"""Lets background work (writing lessons ahead of time) give way to anything the learner is waiting for.

Ollama answers one request at a time on a laptop. Without this, a code request or a tutor answer
would wait behind several lessons being written in the background.
"""
import asyncio
from contextlib import asynccontextmanager

_active = 0
_idle = None


def _event() -> asyncio.Event:
    global _idle
    if _idle is None:  # created lazily so it belongs to the running event loop
        _idle = asyncio.Event()
        _idle.set()
    return _idle


@asynccontextmanager
async def interactive():
    """Wrap any request the learner is actively waiting for."""
    global _active
    _active += 1
    _event().clear()
    try:
        yield
    finally:
        _active = max(0, _active - 1)
        if _active == 0:
            _event().set()


def busy() -> bool:
    return _active > 0


async def wait_until_idle() -> None:
    await _event().wait()