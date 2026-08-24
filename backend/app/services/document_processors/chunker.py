"""Semantic chunker for structured document ASTs."""

from __future__ import annotations

from .models import (
    DocumentElement,
    DocumentManifest,
    FigureElement,
    FormulaElement,
    HeadingElement,
    ImageElement,
    ParagraphElement,
    SemanticChunk,
    TableElement,
)

CHARS_PER_TOKEN = 4.0
TARGET_CHUNK_TOKENS = 600
MAX_CHUNK_TOKENS = 1200


def _estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def build_semantic_chunks(manifest: DocumentManifest) -> list[SemanticChunk]:
    """Agrupa elementos do documento em chunks semânticos coesos respeitando a estrutura."""
    chunks: list[SemanticChunk] = []

    current_heading = manifest.filename
    current_pages: set[int] = set()
    current_element_ids: list[str] = []
    current_md_parts: list[str] = []
    current_has_formulas = False
    current_has_tables = False
    current_has_images = False
    current_images: list[str] = []

    def flush_chunk():
        nonlocal current_pages, current_element_ids, current_md_parts
        nonlocal current_has_formulas, current_has_tables, current_has_images, current_images
        if not current_md_parts and not current_element_ids:
            return

        chunk_text = "\n\n".join(current_md_parts)
        chunk_idx = len(chunks) + 1
        tokens = _estimate_tokens(chunk_text)

        chunks.append(
            SemanticChunk(
                chunk_id=f"chk_{chunk_idx:03d}",
                heading=current_heading,
                page_numbers=sorted(list(current_pages)),
                element_ids=list(current_element_ids),
                content_markdown=chunk_text,
                has_formulas=current_has_formulas,
                has_tables=current_has_tables,
                has_images=current_has_images,
                image_rel_paths=list(current_images),
                token_count=tokens,
            )
        )

        current_pages = set()
        current_element_ids = []
        current_md_parts = []
        current_has_formulas = False
        current_has_tables = False
        current_has_images = False
        current_images = []

    for page in manifest.pages:
        for elem in page.elements:
            elem_tokens = 0
            elem_md = ""

            if isinstance(elem, HeadingElement):
                # Quebra de seção semântica: se o chunk atual já possui conteúdo, finaliza antes do novo título
                if current_md_parts and elem.level <= 2:
                    flush_chunk()
                current_heading = elem.text
                elem_md = f"{'#' * min(6, elem.level + 1)} {elem.text}"

            elif isinstance(elem, FormulaElement):
                current_has_formulas = True
                elem_md = f"$$\n{elem.latex}\n$$"
                if elem.image_rel_path:
                    current_images.append(elem.image_rel_path)

            elif isinstance(elem, TableElement):
                current_has_tables = True
                elem_md = elem.markdown
                if elem.image_rel_path:
                    current_images.append(elem.image_rel_path)

            elif isinstance(elem, FigureElement):
                current_has_images = True
                elem_md = f"**[Figura / Diagrama: {elem.caption or elem.description or 'Gráfico'}]**"
                if elem.image_rel_path:
                    current_images.append(elem.image_rel_path)

            elif isinstance(elem, ImageElement):
                current_has_images = True
                elem_md = f"**[Imagem: {elem.caption or 'Ilustração'}]**"
                if elem.image_rel_path:
                    current_images.append(elem.image_rel_path)

            elif isinstance(elem, ParagraphElement):
                elem_md = elem.text

            else:
                elem_md = getattr(elem, "text", "")

            if elem_md:
                current_md_parts.append(elem_md)
                current_element_ids.append(elem.id)
                current_pages.add(page.page_number)

                current_tokens = _estimate_tokens("\n\n".join(current_md_parts))
                if current_tokens >= TARGET_CHUNK_TOKENS:
                    flush_chunk()

    flush_chunk()

    # Se nenhum chunk foi gerado mas há texto completo no manifesto, cria 1 chunk padrão
    if not chunks and manifest.full_markdown.strip():
        chunks.append(
            SemanticChunk(
                chunk_id="chk_001",
                heading=manifest.filename,
                page_numbers=[p.page_number for p in manifest.pages] or [1],
                element_ids=[],
                content_markdown=manifest.full_markdown,
                token_count=_estimate_tokens(manifest.full_markdown),
            )
        )

    return chunks
