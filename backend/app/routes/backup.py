"""Rotas HTTP da API de Backup, Exportação e Importação do HiAnoter."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.backup_service import (
    create_full_backup_zip,
    export_settings,
    import_settings,
    restore_full_backup_zip,
    validate_full_backup_zip,
    validate_settings_payload,
)

logger = logging.getLogger("hinoter.routes.backup")

router = APIRouter(prefix="/api/backup", tags=["backup"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


# ==============================================================================
# Modelos Pydantic para a API
# ==============================================================================

class SettingsImportRequest(BaseModel):
    data: dict[str, Any]


class SettingsValidateRequest(BaseModel):
    data: dict[str, Any]


# ==============================================================================
# Rotas: Configurações
# ==============================================================================

@router.get("/settings/export")
async def export_settings_endpoint(
    include_secrets: bool = Query(False, description="Incluir chaves de API criptografadas/configuradas"),
) -> JSONResponse:
    """Exporta todas as configurações da plataforma em formato JSON versionado."""
    try:
        payload = export_settings(include_secrets=include_secrets)
        headers = {
            "Content-Disposition": 'attachment; filename="hianoter_settings.json"',
        }
        return JSONResponse(content=payload, headers=headers)
    except Exception as exc:
        logger.error("[backup] erro ao exportar configurações: %s", exc)
        raise HTTPException(status_code=500, detail=f"Falha ao exportar configurações: {exc}") from exc


@router.post("/settings/validate")
async def validate_settings_endpoint(
    body: SettingsValidateRequest,
) -> dict[str, Any]:
    """Valida um arquivo JSON de configurações e retorna uma prévia das alterações."""
    try:
        return validate_settings_payload(body.data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[backup] erro inesperado ao validar configurações: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erro interno de validação: {exc}") from exc


@router.post("/settings/import")
async def import_settings_endpoint(
    body: SettingsImportRequest,
) -> dict[str, Any]:
    """Importa e aplica as configurações a partir de um JSON validado."""
    try:
        return import_settings(body.data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[backup] erro ao importar configurações: %s", exc)
        raise HTTPException(status_code=500, detail=f"Falha ao importar configurações: {exc}") from exc


# ==============================================================================
# Rotas: Backup Completo (Full Data ZIP)
# ==============================================================================

@router.get("/full/export")
async def export_full_backup_endpoint(
    db: DbSession,
) -> FileResponse:
    """Gera e faz o download de um arquivo ZIP contendo todo o banco de dados e arquivos de áudio/documentos."""
    try:
        zip_path, filename = await create_full_backup_zip(db)
        return FileResponse(
            path=str(zip_path),
            filename=filename,
            media_type="application/zip",
        )
    except Exception as exc:
        logger.error("[backup] erro ao gerar backup completo: %s", exc)
        raise HTTPException(status_code=500, detail=f"Falha ao gerar backup completo: {exc}") from exc


@router.post("/full/validate")
async def validate_full_backup_endpoint(
    db: DbSession,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload e inspeção prévia de um arquivo ZIP de backup com relatório de integridade e conflitos."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="O arquivo enviado deve ser um pacote compactado (.zip).")

    temp_dir = Path(tempfile.gettempdir()) / "hianoter_validate"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file = temp_dir / f"val_{os.urandom(8).hex()}.zip"

    try:
        with open(temp_file, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)

        report = await validate_full_backup_zip(temp_file, db)
        return report
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[backup] erro ao validar ZIP de backup: %s", exc)
        raise HTTPException(status_code=500, detail=f"Falha ao validar backup: {exc}") from exc
    finally:
        if temp_file.is_file():
            try:
                temp_file.unlink()
            except Exception:
                pass


@router.post("/full/import")
async def import_full_backup_endpoint(
    db: DbSession,
    file: UploadFile = File(...),
    conflict_strategy: str = Form("merge"),  # "merge" ou "clean"
    restore_settings: bool = Form(True),
) -> dict[str, Any]:
    """Restaura todo o conteúdo da conta a partir de um arquivo ZIP de backup de forma transacional e segura."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="O arquivo enviado deve ser um pacote compactado (.zip).")

    temp_dir = Path(tempfile.gettempdir()) / "hianoter_restore"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file = temp_dir / f"res_{os.urandom(8).hex()}.zip"

    try:
        with open(temp_file, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)

        result = await restore_full_backup_zip(
            zip_path=temp_file,
            db=db,
            conflict_strategy=conflict_strategy,
            restore_settings=restore_settings,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[backup] erro crítico ao restaurar backup: %s", exc)
        raise HTTPException(status_code=500, detail=f"Falha ao restaurar backup: {exc}") from exc
    finally:
        if temp_file.is_file():
            try:
                temp_file.unlink()
            except Exception:
                pass
