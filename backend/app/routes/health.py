import shutil

from fastapi import APIRouter

from .. import __version__, device as device_mod
from ..config import get_settings
from ..schemas import DeviceInfoOut, HealthResponse

router = APIRouter(tags=["health"])

settings = get_settings()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    s = get_settings()
    device = device_mod.get_current()
    return HealthResponse(
        status="ok",
        version=__version__,
        device=DeviceInfoOut(**device.to_dict()),
        whisper_model=s.whisper_model,
        max_upload_mb=s.max_upload_mb,
        ffmpeg_available=shutil.which("ffmpeg") is not None,
        huggingface_cache_dir=str(s.data_path / "models"),
    )