import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, device as device_mod
from .config import get_settings
from .database import init_db
from .events import hub
from .pipeline import recover_stale_recordings
from .queue import queue
from .routes import health as health_router
from .routes import recordings as recordings_router
from .routes import settings as settings_router

logger = logging.getLogger("hinoter.main")

settings = get_settings()

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    await recover_stale_recordings()

    hub.bind_loop(asyncio.get_running_loop())
    device = device_mod.resolve_device(settings)
    device_mod.set_current(device)
    logger.info(
        "[device] modo ativo: %s (compute_type=%s) | gpu=%s",
        device.device,
        device.compute_type,
        device.gpu_name or "nenhuma",
    )

    await queue.start()
    logger.info("[startup] HiaNoter-Lite v%s pronto em 0.0.0.0:8000 (acessível na rede local)", __version__)
    try:
        yield
    finally:
        try:
            await queue.stop()
        except asyncio.CancelledError:
            # estamos sendo cancelados (Ctrl+C): encerra o worker sem espera.
            queue.cancel_worker_now()
        except asyncio.TimeoutError:
            queue.cancel_worker_now()
        logger.info("[shutdown] HiaNoter-Lite encerrado")


app = FastAPI(
    title="HiaNoter-Lite",
    version=__version__,
    description="Transcrição local (faster-whisper) + resumo via OpenRouter + export para Notion.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router.router)
app.include_router(recordings_router.router)
app.include_router(settings_router.router)


# Serve the built frontend (optional; dev uses Vite on :5173).
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
    for extra in ("favicon.ico", "logo.svg", "manifest.json", "site.webmanifest"):
        if (FRONTEND_DIST / extra).exists():

            @app.get(f"/{extra}", include_in_schema=False)
            async def _static_extra(_file: str = extra):
                return FileResponse(FRONTEND_DIST / _file)

    NO_CACHE_HEADERS = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa_fallback(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(FRONTEND_DIST.resolve())):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers=NO_CACHE_HEADERS)