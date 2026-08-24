"""Multimodal Context Builder for LLMs and RAG integration."""

from __future__ import annotations

from typing import Any
from .models import DocumentManifest, SemanticChunk


def build_multimodal_llm_context(
    documents_manifests: list[DocumentManifest],
    max_tokens: int = 15000,
) -> dict[str, Any]:
    """Constrói o contexto documental estruturado e enriquecido para os prompts de IA."""
    doc_sections: list[str] = []
    total_tokens = 0
    total_formulas = 0
    total_tables = 0
    total_images = 0

    for manifest in documents_manifests:
        doc_header = f"=== DOCUMENTO DE CONTEXTO: {manifest.filename} (Tipo: {manifest.mime_type}) ==="
        doc_parts = [doc_header]

        if manifest.diagnostics.formulas_count > 0:
            total_formulas += manifest.diagnostics.formulas_count
        if manifest.diagnostics.tables_count > 0:
            total_tables += manifest.diagnostics.tables_count
        if manifest.diagnostics.images_count > 0:
            total_images += manifest.diagnostics.images_count

        # Prioriza chunks semânticos com suas páginas e fórmulas
        if manifest.semantic_chunks:
            for chunk in manifest.semantic_chunks:
                pages_str = ", ".join(str(p) for p in chunk.page_numbers)
                chunk_header = f"--- [Seção: {chunk.heading} | Página(s): {pages_str}] ---"
                doc_parts.append(chunk_header)
                doc_parts.append(chunk.content_markdown)
        elif manifest.full_markdown:
            doc_parts.append(manifest.full_markdown)

        doc_text = "\n\n".join(doc_parts)
        doc_sections.append(doc_text)

    consolidated_text = "\n\n========================================\n\n".join(doc_sections)

    return {
        "text_context": consolidated_text,
        "total_documents": len(documents_manifests),
        "total_formulas": total_formulas,
        "total_tables": total_tables,
        "total_images": total_images,
    }
