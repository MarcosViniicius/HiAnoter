"""Universal multi-format document extractors for HiNoter-Lite."""

from __future__ import annotations

import io
import json
import logging
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

import httpx

from .youtube import extract_youtube_content, is_youtube_url

logger = logging.getLogger("hinoter.extractors")

CHARS_PER_TOKEN = 4.0


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def extract_text_from_pdf(content: bytes, filename: str = "documento.pdf") -> str:
    """Extrai texto de PDF usando pypdf com fallback resiliente e garantia de não-vazio."""
    num_pages = 0
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(content))
        num_pages = len(reader.pages)
        pages_text: list[str] = []

        for idx, page in enumerate(reader.pages, start=1):
            try:
                text = (page.extract_text() or "").strip()
                if text:
                    pages_text.append(f"--- [Página {idx}/{num_pages}] ---\n{text}")
            except Exception as page_exc:
                logger.warning("[extractors] erro na pagina %d de %s: %s", idx, filename, page_exc)

        if pages_text:
            return "\n\n".join(pages_text)
    except Exception as exc:
        logger.warning("[extractors] pypdf falhou para %s: %s. Usando fallback.", filename, exc)

    # Fallback: extrai blocos de texto legíveis
    try:
        text_chunks = re.findall(rb"[\x20-\x7E\xC0-\xFF]{4,}", content)
        decoded = [c.decode("latin-1", errors="ignore") for c in text_chunks]
        clean = [t for t in decoded if not t.startswith(("/Filter", "/Length", "/Type", "/Font", "/Root", "/Parent")) and len(t.strip()) > 3]
        if clean:
            extracted_text = "\n".join(clean[:1500])
            if len(extracted_text.strip()) > 20:
                return extracted_text
    except Exception:
        pass

    page_info = f" ({num_pages} páginas)" if num_pages > 0 else ""
    return f"[Documento PDF: {filename}{page_info}]\n(Este arquivo PDF foi anexado e indexado como material de apoio para a síntese)."


def extract_text_from_docx(content: bytes, filename: str = "documento.docx") -> str:
    """Extrai texto de arquivos .docx via inspeção XML nativa de zip."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            if "word/document.xml" in z.namelist():
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                # w:t tags contain text
                texts = [elem.text for elem in tree.iter() if elem.text and elem.tag.endswith("}t")]
                return "\n".join(texts)
    except Exception as exc:
        logger.warning("[extractors] falha ao extrair docx %s: %s", filename, exc)
    return f"[Documento Word: {filename}]"


def extract_text_from_pptx(content: bytes, filename: str = "slides.pptx") -> str:
    """Extrai texto e anotações de apresentações .pptx."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            slides: list[str] = []
            slide_files = sorted([n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")])
            for idx, sfile in enumerate(slide_files, start=1):
                xml_content = z.read(sfile)
                tree = ET.fromstring(xml_content)
                texts = [elem.text.strip() for elem in tree.iter() if elem.text and elem.tag.endswith("}t") and elem.text.strip()]
                if texts:
                    slides.append(f"--- [Slide {idx}] ---\n" + "\n".join(texts))
            if slides:
                return "\n\n".join(slides)
    except Exception as exc:
        logger.warning("[extractors] falha ao extrair pptx %s: %s", filename, exc)
    return f"[Apresentação de Slides: {filename}]"


def extract_text_from_document(filename: str, content: bytes) -> str:
    """Roteador inteligente de extração de conteúdo para qualquer extensão."""
    ext = os.path.splitext(filename)[1].lower()

    # Formatos de texto puro / código / dados
    if ext in (
        ".txt",
        ".md",
        ".markdown",
        ".json",
        ".csv",
        ".tsv",
        ".log",
        ".yaml",
        ".yml",
        ".xml",
        ".html",
        ".htm",
        ".css",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".py",
        ".sql",
        ".sh",
        ".env",
        ".ini",
    ):
        try:
            return content.decode("utf-8", errors="ignore")
        except Exception:
            return content.decode("latin-1", errors="ignore")

    # Documentos PDF
    if ext == ".pdf":
        return extract_text_from_pdf(content, filename)

    # Documentos Microsoft Office
    if ext == ".docx":
        return extract_text_from_docx(content, filename)

    if ext == ".pptx":
        return extract_text_from_pptx(content, filename)

    # Imagens / Fotos
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".svg"):
        size_kb = round(len(content) / 1024, 1)
        return f"[Imagem / Foto anexada: {filename} ({size_kb} KB)]\n(Esta imagem contém diagramas, lousa ou esquemas visuais vinculados à aula/gravação)."

    # Fallback geral
    try:
        text = content.decode("utf-8", errors="ignore")
        if len(text.strip()) > 10:
            return text
    except Exception:
        pass

    return f"[Arquivo anexado: {filename}]"


async def fetch_url_content(url: str) -> tuple[str, str]:
    """Retorna (título_ou_url, texto_extraído) com suporte nativo a YouTube e páginas web."""
    if is_youtube_url(url):
        yt = await extract_youtube_content(url)
        return yt["title"], yt["formatted_text"]

    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "HiNoter-Lite/3.0 (Universal Study Context)"})
            resp.raise_for_status()
            html = resp.text
            title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else url
            cleaned = re.sub(r"<(script|style|svg|nav|footer).*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            cleaned = re.sub(r"<[^>]+>", " ", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            return title, cleaned[:15000]
    except Exception as e:
        logger.warning("[extractors] falha ao buscar URL %s: %s", url, e)
        return url, f"[Link: {url} (conteúdo da página não pôde ser carregado automaticamente)]"
