import asyncio
import datetime as dt
import json
import logging
import mimetypes
import os
import re
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import device as device_mod
from ..config import get_settings
from ..database import async_session, get_db
from ..events import hub
from ..models import (
    NotionExportStatus,
    Recording,
    RecordingDocument,
    RecordingStatus,
    SummaryStyle,
    SummaryVersion,
    TranscriptionVersion,
    default_title,
    new_id,
)
from ..queue import queue
from ..schemas import (
    ChatRequest,
    ChatResponse,
    CreateMaterialsSessionRequest,
    DocumentCreate,
    HistoryResponse,
    MaterialItemInput,
    ProcessRequest,
    RecordingDetail,
    RecordingDocumentOut,
    RecordingListItem,
    SelectVersionRequest,
    SummarizeRequest,
    SummaryVersionOut,
    TranscribeRequest,
    TranscriptionVersionOut,
    UploadResponse,
)
from ..services.extractors import (
    estimate_tokens,
    extract_text_from_document,
    fetch_url_content,
)
from ..services.document_processors import process_universal_document
from ..services.notion import NotionConfigError, NotionExportError, export_to_notion
from ..services.summarize import (
    chat_with_recording_context,
    generate_standalone_mindmap,
    summarize_materials,
    summarize_transcript,
)
from ..services.youtube import extract_youtube_content, is_youtube_url

logger = logging.getLogger("hinoter.api")

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

settings = get_settings()

ALLOWED_EXTENSIONS = {".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4"}
ALLOWED_EXTENSION_LABEL = ", ".join(sorted(ALLOWED_EXTENSIONS))
CHUNK = 1024 * 1024

DbSession = Annotated[AsyncSession, Depends(get_db)]


def _raise_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Gravação não encontrada")


async def publish_event(recording_id: str, event: str, data: dict | None = None) -> None:
    """Helper unificado para publicar eventos em tempo real no EventHub SSE."""
    payload = {"id": recording_id}
    if data:
        payload.update(data)
    await hub.publish(recording_id, event, payload)


# ---------------------------------------------------------------- upload

@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_recording(
    file: Annotated[UploadFile, File(...)],
    db: DbSession,
    deferred: bool = Query(False, description="Se true, salva como rascunho sem enfileirar imediatamente"),
    summary_style: str = Query("ABSTRACT", description="Estilo de resumo preferido"),
    transcription_provider: str = Query("local", description="Motor de transcrição: 'local' ou 'openrouter'"),
    whisper_model: str | None = Query(None, description="Modelo whisper (opcional)"),
    title: str | None = Query(None, description="Título personalizado para a gravação"),
) -> UploadResponse:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Extensão '{ext or 'sem extensão'}' não suportada. Formatos aceitos: {ALLOWED_EXTENSION_LABEL}.",
        )

    rid = new_id()
    s = get_settings()
    target = s.uploads_path / f"{rid}{ext}"
    max_bytes = s.max_upload_bytes

    known_size = getattr(file, "size", None) or 0
    if known_size and known_size > max_bytes:
        raise HTTPException(status_code=413, detail=f"Arquivo excede o limite de {s.max_upload_mb} MB.")

    written = 0
    with open(target, "wb") as out:
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Arquivo excede o limite de {s.max_upload_mb} MB.")
            out.write(chunk)

    if written == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    initial_status = RecordingStatus.DRAFT.value if deferred else RecordingStatus.QUEUED.value
    execution_mode = "DEFERRED" if deferred else "IMMEDIATE"
    valid_style = summary_style.upper() if summary_style.upper() in SummaryStyle.__members__ else "ABSTRACT"
    recording_title = title.strip() if title and title.strip() else default_title()

    recording = Recording(
        id=rid,
        title=recording_title,
        original_filename=file.filename or target.name,
        original_file_path=str(target),
        status=initial_status,
        progress_pct=0,
        summary_style=valid_style,
        execution_mode=execution_mode,
        transcription_provider=transcription_provider,
        whisper_model=whisper_model,
    )
    db.add(recording)
    await db.commit()

    if not deferred:
        queue.enqueue(
            rid,
            provider=transcription_provider,
            model=whisper_model,
        )
        logger.info(
            "[api] upload aceito e enfileirado: %s (%d bytes / provider=%s)",
            rid, written, transcription_provider,
        )
        await publish_event(rid, "progress", {
            "title": recording.title,
            "status": RecordingStatus.QUEUED.value,
            "progress_pct": 0,
        })
    else:
        logger.info("[api] upload aceito como rascunho (deferred): %s (%d bytes)", rid, written)
        await publish_event(rid, "progress", {
            "title": recording.title,
            "status": RecordingStatus.DRAFT.value,
            "progress_pct": 0,
        })

    return UploadResponse(
        id=rid,
        status=initial_status,
        title=recording.title,
        summary_style=recording.summary_style,
        execution_mode=recording.execution_mode,
        transcription_provider=transcription_provider,
    )


# ---------------------------------------------------------------- materials study session

