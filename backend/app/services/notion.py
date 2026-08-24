"""Notion export: markdown+action items -> Notion page in the configured database."""

from __future__ import annotations

import logging
import re
from typing import Any

from ..config import get_settings
from ..models import Recording

logger = logging.getLogger("hinoter.notion")

settings = get_settings()

MAX_CHILDREN_PER_REQUEST = 100
MAX_TEXT = 2000
MAX_TITLE = 190


class NotionConfigError(RuntimeError):
    pass


class NotionExportError(RuntimeError):
    pass


# ------------------------------- inline markdown -------------------------------

_INLINE_RE = re.compile(r"(\*\*\S.*?\*\*|`[^`]+`|\$[^\$]+?\$|\b_[^_]+_\b)")


def _chunk_text(text: str, limit: int = MAX_TEXT) -> list[str]:
    """Divide uma string longa em pedaços de no máximo `limit` caracteres."""
    if not text:
        return []
    return [text[i : i + limit] for i in range(0, len(text), limit)]


def _rich_text(text: str) -> list[dict]:
    out: list[dict] = []
    for part in _INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            content = part[2:-2]
            for c in _chunk_text(content):
                out.append({"type": "text", "text": {"content": c}, "annotations": {"bold": True}})
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            content = part[1:-1]
            for c in _chunk_text(content):
                out.append({"type": "text", "text": {"content": c}, "annotations": {"code": True}})
        elif part.startswith("$") and part.endswith("$") and len(part) > 2 and not part.startswith("$$"):
            content = part[1:-1]
            out.append({"type": "equation", "equation": {"expression": content}})
        elif part.startswith("_") and part.endswith("_") and len(part) > 2:
            content = part[1:-1]
            for c in _chunk_text(content):
                out.append({"type": "text", "text": {"content": c}, "annotations": {"italic": True}})
        else:
            for c in _chunk_text(part):
                out.append({"type": "text", "text": {"content": c}})
    return out or [{"type": "text", "text": {"content": ""}}]


def _paragraph_block(text: str) -> list[dict]:
    chunks = _chunk_text(text, MAX_TEXT)
    if not chunks:
        return []
    return [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": _rich_text(c)}} for c in chunks]


def _simple_block(block_type: str, text: str) -> dict:
    return {
        "object": "block",
        "type": block_type,
        block_type: {"rich_text": _rich_text(text[:MAX_TEXT])},
    }


# ------------------------------- markdown -> blocks -------------------------------

def build_blocks(markdown: str, action_items: list[str] | None) -> list[dict]:
    blocks: list[dict] = []
    in_code: bool = False
    code_lines: list[str] = []

    def flush_code() -> None:
        nonlocal code_lines
        if code_lines:
            full_code = "\n".join(code_lines)
            code_chunks = _chunk_text(full_code, MAX_TEXT)
            rich_items = [{"type": "text", "text": {"content": chunk}} for chunk in code_chunks]
            blocks.append(
                {
                    "object": "block",
                    "type": "code",
                    "code": {"language": "plain text", "rich_text": rich_items or [{"type": "text", "text": {"content": ""}}]},
                }
            )
            code_lines = []

    for raw_line in (markdown or "").splitlines():
        line = raw_line.rstrip()
        if line.strip().startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                flush_code()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not line.strip():
            continue
        if line.startswith("# "):
            blocks.append(_simple_block("heading_1", line[2:]))
        elif line.startswith("## "):
            blocks.append(_simple_block("heading_2", line[2:]))
        elif line.startswith("### "):
            blocks.append(_simple_block("heading_3", line[2:]))
        elif line.startswith("- ") or line.startswith("* "):
            blocks.append(_simple_block("bulleted_list_item", line[2:]))
        elif re.match(r"^\d+\. ", line):
            blocks.append(_simple_block("numbered_list_item", re.sub(r"^\d+\.\s*", "", line)))
        elif line.startswith("$$") and line.endswith("$$") and len(line) > 4:
            expr = line[2:-2].strip()
            blocks.append({"object": "block", "type": "equation", "equation": {"expression": expr}})
        elif line.startswith("> "):
            blocks.append(_simple_block("quote", line[2:]))
        elif line.strip() == "---":
            blocks.append({"object": "block", "type": "divider", "divider": {}})
        else:
            blocks.extend(_paragraph_block(line))
    flush_code()

    if action_items:
        blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Ações"}}]}})
        for item in action_items:
            blocks.append(
                {
                    "object": "block",
                    "type": "to_do",
                    "to_do": {"rich_text": _rich_text(item[:MAX_TEXT]), "checked": False},
                }
            )
    return blocks


# ------------------------------- client -------------------------------

def _notion_client() -> Any:
    s = get_settings()
    if not s.notion_api_key:
        raise NotionConfigError(
            "Chave do Notion (NOTION_API_KEY) nao configurada. Defina em Configurações ou em backend/.env."
        )
    if not s.notion_database_id:
        raise NotionConfigError(
            "NOTION_DATABASE_ID nao configurada. Compartilhe o banco com a integration e cole o ID em Configurações."
        )
    from notion_client import Client

    return Client(auth=s.notion_api_key, timeout_ms=60_000)


def _find_title_property(client: Any, database_id: str) -> str:
    try:
        db = client.databases.retrieve(database_id=database_id)
        for name, prop in (db.get("properties") or {}).items():
            if prop.get("type") == "title":
                return name
    except Exception as exc:  # noqa: BLE001
        logger.warning("[notion] nao foi possivel inspecionar o banco (%s); usando property 'title'", exc)
    return "title"


def export_to_notion(recording: Recording) -> tuple[str, str]:
    """Create/append a Notion page. Returns (page_id, page_url).

    Runs synchronously; call via asyncio.to_thread from the API layer.
    """
    s = get_settings()
    client = _notion_client()
    title_prop = _find_title_property(client, s.notion_database_id)
    blocks = build_blocks(recording.summary_markdown or "", recording.action_items or [])
    if not blocks:
        raise NotionExportError("Nada para exportar: o resumo esta vazio.")

    properties = {
        title_prop: {
            "title": [{"type": "text", "text": {"content": (recording.title or "HiNoter")[:MAX_TITLE]}}]
        }
    }
    try:
        page = client.pages.create(
            parent={"database_id": s.notion_database_id},
            properties=properties,
            children=blocks[:MAX_CHILDREN_PER_REQUEST],
        )
    except Exception as exc:  # noqa: BLE001
        raise NotionExportError(f"Falha ao criar a pagina no Notion: {exc}") from exc

    page_id = page["id"]
    for start in range(MAX_CHILDREN_PER_REQUEST, len(blocks), MAX_CHILDREN_PER_REQUEST):
        try:
            client.blocks.children.append(
                block_id=page_id,
                children=blocks[start : start + MAX_CHILDREN_PER_REQUEST],
            )
        except Exception as exc:  # noqa: BLE001
            raise NotionExportError(f"Pagina criada, mas o conteudo ficou incompleto: {exc}") from exc

    url = page.get("url") or f"https://www.notion.so/{page_id.replace('-', '')}"
    logger.info("[notion] pagina exportada: %s", url)
    return page_id, url