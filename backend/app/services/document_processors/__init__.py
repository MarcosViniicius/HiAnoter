"""Universal Multimodal Document Processing Package for HiNoter-Lite."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from .chunker import build_semantic_chunks
from .context_builder import build_multimodal_llm_context
from .models import DocumentManifest, ExtractionDiagnostics, PageInfo, ParagraphElement
from .office_processor import process_docx_document, process_pptx_document
from .pdf_processor import process_pdf_document

logger = logging.getLogger("hinoter.document_processors")


def process_universal_document(
    doc_id: str,
    recording_id: str,
    filename: str,
    content: bytes,
    doc_dir: Path,
) -> DocumentManifest:
    """Roteador mestre de ingestão e processamento estrutural multimodal de arquivos."""
    doc_dir.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower()

    manifest: DocumentManifest

    if ext == ".pdf":
        manifest = process_pdf_document(
            doc_id=doc_id,
            recording_id=recording_id,
            filename=filename,
            pdf_bytes=content,
            output_dir=doc_dir,
        )
    elif ext == ".docx":
        manifest = process_docx_document(
            doc_id=doc_id,
            recording_id=recording_id,
            filename=filename,
            content=content,
            output_dir=doc_dir,
        )
    elif ext == ".pptx":
        manifest = process_pptx_document(
            doc_id=doc_id,
            recording_id=recording_id,
            filename=filename,
            content=content,
            output_dir=doc_dir,
        )
    else:
        # Arquivo de Texto / Imagem / Fallback
        orig_path = doc_dir / f"original_{filename}"
        with open(orig_path, "wb") as f:
            f.write(content)

        text_content = ""
        try:
            text_content = content.decode("utf-8", errors="ignore")
        except Exception:
            text_content = content.decode("latin-1", errors="ignore")

        elem = ParagraphElement(
            id="elem_0001",
            page_number=1,
            reading_order=1,
            text=text_content or f"[Arquivo: {filename}]",
        )
        p_info = PageInfo(page_number=1, width=800, height=600, elements=[elem])
        manifest = DocumentManifest(
            document_id=doc_id,
            recording_id=recording_id,
            filename=filename,
            mime_type=f"application/octet-stream",
            file_size_bytes=len(content),
            original_rel_path=f"original_{filename}",
            pages=[p_info],
            full_markdown=text_content,
            diagnostics=ExtractionDiagnostics(total_pages=1, processed_pages=1, total_elements=1),
        )

    # Constrói chunks semânticos
    manifest.semantic_chunks = build_semantic_chunks(manifest)

    # Persiste manifest central `document.json`
    manifest_path = doc_dir / "document.json"
    with open(manifest_path, "w", encoding="utf-8") as f_json:
        json.dump(manifest.model_dump(), f_json, ensure_ascii=False, indent=2)

    logger.info(
        "[document_processors] documento %s (%s) processado: %d página(s), %d fórmulas, %d tabelas, %d chunks",
        filename,
        doc_id,
        len(manifest.pages),
        manifest.diagnostics.formulas_count,
        manifest.diagnostics.tables_count,
        len(manifest.semantic_chunks),
    )

    return manifest