@router.post("/materials", response_model=RecordingDetail, status_code=201)
async def create_materials_session(
    payload: CreateMaterialsSessionRequest,
    db: DbSession,
) -> RecordingDetail:
    """Cria uma nova sessão de estudo baseada exclusivamente em materiais (YouTube, Web, PDFs, Textos)."""
    rid = new_id()
    title = (payload.title or "").strip() or f"Estudo por Materiais - {dt.datetime.now().strftime('%d/%m/%Y %H:%M')}"
    style_upper = payload.summary_style.upper() if payload.summary_style.upper() in SummaryStyle.__members__ else "ABSTRACT"

    rec = Recording(
        id=rid,
        title=title,
        original_filename="Materiais de Estudo",
        file_path=None,
        original_file_path=None,
        duration_seconds=0.0,
        status=RecordingStatus.DRAFT.value if not payload.auto_generate else RecordingStatus.SUMMARIZING.value,
        summary_style=style_upper,
        execution_mode="MATERIALS",
        progress_pct=100,
    )
    db.add(rec)
    await db.flush()

    # Processa e anexa cada material fornecido
    docs_to_summarize: list[dict] = []
    for m in payload.materials:
        doc_id = new_id()
        content = m.content or ""
        fname = m.title or "Material de Estudo"
        dtype = m.doc_type or "text"

        if m.url and not content.strip():
            if is_youtube_url(m.url):
                dtype = "youtube"
            url_title, url_text = await fetch_url_content(m.url)
            fname = m.title or url_title
            content = url_text

        toks = estimate_tokens(content) if content else 0
        doc = RecordingDocument(
            id=doc_id,
            recording_id=rid,
            doc_type=dtype,
            filename=fname,
            file_path=None,
            content_text=content,
            token_count=toks,
        )
        db.add(doc)
        if content:
            docs_to_summarize.append({
                "filename": fname,
                "doc_type": dtype,
                "content_text": content,
            })

    await db.commit()
    await db.refresh(rec)
    await publish_event(rid, "progress", {
        "title": rec.title,
        "status": rec.status,
        "progress_pct": 100,
        "documents_count": len(docs_to_summarize),
    })

    # Se auto_generate for True e houver materiais, gera o resumo imediatamente!
    if payload.auto_generate and docs_to_summarize:
        try:
            result = await summarize_materials(docs_to_summarize, style=style_upper, title=rec.title)
            sv_id = new_id()
            sv = SummaryVersion(
                id=sv_id,
                recording_id=rid,
                transcription_version_id=None,
                version_number=1,
                style=style_upper,
                model_name=str(get_settings().openrouter_model),
                summary_markdown=result["summary_markdown"],
                mindmap_json=result.get("mindmap_json"),
                action_items=result["action_items"],
                llm_cost_usd=result["llm_cost_usd"],
                context_docs_count=len(docs_to_summarize),
                status="COMPLETED",
            )
            db.add(sv)

            rec.summary_markdown = result["summary_markdown"]
            rec.action_items = result["action_items"]
            rec.llm_cost_usd = result["llm_cost_usd"]
            if result.get("icon"):
                rec.icon = result["icon"]
            if result.get("mindmap_json"):
                rec.mindmap_json = result["mindmap_json"]
            rec.active_summary_id = sv_id
            rec.status = RecordingStatus.COMPLETED.value
            rec.summary_error_message = None
            await db.commit()
            logger.info("[api] sessão de materiais %s sintetizada com sucesso", rid)
            await publish_event(rid, "done", {
                "title": rec.title,
                "status": RecordingStatus.COMPLETED.value,
                "summary_updated": True,
                "active_summary_id": sv_id,
            })
        except Exception as exc:
            logger.warning("[api] falha ao sintetizar materiais para %s: %s", rid, exc)
            rec.status = RecordingStatus.COMPLETED.value
            rec.summary_error_message = str(exc)
            await db.commit()
            await publish_event(rid, "error", {
                "title": rec.title,
                "status": RecordingStatus.COMPLETED.value,
                "summary_error_message": str(exc),
            })
    elif payload.auto_generate:
        rec.status = RecordingStatus.COMPLETED.value
        await db.commit()
        await publish_event(rid, "done", {
            "title": rec.title,
            "status": RecordingStatus.COMPLETED.value,
        })

    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- process deferred recording

