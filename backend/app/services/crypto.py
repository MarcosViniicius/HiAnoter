"""Módulo de segurança criptográfica para armazenamento de chaves de API.

- Gera hash SHA-256 para fingerprint, verificação e identificação segura.
- Criptografa as chaves de API em repouso com chave derivada localmente.
- Fornece visualização mascarada (ex: sk-or••••4a9f) e status de configuração.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import platform
from typing import Any

from ..config import is_real_secret

# Chave mestra derivada da máquina e do diretório de instalação
_SALT = b"hinoter-lite-api-keys-salt-v1"


def _get_master_key() -> bytes:
    machine_id = platform.node() + platform.machine() + os.path.expanduser("~")
    return hashlib.pbkdf2_hmac("sha256", machine_id.encode("utf-8"), _SALT, 100_000)


def compute_sha256(secret: str) -> str:
    """Calcula hash SHA-256 da chave de API."""
    if not secret:
        return ""
    return hashlib.sha256(secret.strip().encode("utf-8")).hexdigest()


def mask_secret(secret: str) -> str:
    """Retorna prévia mascarada segura da chave (ex: sk-or••••••••4a9f)."""
    if not is_real_secret(secret):
        return ""
    val = secret.strip()
    if len(val) <= 8:
        return "••••••••"
    prefix = val[:5]
    suffix = val[-4:]
    return f"{prefix}••••••••{suffix}"


def encrypt_secret(secret: str) -> str:
    """Criptografa a chave de API em repouso."""
    if not secret:
        return ""
    key = _get_master_key()
    raw = secret.encode("utf-8")
    # XOR com keystream derivado por HMAC-SHA256
    keystream = hashlib.sha256(key + _SALT).digest()
    while len(keystream) < len(raw):
        keystream += hashlib.sha256(keystream + key).digest()
    encrypted = bytes(b ^ k for b, k in zip(raw, keystream))
    return base64.b64encode(encrypted).decode("ascii")


def decrypt_secret(encrypted_b64: str) -> str:
    """Descriptografa a chave de API recuperada do banco."""
    if not encrypted_b64:
        return ""
    try:
        key = _get_master_key()
        encrypted = base64.b64decode(encrypted_b64.encode("ascii"))
        keystream = hashlib.sha256(key + _SALT).digest()
        while len(keystream) < len(encrypted):
            keystream += hashlib.sha256(keystream + key).digest()
        raw = bytes(b ^ k for b, k in zip(encrypted, keystream))
        return raw.decode("utf-8")
    except Exception:
        return ""


def get_secret_metadata(secret: str | None) -> dict[str, Any]:
    """Retorna metadados seguros (status configurado, hash SHA-256 e preview)."""
    if not is_real_secret(secret):
        return {
            "configured": False,
            "sha256": None,
            "masked": None,
        }
    val = (secret or "").strip()
    return {
        "configured": True,
        "sha256": compute_sha256(val),
        "masked": mask_secret(val),
    }
