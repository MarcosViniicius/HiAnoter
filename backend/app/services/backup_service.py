"""Serviço unificado de Backup e Restauração para o HiAnoter.

Suporta:
1. Exportação e Importação de Configurações (JSON versionado).
2. Backup Completo de Dados (ZIP com manifest.json, tabelas relacionais e arquivos binários de áudio/documentos).
3. Validação de integridade, detecção de conflitos, proteção estrita contra Path Traversal (Zip Slip) e restauração transacional.
"""

from __future__ import annotations

import datetime as dt
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import (
    get_settings,
    is_real_secret,
    settings_file_path,
    update_settings,
)
from ..models import (
    Recording,
    RecordingDocument,
    SummaryVersion,
    TranscriptionVersion,
)

logger = logging.getLogger("hinoter.backup")

SETTINGS_FORMAT_ID = "hianoter-settings"
SETTINGS_FORMAT_VERSION = 1

FULL_BACKUP_FORMAT_ID = "hianoter-full-backup"
FULL_BACKUP_FORMAT_VERSION = 1


# ==============================================================================
# 1. Configurações (Settings Export & Import)
# ==============================================================================

def export_settings(include_secrets: bool = False) -> dict[str, Any]:
    """Gera o payload JSON estruturado e versionado de configurações."""
    s = get_settings()

    settings_payload: dict[str, Any] = {
        "appearance": {
            "theme": s.theme,
        },
        "ai": {
            "llm_provider": s.llm_provider,
            "llm_model": s.llm_model,
            "llm_base_url": s.llm_base_url,
            "openrouter_model": s.openrouter_model,
            "openrouter_base_url": s.openrouter_base_url,
            "llm_chunk_token_limit": s.llm_chunk_token_limit,
            "llm_max_retries": s.llm_max_retries,
            "llm_retry_base_delay": s.llm_retry_base_delay,
        },
        "transcription": {
            "transcription_provider": s.transcription_provider,
            "openrouter_whisper_model": s.openrouter_whisper_model,
            "whisper_model": s.whisper_model,
            "whisper_device": s.whisper_device,
            "whisper_engine": s.whisper_engine,
            "whisper_language": s.whisper_language,
            "whisper_mode": s.whisper_mode,
            "whisper_beam_size": s.whisper_beam_size,
            "whisper_temperature_fallback": s.whisper_temperature_fallback,
            "whisper_cpu_threads": s.whisper_cpu_threads,
        },
        "integrations": {
            "notion_database_id": s.notion_database_id,
        },
        "system": {
            "max_upload_mb": s.max_upload_mb,
        },
    }

    if include_secrets:
        if is_real_secret(s.openrouter_api_key):
            settings_payload["ai"]["openrouter_api_key"] = s.openrouter_api_key
        if is_real_secret(s.openai_api_key):
            settings_payload["ai"]["openai_api_key"] = s.openai_api_key
        if is_real_secret(s.gemini_api_key):
            settings_payload["ai"]["gemini_api_key"] = s.gemini_api_key
        if is_real_secret(s.llm_api_key):
            settings_payload["ai"]["llm_api_key"] = s.llm_api_key
        if is_real_secret(s.notion_api_key):
            settings_payload["integrations"]["notion_api_key"] = s.notion_api_key

    return {
        "format": SETTINGS_FORMAT_ID,
        "version": SETTINGS_FORMAT_VERSION,
        "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "appVersion": "3.0.0",
        "hasSecrets": include_secrets,
        "settings": settings_payload,
    }