@router.post("/{recording_id}/process", response_model=RecordingDetail)
async def process_recording_endpoint(
    recording_id: str,
    db: DbSession,
    payload: ProcessRequest | None = None,
) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    if rec.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
        raise HTTPException(status_code=409, detail="A gravação já está sendo processada.")

    if payload:
        if payload.summary_style:
            style_upper = payload.summary_style.upper()
            if style_upper in SummaryStyle.__members__:
                rec.summary_style = style_upper
        if payload.transcription_provider:
            rec.transcription_provider = payload.transcription_provider
        if payload.whisper_model:
            rec.whisper_model = payload.whisper_model

    # Se for uma sessão puramente de materiais, aciona o resumo de materiais diretamente!
    if rec.execution_mode == "MATERIALS":
        docs_list = [
            {
                "filename": d.filename,
                "doc_type": d.doc_type,
                "content_text": d.content_text or f"[{d.doc_type.upper()}: {d.filename}]",
            }
            for d in (rec.documents or [])
        ]
        rec.status = RecordingStatus.SUMMARIZING.value
        rec.progress_pct = 100
        rec.error_message = None
        await db.commit()
        await publish_event(recording_id, "progress", {
            "title": rec.title,
            "status": RecordingStatus.SUMMARIZING.value,
            "progress_pct": 100,
            "summary_style": rec.summary_style,
        })

        try:
            result = await summarize_materials(docs_list, style=rec.summary_style or "ABSTRACT", title=rec.title)
            sv_id = new_id()
            sv = SummaryVersion(
                id=sv_id,
                recording_id=recording_id,
                transcription_version_id=None,
                version_number=1,
                style=rec.summary_style or "ABSTRACT",
                model_name=str(get_settings().openrouter_model),
                summary_markdown=result["summary_markdown"],
                mindmap_json=result.get("mindmap_json"),
                action_items=result["action_items"],
                llm_cost_usd=result["llm_cost_usd"],
                context_docs_count=len(docs_list),
                status="COMPLETED",
            )
            db.add(sv)
            rec.summary_markdown = result["summary_markdown"]
            rec.action_items = result["action_items"]
            rec.llm_cost_usd = result["llm_cost_usd"]
            if result.get("icon"):
                rec.icon = result["icon"]
            if result.get("mindmap_json"):
                rec.mindmap_json = result["mindmap_json"]
            rec.active_summary_id = sv_id
            rec.status = RecordingStatus.COMPLETED.value
            rec.summary_error_message = None
            await db.commit()
            await publish_event(recording_id, "done", {
                "title": rec.title,
                "status": RecordingStatus.COMPLETED.value,
                "summary_updated": True,
                "active_summary_id": sv_id,
            })
        except Exception as exc:
            logger.warning("[api] falha ao sintetizar materiais para %s: %s", recording_id, exc)
            rec.status = RecordingStatus.COMPLETED.value
            rec.summary_error_message = str(exc)
            await db.commit()
            await publish_event(recording_id, "error", {
                "title": rec.title,
                "status": RecordingStatus.COMPLETED.value,
                "summary_error_message": str(exc),
            })

        await db.refresh(rec)
        return RecordingDetail.model_validate(rec)

    # Caso padrão de áudio: enfileira para transcrição
    rec.status = RecordingStatus.QUEUED.value
    rec.progress_pct = 0
    rec.error_message = None
    rec.execution_mode = "IMMEDIATE"
    await db.commit()

    queue.enqueue(
        recording_id,
        provider=rec.transcription_provider,
        model=rec.whisper_model,
    )
    logger.info(
        "[api] processamento iniciado para %s (estilo=%s, provider=%s)",
        recording_id, rec.summary_style, rec.transcription_provider,
    )
    await publish_event(recording_id, "progress", {
        "title": rec.title,
        "status": RecordingStatus.QUEUED.value,
        "progress_pct": 0,
    })
    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- context documents

