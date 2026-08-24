"""High-fidelity structural and multimodal PDF extractor using PyMuPDF and Pillow."""

from __future__ import annotations

import io
import logging
import os
import re
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from PIL import Image

from .models import (
    DocumentManifest,
    ExtractionDiagnostics,
    FigureElement,
    FormulaElement,
    HeadingElement,
    ImageElement,
    ListItemElement,
    PageInfo,
    ParagraphElement,
    TableCell,
    TableElement,
)

logger = logging.getLogger("hinoter.pdf_processor")

MATH_SYMBOLS_REGEX = re.compile(
    r"(\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|sum|int|partial|sqrt|frac|times|pm|approx|leq|geq|neq|subset|in|forall|exists|rightarrow|infty|nabla|bmatrix|pmatrix|matrix))|"
    r"([a-zA-Z0-9_\^\+\-\*/=\(\)\{\}\[\]\|\s]{2,}[=<>≤≥≠≈][a-zA-Z0-9_\^\+\-\*/=\(\)\{\}\[\]\|\s]{2,})|"
    r"(\b[A-Za-z]\s*\(t\)\s*=\b)|"
    r"(\b\d+x\s*[\+\-]\s*\d+y\b)|"
    r"(\bdet\s*\([A-Z]\)\b)|"
    r"(\b[A-Z]\s*\^?\s*[-+]?[T0-9-1]\b)"
)


def _detect_math_latex(text: str) -> tuple[bool, str]:
    """Detects whether a text block represents a mathematical equation or matrix and formats to LaTeX."""
    t = text.strip()
    if not t:
        return False, ""

    # Check for explicit LaTeX
    if ("$$" in t or "\\[" in t or "\\begin{" in t or "\\frac" in t or "\\sqrt" in t or "\\sum" in t or "\\int" in t):
        clean = t.replace("$$", "").replace("\\[", "").replace("\\]", "").strip()
        return True, clean

    # Check for matrix-like formatting
    matrix_lines = [l.strip() for l in t.split("\n") if l.strip()]
    if len(matrix_lines) >= 2 and all(
        re.match(r"^\[?[\s\d\w\.\+\-/\*√,]+\]?$", line) for line in matrix_lines
    ):
        rows: list[str] = []
        for line in matrix_lines:
            row_items = re.split(r"[,;\s]+", line.strip("[]()"))
            clean_items = [item for item in row_items if item]
            if clean_items:
                rows.append(" & ".join(clean_items))
        if rows:
            latex_matrix = "\\begin{bmatrix}\n" + " \\\\\n".join(rows) + "\n\\end{bmatrix}"
            return True, latex_matrix

    # Check for linear system / equations
    if any(sym in t for sym in ("=", "≈", "≤", "≥", "≠", "→", "∈", "∫", "∑", "√", "∂")):
        # If it looks like a formula or definition
        has_vars = bool(re.search(r"[a-zA-Z]\s*[\^_\+\-\*/=]", t))
        has_math_len = len(t) < 300
        if has_vars and has_math_len:
            latex = t
            # Normalize common Unicode to LaTeX
            latex = latex.replace("√", "\\sqrt").replace("∑", "\\sum").replace("∫", "\\int").replace("∂", "\\partial")
            latex = latex.replace("≤", "\\leq ").replace("≥", "\\geq ").replace("≠", "\\neq ").replace("≈", "\\approx ")
            latex = latex.replace("α", "\\alpha").replace("β", "\\beta").replace("θ", "\\theta").replace("π", "\\pi")
            latex = latex.replace("λ", "\\lambda").replace("μ", "\\mu").replace("σ", "\\sigma").replace("ω", "\\omega")
            return True, latex

    return False, ""


