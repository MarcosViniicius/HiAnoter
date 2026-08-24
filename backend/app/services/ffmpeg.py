"""ffmpeg wrapper: normalizes any input format to WAV 16kHz mono before transcription."""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

logger = logging.getLogger("hinoter.ffmpeg")


class FfmpegError(RuntimeError):
    pass


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


async def normalize_to_wav(src: Path, dst: Path, timeout: int = 600) -> Path:
    """Convert `src` to 16kHz mono PCM WAV at `dst`. Raises FfmpegError on failure."""
    if not ffmpeg_available():
        raise FfmpegError(
            "ffmpeg nao encontrado no PATH. Instale-o (choco install ffmpeg / brew install ffmpeg / apt install ffmpeg) e tente novamente."
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    logger.info("[ffmpeg] normalizando %s -> %s", src.name, dst.name)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise FfmpegError("ffmpeg excedeu o tempo limite ao normalizar o audio.") from None
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()[-500:]
        raise FfmpegError(f"Falha ao normalizar o audio com ffmpeg: {err}")
    if not dst.exists() or dst.stat().st_size == 0:
        raise FfmpegError("ffmpeg concluiu mas nao produziu o arquivo WAV esperado.")
    return dst


async def compress_for_api(src: Path, dst: Path, bitrate: str = "32k", timeout: int = 600) -> Path:
    """Compacta áudio em MP3 mono 16kHz otimizado para voz para envio a APIs remotas (limite 25MB)."""
    if not ffmpeg_available():
        raise FfmpegError("ffmpeg nao encontrado no PATH.")
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        bitrate,
        str(dst),
    ]
    logger.info("[ffmpeg] compactando para API %s -> %s (bitrate=%s)", src.name, dst.name, bitrate)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise FfmpegError("ffmpeg excedeu o tempo limite ao compactar o audio.") from None
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()[-500:]
        raise FfmpegError(f"Falha ao compactar o audio com ffmpeg: {err}")
    if not dst.exists() or dst.stat().st_size == 0:
        raise FfmpegError("ffmpeg concluiu mas nao produziu o arquivo MP3 compactado.")
    return dst


async def get_audio_duration(src: Path) -> float:
    """Retorna a duração exata do áudio em segundos via wave ou ffprobe."""
    try:
        import wave
        with wave.open(str(src), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return round(frames / float(rate), 2)
    except Exception:
        pass

    if shutil.which("ffprobe"):
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(src),
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            val = out.decode("utf-8").strip()
            if val:
                return round(float(val), 2)
        except Exception:
            pass
    return 0.0


async def extract_audio_chunk(
    src: Path,
    dst: Path,
    start_sec: float,
    duration_sec: float,
    bitrate: str = "32k",
    timeout: int = 300,
) -> Path:
    """Extrai e compacta um trecho específico de áudio em MP3 mono 16kHz (ex: 10 minutos ~ 2.4MB)."""
    if not ffmpeg_available():
        raise FfmpegError("ffmpeg nao encontrado no PATH.")
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_sec:.2f}",
        "-t",
        f"{duration_sec:.2f}",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        bitrate,
        str(dst),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise FfmpegError("ffmpeg excedeu o tempo limite ao extrair trecho de audio.") from None
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()[-500:]
        raise FfmpegError(f"Falha ao extrair trecho de audio com ffmpeg: {err}")
    if not dst.exists() or dst.stat().st_size == 0:
        raise FfmpegError("ffmpeg concluiu mas nao produziu o trecho MP3 esperado.")
    return dst