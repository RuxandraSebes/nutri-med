from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


def timed_sync(label: str, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    start = time.perf_counter()
    try:
        return fn(*args, **kwargs)
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info("[timing] %s: %.1f ms", label, elapsed_ms)


async def timed_coro(label: str, coro: Awaitable[T]) -> T:
    start = time.perf_counter()
    try:
        return await coro
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info("[timing] %s: %.1f ms", label, elapsed_ms)
