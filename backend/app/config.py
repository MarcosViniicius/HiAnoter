"""Configuração viva (runtime) do HiNoter-Lite.

Fontes, em ordem de precedência:
  1. `.env` / variáveis de ambiente (lidas a cada snapshot);
  2. overrides persistidos em `<DATA_DIR>/settings.json` (alterados pelo menu).

`get_settings()` SEMPRE retorna o snapshot atual (sem cache): o menu pode mudar
QUASE tudo em runtime. Campos que só valem após restart (ex.: `data_dir`,
`database_url`) são marcados com `requires_restart=True` e a UI avisa.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("hinoter.config")

_CONFIG_FILENAME = "settings.json"
_DEFAULT_DATA_DIR = "~/.hinoter-lite/data"

# Sentinela usada no PATCH para "campo secreto não alterado".
UNCHANGED_SECRET = "__unchanged__"


def _expand_path(value: str) -> Path:
    return Path(os.path.expanduser(os.path.expandvars(value))).resolve()


class Settings(BaseSettings):
    """Snapshot de configuração efetiva (env + overrides persistidos)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    data_dir: str = _DEFAULT_DATA_DIR
    database_url: str = ""  # vazio => <data_dir>/hinoter.db
    max_upload_mb: int = 300
    theme: str = "system"  # "system" | "dark" | "light"

    transcription_provider: str = "local"  # "local" ou "openrouter"
    openrouter_whisper_model: str = "openai/whisper-large-v3-turbo"

    whisper_model: str = "large-v3"
    whisper_device: str = "auto"
    whisper_engine: str = "auto"
    whisper_language: str | None = None

    # Preset de velocidade (Rápido/Equilibrado/Máxima fidelidade/Custom) que
    # sobrepõe os knobs individuais abaixo; "custom" usa os knobs.
    whisper_mode: str = "fast"

    # → desempenho da transcrição (usados quando whisper_mode=custom)
    whisper_beam_size: int = 1        # faster-whisper: 1 = greedy (rápido); >=2 = beam search (qualidade)
    whisper_temperature_fallback: bool = False  # False = única passagem (mais rápido); True = múltiplas
    whisper_cpu_threads: int = 0      # 0 = automático (todos os núcleos); >0 fixa otimizações

    llm_chunk_token_limit: int = 12000
    llm_max_retries: int = 3
    llm_retry_base_delay: float = 2.0

    # Multi-provedor LLM (OpenRouter, OpenAI, Google Gemini, Custom / Local / Ollama)
    llm_provider: str = "openrouter"  # "openrouter" | "openai" | "gemini" | "custom"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""

    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-3.5-sonnet"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    openai_api_key: str = ""
    gemini_api_key: str = ""

    notion_api_key: str = ""
    notion_database_id: str = ""

    def get_effective_llm_config(self) -> dict[str, str]:
        prov = (self.llm_provider or "openrouter").lower().strip()
        base_url = (self.llm_base_url or "").strip()
        api_key = (self.llm_api_key or "").strip()
        model = (self.llm_model or "").strip()

        if prov == "openai":
            base_url = base_url or "https://api.openai.com/v1"
            api_key = api_key or self.openai_api_key or self.openrouter_api_key
            model = model or "gpt-4o-mini"
        elif prov == "gemini":
            base_url = base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
            api_key = api_key or self.gemini_api_key or self.openrouter_api_key
            model = model or "gemini-2.0-flash"
        elif prov == "custom":
            base_url = base_url or "http://localhost:11434/v1"
            api_key = api_key or self.openrouter_api_key or "local"
            model = model or "llama3.2"
        else:  # openrouter
            prov = "openrouter"
            base_url = base_url or self.openrouter_base_url or "https://openrouter.ai/api/v1"
            api_key = api_key or self.openrouter_api_key
            model = model or self.openrouter_model or "anthropic/claude-3.5-sonnet"

        return {
            "provider": prov,
            "base_url": base_url.rstrip("/"),
            "api_key": api_key,
            "model": model,
        }

    # ------------------------------------------------------------ derived

    @property
    def data_path(self) -> Path:
        return _expand_path(self.data_dir)

    @property
    def uploads_path(self) -> Path:
        return self.data_path / "uploads"

    @property
    def audio_path(self) -> Path:
        return self.data_path / "audio"

    @property
    def documents_path(self) -> Path:
        return self.data_path / "documents"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def resolved_database_url(self) -> str:
        url = (self.database_url or "").strip()
        if not url:
            # Sem DATABASE_URL explícita, o banco vive dentro do DATA_DIR.
            return f"sqlite+aiosqlite:///{self.data_path / 'hinoter.db'}"
        if url.startswith("sqlite+aiosqlite:///"):
            raw = url[len("sqlite+aiosqlite:///"):]
            return f"sqlite+aiosqlite:///{_expand_path(raw)}"
        if url.startswith("sqlite:///"):
            raw = url[len("sqlite:///"):]
            return f"sqlite:///{_expand_path(raw)}"
        return url

    def ensure_dirs(self) -> None:
        self.data_path.mkdir(parents=True, exist_ok=True)
        self.uploads_path.mkdir(parents=True, exist_ok=True)
        self.audio_path.mkdir(parents=True, exist_ok=True)
        self.documents_path.mkdir(parents=True, exist_ok=True)

    def is_real_secret(self, value: str | None) -> bool:
        return is_real_secret(value)


