from __future__ import annotations

import functools
import os
import re


def normalize_query_text(text: str) -> str:
    if not text:
        return ""
    s = text.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def normalize_embed_input(text: str) -> str:
    return normalize_query_text(text)


_EMBED_CACHE_SIZE = int(os.getenv("RAG_EMBED_CACHE_SIZE", "4096"))
_USE_EMBED_CACHE = os.getenv("RAG_EMBED_CACHE", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


class CachedQueryEmbeddings:
    def __init__(self, inner):
        self._inner = inner

    @functools.lru_cache(maxsize=_EMBED_CACHE_SIZE)
    def _embed_query_cached(self, normalized: str) -> tuple[float, ...]:
        vec = self._inner.embed_query(normalized)
        return tuple(float(x) for x in vec)

    def embed_query(self, text: str) -> list[float]:
        if not _USE_EMBED_CACHE:
            return self._inner.embed_query(text)
        n = normalize_embed_input(text)
        return list(self._embed_query_cached(n))

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._inner.embed_documents(texts)

    def __getattr__(self, name: str):
        return getattr(self._inner, name)
