"""Background pipeline: normalize -> transcribe (real % progress) -> summarize (chunked LLM)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import select

from . import device as device_mod
from .config import get_settings
from .database import async_session
from .events import hub
from .models import Recording, RecordingStatus
from .services.ffmpeg import FfmpegError, normalize_to_wav
from .services.summarize import summarize_transcript
from .services.transcription import ensure_model, transcribe_sync

logger = logging.getLogger("hinoter.pipeline")

settings = get_settings()

POLL_INTERVAL = 0.5


def _readable_error(exc: BaseException) -> str:
    msg = str(exc) or type(exc).__name__
    if msg.startswith("(") and ")" in msg:
        msg = msg[msg.index(")") + 1 :].strip(" :")
    return msg[:500]


async def publish_state(recording: Recording, event: str = "progress") -> None:
    data: dict[str, Any] = {
        "id": recording.id,
        "title": recording.title,
        "status": recording.status,
        "progress_pct": recording.progress_pct,
        "duration_seconds": recording.duration_seconds,
        "summary_style": recording.summary_style,
        "active_transcription_id": recording.active_transcription_id,
        "active_summary_id": recording.active_summary_id,
    }
    if recording.error_message:
        data["error_message"] = recording.error_message
    await hub.publish(recording.id, event, data)


async def recover_stale_recordings() -> None:
    """Reset TRANSCRIBING/SUMMARIZING rows left over from a previous process."""
    async with async_session() as db:
        result = await db.execute(
            select(Recording).where(
                Recording.status.in_([RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value])
            )
        )
        stale = result.scalars().all()
        for rec in stale:
            rec.status = RecordingStatus.FAILED.value
            rec.error_message = (
                rec.error_message
                or "O processo foi reiniciado durante o processamento. Use 'Tentar novamente' para continuar."
            )
            logger.warning("[pipeline] %s marcada como FAILED apos restart do backend", rec.id)
        await db.commit()


async def _run_transcription(
    recording: Recording,
    db,
    provider: str | None = None,
    model: str | None = None,
    language: str | None = None,
) -> None:
    s = get_settings()
    effective_provider = (provider or s.transcription_provider or "local").strip().lower()
    progress: dict[str, int] = {"pct": 0}

    def on_progress(pct: int) -> None:
        progress["pct"] = pct

    if effective_provider == "openrouter":
        from .services.transcription import transcribe_openrouter
        engine_name = "openrouter"
        model_name = model or s.openrouter_whisper_model or "openai/whisper-large-v3-turbo"

        recording.progress_pct = 15
        await db.commit()
        await publish_state(recording)

        task = asyncio.create_task(
            transcribe_openrouter(
                str(recording.file_path),
                model=model_name,
                language=language or s.whisper_language,
                on_progress=on_progress,
            )
        )
    else:
        # Local whisper (faster-whisper ou whisper-cpp)
        info = device_mod.get_current()
        await ensure_model()
        engine_name = str(info.engine)
        model_name = model or str(s.whisper_model)

        task = asyncio.create_task(
            asyncio.to_thread(transcribe_sync, str(recording.file_path), on_progress)
        )

    last_pct = 0
    while not task.done():
        await asyncio.sleep(POLL_INTERVAL)
        pct = progress["pct"]
        if 0 < pct < 100 and pct != last_pct:
            last_pct = pct
            recording.progress_pct = pct
            await db.commit()
            await publish_state(recording)
    try:
        text, segments, duration = await task
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Falha na transcricao ({effective_provider}): {_readable_error(exc)}") from exc

    # Busca próxima versão de transcrição
    from .models import TranscriptionVersion
    res_count = await db.execute(
        select(TranscriptionVersion).where(TranscriptionVersion.recording_id == recording.id)
    )
    existing_tvs = res_count.scalars().all()
    next_version = len(existing_tvs) + 1

    import uuid
    tv_id = str(uuid.uuid4())
    tv = TranscriptionVersion(
        id=tv_id,
        recording_id=recording.id,
        version_number=next_version,
        engine=engine_name,
        model_name=model_name,
        duration_seconds=duration,
        raw_transcript=text,
        transcript_segments=segments,
        status="COMPLETED",
    )
    db.add(tv)

    recording.progress_pct = 100
    recording.duration_seconds = duration
    recording.raw_transcript = text
    recording.transcript_segments = segments
    recording.active_transcription_id = tv_id
    recording.status = RecordingStatus.COMPLETED.value
    await db.commit()
    await publish_state(recording, event="done")
    logger.info(
        "[pipeline] %s transcrito com sucesso (v%d / %.1fs / %d segmentos / engine=%s:%s)",
        recording.id, next_version, duration, len(segments), engine_name, model_name,
    )


async def process_recording(
    recording_id: str,
    provider: str | None = None,
    model: str | None = None,
    language: str | None = None,
) -> None:
    async with async_session() as db:
        recording = await db.get(Recording, recording_id)
        if recording is None:
            logger.warning("[pipeline] %s nao encontrado; job ignorado", recording_id)
            return
        if recording.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
            logger.info("[pipeline] %s ja em processamento; job ignorado", recording_id)
            return

        recording.status = RecordingStatus.TRANSCRIBING.value
        recording.progress_pct = 0
        recording.error_message = None
        await db.commit()
        await publish_state(recording)

        try:
            # --- 1. Normalize with ffmpeg -----------------------------------
            if not recording.file_path:
                if not recording.original_file_path or not Path(recording.original_file_path).exists():
                    raise FfmpegError("Arquivo de audio original nao foi encontrado em disco.")
                wav_path = await normalize_to_wav(
                    Path(recording.original_file_path),
                    get_settings().audio_path / f"{recording.id}.wav",
                )
                recording.file_path = str(wav_path)
                await db.commit()

            # --- 2. Transcribe (Automático em segundo plano) ----------------
            await _run_transcription(
                recording,
                db,
                provider=provider,
                model=model,
                language=language,
            )

        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("[pipeline] falha em %s", recording_id)
            recording.status = RecordingStatus.FAILED.value
            recording.error_message = _readable_error(exc)
            await db.commit()
            await publish_state(recording, event="error")