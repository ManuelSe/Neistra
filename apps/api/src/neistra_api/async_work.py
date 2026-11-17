"""Settle operation-owned tasks and threads before releasing their resources."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any


async def settle_owned_task[T](task: asyncio.Task[T]) -> T:
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            continue
    return task.result()


async def offload_owned_work[T](function: Callable[..., T], *args: Any) -> T:
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        # Cancelling an await cannot stop a thread that still owns a file/session.
        try:
            await settle_owned_task(task)
        except Exception:
            pass
        raise