def process_pdf_document(
    doc_id: str,
    recording_id: str,
    filename: str,
    pdf_bytes: bytes,
    output_dir: Path,
) -> DocumentManifest:
    """Extrai estruturalmente e visualmente todo o conteúdo do PDF em alta fidelidade."""
    output_dir.mkdir(parents=True, exist_ok=True)
    pages_dir = output_dir / "pages"
    formulas_dir = output_dir / "formulas"
    tables_dir = output_dir / "tables"
    figures_dir = output_dir / "figures"
    images_dir = output_dir / "images"

    for d in (pages_dir, formulas_dir, tables_dir, figures_dir, images_dir):
        d.mkdir(parents=True, exist_ok=True)

    # 1. Salva arquivo original intacto
    orig_path = output_dir / f"original_{filename}"
    with open(orig_path, "wb") as f:
        f.write(pdf_bytes)

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    pages_info: list[PageInfo] = []
    all_markdown_parts: list[str] = []

    diag = ExtractionDiagnostics(
        total_pages=total_pages,
        processed_pages=0,
    )

    elem_counter = 0

    for page_idx in range(total_pages):
        page_num = page_idx + 1
        page = doc[page_idx]
        rect = page.rect
        width, height = rect.width, rect.height

        # Renderiza página inteira em 150 DPI para inspeção visual e fallback
        page_img_rel = f"pages/{page_num:03d}.png"
        page_img_path = output_dir / page_img_rel
        try:
            pix = page.get_pixmap(dpi=150)
            pix.save(str(page_img_path))
        except Exception as exc:
            logger.warning("[pdf_processor] falha ao renderizar pagina %d: %s", page_num, exc)
            page_img_rel = None

        page_elements: list[Any] = []
        page_text_len = 0

        # --- A. Extração de Tabelas Estruturadas via page.find_tables()
        table_rects: list[fitz.Rect] = []
        try:
            tables = page.find_tables()
            for t_idx, tab in enumerate(tables, start=1):
                t_bbox = [tab.bbox[0], tab.bbox[1], tab.bbox[2], tab.bbox[3]]
                table_rects.append(fitz.Rect(tab.bbox))

                raw_df = tab.extract()
                headers: list[str] = []
                rows: list[list[str]] = []
                if raw_df:
                    headers = [str(c or "").strip() for c in raw_df[0]]
                    for row in raw_df[1:]:
                        rows.append([str(c or "").strip() for c in row])

                # Gera Markdown estruturado da tabela
                md_lines: list[str] = []
                if headers:
                    md_lines.append("| " + " | ".join(headers) + " |")
                    md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
                for r in rows:
                    md_lines.append("| " + " | ".join(r) + " |")
                table_md = "\n".join(md_lines)

                # Crop visual da tabela
                tab_img_rel = f"tables/p{page_num}_t{t_idx}.png"
                tab_img_path = output_dir / tab_img_rel
                try:
                    clip_pix = page.get_pixmap(clip=fitz.Rect(tab.bbox), dpi=150)
                    clip_pix.save(str(tab_img_path))
                except Exception:
                    tab_img_rel = None

                elem_counter += 1
                t_elem = TableElement(
                    id=f"elem_{elem_counter:04d}",
                    page_number=page_num,
                    bbox=t_bbox,
                    reading_order=elem_counter,
                    headers=headers,
                    rows=rows,
                    markdown=table_md,
                    image_rel_path=tab_img_rel,
                )
                page_elements.append(t_elem)
                diag.tables_count += 1
        except Exception as exc:
            logger.warning("[pdf_processor] falha na extracao de tabelas pagina %d: %s", page_num, exc)

        # --- B. Extração de Imagens e Figuras Embutidas
        try:
            image_list = page.get_images(full=True)
            for img_idx, img_info in enumerate(image_list, start=1):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]

                img_rel = f"images/p{page_num}_img{img_idx}.{image_ext}"
                img_path = output_dir / img_rel
                with open(img_path, "wb") as f_img:
                    f_img.write(image_bytes)

                elem_counter += 1
                img_elem = ImageElement(
                    id=f"elem_{elem_counter:04d}",
                    page_number=page_num,
                    reading_order=elem_counter,
                    image_rel_path=img_rel,
                    width=base_image.get("width", 0),
                    height=base_image.get("height", 0),
                    format=image_ext,
                )
                page_elements.append(img_elem)
                diag.images_count += 1
        except Exception as exc:
            logger.warning("[pdf_processor] falha na extracao de imagens pagina %d: %s", page_num, exc)

        # --- C. Extração e Classificação de Blocos de Texto e Fórmulas
        try:
            text_page = page.get_text("dict")
            blocks = text_page.get("blocks", [])

            for b in blocks:
                # 0 = Text block, 1 = Image block
                if b.get("type") == 0:
                    b_bbox = list(b.get("bbox", [0, 0, 0, 0]))
                    b_rect = fitz.Rect(b_bbox)

                    # Se o bloco de texto está dentro de uma tabela já extraída, ignora duplicata
                    if any(t_rect.intersects(b_rect) for t_rect in table_rects):
                        continue

                    # Concatena linhas do bloco
                    block_text_lines: list[str] = []
                    max_font_size = 0.0
                    for line in b.get("lines", []):
                        line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                        for span in line.get("spans", []):
                            max_font_size = max(max_font_size, span.get("size", 10.0))
                        if line_text.strip():
                            block_text_lines.append(line_text.strip())

                    block_text = "\n".join(block_text_lines).strip()
                    if not block_text:
                        continue

                    page_text_len += len(block_text)

                    # 1. Verifica se é Fórmula Matemática
                    is_math, latex_expr = _detect_math_latex(block_text)
                    if is_math:
                        # Recorte visual da fórmula
                        f_idx = diag.formulas_count + 1
                        form_rel = f"formulas/p{page_num}_f{f_idx}.png"
                        form_path = output_dir / form_rel
                        try:
                            f_pix = page.get_pixmap(clip=b_rect, dpi=150)
                            f_pix.save(str(form_path))
                        except Exception:
                            form_rel = None

                        elem_counter += 1
                        form_elem = FormulaElement(
                            id=f"elem_{elem_counter:04d}",
                            page_number=page_num,
                            bbox=b_bbox,
                            reading_order=elem_counter,
                            latex=latex_expr,
                            raw_text=block_text,
                            image_rel_path=form_rel,
                        )
                        page_elements.append(form_elem)
                        diag.formulas_count += 1
                        continue

                    # 2. Verifica se é Título / Heading
                    is_heading = False
                    heading_level = 1
                    if max_font_size >= 16.0 or (
                        max_font_size >= 13.0 and len(block_text) < 100
                    ) or re.match(r"^(?:Capítulo|\d+(\.\d+)*)\s+", block_text):
                        is_heading = True
                        if max_font_size >= 20.0:
                            heading_level = 1
                        elif max_font_size >= 15.0:
                            heading_level = 2
                        else:
                            heading_level = 3

                    if is_heading:
                        elem_counter += 1
                        h_elem = HeadingElement(
                            id=f"elem_{elem_counter:04d}",
                            page_number=page_num,
                            bbox=b_bbox,
                            reading_order=elem_counter,
                            level=heading_level,
                            text=block_text,
                        )
                        page_elements.append(h_elem)
                        diag.headings_count += 1
                        continue

                    # 3. Verifica se é Lista
                    if re.match(r"^[\*•\-\d+\.]\s+", block_text):
                        elem_counter += 1
                        li_elem = ListItemElement(
                            id=f"elem_{elem_counter:04d}",
                            page_number=page_num,
                            bbox=b_bbox,
                            reading_order=elem_counter,
                            text=block_text,
                        )
                        page_elements.append(li_elem)
                        continue

                    # 4. Caso padrão: Parágrafo
                    elem_counter += 1
                    p_elem = ParagraphElement(
                        id=f"elem_{elem_counter:04d}",
                        page_number=page_num,
                        bbox=b_bbox,
                        reading_order=elem_counter,
                        text=block_text,
                    )
                    page_elements.append(p_elem)
                    diag.paragraphs_count += 1
        except Exception as exc:
            logger.warning("[pdf_processor] falha na extracao de texto pagina %d: %s", page_num, exc)

        # Ordena elementos por posição vertical (y0) e horizontal (x0)
        page_elements.sort(key=lambda e: (e.bbox[1] if e.bbox else 0, e.bbox[0] if e.bbox else 0))

        # Detecta se a página foi escaneada / precisa de OCR
        is_scanned = page_text_len < 20 and len(page_elements) == 0
        if is_scanned:
            diag.scanned_pages += 1
            diag.warnings.append(f"Página {page_num} parece ser imagem digitalizada sem camada de texto nativa.")

        p_info = PageInfo(
            page_number=page_num,
            width=width,
            height=height,
            page_image_rel_path=page_img_rel,
            has_text=page_text_len > 0,
            is_scanned=is_scanned,
            elements=page_elements,
        )
        pages_info.append(p_info)
        diag.processed_pages += 1

        # Renderiza Markdown consolidado da página
        page_md_parts: list[str] = [f"## [Página {page_num}]"]
        for el in page_elements:
            if isinstance(el, HeadingElement):
                page_md_parts.append(f"{'#' * min(6, el.level + 1)} {el.text}")
            elif isinstance(el, ParagraphElement):
                page_md_parts.append(el.text)
            elif isinstance(el, ListItemElement):
                page_md_parts.append(f"- {el.text}")
            elif isinstance(el, FormulaElement):
                page_md_parts.append(f"$$\n{el.latex}\n$$")
            elif isinstance(el, TableElement):
                page_md_parts.append(el.markdown)
            elif isinstance(el, FigureElement):
                page_md_parts.append(f"![Figura: {el.caption or 'Diagrama'}](figures/{os.path.basename(el.image_rel_path or '')})")
        all_markdown_parts.append("\n\n".join(page_md_parts))

    diag.total_elements = elem_counter
    if total_pages > 0:
        diag.confidence_score = round(max(0.2, 1.0 - (diag.scanned_pages / total_pages) * 0.5), 2)

    full_md = "\n\n---\n\n".join(all_markdown_parts)

    manifest = DocumentManifest(
        document_id=doc_id,
        recording_id=recording_id,
        filename=filename,
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        original_rel_path=f"original_{filename}",
        pages=pages_info,
        full_markdown=full_md,
        diagnostics=diag,
    )

    doc.close()
    return manifest
