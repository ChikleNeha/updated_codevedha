import asyncio
import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse

from database.db import get_db
from models.schemas import LessonRequest, LessonResponse, PrewarmRequest
from services.curriculum import require_module
from services.difficulty import LEVELS
from services.llm import LLMUnavailable, chat, stream_chat
from services.prompts import LEVEL_STYLES, LESSON_SYSTEM

router = APIRouter()

CACHE_OWNER = "shared"  # lessons are cached by module and difficulty, not by session
CACHE_VERSION = "v2"    # bump when the lesson prompt changes so old cached lessons are ignored

# (module_id, cache key) -> event that fires when that lesson has been generated
_inflight: dict[tuple[int, str], asyncio.Event] = {}


def _level(difficulty: str) -> str:
    return difficulty if difficulty in LEVELS else "beginner"


def _ckey(difficulty: str) -> str:
    return f"{difficulty}|{CACHE_VERSION}"


def _messages(module: dict, difficulty: str) -> list[dict]:
    system = LESSON_SYSTEM.format(
        module_title=module["title"],
        topics=", ".join(module["topics"]),
        difficulty=difficulty,
        level_style=LEVEL_STYLES[difficulty],
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Write the {difficulty} lesson for {module['title']} now."},
    ]


async def get_cached(module_id: int, ckey: str) -> Optional[str]:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT content FROM lessons WHERE module_id = ? AND difficulty = ? "
            "AND generated_at > datetime('now', '-24 hours') ORDER BY id DESC LIMIT 1",
            (module_id, ckey),
        )
        row = await cur.fetchone()
    return row["content"] if row else None


async def save_lesson(module_id: int, ckey: str, content: str) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM lessons WHERE module_id = ? AND difficulty = ?", (module_id, ckey))
        await db.execute(
            "INSERT INTO lessons (session_id, module_id, difficulty, content) VALUES (?, ?, ?, ?)",
            (CACHE_OWNER, module_id, ckey, content),
        )
        await db.commit()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/lesson/stream")
async def lesson_stream(req: LessonRequest):
    module = require_module(req.module_id)
    difficulty = _level(req.difficulty)
    ckey = _ckey(difficulty)
    flight = (req.module_id, ckey)

    async def gen():
        if not req.force:
            cached = await get_cached(req.module_id, ckey)
            if cached:
                yield _sse("done", {"content": cached, "cached": True})
                return
            waiting = _inflight.get(flight)
            if waiting:  # the background generator is already writing this lesson
                yield _sse("status", {"message": "Your lesson is almost ready."})
                await waiting.wait()
                cached = await get_cached(req.module_id, ckey)
                if cached:
                    yield _sse("done", {"content": cached, "cached": True})
                    return

        event = asyncio.Event()
        _inflight[flight] = event
        try:
            yield _sse("status", {"message": "Writing your lesson. This takes a few seconds."})
            parts: list[str] = []
            try:
                async for piece in stream_chat(_messages(module, difficulty)):
                    parts.append(piece)
                    yield _sse("chunk", {"text": piece})
            except LLMUnavailable as e:
                yield _sse("error", {"message": str(e)})
                return
            content = "".join(parts).strip()
            if not content:
                yield _sse("error", {"message": "The lesson came back empty. Please try again."})
                return
            await save_lesson(req.module_id, ckey, content)
            yield _sse("done", {"content": content, "cached": False})
        finally:
            event.set()
            if _inflight.get(flight) is event:
                _inflight.pop(flight, None)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/lesson", response_model=LessonResponse)
async def lesson(req: LessonRequest):
    module = require_module(req.module_id)
    difficulty = _level(req.difficulty)
    ckey = _ckey(difficulty)
    if not req.force:
        cached = await get_cached(req.module_id, ckey)
        if cached:
            return LessonResponse(module_id=req.module_id, difficulty=difficulty, content=cached, cached=True)
    try:
        content = (await chat(_messages(module, difficulty))).strip()
    except LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    await save_lesson(req.module_id, ckey, content)
    return LessonResponse(module_id=req.module_id, difficulty=difficulty, content=content, cached=False)


async def _prewarm(module_ids: list[int], difficulty: str) -> None:
    ckey = _ckey(difficulty)
    for module_id in module_ids:
        module = require_module(module_id)
        flight = (module_id, ckey)
        if flight in _inflight or await get_cached(module_id, ckey):
            continue
        event = asyncio.Event()
        _inflight[flight] = event
        try:
            content = (await chat(_messages(module, difficulty))).strip()
            if content:
                await save_lesson(module_id, ckey, content)
        except LLMUnavailable:
            return
        finally:
            event.set()
            if _inflight.get(flight) is event:
                _inflight.pop(flight, None)


@router.post("/lesson/prewarm")
async def prewarm(req: PrewarmRequest, background: BackgroundTasks):
    ids = [m for m in req.module_ids if 1 <= m <= 5]
    background.add_task(_prewarm, ids, _level(req.difficulty))
    return {"queued": ids}