"""Serviço unificado de listagem de modelos para múltiplos provedores de IA.

Suporta:
- OpenRouter (https://openrouter.ai/api/v1/models)
- OpenAI (https://api.openai.com/v1/models)
- Google Gemini (https://generativelanguage.googleapis.com/v1beta/openai/models)
- Custom / Local / Ollama / LM Studio / Groq (<base_url>/models)
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

from ..config import get_settings, is_real_secret

logger = logging.getLogger("hinoter.models")

MODELS_CACHE_TTL = 8 * 3600  # 8 horas

# Modelos recomendados padrão para cada provedor
DEFAULT_PRESET_MODELS: dict[str, list[dict[str, Any]]] = {
    "openrouter": [
        {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet (Recomendado / Melhor Síntese)", "context": 200000},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash (Ultrarrápido & Econômico)", "context": 1000000},
        {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3 (Alta Inteligência & Baixo Custo)", "context": 64000},
        {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B (Open-Source de Topo)", "context": 128000},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini (Ágil & Barato)", "context": 128000},
        {"id": "openai/gpt-4o", "name": "GPT-4o (Referência OpenAI)", "context": 128000},
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o (Mais Capaz & Inteligente)", "context": 128000},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini (Recomendado / Rápido & Econômico)", "context": 128000},
        {"id": "o3-mini", "name": "o3-mini (Raciocínio Lógico Avançado)", "context": 200000},
        {"id": "o1-mini", "name": "o1-mini (Raciocínio Rápido)", "context": 128000},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo (Alta Precisão)", "context": 128000},
    ],
    "gemini": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash (Recomendado / Nova Geração)", "context": 1000000},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro (Contexto Gigante de 2M Tokens)", "context": 2000000},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash (Super Econômico)", "context": 1000000},
        {"id": "gemini-2.0-pro-exp-02-05", "name": "Gemini 2.0 Pro Experimental", "context": 2000000},
    ],
    "custom": [
        {"id": "llama3.2:latest", "name": "Llama 3.2 (Ollama / Local)", "context": 128000},
        {"id": "deepseek-r1:latest", "name": "DeepSeek R1 (Raciocínio Local)", "context": 64000},
        {"id": "qwen2.5:latest", "name": "Qwen 2.5 (Multilíngue)", "context": 32000},
        {"id": "mistral:latest", "name": "Mistral 7B (Geral)", "context": 32000},
    ],
}


def _cache_path(provider: str) -> Path:
    return get_settings().data_path / f"{provider}_models_cache.json"


def _read_cache(provider: str, stale_ok: bool = False) -> dict[str, Any] | None:
    path = _cache_path(provider)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or not isinstance(raw.get("models"), list):
            return None
        cached_at = raw.get("cached_at", 0)
        if not stale_ok and (time.time() - cached_at) > MODELS_CACHE_TTL:
            return None
        return raw
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("[models] cache inválido para %s: %s", provider, exc)
        return None


def _write_cache(provider: str, models: list[dict]) -> None:
    path = _cache_path(provider)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"cached_at": time.time(), "models": models}
    fd, tmp = tempfile.mkstemp(prefix=f"{provider}_models", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, str(path))
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def _normalize_model(item: dict) -> dict | None:
    mid = item.get("id") or item.get("name") or item.get("model")
    if not mid:
        return None
    name = item.get("name") or item.get("id") or mid
    context = item.get("context_length") or item.get("context_window") or None

    pricing = item.get("pricing") or {}
    kep: dict[str, str] = {}
    for k in ("prompt", "completion", "request", "image", "input", "output", "web_search"):
        if k in pricing and isinstance(pricing[k], (str, int, float)):
            kep[k] = str(pricing[k])

    return {
        "id": str(mid).strip(),
        "name": str(name).strip(),
        "context": context,
        "pricing": kep,
    }


async def fetch_models(
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Busca a lista de modelos de forma inteligente para o provedor selecionado."""
    s = get_settings()
    llm_cfg = s.get_effective_llm_config()

    prov = (provider or llm_cfg["provider"] or "openrouter").lower().strip()
    key = (api_key or llm_cfg["api_key"] or "").strip()
    endpoint = (base_url or llm_cfg["base_url"] or "").strip()

    presets = DEFAULT_PRESET_MODELS.get(prov, DEFAULT_PRESET_MODELS["openrouter"])

    # Se a chave não foi configurada ou for placeholder
    if not is_real_secret(key) and prov != "custom":
        return {
            "models": presets,
            "source": "preset",
            "error": None,
            "cached_at": None,
        }

    # Se não forçar, checa cache
    if not force:
        cached = _read_cache(prov)
        if cached and cached.get("models"):
            return {
                "models": cached["models"],
                "source": "cache",
                "error": None,
                "cached_at": cached.get("cached_at"),
            }

    # Define URL de busca
    if prov == "openrouter":
        target_url = f"{endpoint or 'https://openrouter.ai/api/v1'}/models"
        headers = {"Authorization": f"Bearer {key}"}
    elif prov == "openai":
        target_url = f"{endpoint or 'https://api.openai.com/v1'}/models"
        headers = {"Authorization": f"Bearer {key}"}
    elif prov == "gemini":
        target_url = f"{endpoint or 'https://generativelanguage.googleapis.com/v1beta/openai'}/models"
        headers = {"Authorization": f"Bearer {key}"}
    else:  # custom / ollama / lm studio
        target_url = f"{endpoint or 'http://localhost:11434/v1'}/models"
        headers = {"Authorization": f"Bearer {key}"} if key else {}

    seen: dict[str, dict] = {}
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(target_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                raw_list = data.get("data") or data.get("models") or []
                for item in raw_list:
                    norm = _normalize_model(item)
                    if norm:
                        # Filtra modelos de embedding ou whisper se for listagem geral da OpenAI
                        mid_lower = norm["id"].lower()
                        if any(x in mid_lower for x in ("whisper", "tts", "embedding", "dall-e", "moderation", "audio")):
                            continue
                        seen[norm["id"]] = norm
            else:
                logger.warning("[models] endpoint %s retornou status %d", target_url, resp.status_code)
    except Exception as exc:
        logger.warning("[models] falha ao buscar modelos ao vivo de %s: %s", target_url, exc)

    if seen:
        models = list(seen.values())
        _write_cache(prov, models)
        return {"models": models, "source": "live", "error": None, "cached_at": time.time()}

    # Se a busca falhar mas tivermos cache antigo ou presets
    stale = _read_cache(prov, stale_ok=True)
    if stale and stale.get("models"):
        return {
            "models": stale["models"],
            "source": "cache",
            "error": "Não foi possível sincronizar com a API agora. Exibindo modelos em cache.",
            "cached_at": stale.get("cached_at"),
        }

    return {
        "models": presets,
        "source": "preset",
        "error": None,
        "cached_at": None,
    }