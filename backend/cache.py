"""Simple TTL-backed in-memory cache (no external dependencies)."""

import time
from typing import Any


class TTLCache:
    def __init__(self, ttl_seconds: int = 3600):
        self._store: dict[str, tuple[Any, float]] = {}
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        if key in self._store:
            val, ts = self._store[key]
            if time.time() - ts < self._ttl:
                return val
            del self._store[key]
        return None

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (value, time.time())

    def clear(self) -> None:
        self._store.clear()


# Global instances
PITCHER_CACHE = TTLCache(ttl_seconds=86_400)   # 24 h — pitcher list rarely changes
SEASON_CACHE  = TTLCache(ttl_seconds=3_600)    # 1 h  — Statcast data per (pid, year)
