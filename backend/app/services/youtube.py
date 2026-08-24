"""Serviço de extração e transcrição de vídeos do YouTube para o HiNoter-Lite."""

import logging
import re
from typing import Any
import httpx

logger = logging.getLogger("hinoter.youtube")

YOUTUBE_REGEX = re.compile(
    r"(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})"
)


def is_youtube_url(url: str) -> bool:
    if not url:
        return False
    return bool(YOUTUBE_REGEX.search(url.strip()))


def extract_video_id(url: str) -> str | None:
    match = YOUTUBE_REGEX.search(url.strip())
    return match.group(1) if match else None


async def fetch_youtube_oembed(url: str) -> dict[str, str]:
    """Obtém título e autor do vídeo via oEmbed público da Google/YouTube."""
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(oembed_url, headers={"User-Agent": "HiNoter-Lite/3.0"})
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "title": str(data.get("title") or "").strip(),
                    "author_name": str(data.get("author_name") or "").strip(),
                }
    except Exception as e:
        logger.warning("[youtube] erro ao buscar oEmbed para %s: %s", url, e)
    return {"title": "", "author_name": ""}


async def extract_youtube_content(url: str) -> dict[str, Any]:
    """Extrai informações e transcrição de um vídeo do YouTube.

    Retorna:
        dict com 'video_id', 'title', 'author', 'transcript', 'formatted_text', 'has_transcript'.
    """
    video_id = extract_video_id(url)
    if not video_id:
        return {
            "video_id": None,
            "title": url,
            "author": "",
            "transcript": "",
            "formatted_text": f"[Link: {url}]",
            "has_transcript": False,
        }

    # 1. Metadados básicos
    oembed = await fetch_youtube_oembed(url)
    title = oembed["title"] or f"Vídeo do YouTube ({video_id})"
    author = oembed["author_name"]

    # 2. Transcrição / Legendas
    transcript_text = ""
    has_transcript = False
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore

        yt_api = YouTubeTranscriptApi()
        try:
            fetched = yt_api.fetch(video_id, languages=['pt', 'pt-BR', 'en', 'es', 'fr', 'de'])
            lines = [item.text for item in fetched if getattr(item, "text", None)]
            if not lines:
                lines = [item.get("text", "") for item in fetched if isinstance(item, dict) and item.get("text")]
            transcript_text = " ".join(lines)
            if transcript_text.strip():
                has_transcript = True
        except Exception:
            # Fallback list & fetch
            transcript_list = yt_api.list(video_id)
            t = next(iter(transcript_list))
            fetched = t.fetch()
            lines = [item.text if hasattr(item, "text") else item.get("text", "") for item in fetched]
            transcript_text = " ".join(lines)
            if transcript_text.strip():
                has_transcript = True
    except Exception as exc:
        logger.info("[youtube] legendas não disponíveis via API para vídeo %s: %s", video_id, exc)

    # Formata bloco de conteúdo para a IA
    author_info = f" por {author}" if author else ""
    if has_transcript:
        formatted_text = f"### [Vídeo do YouTube] {title}{author_info}\nLink: {url}\n\n#### Transcrição do Vídeo:\n{transcript_text}"
    else:
        formatted_text = f"### [Vídeo do YouTube] {title}{author_info}\nLink: {url}\n*(Vídeo sem legendas automáticas públicas disponíveis)*"

    return {
        "video_id": video_id,
        "title": title,
        "author": author,
        "transcript": transcript_text,
        "formatted_text": formatted_text,
        "has_transcript": has_transcript,
    }
