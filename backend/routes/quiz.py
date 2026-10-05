import json

from fastapi import APIRouter

from database.db import get_db
from models.schemas import QuizRequest, QuizResponse, QuizResultRequest, QuizResultResponse
from routes.progress import upsert_progress
from services.curriculum import require_module
from services.difficulty import LEVELS, adapt_difficulty
from services.quiz_bank import pick_questions

router = APIRouter()

PASS_PERCENT = 60


@router.post("/quiz", response_model=QuizResponse)
async def make_quiz(req: QuizRequest):
    require_module(req.module_id)
    difficulty = req.difficulty if req.difficulty in LEVELS else "beginner"
    return QuizResponse(
        module_id=req.module_id,
        difficulty=difficulty,
        questions=pick_questions(req.module_id, difficulty),
    )


@router.post("/quiz/result", response_model=QuizResultResponse)
async def quiz_result(req: QuizResultRequest):
    require_module(req.module_id)
    score = min(req.score, req.total)
    pct = round(100 * score / req.total)
    passed = pct >= PASS_PERCENT
    difficulty = req.difficulty if req.difficulty in LEVELS else "beginner"
    new_level = adapt_difficulty(difficulty, score, req.total, req.wrong_topics)

    async with get_db() as db:
        await db.execute(
            "INSERT INTO quiz_attempts (session_id, module_id, score, total, wrong_topics) VALUES (?, ?, ?, ?, ?)",
            (req.session_id, req.module_id, score, req.total, json.dumps(req.wrong_topics)),
        )
        if new_level:
            await db.execute(
                "INSERT INTO difficulty_log (session_id, module_id, old_difficulty, new_difficulty, reason) "
                "VALUES (?, ?, ?, ?, ?)",
                (req.session_id, req.module_id, difficulty, new_level, f"quiz score {pct} percent"),
            )
        await upsert_progress(db, req.session_id, req.module_id, "completed" if passed else "in_progress", pct)

    if new_level and LEVELS.index(new_level) > LEVELS.index(difficulty):
        message = f"Great work. Moving you up to {new_level}."
    elif new_level:
        message = f"Let us slow down a little. Moving you to {new_level}."
    elif passed:
        message = "Module complete."
    else:
        message = "Review the lesson and try again."
    return QuizResultResponse(percentage=pct, passed=passed, new_difficulty=new_level, message=message)