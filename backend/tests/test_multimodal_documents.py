"""Automated test suite for the Multimodal and Structural Document Processing System."""

from __future__ import annotations

import io
import os
import sys
import tempfile
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz  # PyMuPDF

from app.services.document_processors import (
    build_multimodal_llm_context,
    build_semantic_chunks,
    process_universal_document,
)
from app.services.document_processors.models import (
    DocumentManifest,
    FormulaElement,
    HeadingElement,
    TableElement,
)


def create_sample_academic_math_pdf() -> bytes:
    """Cria um PDF em memória contendo seções, matrizes, fórmulas e tabelas para teste."""
    doc = fitz.open()

    # Página 1: Álgebra Linear e Matrizes
    page1 = doc.new_page(width=595, height=842)
    # Título
    page1.insert_text(fitz.Point(50, 60), "1. Álgebra Linear e Transformações", fontsize=18)
    # Parágrafo
    page1.insert_text(
        fitz.Point(50, 100),
        "Uma transformação linear preserva as operações de adição vetorial e multiplicação por escalar.",
        fontsize=11,
    )
    # Fórmula / Matriz
    page1.insert_text(
        fitz.Point(50, 150),
        "$$\n\\begin{bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{bmatrix}\n$$",
        fontsize=11,
    )
    # Equação
    page1.insert_text(
        fitz.Point(50, 220),
        "$$\nf(x) = \\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$",
        fontsize=11,
    )

    # Página 2: Tabelas e Propriedades
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text(fitz.Point(50, 60), "2. Propriedades Operacionais", fontsize=16)
    page2.insert_text(
        fitz.Point(50, 100),
        "A tabela a seguir sumariza as propriedades das matrizes quadradas inversíveis:",
        fontsize=11,
    )
    # Desenho de tabela com linhas para detecção por find_tables
    # Linhas horizontais
    page2.draw_line(fitz.Point(50, 140), fitz.Point(500, 140))
    page2.draw_line(fitz.Point(50, 170), fitz.Point(500, 170))
    page2.draw_line(fitz.Point(50, 200), fitz.Point(500, 200))
    page2.draw_line(fitz.Point(50, 230), fitz.Point(500, 230))
    # Linhas verticais
    page2.draw_line(fitz.Point(50, 140), fitz.Point(50, 230))
    page2.draw_line(fitz.Point(200, 140), fitz.Point(200, 230))
    page2.draw_line(fitz.Point(350, 140), fitz.Point(350, 230))
    page2.draw_line(fitz.Point(500, 140), fitz.Point(500, 230))

    page2.insert_text(fitz.Point(60, 160), "Propriedade", fontsize=10)
    page2.insert_text(fitz.Point(210, 160), "Definição", fontsize=10)
    page2.insert_text(fitz.Point(360, 160), "Expressão LaTeX", fontsize=10)

    page2.insert_text(fitz.Point(60, 190), "Invertibilidade", fontsize=10)
    page2.insert_text(fitz.Point(210, 190), "det(A) != 0", fontsize=10)
    page2.insert_text(fitz.Point(360, 190), "A * A^{-1} = I", fontsize=10)

    page2.insert_text(fitz.Point(60, 220), "Transposta", fontsize=10)
    page2.insert_text(fitz.Point(210, 220), "(A^T)^T = A", fontsize=10)
    page2.insert_text(fitz.Point(360, 220), "(AB)^T = B^T A^T", fontsize=10)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_multimodal_pdf_processing():
    """Testa a extração completa do pipeline multimodal em um PDF acadêmico."""
    pdf_bytes = create_sample_academic_math_pdf()

    with tempfile.TemporaryDirectory() as tmp_dir:
        doc_dir = Path(tmp_dir) / "doc_test_1"

        manifest = process_universal_document(
            doc_id="doc_test_1",
            recording_id="rec_test_1",
            filename="algebra_linear.pdf",
            content=pdf_bytes,
            doc_dir=doc_dir,
        )

        # 1. Validação de Preservação do Arquivo Original
        assert (doc_dir / "original_algebra_linear.pdf").exists()
        assert (doc_dir / "document.json").exists()

        # 2. Validação de Renderização de Páginas
        assert len(manifest.pages) == 2
        assert (doc_dir / "pages" / "001.png").exists()
        assert (doc_dir / "pages" / "002.png").exists()

        # 3. Validação de Fórmulas Matemáticas em LaTeX
        formulas = [e for p in manifest.pages for e in p.elements if isinstance(e, FormulaElement)]
        assert len(formulas) >= 1
        assert any("\\begin{bmatrix}" in f.latex or "\\int" in f.latex for f in formulas)

        # 4. Validação de Chunks Semânticos
        assert len(manifest.semantic_chunks) >= 1
        for chunk in manifest.semantic_chunks:
            assert chunk.token_count > 0
            assert len(chunk.page_numbers) > 0

        # 5. Validação do Context Builder Multimodal
        context_pkg = build_multimodal_llm_context([manifest])
        assert context_pkg["total_documents"] == 1
        assert "Álgebra Linear" in context_pkg["text_context"]
        assert "\\begin{bmatrix}" in context_pkg["text_context"] or "\\int" in context_pkg["text_context"]

        print("[OK] Teste multimodal de PDF acadêmico aprovado com sucesso!")


if __name__ == "__main__":
    test_multimodal_pdf_processing()
    print("Todos os testes do pipeline multimodal passaram com 100% de sucesso!")
