"""In-memory pub/sub for Server-Sent Events, thread-safe for executor workers."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger("hinoter.sse")


class EventHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._global_subs: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def subscribe(self, recording_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if recording_id == "*":
                self._global_subs.add(q)
            else:
                self._subs.setdefault(recording_id, set()).add(q)
        return q

    async def unsubscribe(self, recording_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            if recording_id == "*":
                self._global_subs.discard(q)
            else:
                subs = self._subs.get(recording_id)
                if subs:
                    subs.discard(q)
                    if not subs:
                        self._subs.pop(recording_id, None)

    async def publish(self, recording_id: str, event: str, data: dict[str, Any]) -> None:
        """Deliver an event to all subscribers of `recording_id` and global subscribers.

        Safe from both the event loop thread and worker threads.
        """
        async with self._lock:
            queues = list(self._subs.get(recording_id, ()))
            if self._global_subs:
                queues.extend(list(self._global_subs))
        if not queues:
            return
        loop = self._loop
        if loop is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
        # Ensure data has recording id
        if isinstance(data, dict) and "id" not in data:
            data = {"id": recording_id, **data}
        for q in queues:
            loop.call_soon_threadsafe(q.put_nowait, (event, data))

    @property
    def subscriber_count(self) -> int:
        return sum(len(v) for v in self._subs.values()) + len(self._global_subs)


hub = EventHub()