# ---------------------------------------------------------------- descritores

class FieldSpec:
    def __init__(
        self,
        key: str,
        group: str,
        label: str,
        ftype: str = "str",
        options: list[str] | None = None,
        secret: bool = False,
        requires_restart: bool = False,
        help: str = "",
    ) -> None:
        self.key = key
        self.group = group
        self.label = label
        self.ftype = "enum" if options is not None else ftype  # str | int | float | bool | enum | secret
        self.options = options
        self.secret = secret
        self.requires_restart = requires_restart
        self.help = help

    @property
    def is_secret(self) -> bool:
        return self.secret or self.ftype == "secret"

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "group": self.group,
            "label": self.label,
            "type": self.ftype,
            "options": self.options,
            "secret": self.is_secret,
            "requires_restart": self.requires_restart,
            "help": self.help,
        }


FIELDS: dict[str, FieldSpec] = {
    # --- aparência ---
    "theme": FieldSpec(
        "theme", "Aparência", "Tema da Interface",
        options=["system", "dark", "light"],
        help="system = segue o tema do dispositivo; dark = modo escuro; light = modo claro.",
    ),
    # --- armazenamento ---
    "data_dir": FieldSpec(
        "data_dir", "Armazenamento", "Pasta de dados (uploads, modelos, banco)",
        requires_restart=True,
        help="Onde o HiNoter guarda uploads, áudios normalizados, modelos e o SQLite.",
    ),
    "database_url": FieldSpec(
        "database_url", "Armazenamento", "URL do banco (SQLite)",
        requires_restart=True,
        help="Ex.: sqlite+aiosqlite:///~/.hinoter-lite/data/hinoter.db. Só vale após reinício.",
    ),
    "max_upload_mb": FieldSpec(
        "max_upload_mb", "Armazenamento", "Limite de upload (MB)",
        ftype="int", help="Arquivos acima deste tamanho são recusados (HTTP 413).",
    ),
    # --- transcrição ---
    "transcription_provider": FieldSpec(
        "transcription_provider", "Transcrição", "Provedor de Transcrição",
        options=["local", "openrouter"],
        help="local = Whisper offline no seu hardware (rápido/privado). openrouter = Nuvem via OpenRouter (openai/whisper-large-v3-turbo).",
    ),
    "openrouter_whisper_model": FieldSpec(
        "openrouter_whisper_model", "Transcrição", "Modelo na Nuvem (OpenRouter)",
        help="Modelo de áudio no OpenRouter (padrão: openai/whisper-large-v3-turbo).",
    ),
    "whisper_model": FieldSpec(
        "whisper_model", "Transcrição", "Modelo Whisper Local",
        options=["large-v3", "large-v3-turbo", "medium", "small", "base", "tiny"],
        help="large-v3 = Máxima precisão e fidelidade (Padrão). large-v3-turbo = Rápido e de alta qualidade. medium/small = Mais leves para CPUs modestas.",
    ),
    "whisper_device": FieldSpec(
        "whisper_device", "Transcrição", "Dispositivo de Aceleração",
        options=["auto", "cuda", "rocm", "vulkan", "cpu"],
        help="auto = detecta GPU automaticamente. cuda = NVIDIA. rocm = AMD ROCm/HIP. vulkan = AMD/Intel Vulkan. cpu = Processador.",
    ),
    "whisper_engine": FieldSpec(
        "whisper_engine", "Transcrição", "Motor de transcrição",
        options=["auto", "faster-whisper", "whisper-cpp"],
        help="faster-whisper (NVIDIA CUDA, AMD ROCm ou CPU) ou whisper.cpp (AMD/Intel Vulkan, Apple Metal).",
    ),
    "whisper_language": FieldSpec(
        "whisper_language", "Transcrição", "Idioma (ISO-639-1)",
        help="Ex.: pt (fixa português). Vazio = detecção automática.",
    ),
    "whisper_mode": FieldSpec(
        "whisper_mode", "Transcrição", "Velocidade",
        options=["fast", "balanced", "quality", "custom"],
        help="fast = transcreve o mais rápido possível (padrão). balanced = equilíbrio. quality = máxima fidelidade. custom = usa os campos Beam/Fallback/Threads abaixo.",
    ),
    "whisper_beam_size": FieldSpec(
        "whisper_beam_size", "Transcrição", "Beam size (qualidade × velocidade)",
        ftype="int", help="1 = greedy (mais rápido, recomendado p/ CPU); 5 = melhor fidelidade. Acima de 1 só no faster-whisper. Usado quando a velocidade é 'custom'.",
    ),
    "whisper_temperature_fallback": FieldSpec(
        "whisper_temperature_fallback", "Transcrição", "Fallback de temperatura (múltiplas passadas)",
        ftype="bool", help="Desligado = uma única passada (rápido). Ligado = re-tenta com mais temperatura em trechos de baixa confiança (mais lento). Aplicado no modo 'custom'.",
    ),
    "whisper_cpu_threads": FieldSpec(
        "whisper_cpu_threads", "Transcrição", "Threads na CPU (0 = automático)",
        ftype="int", help="0 usa todos os núcleos. Definir um valor fixo ajuda a estabilizar o uso de CPU. Irrelevante na GPU. Aplicado no modo 'custom' (demais presets usam automático).",
    ),
    # --- LLM (Inteligência Artificial Universal) ---
    "llm_provider": FieldSpec(
        "llm_provider", "Inteligência Artificial (LLM)", "Provedor de IA",
        options=["openrouter", "openai", "gemini", "custom"],
        help="Escolha o provedor de IA: OpenRouter (+100 modelos), OpenAI (GPT-4o/o3), Google Gemini ou Endpoint Personalizado (Ollama, LM Studio, Groq, DeepSeek).",
    ),
    "llm_model": FieldSpec(
        "llm_model", "Inteligência Artificial (LLM)", "Nome do Modelo",
        help="Ex: gpt-4o-mini, gemini-2.0-flash, anthropic/claude-3.5-sonnet, deepseek-chat, llama3.2.",
    ),
    "llm_api_key": FieldSpec(
        "llm_api_key", "Inteligência Artificial (LLM)", "Chave da API Universal",
        ftype="secret", help="Chave de API do provedor selecionado (OpenRouter, OpenAI sk-..., Gemini ou Custom).",
    ),
    "llm_base_url": FieldSpec(
        "llm_base_url", "Inteligência Artificial (LLM)", "Endpoint Base URL (Personalizado)",
        help="URL base da API (padrão OpenAI). Ex: http://localhost:11434/v1 para Ollama ou https://api.openai.com/v1.",
    ),
    "openrouter_api_key": FieldSpec(
        "openrouter_api_key", "Inteligência Artificial (LLM)", "Chave OpenRouter (Legado)",
        ftype="secret", help="sk-or-v1-… — chave do OpenRouter.",
    ),
    "openrouter_model": FieldSpec(
        "openrouter_model", "Inteligência Artificial (LLM)", "Modelo OpenRouter",
        help="Modelo padrão quando OpenRouter estiver ativo.",
    ),
    "openrouter_base_url": FieldSpec(
        "openrouter_base_url", "Inteligência Artificial (LLM)", "Base URL OpenRouter",
        help="Base URL para requisições do OpenRouter.",
    ),
    "openai_api_key": FieldSpec(
        "openai_api_key", "Inteligência Artificial (LLM)", "Chave OpenAI",
        ftype="secret", help="sk-... — chave da OpenAI para GPT e Whisper.",
    ),
    "gemini_api_key": FieldSpec(
        "gemini_api_key", "Inteligência Artificial (LLM)", "Chave Google Gemini",
        ftype="secret", help="Chave de API do Google AI Studio (Gemini).",
    ),
    "llm_chunk_token_limit": FieldSpec(
        "llm_chunk_token_limit", "Inteligência Artificial (LLM)", "Limite de tokens por trecho",
        ftype="int", help="Transcrições maiores são divididas e consolidadas (evita truncar contexto).",
    ),
    "llm_max_retries": FieldSpec(
        "llm_max_retries", "Inteligência Artificial (LLM)", "Tentativas (retry)",
        ftype="int", help="Tentativas com backoff exponencial em timeout/429/5xx.",
    ),
    "llm_retry_base_delay": FieldSpec(
        "llm_retry_base_delay", "Inteligência Artificial (LLM)", "Atraso inicial do retry (s)",
        ftype="float", help="Base do backoff exponencial (2^tentativa × este valor).",
    ),
    # --- notion ---
    "notion_api_key": FieldSpec(
        "notion_api_key", "Export (Notion)", "Integration Token",
        ftype="secret", help="secret_… de notion.so/my-integrations.",
    ),
    "notion_database_id": FieldSpec(
        "notion_database_id", "Export (Notion)", "ID da database",
        help="ID do banco Notion compartilhado com a integration.",
    ),
}

