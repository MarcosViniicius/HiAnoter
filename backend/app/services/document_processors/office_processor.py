"""Processors for Office documents (DOCX, PPTX, XLSX) and structured text files."""

from __future__ import annotations

import io
import logging
import os
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from .models import (
    DocumentManifest,
    ExtractionDiagnostics,
    HeadingElement,
    ListItemElement,
    PageInfo,
    ParagraphElement,
    TableElement,
)

logger = logging.getLogger("hinoter.office_processor")


def process_docx_document(
    doc_id: str,
    recording_id: str,
    filename: str,
    content: bytes,
    output_dir: Path,
) -> DocumentManifest:
    """Processa arquivo DOCX preservando parágrafos, cabeçalhos e tabelas."""
    output_dir.mkdir(parents=True, exist_ok=True)
    orig_path = output_dir / f"original_{filename}"
    with open(orig_path, "wb") as f:
        f.write(content)

    elements = []
    diag = ExtractionDiagnostics(total_pages=1, processed_pages=1)
    elem_counter = 0

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            if "word/document.xml" in z.namelist():
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)

                # Percorre parágrafos e tabelas no XML do Word
                for node in tree.iter():
                    if node.tag.endswith("}p"):
                        texts = [elem.text for elem in node.iter() if elem.text and elem.tag.endswith("}t")]
                        p_text = "".join(texts).strip()
                        if p_text:
                            elem_counter += 1
                            elem = ParagraphElement(
                                id=f"elem_{elem_counter:04d}",
                                page_number=1,
                                reading_order=elem_counter,
                                text=p_text,
                            )
                            elements.append(elem)
                            diag.paragraphs_count += 1

                    elif node.tag.endswith("}tbl"):
                        # Tabela
                        rows: list[list[str]] = []
                        for tr in node.iter():
                            if tr.tag.endswith("}tr"):
                                row_cells: list[str] = []
                                for tc in tr.iter():
                                    if tc.tag.endswith("}tc"):
                                        c_texts = [e.text for e in tc.iter() if e.text and e.tag.endswith("}t")]
                                        row_cells.append("".join(c_texts).strip())
                                if row_cells:
                                    rows.append(row_cells)

                        if rows:
                            elem_counter += 1
                            headers = rows[0]
                            data_rows = rows[1:] if len(rows) > 1 else []
                            md_lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
                            for dr in data_rows:
                                md_lines.append("| " + " | ".join(dr) + " |")

                            t_elem = TableElement(
                                id=f"elem_{elem_counter:04d}",
                                page_number=1,
                                reading_order=elem_counter,
                                headers=headers,
                                rows=data_rows,
                                markdown="\n".join(md_lines),
                            )
                            elements.append(t_elem)
                            diag.tables_count += 1
    except Exception as exc:
        logger.warning("[office_processor] erro ao processar docx %s: %s", filename, exc)

    diag.total_elements = elem_counter
    page_info = PageInfo(page_number=1, width=800, height=1100, elements=elements)
    full_md = "\n\n".join(getattr(e, "markdown", getattr(e, "text", "")) for e in elements)

    return DocumentManifest(
        document_id=doc_id,
        recording_id=recording_id,
        filename=filename,
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size_bytes=len(content),
        original_rel_path=f"original_{filename}",
        pages=[page_info],
        full_markdown=full_md,
        diagnostics=diag,
    )


def process_pptx_document(
    doc_id: str,
    recording_id: str,
    filename: str,
    content: bytes,
    output_dir: Path,
) -> DocumentManifest:
    """Processa apresentações PPTX página a página (slides)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    orig_path = output_dir / f"original_{filename}"
    with open(orig_path, "wb") as f:
        f.write(content)

    pages: list[PageInfo] = []
    diag = ExtractionDiagnostics()
    elem_counter = 0

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            slide_files = sorted([n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")])
            diag.total_pages = len(slide_files)

            for s_idx, sfile in enumerate(slide_files, start=1):
                xml_content = z.read(sfile)
                tree = ET.fromstring(xml_content)
                slide_elems = []

                texts = [elem.text.strip() for elem in tree.iter() if elem.text and elem.tag.endswith("}t") and elem.text.strip()]
                for t in texts:
                    elem_counter += 1
                    elem = ParagraphElement(
                        id=f"elem_{elem_counter:04d}",
                        page_number=s_idx,
                        reading_order=elem_counter,
                        text=t,
                    )
                    slide_elems.append(elem)
                    diag.paragraphs_count += 1

                p_info = PageInfo(
                    page_number=s_idx,
                    width=1280,
                    height=720,
                    elements=slide_elems,
                )
                pages.append(p_info)
                diag.processed_pages += 1
    except Exception as exc:
        logger.warning("[office_processor] erro ao processar pptx %s: %s", filename, exc)

    diag.total_elements = elem_counter
    full_md_slides = []
    for p in pages:
        full_md_slides.append(f"## Slide {p.page_number}\n" + "\n".join(getattr(e, "text", "") for e in p.elements))
    full_md = "\n\n---\n\n".join(full_md_slides)

    return DocumentManifest(
        document_id=doc_id,
        recording_id=recording_id,
        filename=filename,
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        file_size_bytes=len(content),
        original_rel_path=f"original_{filename}",
        pages=pages,
        full_markdown=full_md,
        diagnostics=diag,
    )
