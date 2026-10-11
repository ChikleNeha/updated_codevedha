from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage

from database.db import get_db
from graph.graph import get_graph
from models.schemas import TutorRequest, TutorResponse
from services.curriculum import require_module
from services.difficulty import LEVELS
from services.facts import answer_meta, build_facts, facts_text
from services.llm import LLMUnavailable
from services.priority import interactive

router = APIRouter()

QUIZ_ONLY_MESSAGE = (
    "During a quiz I can only answer questions about your progress, the modules and the time. "
    "Python questions can wait until you are back in the lesson."
)


async def _log(req: TutorRequest, response: str, difficulty: str, new_level=None) -> None:
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


@router.post("/tutor", response_model=TutorResponse)
async def tutor(req: TutorRequest):
    module = require_module(req.module_id)
    difficulty = req.difficulty if req.difficulty in LEVELS else "beginner"

    # Questions about the learner's own progress, modules, time or level are answered from the database.
    facts = await build_facts(req.session_id, req.module_id, difficulty, req.username)
    meta = answer_meta(req.message, facts)
    if meta is None and req.scope == "quiz":
        meta = QUIZ_ONLY_MESSAGE
    if meta is not None:
        await _log(req, meta, difficulty)
        return TutorResponse(response=meta, intent="meta")

    graph = await get_graph()
    state_in = {
        "messages": [HumanMessage(content=req.message)],
        "session_id": req.session_id,
        "module_id": req.module_id,
        "module_title": module["title"],
        "module_topics": module["topics"],
        "lesson_context": req.lesson_context,
        "app_facts": facts_text(facts),
        "difficulty": difficulty,
        # reset per turn fields so a checkpointed value from the last turn never leaks in
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "unknown",
        "response": "",
        "quiz_questions": [],
    }
    try:
        async with interactive():
            result = await graph.ainvoke(
                state_in, config={"configurable": {"thread_id": f"{req.session_id}:{req.module_id}"}}
            )
    except LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))

    response = result.get("response", "")
    new_level = result.get("updated_difficulty")
    await _log(req, response, difficulty, new_level)
    return TutorResponse(
        response=response,
        intent=result.get("intent", "tutor"),
        updated_difficulty=new_level,
        lesson_adjust=bool(result.get("lesson_adjustment")),
    )