_FIELDS = frozenset(FIELDS)
_INT_KEYS = frozenset(k for k, s in FIELDS.items() if s.ftype == "int")
_FLOAT_KEYS = frozenset(k for k, s in FIELDS.items() if s.ftype == "float")
_SECRET_KEYS = frozenset(k for k, s in FIELDS.items() if s.secret)


# ---------------------------------------------------------------- store

_lock = threading.RLock()
_overrides: dict[str, Any] | None = None
_overrides_file_read: bool = False


def _overrides_path() -> Path:
    raw = os.getenv("DATA_DIR") or _DEFAULT_DATA_DIR
    return _expand_path(raw) / _CONFIG_FILENAME


def settings_file_path() -> Path:
    """Caminho do arquivo de configurações do menu (settings.json)."""
    return _overrides_path()


def _read_overrides() -> dict[str, Any]:
    global _overrides
    with _lock:
        if _overrides is not None:
            return dict(_overrides)
        path = _overrides_path()
        data: dict[str, Any] = {}
        if path.exists():
            try:
                raw = path.read_text(encoding="utf-8")
                if raw.strip():
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        data = parsed
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("[config] settings.json inválido em %s: %s", path, exc)
        _overrides = data
        return dict(data)


def _write_overrides(new_data: dict[str, Any]) -> None:
    global _overrides
    path = _overrides_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="settings", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(new_data, fh, ensure_ascii=False, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, str(path))
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass
    with _lock:
        _overrides = dict(new_data)


