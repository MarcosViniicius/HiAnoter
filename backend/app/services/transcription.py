"""Transcrição unificada: escolhe o motor e expõe ``(text, segments, duration)``.

* ``faster-whisper`` (CTranslate2) — NVIDIA/CUDA ou CPU/int8.
* ``whisper-cpp``   (whisper.cpp/GGML via pywhispercpp) — GPU não-NVIDIA
  (Metal/Vulkan conforme build) ou CPU.

Ambos entregam progresso real (0..100) alimentado por segmento decodificado.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from .. import device as device_mod
from ..config import get_settings, is_real_secret

logger = logging.getLogger("hinoter.transcribe")

ProgressCallback = Callable[[int], None]

# Presets de velocidade: reparametrizam beam/temperature/threads de uma vez.
MODE_PRESETS: dict[str, dict] = {
    "fast": {"beam": 1, "fallback": False, "threads": 0},
    "balanced": {"beam": 2, "fallback": False, "threads": 0},
    "quality": {"beam": 5, "fallback": True, "threads": 0},
}


def _speed_params() -> dict:
    """Retorna {beam, fallback, threads} conforme modo (preset ou custom)."""
    s = get_settings()
    mode = (s.whisper_mode or "fast").strip().lower()
    preset = MODE_PRESETS.get(mode)
    if preset:
        return dict(preset)
    return {
        "beam": max(1, int(s.whisper_beam_size)),
        "fallback": bool(s.whisper_temperature_fallback),
        "threads": int(s.whisper_cpu_threads or 0),
    }


def _resolve_threads() -> int:
    """Threads para whisper.cpp/CPU: presets/custom decide."""
    s = get_settings()
    mode = (s.whisper_mode or "fast").strip().lower()
    if mode in MODE_PRESETS:
        threads = MODE_PRESETS[mode]["threads"]
    else:
        threads = int(s.whisper_cpu_threads or 0)
    if threads and threads > 0:
        return threads
    import os as _os

    cores = _os.cpu_count() or 4
    return max(4, min(cores, 16))

_fw_lock: asyncio.Lock | None = None
_fw_model: Any | None = None

_wcpp_lock: asyncio.Lock | None = None
_wcpp_model: Any | None = None


def _l1() -> asyncio.Lock:
    global _fw_lock
    if _fw_lock is None:
        _fw_lock = asyncio.Lock()
    return _fw_lock


def _l2() -> asyncio.Lock:
    global _wcpp_lock
    if _wcpp_lock is None:
        _wcpp_lock = asyncio.Lock()
    return _wcpp_lock


# ---------------------------------------------------------------- faster-whisper

def _load_fw(device: str, compute_type: str) -> Any:
    from faster_whisper import WhisperModel

    s = get_settings()
    logger.info(
        "[whisper] faster-whisper: modelo '%s' (device=%s, compute_type=%s)",
        s.whisper_model, device, compute_type,
    )
    return WhisperModel(
        s.whisper_model,
        device=device,
        compute_type=compute_type,
        download_root=str(s.data_path / "models"),
    )


async def _fw_ensure() -> Any:
    global _fw_model
    if _fw_model is not None:
        return _fw_model
    target = device_mod.get_current()
    async with _l1():
        if _fw_model is not None:
            return _fw_model
        try:
            model = await asyncio.to_thread(_load_fw, target.device, target.compute_type)
        except Exception as exc:  # noqa: BLE001
            if target.device in ("cuda", "vulkan"):
                logger.error(
                    "[whisper] falha ao carregar faster-whisper em %s (%s). Fallback silencioso para CPU/int8.",
                    target.device, exc,
                )
                cur = device_mod.get_current()
                cur.engine = "faster-whisper"
                cur.device = "cpu"
                cur.compute_type = "int8"
                cur.backend = "cpu"
                cur.notes = f"Falha no carregamento {target.device} ({type(exc).__name__}); fallback p/ CPU/int8"
                device_mod.set_current(cur)
                try:
                    model = await asyncio.to_thread(_load_fw, "cpu", "int8")
                except Exception as exc2:  # noqa: BLE001
                    raise RuntimeError(
                        f"Falha ao carregar o modelo Whisper ({get_settings().whisper_model}): {exc2}."
                    ) from exc2
                _fw_model = model
                return model
            raise RuntimeError(
                f"Falha ao carregar o modelo Whisper ({get_settings().whisper_model}): {exc}."
            ) from exc
        _fw_model = model
        return model


# ---------------------------------------------------------------- whisper.cpp

def _load_wcpp() -> Any:
    from pywhispercpp.model import Model

    s = get_settings()
    logger.info(
        "[whisper] whisper.cpp: modelo '%s' (GGML, threads=%d)", s.whisper_model, _resolve_threads(),
    )
    return Model(s.whisper_model, models_dir=str(s.data_path / "models"), n_threads=_resolve_threads())


async def _wcpp_ensure() -> Any:
    global _wcpp_model
    if _wcpp_model is not None:
        return _wcpp_model
    async with _l2():
        if _wcpp_model is not None:
            return _wcpp_model
        try:
            _wcpp_model = await asyncio.to_thread(_load_wcpp)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Falha ao carregar whisper.cpp. Instale o binding: "
                f"pip install pywhispercpp. Detalhe: {exc}"
            ) from exc
        return _wcpp_model


def _wav_duration(path: str) -> float:
    import wave

    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return 0.0


def _transcribe_wc(model: Any, path: str, on_progress: ProgressCallback | None) -> tuple[str, list[dict], float]:
    wav_dur = _wav_duration(path)

    def new_segment(seg: Any) -> None:
        try:
            t1 = int(getattr(seg, "t1", 0) or 0)
        except Exception:
            t1 = 0
        if on_progress is not None and wav_dur > 0:
            # whisper.cpp reporta t1 em centésimos de segundo → progresso real
            on_progress(max(0, min(100, int(t1 / (wav_dur * 100) * 100))))

    segments = model.transcribe(
        path,
        language=get_settings().whisper_language or "auto",
        new_segment_callback=new_segment,
    )
    if not segments:
        return "", [], wav_dur

    last_t1 = int(getattr(segments[-1], "t1", 0) or 0)
    scale = (wav_dur / last_t1) if last_t1 > 0 else 1.0
    collected: list[dict] = []
    parts: list[str] = []
    for raw in segments:
        text = (getattr(raw, "text", "") or "").strip()
        t0 = _seg_sec(getattr(raw, "t0", 0) or 0, scale)
        t1 = _seg_sec(getattr(raw, "t1", 0) or 0, scale)
        collected.append({"start": round(t0, 2), "end": round(t1, 2), "text": text})
        parts.append(text)

    return (
        "\n".join(p for p in parts if p),
        collected,
        wav_dur if wav_dur else (collected[-1]["end"] if collected else 0.0),
    )


def _seg_sec(ticks: float, scale: float) -> float:
    return ticks * scale


# ---------------------------------------------------------------- public API

def reset_models() -> None:
    """Zera as caches de modelo (necessário após mudar whisper_* em runtime)."""
    global _fw_model, _wcpp_model
    _fw_model = None
    _wcpp_model = None
    logger.info("[whisper] modelos resetados (próxima transcrição recarregará)")


async def ensure_model() -> None:
    cur = device_mod.get_current()
    if cur.engine == "whisper-cpp":
        await _wcpp_ensure()
    else:
        await _fw_ensure()


def transcribe_sync(path: str, on_progress: ProgressCallback | None = None) -> tuple[str, list[dict], float]:
    """Blocante — roda dentro de asyncio.to_thread (ver pipeline)."""
    cur = device_mod.get_current()

    if cur.engine == "whisper-cpp":
        if _wcpp_model is None:
            raise RuntimeError("Modelo whisper.cpp não inicializado.")
        return _transcribe_wc(_wcpp_model, str(path), on_progress)

    if _fw_model is None:
        raise RuntimeError("Modelo faster-whisper não inicializado.")

    speed = _speed_params()

    def run_with(vad: bool) -> Any:
        kwargs: dict[str, Any] = {
            "beam_size": speed["beam"],
            "language": get_settings().whisper_language,
            "vad_filter": vad,
        }
        if not speed["fallback"]:
            kwargs["temperature"] = 0.0  # uma passada só = mais rápido
        if speed["threads"] and speed["threads"] > 0:
            kwargs["cpu_threads"] = int(speed["threads"])
        return _fw_model.transcribe(str(path), **kwargs)

    try:
        segments_iter, meta = run_with(True)
    except Exception:  # noqa: BLE001
        logger.warning("[whisper] VAD indisponível; transcrevendo sem filtrar silêncio")
        segments_iter, meta = run_with(False)

    total = float(getattr(meta, "duration", 0) or 0.0)
    collected: list[dict] = []
    parts: list[str] = []
    for seg in segments_iter:
        collected.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()})
        parts.append(seg.text.strip())
        if on_progress is not None and total > 0:
            on_progress(max(0, min(100, int(seg.end / total * 100))))
    return "\n".join(p for p in parts if p), collected, total


async def transcribe_openrouter(
    path: str,
    model: str | None = None,
    language: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> tuple[str, list[dict], float]:
    """Transcreve áudio via API OpenRouter com compactação automática e chunking inteligente (sem limite de 25MB)."""
    import math
    import httpx
    from pathlib import Path
    from .ffmpeg import compress_for_api, extract_audio_chunk, get_audio_duration

    s = get_settings()
    api_key = (s.openrouter_api_key or "").strip()
    if not api_key or not is_real_secret(api_key):
        raise RuntimeError(
            "Chave OPENROUTER_API_KEY não configurada. Configure a chave da API em Configurações para usar transcrição via OpenRouter."
        )

    model_name = model or s.openrouter_whisper_model or "openai/whisper-large-v3-turbo"
    base_url = (s.openrouter_base_url or "https://openrouter.ai/api/v1").rstrip("/")
    endpoint = f"{base_url}/audio/transcriptions"

    p = Path(path)
    if not p.exists():
        raise RuntimeError(f"Arquivo de áudio não encontrado: {path}")

    if on_progress:
        on_progress(10)

    # 1. Obtém duração total do áudio
    total_duration = await get_audio_duration(p)

    CHUNK_SEC = 600.0  # 10 minutos por chunk (~2.4 MB em MP3 32kbps, bem abaixo de 25MB)

    async def _transcribe_single_file(
        client: httpx.AsyncClient, file_path: Path, offset_sec: float = 0.0
    ) -> tuple[str, list[dict], float]:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, "audio/mpeg")}
            data: dict[str, Any] = {
                "model": model_name,
                "response_format": "verbose_json",
            }
            if language or s.whisper_language:
                data["language"] = language or s.whisper_language

            headers = {
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://github.com/hinoter/hinoter-lite",
                "X-Title": "HiNoter-Lite",
            }

            resp = await client.post(endpoint, headers=headers, files=files, data=data)

        if resp.status_code != 200:
            err_detail = resp.text
            try:
                err_json = resp.json()
                if "error" in err_json:
                    err_detail = err_json["error"].get("message", err_detail)
                elif "detail" in err_json:
                    err_detail = err_json["detail"]
            except Exception:
                pass
            raise RuntimeError(f"Falha no OpenRouter ({resp.status_code}): {err_detail}")

        result = resp.json()
        chunk_text = result.get("text", "").strip()
        chunk_dur = float(result.get("duration", 0) or 0.0)

        chunk_segments: list[dict] = []
        raw_segs = result.get("segments", [])
        if raw_segs and isinstance(raw_segs, list):
            for seg in raw_segs:
                chunk_segments.append({
                    "start": round(float(seg.get("start", 0.0)) + offset_sec, 2),
                    "end": round(float(seg.get("end", 0.0)) + offset_sec, 2),
                    "text": str(seg.get("text", "")).strip(),
                })
        return chunk_text, chunk_segments, chunk_dur

    # Se a duração for curta (<= 10 minutos), envia em um único MP3 compactado
    if total_duration > 0 and total_duration <= CHUNK_SEC:
        mp3_tmp = p.with_name(f"{p.stem}_api_compressed.mp3")
        try:
            await compress_for_api(p, mp3_tmp, bitrate="32k")
            if on_progress:
                on_progress(40)
            async with httpx.AsyncClient(timeout=300.0) as client:
                text, segments, final_dur = await _transcribe_single_file(client, mp3_tmp, offset_sec=0.0)
            if on_progress:
                on_progress(100)
            return text, segments, final_dur if final_dur > 0 else total_duration
        finally:
            mp3_tmp.unlink(missing_ok=True)

    # Para áudios longos (> 10 minutos ou sem duração prévia):
    if total_duration <= 0:
        mp3_tmp = p.with_name(f"{p.stem}_api_compressed.mp3")
        try:
            await compress_for_api(p, mp3_tmp, bitrate="32k")
            total_duration = await get_audio_duration(mp3_tmp)
        finally:
            mp3_tmp.unlink(missing_ok=True)

    if total_duration <= CHUNK_SEC:
        total_duration = max(total_duration, 1.0)
        num_chunks = 1
    else:
        num_chunks = math.ceil(total_duration / CHUNK_SEC)

    all_texts: list[str] = []
    all_segments: list[dict] = []
    total_processed_duration = 0.0

    async with httpx.AsyncClient(timeout=300.0) as client:
        for i in range(num_chunks):
            start_sec = i * CHUNK_SEC
            duration_sec = min(CHUNK_SEC, total_duration - start_sec)
            if duration_sec <= 0:
                break

            chunk_file = p.with_name(f"{p.stem}_chunk_{i}.mp3")
            try:
                await extract_audio_chunk(
                    p, chunk_file, start_sec=start_sec, duration_sec=duration_sec, bitrate="32k"
                )
                c_text, c_segs, c_dur = await _transcribe_single_file(
                    client, chunk_file, offset_sec=start_sec
                )
                if c_text:
                    all_texts.append(c_text)
                all_segments.extend(c_segs)
                total_processed_duration += (c_dur if c_dur > 0 else duration_sec)

                if on_progress:
                    pct = int(((i + 1) / num_chunks) * 85) + 10
                    on_progress(min(98, pct))
            finally:
                chunk_file.unlink(missing_ok=True)

    final_text = " ".join(all_texts).strip()
    if on_progress:
        on_progress(100)

    logger.info(
        "[whisper-openrouter] %s transcrito em %d chunk(s) via OpenRouter model=%s (%.1fs / %d segmentos)",
        p.name, num_chunks, model_name, total_duration or total_processed_duration, len(all_segments),
    )
    return final_text, all_segments, total_duration or total_processed_duration