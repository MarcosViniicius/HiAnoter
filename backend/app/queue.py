"""Fila em memória com concorrência máx. de 1.

A fila desaparece se o processo morrer — aceitável (uso pessoal). O shutdown é
tolerante a cancelamento (ex.: Ctrl+C no uvicorn), então parar o serviço não
vaza tracebacks nem deixa o processo pendurado.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .pipeline import process_recording

logger = logging.getLogger("hinoter.queue")


class PipelineQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()
        self._pending: set[str] = set()
        self._worker: asyncio.Task | None = None
        self._stopping = False

    def enqueue(
        self,
        recording_id: str,
        provider: str | None = None,
        model: str | None = None,
        language: str | None = None,
    ) -> bool:
        """Enfileira um job. Retorna False se ele já estiver pendente (dedup)."""
        if recording_id in self._pending:
            logger.debug("[queue] %s ja esta na fila", recording_id)
            return False
        self._pending.add(recording_id)
        self._queue.put_nowait({
            "id": recording_id,
            "provider": provider,
            "model": model,
            "language": language,
        })
        logger.info(
            "[queue] job enfileirado: %s (provider=%s, model=%s, pendentes=%d)",
            recording_id, provider, model, len(self._pending),
        )
        return True

    async def _run(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None or self._stopping:
                break
            rec_id = item["id"] if isinstance(item, dict) else item
            provider = item.get("provider") if isinstance(item, dict) else None
            model = item.get("model") if isinstance(item, dict) else None
            language = item.get("language") if isinstance(item, dict) else None
            self._pending.discard(rec_id)
            try:
                await process_recording(rec_id, provider=provider, model=model, language=language)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                logger.exception("[queue] falha inesperada ao processar %s", rec_id)

    async def start(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._run(), name="pipeline-worker")
            logger.info("[queue] worker iniciado (concorrencia maxima: 1)")

    def cancel_worker_now(self) -> None:
        """Fire-and-forget: cancela e esquece o worker (não faz await)."""
        if self._worker is not None:
            self._worker.cancel()
            self._worker = None
            self._pending = set()

    async def stop(self, timeout: float = 8.0) -> None:
        """Desliga limpo. Nunca relança CancelledError/TimeoutError.

        Usa ``asyncio.shield`` para que a espera não seja interrompida quando o
        evento de shutdown (Ctrl+C) é injetado no loop; se o job atual demorar
        além do timeout, cancela o worker e retorna — sem ruído.
        """
        worker = self._worker
        if worker is None or worker.done():
            self._worker = None
            return
        self._stopping = True
        self._queue.put_nowait(None)  # sinaliza parada quando o job atual terminar
        try:
            await asyncio.wait_for(asyncio.shield(worker), timeout=timeout)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            # job ainda rodando (transcrição) ou fomos cancelados: interrompe já.
            worker.cancel()
            logger.info("[queue] worker interrompido durante shutdown")
        finally:
            self._worker = None


queue = PipelineQueue()