# ---------------------------------------------------------------- principal

def get_settings() -> Settings:
    """Snapshot atual: env/.env + overrides do settings.json."""
    base = Settings()
    overrides = _read_overrides()
    keep = {k: v for k, v in overrides.items() if k in _FIELDS}
    if not keep:
        return base
    return Settings(**{**base.model_dump(), **keep})


def get_settings_ui() -> list[dict]:
    """Descritores + valor atual (secret mascarado com hash SHA-256 e status)."""
    current = get_settings()
    items: list[dict] = []
    for spec in FIELDS.values():
        value = getattr(current, spec.key)
        base = spec.to_dict()
        if spec.is_secret:
            is_set = _is_real_secret(value)
            sha = ""
            masked = ""
            if is_set and value:
                import hashlib
                sha = hashlib.sha256(value.strip().encode("utf-8")).hexdigest()
                val_str = value.strip()
                if len(val_str) > 8:
                    masked = f"{val_str[:5]}••••••••{val_str[-4:]}"
                else:
                    masked = "••••••••"
            items.append({
                **base,
                "value": None,
                "set": is_set,
                "sha256": sha if is_set else None,
                "masked": masked if is_set else None,
            })
        else:
            items.append({**base, "value": value, "set": True, "sha256": None, "masked": None})
    return items


