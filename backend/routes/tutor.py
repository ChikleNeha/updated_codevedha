from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage

from database.db import get_db
from graph.graph import get_graph
from models.schemas import TutorRequest, TutorResponse
from services.curriculum import require_module
from services.difficulty import LEVELS
from services.llm import LLMUnavailable

router = APIRouter()


@router.post("/tutor", response_model=TutorResponse)
async def tutor(req: TutorRequest):
    module = require_module(req.module_id)
    difficulty = req.difficulty if req.difficulty in LEVELS else "beginner"
    graph = await get_graph()
    state_in = {
        "messages": [HumanMessage(content=req.message)],
        "session_id": req.session_id,
        "module_id": req.module_id,
        "module_title": module["title"],
        "module_topics": module["topics"],
        "lesson_context": req.lesson_context,
        "difficulty": difficulty,
        # reset per turn fields so a checkpointed value from the last turn never leaks in
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "unknown",
        "response": "",
        "quiz_questions": [],
    }
    try:
        result = await graph.ainvoke(
            state_in, config={"configurable": {"thread_id": f"{req.session_id}:{req.module_id}"}}
        )
    except LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))

    response = result.get("response", "")
    new_level = result.get("updated_difficulty")
    async with get_db() as db:
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content) VALUES (?, ?, 'user', ?)",
            (req.session_id, req.module_id, req.message),
        )
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content) VALUES (?, ?, 'assistant', ?)",
            (req.session_id, req.module_id, response),
        )
        if new_level:
            await db.execute(
                "INSERT INTO difficulty_log (session_id, module_id, old_difficulty, new_difficulty, reason) "
                "VALUES (?, ?, ?, ?, 'tutor signal')",
                (req.session_id, req.module_id, difficulty, new_level),
            )
        await db.commit()

    return TutorResponse(
        response=response,
        intent=result.get("intent", "tutor"),
        updated_difficulty=new_level,
        lesson_adjust=bool(result.get("lesson_adjustment")),
    )
