"""Data models for structural and multimodal document representations."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

    def to_list(self) -> list[float]:
        return [self.x0, self.y0, self.x1, self.y1]


class BaseElement(BaseModel):
    id: str
    type: Literal[
        "heading",
        "paragraph",
        "list_item",
        "formula",
        "table",
        "figure",
        "image",
        "code_block",
        "header_footer",
        "note",
        "unknown",
    ]
    page_number: int
    bbox: list[float] | None = None
    reading_order: int = 0
    confidence: float = 1.0


class HeadingElement(BaseElement):
    type: Literal["heading"] = "heading"
    level: int = 1
    text: str


class ParagraphElement(BaseElement):
    type: Literal["paragraph"] = "paragraph"
    text: str


class ListItemElement(BaseElement):
    type: Literal["list_item"] = "list_item"
    text: str
    level: int = 0


class FormulaElement(BaseElement):
    type: Literal["formula"] = "formula"
    latex: str
    raw_text: str = ""
    is_display: bool = True  # True = block formula, False = inline
    image_rel_path: str | None = None
    context_before: str = ""
    context_after: str = ""


class TableCell(BaseModel):
    row_idx: int
    col_idx: int
    text: str
    is_header: bool = False
    bbox: list[float] | None = None


class TableElement(BaseElement):
    type: Literal["table"] = "table"
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    cells: list[TableCell] = Field(default_factory=list)
    markdown: str = ""
    caption: str = ""
    image_rel_path: str | None = None


class FigureElement(BaseElement):
    type: Literal["figure"] = "figure"
    caption: str = ""
    description: str = ""
    image_rel_path: str | None = None
    is_vector_graphic: bool = False


class ImageElement(BaseElement):
    type: Literal["image"] = "image"
    caption: str = ""
    image_rel_path: str | None = None
    width: int = 0
    height: int = 0
    format: str = "png"


class CodeBlockElement(BaseElement):
    type: Literal["code_block"] = "code_block"
    language: str = ""
    code: str = ""


DocumentElement = (
    HeadingElement
    | ParagraphElement
    | ListItemElement
    | FormulaElement
    | TableElement
    | FigureElement
    | ImageElement
    | CodeBlockElement
    | BaseElement
)


class PageInfo(BaseModel):
    page_number: int
    width: float
    height: float
    page_image_rel_path: str | None = None
    has_text: bool = True
    is_scanned: bool = False
    elements: list[DocumentElement] = Field(default_factory=list)


class SemanticChunk(BaseModel):
    chunk_id: str
    heading: str = ""
    page_numbers: list[int] = Field(default_factory=list)
    element_ids: list[str] = Field(default_factory=list)
    content_markdown: str = ""
    has_formulas: bool = False
    has_tables: bool = False
    has_images: bool = False
    image_rel_paths: list[str] = Field(default_factory=list)
    token_count: int = 0


class ExtractionDiagnostics(BaseModel):
    total_pages: int = 0
    processed_pages: int = 0
    scanned_pages: int = 0
    ocr_applied_pages: int = 0
    headings_count: int = 0
    paragraphs_count: int = 0
    formulas_count: int = 0
    tables_count: int = 0
    figures_count: int = 0
    images_count: int = 0
    total_elements: int = 0
    confidence_score: float = 1.0
    warnings: list[str] = Field(default_factory=list)


class DocumentManifest(BaseModel):
    version: str = "2.0"
    document_id: str
    recording_id: str
    filename: str
    mime_type: str
    file_size_bytes: int = 0
    created_at: str = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())
    original_rel_path: str = "original.pdf"
    pages: list[PageInfo] = Field(default_factory=list)
    semantic_chunks: list[SemanticChunk] = Field(default_factory=list)
    full_markdown: str = ""
    diagnostics: ExtractionDiagnostics = Field(default_factory=ExtractionDiagnostics)