def _is_real_secret(value: str | None) -> bool:
    return is_real_secret(value)


def is_real_secret(value: str | None) -> bool:
    """Considera placeholders (.env.example) como 'não configurado'."""
    if not value:
        return False
    val = value.strip()
    placeholders = {
        "sk-or-v1-xxxxxxxxxxxxxxxxxxxx",
        "secret_xxxxxxxxxxxxxxxxxxxx",
        "xxxxxxxxxxxxxxxxxxxx",
    }
    if val in placeholders:
        return False
    # placeholders com sufixos curtos tipo 'sk-or-v1-xxxx'
    if val.lower().count("x") >= len(val) * 0.25:
        return False
    return True


def update_settings(patch: dict[str, Any]) -> dict:
    """Aplica patch e persiste. Erros de validação sobem ValueError.

    Retorna: {ok, updated, requires_restart, notice}.
    """
    unknown = [k for k in patch if k not in FIELDS]
    if unknown:
        raise ValueError(f"Configuração desconhecida: {', '.join(sorted(unknown))}")

    with _lock:
        overrides = _read_overrides()
        previous = dict(overrides)
        merged = dict(overrides)
        touched: list[str] = []
        for key, value in patch.items():
            spec = FIELDS[key]
            if spec.is_secret:
                if value is None or value == UNCHANGED_SECRET or value == "":
                    continue
                value = str(value).strip()
                if value:
                    merged[key] = value
                    touched.append(key)
                continue
            if value is None or value == "":
                merged.pop(key, None)
            else:
                merged[key] = value
            touched.append(key)

        base = Settings().model_dump()
        try:
            Settings(**{**base, **merged})
        except ValidationError as exc:
            raise ValueError(_validation_msg(exc)) from exc

        # aplica efeito runtime (device/modelo) antes de commit — com rollback
        try:
            if _WHISPER_KEYS & set(touched):
                _write_overrides(merged)
                _reset_runtime()
            else:
                _write_overrides(merged)
        except RuntimeError as exc:
            _write_overrides(previous)
            raise ValueError(f"Não foi possível aplicar as configurações: {exc}") from exc
        except Exception as exc:  # noqa: BLE001
            _write_overrides(previous)
            logger.exception("[config] falha ao aplicar patch")
            raise ValueError(f"Falha ao aplicar as configurações: {exc}") from exc

    requires = [k for k in touched if FIELDS[k].requires_restart]
    notice = (
        "Alguns campos exigem reiniciar o servidor para ter efeito." if requires else ""
    )
    return {"ok": True, "updated": touched, "requires_restart": requires, "notice": notice}


def reset_settings() -> dict:
    with _lock:
        _write_overrides({})
        try:
            _reset_runtime()
        except Exception:  # noqa: BLE001
            logger.warning("[config] reset: device não pode ser re-resolvido; uso médio do .env")
    return {"ok": True, "updated": [], "requires_restart": [], "notice": "Padrões restaurados."}


_WHISPER_KEYS = frozenset(
    {"whisper_model", "whisper_device", "whisper_engine", "whisper_language", "whisper_cpu_threads"}
)


def _reset_runtime() -> None:
    """Reaplica device/modelo em runtime (imports locais evitam ciclo)."""
    from . import device as device_mod
    from .services.transcription import reset_models

    reset_models()
    device_mod.resolve_device(get_settings())


def _validation_msg(exc: ValidationError) -> str:
    errs = exc.errors()
    if errs:
        first = errs[0]
        loc = first.get("loc")
        msg = first.get("msg", "")
        key = str(loc[0]) if loc else "?"
        spec = FIELDS.get(key)
        label = spec.label if spec else key
        return f"Valor inválido para '{label}': {msg}"
    return "Configuração inválida."