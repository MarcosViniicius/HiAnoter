from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config as config_mod
from ..config import update_settings as _update
from ..config import reset_settings as _reset
from ..services.model_list import fetch_models

router = APIRouter(tags=["settings"])


class SettingItem(BaseModel):
    key: str
    group: str
    label: str
    type: str
    options: list[str] | None = None
    secret: bool = False
    requires_restart: bool = False
    help: str = ""
    value: Any = None
    set: bool = True
    sha256: str | None = None
    masked: str | None = None


class SettingsListResponse(BaseModel):
    settings: list[SettingItem]
    file: str
    configured_providers: dict[str, bool] = {}
    keys_status: dict[str, dict[str, Any]] = {}


class SettingsUpdateRequest(BaseModel):
    values: dict[str, Any]


class SettingsUpdateResponse(BaseModel):
    ok: bool
    updated: list[str]
    requires_restart: list[str]
    notice: str = ""


@router.get("/api/settings", response_model=SettingsListResponse)
async def list_settings() -> SettingsListResponse:
    ui_items = config_mod.get_settings_ui()
    items = [SettingItem(**item) for item in ui_items]
    current = config_mod.get_settings()

    configured_provs = {
        "openrouter": config_mod.is_real_secret(current.openrouter_api_key) or config_mod.is_real_secret(current.llm_api_key),
        "openai": config_mod.is_real_secret(current.openai_api_key),
        "gemini": config_mod.is_real_secret(current.gemini_api_key),
        "notion": config_mod.is_real_secret(current.notion_api_key),
        "custom": True,
    }

    keys_status = {}
    for it in items:
        if it.secret:
            keys_status[it.key] = {
                "configured": it.set,
                "sha256": it.sha256,
                "masked": it.masked,
            }

    return SettingsListResponse(
        settings=items,
        file=str(config_mod.settings_file_path()),
        configured_providers=configured_provs,
        keys_status=keys_status,
    )


@router.patch("/api/settings", response_model=SettingsUpdateResponse)
async def update_settings(body: SettingsUpdateRequest) -> SettingsUpdateResponse:
    try:
        result = _update(body.values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao salvar configurações: {exc}") from exc
    return SettingsUpdateResponse(**result)


@router.post("/api/settings/reset", response_model=SettingsUpdateResponse)
async def reset_settings() -> SettingsUpdateResponse:
    return SettingsUpdateResponse(**_reset())


# ---------------------------------------------------------------- modelos

class ModelInfo(BaseModel):
    id: str
    name: str
    context: int | None = None
    pricing: dict[str, str] = {}


class ModelsResponse(BaseModel):
    models: list[ModelInfo] = []
    source: str  # live | cache | none
    error: str | None = None
    cached_at: float | None = None


@router.get("/api/settings/models", response_model=ModelsResponse)
async def list_models(
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    force: bool = False,
) -> ModelsResponse:
    result = await fetch_models(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        force=force,
    )
    return ModelsResponse(
        models=[ModelInfo(**m) for m in result["models"]],
        source=result["source"],
        error=result["error"],
        cached_at=result.get("cached_at"),
    )