@router.post("/{recording_id}/documents/upload", response_model=RecordingDocumentOut, status_code=201)
async def upload_document(
    recording_id: str,
    file: Annotated[UploadFile, File(...)],
    db: DbSession,
) -> RecordingDocumentOut:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    doc_id = new_id()
    s = get_settings()
    doc_dir = s.documents_path / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    raw_filename = file.filename or "documento"
    ext = os.path.splitext(raw_filename)[1].lower()
    target_path = doc_dir / f"original_{raw_filename}"

    content = await file.read()
    with open(target_path, "wb") as out:
        out.write(content)

    # Processamento multimodal estrutural de alta fidelidade
    manifest = process_universal_document(
        doc_id=doc_id,
        recording_id=recording_id,
        filename=raw_filename,
        content=content,
        doc_dir=doc_dir,
    )

    extracted = manifest.full_markdown or extract_text_from_document(raw_filename, content)
    tokens = estimate_tokens(extracted)
    doc_type = "pdf" if ext == ".pdf" else "image" if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif") else "text"

    doc = RecordingDocument(
        id=doc_id,
        recording_id=recording_id,
        doc_type=doc_type,
        filename=raw_filename,
        file_path=str(target_path),
        manifest_path=str(doc_dir / "document.json"),
        content_text=extracted,
        token_count=tokens,
        pages_count=len(manifest.pages) or 1,
        structure_json=manifest.model_dump(),
        diagnostics=manifest.diagnostics.model_dump(),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info("[api] documento multimodal anexado a %s: %s (%d tokens estimados, %d páginas)", recording_id, raw_filename, tokens, doc.pages_count)
    await publish_event(recording_id, "document_updated", {
        "doc_id": doc.id,
        "action": "added",
        "filename": doc.filename,
        "documents_count": len(rec.documents or []) + 1,
    })
    return RecordingDocumentOut.model_validate(doc)


@router.post("/{recording_id}/documents/batch", response_model=list[RecordingDocumentOut], status_code=201)
async def upload_documents_batch(
    recording_id: str,
    files: list[UploadFile] = File(...),
    db: DbSession = None,
) -> list[RecordingDocumentOut]:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    s = get_settings()
    created_docs = []

    for file in files:
        doc_id = new_id()
        doc_dir = s.documents_path / doc_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        raw_filename = file.filename or "documento"
        ext = os.path.splitext(raw_filename)[1].lower()
        target_path = doc_dir / f"original_{raw_filename}"

        content = await file.read()
        with open(target_path, "wb") as out:
            out.write(content)

        manifest = process_universal_document(
            doc_id=doc_id,
            recording_id=recording_id,
            filename=raw_filename,
            content=content,
            doc_dir=doc_dir,
        )

        extracted = manifest.full_markdown or extract_text_from_document(raw_filename, content)
        tokens = estimate_tokens(extracted)
        doc_type = "pdf" if ext == ".pdf" else "image" if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif") else "text"

        doc = RecordingDocument(
            id=doc_id,
            recording_id=recording_id,
            doc_type=doc_type,
            filename=raw_filename,
            file_path=str(target_path),
            manifest_path=str(doc_dir / "document.json"),
            content_text=extracted,
            token_count=tokens,
            pages_count=len(manifest.pages) or 1,
            structure_json=manifest.model_dump(),
            diagnostics=manifest.diagnostics.model_dump(),
        )
        db.add(doc)
        created_docs.append(doc)

    await db.commit()
    for d in created_docs:
        await db.refresh(d)
    logger.info("[api] lote de %d documento(s) multimodal anexado a %s", len(created_docs), recording_id)
    await publish_event(recording_id, "document_updated", {
        "action": "batch_added",
        "added_count": len(created_docs),
        "documents_count": len(rec.documents or []) + len(created_docs),
    })
    return [RecordingDocumentOut.model_validate(d) for d in created_docs]


@router.get("/{recording_id}/documents/{document_id}/manifest", response_model=dict)
async def get_document_manifest(
    recording_id: str,
    document_id: str,
    db: DbSession,
) -> dict:
    doc = await db.get(RecordingDocument, document_id)
    if doc is None or doc.recording_id != recording_id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    if doc.structure_json:
        return doc.structure_json

    if doc.manifest_path and os.path.exists(doc.manifest_path):
        try:
            with open(doc.manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "full_markdown": doc.content_text or "",
        "diagnostics": {"total_pages": doc.pages_count or 1},
    }


@router.get("/{recording_id}/documents/{document_id}/assets/{asset_type}/{filename}")
async def get_document_asset(
    recording_id: str,
    document_id: str,
    asset_type: str,
    filename: str,
    db: DbSession,
) -> FileResponse:
    doc = await db.get(RecordingDocument, document_id)
    if doc is None or doc.recording_id != recording_id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    clean_type = os.path.basename(asset_type)
    clean_filename = os.path.basename(filename)

    s = get_settings()
    doc_dir = s.documents_path / document_id
    asset_path = doc_dir / clean_type / clean_filename

    if not asset_path.exists() or not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Recurso não encontrado")

    media_type = "image/png"
    if clean_filename.endswith(".jpg") or clean_filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif clean_filename.endswith(".webp"):
        media_type = "image/webp"
    elif clean_filename.endswith(".svg"):
        media_type = "image/svg+xml"

    return FileResponse(path=str(asset_path), media_type=media_type)


@router.post("/{recording_id}/documents/note", response_model=RecordingDocumentOut, status_code=201)
async def create_document_note(
    recording_id: str,
    payload: DocumentCreate,
    db: DbSession,
) -> RecordingDocumentOut:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    doc_id = new_id()
    doc_type = payload.doc_type.lower()
    filename = payload.filename or "Nota de Contexto"
    content_text = payload.content_text

    if doc_type in ("url", "youtube"):
        url = payload.content_text.strip()
        title, fetched_text = await fetch_url_content(url)
        filename = title if not payload.filename else payload.filename
        content_text = fetched_text

    tokens = estimate_tokens(content_text)

    doc = RecordingDocument(
        id=doc_id,
        recording_id=recording_id,
        doc_type=doc_type,
        filename=filename,
        file_path=None,
        content_text=content_text,
        token_count=tokens,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info("[api] nota/link anexado a %s: %s", recording_id, filename)
    await publish_event(recording_id, "document_updated", {
        "doc_id": doc.id,
        "action": "note_added",
        "filename": filename,
        "documents_count": len(rec.documents or []) + 1,
    })
    return RecordingDocumentOut.model_validate(doc)


@router.get("/{recording_id}/documents", response_model=list[RecordingDocumentOut])
async def list_recording_documents(
    recording_id: str,
    db: DbSession,
) -> list[RecordingDocumentOut]:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    return [RecordingDocumentOut.model_validate(d) for d in (rec.documents or [])]


@router.delete("/{recording_id}/documents/{document_id}", status_code=200)
async def delete_document(
    recording_id: str,
    document_id: str,
    db: DbSession,
) -> dict:
    doc = await db.get(RecordingDocument, document_id)
    if doc is None or doc.recording_id != recording_id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    if doc.file_path:
        try:
            import shutil
            p = Path(doc.file_path).resolve()
            base = get_settings().data_path.resolve()
            if str(p).startswith(str(base)):
                doc_dir = p.parent
                if doc_dir.name == document_id and doc_dir.is_dir():
                    shutil.rmtree(doc_dir, ignore_errors=True)
                else:
                    p.unlink(missing_ok=True)
        except OSError:
            logger.warning("[api] nao conseguiu apagar documento %s", doc.file_path)

    await db.delete(doc)
    await db.commit()
    logger.info("[api] documento %s removido de %s", document_id, recording_id)
    await publish_event(recording_id, "document_updated", {
        "deleted": document_id,
        "action": "deleted",
    })
    return {"ok": True, "deleted": document_id}


# ---------------------------------------------------------------- summarize on demand

# ---------------------------------------------------------------- summarize on demand

@router.post("/{recording_id}/summarize", response_model=RecordingDetail)
async def generate_summary(
    recording_id: str,
    payload: SummarizeRequest,
    db: DbSession,
) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    # Determine which transcript text/segments to use
    chosen_tv = None
    if payload.transcription_version_id:
        chosen_tv = await db.get(TranscriptionVersion, payload.transcription_version_id)
        if chosen_tv is None or chosen_tv.recording_id != recording_id:
            raise HTTPException(status_code=404, detail="Versão de transcrição especificada não foi encontrada.")
    elif rec.active_transcription_id:
        chosen_tv = await db.get(TranscriptionVersion, rec.active_transcription_id)

    raw_text = (chosen_tv.raw_transcript if chosen_tv else rec.raw_transcript) or ""
    segments = (chosen_tv.transcript_segments if chosen_tv else rec.transcript_segments) or []

    # Filter documents if specific document IDs were selected
    selected_docs = rec.documents or []
    if payload.selected_document_ids is not None:
        sel_set = set(payload.selected_document_ids)
        selected_docs = [d for d in selected_docs if d.id in sel_set]

    docs_context = [
        {
            "filename": d.filename,
            "doc_type": d.doc_type,
            "content_text": d.content_text or f"[{d.doc_type.upper()}: {d.filename}]",
        }
        for d in selected_docs
    ]

    is_materials_only = rec.execution_mode == "MATERIALS" or (not raw_text.strip() and bool(selected_docs))

    if not raw_text.strip() and not is_materials_only:
        raise HTTPException(
            status_code=400,
            detail="A gravação precisa ter uma transcrição válida ou materiais de estudo anexados antes de gerar o resumo.",
        )

    if rec.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
        raise HTTPException(status_code=409, detail="A gravação já está sendo processada.")

    style_upper = payload.style.upper() if payload.style.upper() in SummaryStyle.__members__ else "ABSTRACT"
    rec.summary_style = style_upper
    rec.status = RecordingStatus.SUMMARIZING.value
    rec.summary_error_message = None
    await db.commit()
    await publish_event(recording_id, "progress", {
        "title": rec.title,
        "status": RecordingStatus.SUMMARIZING.value,
        "progress_pct": 100,
        "summary_style": style_upper,
    })

    # Calculate next version number for summaries
    res_s_count = await db.execute(
        select(SummaryVersion).where(SummaryVersion.recording_id == recording_id)
    )
    existing_svs = res_s_count.scalars().all()
    next_s_version = len(existing_svs) + 1

    try:
        if is_materials_only:
            result = await summarize_materials(
                docs_context,
                style=style_upper,
                title=rec.title,
                additional_instructions=payload.additional_instructions,
            )
        else:
            result = await summarize_transcript(
                raw_text,
                segments,
                style=style_upper,
                context_docs=docs_context,
                additional_instructions=payload.additional_instructions,
            )

        sv_id = new_id()
        sv = SummaryVersion(
            id=sv_id,
            recording_id=recording_id,
            transcription_version_id=chosen_tv.id if chosen_tv else rec.active_transcription_id,
            version_number=next_s_version,
            style=style_upper,
            model_name=str(get_settings().openrouter_model),
            summary_markdown=result["summary_markdown"],
            mindmap_json=result.get("mindmap_json"),
            action_items=result["action_items"],
            llm_cost_usd=result["llm_cost_usd"],
            context_docs_count=len(docs_context),
            status="COMPLETED",
        )
        db.add(sv)

        rec.summary_markdown = result["summary_markdown"]
        rec.action_items = result["action_items"]
        rec.llm_cost_usd = result["llm_cost_usd"]
        if result.get("icon"):
            rec.icon = result["icon"]
        if result.get("mindmap_json"):
            rec.mindmap_json = result["mindmap_json"]
        rec.active_summary_id = sv_id
        rec.status = RecordingStatus.COMPLETED.value
        rec.summary_error_message = None
        await db.commit()
        logger.info("[api] resumo v%d gerado sob demanda para %s (estilo=%s)", next_s_version, recording_id, style_upper)
        await publish_event(recording_id, "done", {
            "title": rec.title,
            "status": RecordingStatus.COMPLETED.value,
            "summary_updated": True,
            "active_summary_id": sv_id,
            "summary_version": next_s_version,
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("[api] falha ao gerar resumo sob demanda para %s: %s", recording_id, exc)
        rec.status = RecordingStatus.COMPLETED.value
        rec.summary_error_message = str(exc)
        await db.commit()
        await publish_event(recording_id, "error", {
            "title": rec.title,
            "status": RecordingStatus.COMPLETED.value,
            "summary_error_message": str(exc),
        })

    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- generate mindmap on demand

@router.post("/{recording_id}/mindmap", response_model=RecordingDetail)
async def generate_mindmap_endpoint(
    recording_id: str,
    db: DbSession,
) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    # Use summary_markdown or raw_transcript as source
    source_text = (rec.summary_markdown or rec.raw_transcript or "").strip()
    if not source_text:
        raise HTTPException(
            status_code=400,
            detail="A gravação precisa ter uma transcrição ou resumo antes de gerar o mapa mental.",
        )

    docs_context = [
        {
            "filename": d.filename,
            "doc_type": d.doc_type,
            "content_text": d.content_text,
        }
        for d in (rec.documents or [])
        if d.content_text
    ]

    await publish_event(recording_id, "progress", {
        "title": rec.title,
        "mindmap_generating": True,
    })

    try:
        res = await generate_standalone_mindmap(source_text, context_docs=docs_context)
        rec.mindmap_json = res["mindmap_json"]
        if res.get("llm_cost_usd"):
            rec.llm_cost_usd = (rec.llm_cost_usd or 0.0) + res["llm_cost_usd"]
        await db.commit()
        await db.refresh(rec)
        logger.info("[api] mapa mental gerado com sucesso para %s", recording_id)
        await publish_event(recording_id, "done", {
            "title": rec.title,
            "mindmap_updated": True,
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("[api] falha ao gerar mapa mental para %s: %s", recording_id, exc)
        await publish_event(recording_id, "error", {
            "title": rec.title,
            "mindmap_error": str(exc),
        })
        raise HTTPException(status_code=500, detail=str(exc))

    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- chat with recording context

@router.post("/{recording_id}/chat", response_model=ChatResponse)
async def chat_with_recording_endpoint(
    recording_id: str,
    payload: ChatRequest,
    db: DbSession,
) -> ChatResponse:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    docs_context = [
        {
            "filename": d.filename,
            "doc_type": d.doc_type,
            "content_text": d.content_text,
        }
        for d in (rec.documents or [])
        if d.content_text
    ]

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    try:
        res = await chat_with_recording_context(
            messages=messages,
            title=rec.title,
            summary_markdown=rec.summary_markdown,
            raw_transcript=rec.raw_transcript,
            context_docs=docs_context,
            action_items=rec.action_items,
        )
        return ChatResponse(
            reply=res["reply"],
            llm_cost_usd=res.get("llm_cost_usd"),
            total_tokens=res.get("total_tokens"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[api] falha no chat para %s: %s", recording_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------- re-transcribe on demand

@router.post("/{recording_id}/transcribe", response_model=RecordingDetail)
async def transcribe_again(
    recording_id: str,
    db: DbSession,
    payload: TranscribeRequest | None = None,
) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    if rec.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
        raise HTTPException(status_code=409, detail="A gravação já está sendo processada.")

    rec.status = RecordingStatus.QUEUED.value
    rec.progress_pct = 0
    rec.error_message = None
    await db.commit()

    provider = payload.provider if payload else None
    model = payload.whisper_model if payload else None
    lang = payload.language if payload else None

    queue.enqueue(recording_id, provider=provider, model=model, language=lang)
    logger.info(
        "[api] nova transcrição solicitada para %s (provider=%s, model=%s)",
        recording_id, provider, model,
    )
    await publish_event(recording_id, "progress", {
        "title": rec.title,
        "status": RecordingStatus.QUEUED.value,
        "progress_pct": 0,
    })
    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- history & version selection

@router.get("/{recording_id}/history", response_model=HistoryResponse)
async def get_recording_history(recording_id: str, db: DbSession) -> HistoryResponse:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    t_res = await db.execute(
        select(TranscriptionVersion)
        .where(TranscriptionVersion.recording_id == recording_id)
        .order_by(TranscriptionVersion.version_number.desc())
    )
    transcriptions = t_res.scalars().all()

    s_res = await db.execute(
        select(SummaryVersion)
        .where(SummaryVersion.recording_id == recording_id)
        .order_by(SummaryVersion.version_number.desc())
    )
    summaries = s_res.scalars().all()

    return HistoryResponse(
        transcriptions=[TranscriptionVersionOut.model_validate(t) for t in transcriptions],
        summaries=[SummaryVersionOut.model_validate(s) for s in summaries],
        active_transcription_id=rec.active_transcription_id,
        active_summary_id=rec.active_summary_id,
    )


@router.post("/{recording_id}/select-version", response_model=RecordingDetail)
async def select_active_version(
    recording_id: str,
    payload: SelectVersionRequest,
    db: DbSession,
) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    if payload.transcription_id:
        tv = await db.get(TranscriptionVersion, payload.transcription_id)
        if tv and tv.recording_id == recording_id:
            rec.active_transcription_id = tv.id
            rec.raw_transcript = tv.raw_transcript
            rec.transcript_segments = tv.transcript_segments
            rec.duration_seconds = tv.duration_seconds

    if payload.summary_id:
        sv = await db.get(SummaryVersion, payload.summary_id)
        if sv and sv.recording_id == recording_id:
            rec.active_summary_id = sv.id
            rec.summary_markdown = sv.summary_markdown
            rec.action_items = sv.action_items
            rec.llm_cost_usd = sv.llm_cost_usd
            rec.summary_style = sv.style

    await db.commit()
    await db.refresh(rec)
    await publish_event(recording_id, "done", {
        "title": rec.title,
        "version_switched": True,
        "active_summary_id": rec.active_summary_id,
        "active_transcription_id": rec.active_transcription_id,
    })
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- list / detail

@router.get("", response_model=list[RecordingListItem])
async def list_recordings(
    db: DbSession,
    q: str | None = Query(None, description="Busca textual por título, transcrição ou resumo"),
    limit: int = 50,
    offset: int = 0,
) -> list[RecordingListItem]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = select(Recording)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Recording.title.ilike(term),
                Recording.raw_transcript.ilike(term),
                Recording.summary_markdown.ilike(term),
            )
        )

    stmt = stmt.order_by(desc(Recording.created_at)).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items: list[RecordingListItem] = []
    for rec in rows:
        preview = None
        if rec.summary_markdown:
            lines = [l.rstrip() for l in rec.summary_markdown.splitlines() if l.strip()]
            preview = "\n".join(lines[:2])
        items.append(
            RecordingListItem(
                id=rec.id,
                title=rec.title,
                original_filename=rec.original_filename,
                duration_seconds=rec.duration_seconds,
                status=rec.status,
                progress_pct=rec.progress_pct,
                retry_count=rec.retry_count,
                created_at=rec.created_at,
                summary_style=rec.summary_style or "ABSTRACT",
                execution_mode=rec.execution_mode or "IMMEDIATE",
                summary_preview=preview,
                documents_count=len(rec.documents or []),
            )
        )
    return items


@router.get("/{recording_id}", response_model=RecordingDetail)
async def get_recording(recording_id: str, db: DbSession) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- subtitle exports (SRT / VTT)

def _format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_vtt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


@router.get("/{recording_id}/export/srt")
async def export_srt(recording_id: str, db: DbSession):
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    segments = rec.transcript_segments or []
    if not segments and rec.raw_transcript:
        segments = [{"start": 0.0, "end": rec.duration_seconds or 10.0, "text": rec.raw_transcript}]

    srt_lines: list[str] = []
    for i, seg in enumerate(segments, start=1):
        start_t = _format_srt_time(float(seg.get("start", 0)))
        end_t = _format_srt_time(float(seg.get("end", 0)))
        text = str(seg.get("text", "")).strip()
        srt_lines.append(f"{i}\n{start_t} --> {end_t}\n{text}\n")

    content = "\n".join(srt_lines)
    filename = f"{rec.title or 'transcricao'}.srt"
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{recording_id}/export/vtt")
async def export_vtt(recording_id: str, db: DbSession):
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    segments = rec.transcript_segments or []
    if not segments and rec.raw_transcript:
        segments = [{"start": 0.0, "end": rec.duration_seconds or 10.0, "text": rec.raw_transcript}]

    vtt_lines: list[str] = ["WEBVTT\n"]
    for i, seg in enumerate(segments, start=1):
        start_t = _format_vtt_time(float(seg.get("start", 0)))
        end_t = _format_vtt_time(float(seg.get("end", 0)))
        text = str(seg.get("text", "")).strip()
        vtt_lines.append(f"{start_t} --> {end_t}\n{text}\n")

    content = "\n".join(vtt_lines)
    filename = f"{rec.title or 'transcricao'}.vtt"
    return Response(
        content=content,
        media_type="text/vtt; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------- audio playback

@router.get("/{recording_id}/audio")
async def get_audio(request: Request, recording_id: str, db: DbSession):
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    source = rec.file_path if (rec.file_path and Path(rec.file_path).exists()) else rec.original_file_path
    if not source or not Path(source).exists():
        if rec.status in (RecordingStatus.QUEUED.value, RecordingStatus.DRAFT.value) or not rec.file_path:
            raise HTTPException(status_code=404, detail="Áudio ainda não disponível.")
        raise HTTPException(status_code=404, detail="Arquivo de áudio não encontrado em disco.")

    path = Path(source)
    size = path.stat().st_size
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    range_header = request.headers.get("range")
    if range_header:
        start = end = None
        try:
            _, spec = range_header.split("=", 1)
            start_s, _, end_s = spec.partition("-")
            start = int(start_s) if start_s != "" else None
            end = int(end_s) if end_s != "" else None
        except ValueError:
            start = end = None
        if start is not None:
            start = max(0, min(start, size - 1))
            end = min(end, size - 1) if end is not None else min(start + 1024 * 1024 - 1, size - 1)
            if end < start:
                end = start
            length = end - start + 1
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{end}/{size}",
                "Content-Length": str(length),
                "Content-Type": media_type,
            }

            async def _partial():
                with open(path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        data = f.read(min(CHUNK, remaining))
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            return StreamingResponse(_partial(), status_code=206, headers=headers)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": media_type,
    }
    return FileResponse(path, headers=headers, filename=rec.original_filename or None)


# ---------------------------------------------------------------- SSE streams

@router.get("/events/stream")
async def stream_all_events(request: Request):
    """Stream SSE global para todas as alterações do workspace em tempo real."""
    async def event_generator():
        q = None
        try:
            yield ": connected\n\n"
            q = await hub.subscribe("*")
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            return
        finally:
            if q is not None:
                await hub.unsubscribe("*", q)
        yield ": stream closed\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/{recording_id}/stream")
async def stream_recording(request: Request, recording_id: str, db: DbSession):
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()

    async def event_generator():
        q = None
        try:
            yield ": connected\n\n"
            # Snapshot inicial com metadados para sincronização instantânea
            snapshot = {
                "id": rec.id,
                "title": rec.title,
                "status": rec.status,
                "progress_pct": rec.progress_pct,
                "error_message": rec.error_message,
                "summary_style": rec.summary_style,
                "active_summary_id": rec.active_summary_id,
                "active_transcription_id": rec.active_transcription_id,
                "documents_count": len(rec.documents or []),
                "summary_preview": (rec.summary_markdown[:180] + "…") if rec.summary_markdown else None,
            }
            yield f"event: progress\ndata: {json.dumps(snapshot)}\n\n"

            # Mantém a conexão aberta para eventos contínuos (resumos sob demanda, mapas mentais, anexos, etc.)
            q = await hub.subscribe(recording_id)
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            return
        finally:
            if q is not None:
                await hub.unsubscribe(recording_id, q)
        yield ": stream closed\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------- retry

@router.post("/{recording_id}/retry", response_model=RecordingDetail)
async def retry_recording(recording_id: str, db: DbSession) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    resumable = (
        rec.status in (RecordingStatus.FAILED.value, RecordingStatus.DRAFT.value)
        or (rec.status == RecordingStatus.COMPLETED.value and not rec.summary_markdown)
    )
    if not resumable:
        raise HTTPException(
            status_code=409,
            detail="Só é possível tentar novamente quando a gravação falhou, está em rascunho ou ficou sem resumo.",
        )
    if rec.notion_export_status == NotionExportStatus.EXPORTING.value:
        raise HTTPException(status_code=409, detail="Aguarde a exportação para o Notion concluir.")

    rec.status = RecordingStatus.QUEUED.value
    rec.progress_pct = 0
    rec.error_message = None
    rec.summary_error_message = None
    rec.retry_count += 1
    await db.commit()

    queue.enqueue(recording_id)
    logger.info("[api] retry agendado: %s (tentativa %d)", recording_id, rec.retry_count)
    await publish_event(recording_id, "progress", {
        "title": rec.title,
        "status": RecordingStatus.QUEUED.value,
        "progress_pct": 0,
        "retry_count": rec.retry_count,
    })
    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- export to Notion

@router.post("/{recording_id}/export-notion", response_model=RecordingDetail)
async def export_notion(recording_id: str, db: DbSession) -> RecordingDetail:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    if rec.status != RecordingStatus.COMPLETED.value:
        raise HTTPException(status_code=409, detail="A gravação precisa estar COMPLETED para exportar.")

    if rec.notion_export_status == NotionExportStatus.EXPORTING.value:
        raise HTTPException(status_code=409, detail="Exportação em andamento — aguarde (evita páginas duplicadas).")
    if rec.notion_export_status == NotionExportStatus.EXPORTED.value:
        if rec.notion_page_url:
            return RecordingDetail.model_validate(rec)
        raise HTTPException(status_code=409, detail="Exportação já concluída anteriormente.")

    rec.notion_export_status = NotionExportStatus.EXPORTING.value
    rec.notion_error_message = None
    await db.commit()
    await publish_event(recording_id, "notion_updated", {
        "title": rec.title,
        "notion_export_status": NotionExportStatus.EXPORTING.value,
    })

    try:
        page_id, page_url = await asyncio.to_thread(export_to_notion, rec)
    except NotionConfigError as exc:
        rec.notion_export_status = NotionExportStatus.FAILED.value
        rec.notion_error_message = str(exc)
        await db.commit()
        await publish_event(recording_id, "notion_updated", {
            "title": rec.title,
            "notion_export_status": NotionExportStatus.FAILED.value,
            "notion_error_message": str(exc),
        })
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except NotionExportError as exc:
        rec.notion_export_status = NotionExportStatus.FAILED.value
        rec.notion_error_message = str(exc)
        await db.commit()
        await publish_event(recording_id, "notion_updated", {
            "title": rec.title,
            "notion_export_status": NotionExportStatus.FAILED.value,
            "notion_error_message": str(exc),
        })
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    rec.notion_export_status = NotionExportStatus.EXPORTED.value
    rec.notion_page_id = page_id
    rec.notion_page_url = page_url
    await db.commit()
    logger.info("[api] exportado para o Notion: %s -> %s", recording_id, page_url)
    await publish_event(recording_id, "notion_updated", {
        "title": rec.title,
        "notion_export_status": NotionExportStatus.EXPORTED.value,
        "notion_page_url": page_url,
    })
    await db.refresh(rec)
    return RecordingDetail.model_validate(rec)


# ---------------------------------------------------------------- delete

async def _remove_files(rec: Recording) -> None:
    """Remove uploads/áudio/documentos do disco com segurança (nunca fora do DATA_DIR)."""
    base = get_settings().data_path.resolve()
    for attr in ("original_file_path", "file_path"):
        path = getattr(rec, attr)
        if not path:
            continue
        try:
            p = Path(path).resolve()
            if str(p).startswith(str(base)):
                p.unlink(missing_ok=True)
        except OSError:
            logger.warning("[api] nao conseguiu apagar arquivo %s", path)

    for doc in (rec.documents or []):
        if doc.file_path:
            try:
                p = Path(doc.file_path).resolve()
                if str(p).startswith(str(base)):
                    p.unlink(missing_ok=True)
            except OSError:
                logger.warning("[api] nao conseguiu apagar documento %s", doc.file_path)


@router.delete("/{recording_id}", status_code=200)
async def delete_recording(recording_id: str, db: DbSession) -> dict:
    rec = await db.get(Recording, recording_id)
    if rec is None:
        raise _raise_not_found()
    if rec.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
        raise HTTPException(status_code=409, detail="A gravação está em processamento; aguarde terminar para excluir.")
    await _remove_files(rec)
    await db.delete(rec)
    await db.commit()
    logger.info("[api] gravação excluída: %s", recording_id)
    await publish_event(recording_id, "deleted", {"deleted": [recording_id]})
    return {"ok": True, "deleted": [recording_id]}


class BulkDeleteRequest(BaseModel):
    ids: list[str] = []
    all: bool = False


@router.delete("", status_code=200)
async def delete_recordings_bulk(payload: BulkDeleteRequest, db: DbSession) -> dict:
    """Exclui várias: corpo JSON `{ids: [...]}` ou `{all: true}` (todas)."""

    if payload.all:
        result = await db.execute(select(Recording.id))
        ids = [row[0] for row in result.all()]
    else:
        ids = payload.ids or []

    if not ids:
        return {"ok": True, "deleted": [], "removed": 0}

    deleted: list[str] = []
    for rid in ids:
        rec = await db.get(Recording, rid)
        if rec is None:
            continue
        if rec.status in (RecordingStatus.TRANSCRIBING.value, RecordingStatus.SUMMARIZING.value):
            continue
        await _remove_files(rec)
        await db.delete(rec)
        deleted.append(rid)
    await db.commit()
    logger.info("[api] %d gravação(ões) excluída(s) via bulk", len(deleted))
    for rid in deleted:
        await publish_event(rid, "deleted", {"deleted": deleted})
    return {"ok": True, "deleted": deleted, "removed": len(deleted)}