def validate_settings_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Valida formato, versão e estrutura do arquivo de configurações."""
    if not isinstance(data, dict):
        raise ValueError("O arquivo de configuração deve ser um objeto JSON válido.")

    fmt = data.get("format")
    if fmt != SETTINGS_FORMAT_ID:
        raise ValueError(
            f"Formato de arquivo incompatível: esperado '{SETTINGS_FORMAT_ID}', recebido '{fmt}'."
        )

    version = data.get("version")
    if not isinstance(version, int) or version > SETTINGS_FORMAT_VERSION:
        raise ValueError(
            f"Versão de formato de configuração não suportada (versão {version}). A versão suportada atual é {SETTINGS_FORMAT_VERSION}."
        )

    raw_settings = data.get("settings")
    if not isinstance(raw_settings, dict):
        raise ValueError("O bloco 'settings' está ausente ou inválido no arquivo.")

    # Flatten categories into flat key-value pairs for update_settings
    flat_patch: dict[str, Any] = {}
    summary_items: list[dict[str, Any]] = []

    for category, cat_data in raw_settings.items():
        if not isinstance(cat_data, dict):
            continue
        for key, val in cat_data.items():
            if val is not None:
                flat_patch[key] = val
                summary_items.append({
                    "category": category,
                    "key": key,
                    "value": "***" if "api_key" in key else val,
                })

    if not flat_patch:
        raise ValueError("Nenhuma configuração válida encontrada para importar.")

    return {
        "valid": True,
        "format": fmt,
        "version": version,
        "exportedAt": data.get("exportedAt"),
        "totalSettings": len(flat_patch),
        "settingsSummary": summary_items,
        "flatPatch": flat_patch,
    }


def import_settings(data: dict[str, Any]) -> dict[str, Any]:
    """Aplica o arquivo de configurações de forma segura."""
    validated = validate_settings_payload(data)
    patch = validated["flatPatch"]

    result = update_settings(patch)
    logger.info("[backup] configurações importadas com sucesso: %d campos atualizados", len(patch))
    return {
        "ok": True,
        "updatedCount": len(result.get("updated", [])),
        "updated": result.get("updated", []),
        "requiresRestart": result.get("requires_restart", []),
        "notice": result.get("notice", "Configurações importadas com sucesso."),
    }


# ==============================================================================
# 2. Backup Completo de Dados (Full ZIP Export & Import)
# ==============================================================================

def _serialize_datetime(val: Any) -> Any:
    if isinstance(val, (dt.datetime, dt.date)):
        return val.isoformat()
    return val


def _parse_datetime(val: Any) -> dt.datetime | None:
    if not val:
        return None
    if isinstance(val, dt.datetime):
        return val
    try:
        return dt.datetime.fromisoformat(val)
    except Exception:
        return None


def _is_safe_zip_path(target_base: Path, path_in_zip: str) -> bool:
    """Garante defesa estrita contra ataques de Zip Slip / Path Traversal."""
    # Impede caminhos absolutos como /etc/passwd ou C:\\windows
    if os.path.isabs(path_in_zip) or path_in_zip.startswith("/") or path_in_zip.startswith("\\"):
        return False
    resolved = (target_base / path_in_zip).resolve()
    base_resolved = target_base.resolve()
    try:
        resolved.relative_to(base_resolved)
        return True
    except ValueError:
        return False


async def create_full_backup_zip(db: AsyncSession, target_path: Path | None = None) -> tuple[Path, str]:
    """Cria um arquivo ZIP determinístico contendo manifest.json, dados relacionais e binários."""
    s = get_settings()

    # 1. Busca todos os registros do banco de dados
    rec_rows = (await db.execute(select(Recording).order_by(Recording.created_at.asc()))).scalars().all()
    trans_rows = (await db.execute(select(TranscriptionVersion).order_by(TranscriptionVersion.created_at.asc()))).scalars().all()
    sum_rows = (await db.execute(select(SummaryVersion).order_by(SummaryVersion.created_at.asc()))).scalars().all()
    doc_rows = (await db.execute(select(RecordingDocument).order_by(RecordingDocument.created_at.asc()))).scalars().all()

    recordings_data = []
    for r in rec_rows:
        recordings_data.append({
            "id": r.id,
            "title": r.title,
            "original_filename": r.original_filename,
            "duration_seconds": r.duration_seconds,
            "status": r.status,
            "progress_pct": r.progress_pct,
            "error_message": r.error_message,
            "retry_count": r.retry_count,
            "raw_transcript": r.raw_transcript,
            "transcript_segments": r.transcript_segments,
            "summary_style": r.summary_style,
            "execution_mode": r.execution_mode,
            "summary_markdown": r.summary_markdown,
            "action_items": r.action_items,
            "llm_cost_usd": r.llm_cost_usd,
            "summary_error_message": r.summary_error_message,
            "notion_page_id": r.notion_page_id,
            "notion_page_url": r.notion_page_url,
            "notion_export_status": r.notion_export_status,
            "notion_error_message": r.notion_error_message,
            "created_at": _serialize_datetime(r.created_at),
            "icon": r.icon,
            "mindmap_json": r.mindmap_json,
            "active_transcription_id": r.active_transcription_id,
            "active_summary_id": r.active_summary_id,
            "transcription_provider": r.transcription_provider,
            "whisper_model": r.whisper_model,
        })

    transcriptions_data = []
    for t in trans_rows:
        transcriptions_data.append({
            "id": t.id,
            "recording_id": t.recording_id,
            "version_number": t.version_number,
            "engine": t.engine,
            "model_name": t.model_name,
            "duration_seconds": t.duration_seconds,
            "raw_transcript": t.raw_transcript,
            "transcript_segments": t.transcript_segments,
            "status": t.status,
            "error_message": t.error_message,
            "created_at": _serialize_datetime(t.created_at),
        })

    summaries_data = []
    for sm in sum_rows:
        summaries_data.append({
            "id": sm.id,
            "recording_id": sm.recording_id,
            "transcription_version_id": sm.transcription_version_id,
            "version_number": sm.version_number,
            "style": sm.style,
            "model_name": sm.model_name,
            "summary_markdown": sm.summary_markdown,
            "mindmap_json": sm.mindmap_json,
            "action_items": sm.action_items,
            "llm_cost_usd": sm.llm_cost_usd,
            "context_docs_count": sm.context_docs_count,
            "status": sm.status,
            "error_message": sm.error_message,
            "created_at": _serialize_datetime(sm.created_at),
        })

    documents_data = []
    for d in doc_rows:
        documents_data.append({
            "id": d.id,
            "recording_id": d.recording_id,
            "doc_type": d.doc_type,
            "filename": d.filename,
            "content_text": d.content_text,
            "token_count": d.token_count,
            "pages_count": d.pages_count,
            "structure_json": d.structure_json,
            "diagnostics": d.diagnostics,
            "created_at": _serialize_datetime(d.created_at),
        })

    # 2. Prepara arquivo ZIP temporário
    if target_path is None:
        timestamp_str = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"hianoter_backup_{timestamp_str}.zip"
        temp_dir = Path(tempfile.gettempdir()) / "hianoter_backups"
        temp_dir.mkdir(parents=True, exist_ok=True)
        target_path = temp_dir / filename
    else:
        filename = target_path.name

    audio_files_mapped: list[dict[str, Any]] = []
    doc_files_mapped: list[dict[str, Any]] = []
    total_binary_bytes = 0

    with zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # A. Escreve arquivos de dados relacionais
        zf.writestr("data/recordings.json", json.dumps(recordings_data, ensure_ascii=False, indent=2))
        zf.writestr("data/transcription_versions.json", json.dumps(transcriptions_data, ensure_ascii=False, indent=2))
        zf.writestr("data/summary_versions.json", json.dumps(summaries_data, ensure_ascii=False, indent=2))
        zf.writestr("data/recording_documents.json", json.dumps(documents_data, ensure_ascii=False, indent=2))

        # Escreve configurações do ambiente
        settings_export = export_settings(include_secrets=False)
        zf.writestr("data/settings.json", json.dumps(settings_export, ensure_ascii=False, indent=2))

        # B. Copia arquivos binários de áudio
        for r in rec_rows:
            audio_paths = []
            if r.file_path and Path(r.file_path).is_file():
                audio_paths.append((r.file_path, f"files/audio/{r.id}{Path(r.file_path).suffix or '.wav'}"))
            elif r.original_file_path and Path(r.original_file_path).is_file():
                audio_paths.append((r.original_file_path, f"files/audio/{r.id}{Path(r.original_file_path).suffix or '.wav'}"))

            for disk_path_str, zip_dest in audio_paths:
                p = Path(disk_path_str)
                if p.is_file():
                    sz = p.stat().st_size
                    zf.write(p, zip_dest)
                    total_binary_bytes += sz
                    audio_files_mapped.append({
                        "recordingId": r.id,
                        "zipPath": zip_dest,
                        "sizeBytes": sz,
                    })

        # C. Copia arquivos binários de documentos anexos
        for d in doc_rows:
            if d.file_path and Path(d.file_path).is_file():
                p = Path(d.file_path)
                safe_name = f"{d.id}_{p.name}"
                zip_dest = f"files/documents/{safe_name}"
                sz = p.stat().st_size
                zf.write(p, zip_dest)
                total_binary_bytes += sz
                doc_files_mapped.append({
                    "documentId": d.id,
                    "recordingId": d.recording_id,
                    "filename": d.filename,
                    "zipPath": zip_dest,
                    "sizeBytes": sz,
                })

        # D. Cria e escreve o manifest.json
        manifest = {
            "format": FULL_BACKUP_FORMAT_ID,
            "version": FULL_BACKUP_FORMAT_VERSION,
            "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "appVersion": "3.0.0",
            "stats": {
                "recordingsCount": len(recordings_data),
                "transcriptionsCount": len(transcriptions_data),
                "summariesCount": len(summaries_data),
                "documentsCount": len(documents_data),
                "audioFilesCount": len(audio_files_mapped),
                "docFilesCount": len(doc_files_mapped),
                "totalBinaryBytes": total_binary_bytes,
            },
            "files": {
                "audio": audio_files_mapped,
                "documents": doc_files_mapped,
            },
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    logger.info(
        "[backup] backup completo criado em %s (%d gravações, %d docs, %d bytes)",
        target_path, len(recordings_data), len(documents_data), total_binary_bytes,
    )
    return target_path, filename


async def validate_full_backup_zip(zip_path: Path, db: AsyncSession) -> dict[str, Any]:
    """Inspeciona o arquivo ZIP de backup, valida a integridade do manifesto e calcula conflitos com dados existentes."""
    if not zip_path.is_file():
        raise ValueError("O arquivo de backup não foi encontrado.")

    if not zipfile.is_zipfile(zip_path):
        raise ValueError("O arquivo enviado não é um arquivo ZIP válido.")

    with zipfile.ZipFile(zip_path, "r") as zf:
        namelist = set(zf.namelist())

        if "manifest.json" not in namelist:
            raise ValueError("O arquivo de backup não contém o 'manifest.json' obrigatório.")

        try:
            manifest_raw = zf.read("manifest.json").decode("utf-8")
            manifest = json.loads(manifest_raw)
        except Exception as exc:
            raise ValueError(f"Falha ao ler manifest.json do backup: {exc}") from exc

        fmt = manifest.get("format")
        if fmt != FULL_BACKUP_FORMAT_ID:
            raise ValueError(
                f"Formato de backup inválido: esperado '{FULL_BACKUP_FORMAT_ID}', recebido '{fmt}'."
            )

        version = manifest.get("version")
        if not isinstance(version, int) or version > FULL_BACKUP_FORMAT_VERSION:
            raise ValueError(
                f"Versão de backup não suportada (versão {version}). A versão suportada atual é {FULL_BACKUP_FORMAT_VERSION}."
            )

        # Checa presença de arquivos de dados relacionais
        required_data_files = [
            "data/recordings.json",
            "data/transcription_versions.json",
            "data/summary_versions.json",
            "data/recording_documents.json",
        ]
        for req in required_data_files:
            if req not in namelist:
                raise ValueError(f"Arquivo relacional ausente no backup: '{req}'.")

        # Inspeciona IDs de gravações para detectar conflitos
        recordings_raw = json.loads(zf.read("data/recordings.json").decode("utf-8"))
        backup_rec_ids = [r.get("id") for r in recordings_raw if r.get("id")]

        # Busca conflitos no banco atual
        existing_recs = (await db.execute(
            select(Recording.id, Recording.title).where(Recording.id.in_(backup_rec_ids))
        )).all()

        conflicts = [
            {"id": row[0], "title": row[1]} for row in existing_recs
        ]

        # Verifica integridade dos binários mapeados no manifest
        manifest_audio = manifest.get("files", {}).get("audio", [])
        manifest_docs = manifest.get("files", {}).get("documents", [])

        missing_files = []
        for a in manifest_audio:
            if a.get("zipPath") not in namelist:
                missing_files.append(a.get("zipPath"))
        for d in manifest_docs:
            if d.get("zipPath") not in namelist:
                missing_files.append(d.get("zipPath"))

        has_settings = "data/settings.json" in namelist

        return {
            "valid": True,
            "format": fmt,
            "version": version,
            "exportedAt": manifest.get("exportedAt"),
            "appVersion": manifest.get("appVersion", "3.0.0"),
            "stats": manifest.get("stats", {}),
            "recordingsPreview": [
                {"id": r.get("id"), "title": r.get("title"), "created_at": r.get("created_at")}
                for r in recordings_raw[:10]
            ],
            "totalRecordings": len(recordings_raw),
            "hasSettings": has_settings,
            "existingConflictsCount": len(conflicts),
            "conflicts": conflicts[:10],
            "missingFilesCount": len(missing_files),
            "missingFiles": missing_files,
        }


async def restore_full_backup_zip(
    zip_path: Path,
    db: AsyncSession,
    conflict_strategy: str = "merge",  # "merge" (atualiza existentes) ou "clean" (limpa antes)
    restore_settings: bool = True,
) -> dict[str, Any]:
    """Executa a restauração completa e transacional do backup."""
    validation = await validate_full_backup_zip(zip_path, db)
    if not validation.get("valid"):
        raise ValueError("O arquivo de backup é inválido.")

    s = get_settings()
    data_dir = s.data_path
    audio_dir = s.audio_path
    documents_dir = s.documents_path

    audio_dir.mkdir(parents=True, exist_ok=True)
    documents_dir.mkdir(parents=True, exist_ok=True)

    extracted_files: list[Path] = []

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # 1. Restauração de Configurações (se solicitado)
            if restore_settings and "data/settings.json" in zf.namelist():
                try:
                    settings_json = json.loads(zf.read("data/settings.json").decode("utf-8"))
                    import_settings(settings_json)
                except Exception as exc:
                    logger.warning("[backup] aviso ao importar configurações do zip: %s", exc)

            # 2. Extração segura de arquivos de áudio
            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            audio_maps = manifest.get("files", {}).get("audio", [])
            for item in audio_maps:
                zip_path_entry = item.get("zipPath")
                if not zip_path_entry or zip_path_entry not in zf.namelist():
                    continue

                if not _is_safe_zip_path(data_dir, zip_path_entry):
                    raise ValueError(f"Caminho inseguro detectado no arquivo ZIP: '{zip_path_entry}'")

                # Grava no diretório de áudio definitivo
                dest_filename = Path(zip_path_entry).name
                dest_file = audio_dir / dest_filename
                with zf.open(zip_path_entry) as src, open(dest_file, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted_files.append(dest_file)

            # 3. Extração segura de arquivos de documentos
            doc_maps = manifest.get("files", {}).get("documents", [])
            for item in doc_maps:
                zip_path_entry = item.get("zipPath")
                if not zip_path_entry or zip_path_entry not in zf.namelist():
                    continue

                if not _is_safe_zip_path(data_dir, zip_path_entry):
                    raise ValueError(f"Caminho inseguro detectado no arquivo ZIP: '{zip_path_entry}'")

                dest_filename = Path(zip_path_entry).name
                dest_file = documents_dir / dest_filename
                with zf.open(zip_path_entry) as src, open(dest_file, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted_files.append(dest_file)

            # 4. Leitura dos dados JSON
            recs_data = json.loads(zf.read("data/recordings.json").decode("utf-8"))
            trans_data = json.loads(zf.read("data/transcription_versions.json").decode("utf-8"))
            sums_data = json.loads(zf.read("data/summary_versions.json").decode("utf-8"))
            docs_data = json.loads(zf.read("data/recording_documents.json").decode("utf-8"))

            # 5. Estratégia de conflito: se "clean", apaga gravações existentes
            if conflict_strategy == "clean":
                await db.execute(delete(RecordingDocument))
                await db.execute(delete(SummaryVersion))
                await db.execute(delete(TranscriptionVersion))
                await db.execute(delete(Recording))
                await db.flush()

            # 6. Reconstitui gravações no banco
            imported_rec_count = 0
            for r in recs_data:
                rec_id = r["id"]
                existing = await db.get(Recording, rec_id)
                if existing:
                    # Atualiza os dados existentes
                    for k, v in r.items():
                        if k == "created_at":
                            v = _parse_datetime(v)
                        setattr(existing, k, v)
                else:
                    # Encontra o arquivo de áudio restaurado em disco se existir
                    audio_candidate = audio_dir / f"{rec_id}.wav"
                    file_path = str(audio_candidate) if audio_candidate.is_file() else None

                    new_rec = Recording(
                        id=rec_id,
                        title=r.get("title") or "Gravação Restaurada",
                        original_filename=r.get("original_filename") or "",
                        file_path=file_path,
                        original_file_path=file_path,
                        duration_seconds=float(r.get("duration_seconds") or 0.0),
                        status=r.get("status") or "COMPLETED",
                        progress_pct=int(r.get("progress_pct") or 100),
                        error_message=r.get("error_message"),
                        retry_count=int(r.get("retry_count") or 0),
                        raw_transcript=r.get("raw_transcript"),
                        transcript_segments=r.get("transcript_segments"),
                        summary_style=r.get("summary_style") or "ABSTRACT",
                        execution_mode=r.get("execution_mode") or "IMMEDIATE",
                        summary_markdown=r.get("summary_markdown"),
                        action_items=r.get("action_items"),
                        llm_cost_usd=r.get("llm_cost_usd"),
                        summary_error_message=r.get("summary_error_message"),
                        notion_page_id=r.get("notion_page_id"),
                        notion_page_url=r.get("notion_page_url"),
                        notion_export_status=r.get("notion_export_status") or "NOT_EXPORTED",
                        notion_error_message=r.get("notion_error_message"),
                        created_at=_parse_datetime(r.get("created_at")) or dt.datetime.now(dt.timezone.utc),
                        icon=r.get("icon"),
                        mindmap_json=r.get("mindmap_json"),
                        active_transcription_id=r.get("active_transcription_id"),
                        active_summary_id=r.get("active_summary_id"),
                        transcription_provider=r.get("transcription_provider"),
                        whisper_model=r.get("whisper_model"),
                    )
                    db.add(new_rec)
                imported_rec_count += 1

            await db.flush()

            # 7. Reconstitui versões de transcrição
            for t in trans_data:
                t_id = t["id"]
                existing_t = await db.get(TranscriptionVersion, t_id)
                if existing_t:
                    for k, v in t.items():
                        if k == "created_at":
                            v = _parse_datetime(v)
                        setattr(existing_t, k, v)
                else:
                    new_t = TranscriptionVersion(
                        id=t_id,
                        recording_id=t["recording_id"],
                        version_number=int(t.get("version_number") or 1),
                        engine=t.get("engine") or "faster-whisper",
                        model_name=t.get("model_name") or "large-v3",
                        duration_seconds=float(t.get("duration_seconds") or 0.0),
                        raw_transcript=t.get("raw_transcript"),
                        transcript_segments=t.get("transcript_segments"),
                        status=t.get("status") or "COMPLETED",
                        error_message=t.get("error_message"),
                        created_at=_parse_datetime(t.get("created_at")) or dt.datetime.now(dt.timezone.utc),
                    )
                    db.add(new_t)

            await db.flush()

            # 8. Reconstitui versões de resumos
            for sm in sums_data:
                sm_id = sm["id"]
                existing_sm = await db.get(SummaryVersion, sm_id)
                if existing_sm:
                    for k, v in sm.items():
                        if k == "created_at":
                            v = _parse_datetime(v)
                        setattr(existing_sm, k, v)
                else:
                    new_sm = SummaryVersion(
                        id=sm_id,
                        recording_id=sm["recording_id"],
                        transcription_version_id=sm.get("transcription_version_id"),
                        version_number=int(sm.get("version_number") or 1),
                        style=sm.get("style") or "ABSTRACT",
                        model_name=sm.get("model_name") or "",
                        summary_markdown=sm.get("summary_markdown"),
                        mindmap_json=sm.get("mindmap_json"),
                        action_items=sm.get("action_items"),
                        llm_cost_usd=sm.get("llm_cost_usd"),
                        context_docs_count=int(sm.get("context_docs_count") or 0),
                        status=sm.get("status") or "COMPLETED",
                        error_message=sm.get("error_message"),
                        created_at=_parse_datetime(sm.get("created_at")) or dt.datetime.now(dt.timezone.utc),
                    )
                    db.add(new_sm)

            await db.flush()

            # 9. Reconstitui documentos anexos
            for d in docs_data:
                d_id = d["id"]
                existing_d = await db.get(RecordingDocument, d_id)

                # Busca arquivo em documents_dir
                doc_file_candidates = list(documents_dir.glob(f"{d_id}_*"))
                file_path = str(doc_file_candidates[0]) if doc_file_candidates else None

                if existing_d:
                    for k, v in d.items():
                        if k == "created_at":
                            v = _parse_datetime(v)
                        setattr(existing_d, k, v)
                    if file_path:
                        existing_d.file_path = file_path
                else:
                    new_d = RecordingDocument(
                        id=d_id,
                        recording_id=d["recording_id"],
                        doc_type=d.get("doc_type") or "text",
                        filename=d.get("filename") or "documento",
                        file_path=file_path,
                        content_text=d.get("content_text"),
                        token_count=d.get("token_count") or 0,
                        pages_count=d.get("pages_count") or 1,
                        structure_json=d.get("structure_json"),
                        diagnostics=d.get("diagnostics"),
                        created_at=_parse_datetime(d.get("created_at")) or dt.datetime.now(dt.timezone.utc),
                    )
                    db.add(new_d)

            await db.commit()

        logger.info(
            "[backup] restauração concluída com sucesso (%d gravações restauradas)",
            imported_rec_count,
        )
        return {
            "ok": True,
            "recordingsRestored": imported_rec_count,
            "transcriptionsRestored": len(trans_data),
            "summariesRestored": len(sums_data),
            "documentsRestored": len(docs_data),
            "filesExtracted": len(extracted_files),
            "message": f"Backup restaurado com sucesso! {imported_rec_count} gravações e {len(docs_data)} materiais foram sincronizados.",
        }

    except Exception as exc:
        await db.rollback()
        logger.error("[backup] erro durante a restauração do backup, rollback executado: %s", exc)
        raise ValueError(f"Falha ao restaurar backup: {exc}") from exc