from langchain_core.messages import AIMessage

from graph.state import TutorState
from services.difficulty import parse_signals
from services.llm import chat
from services.prompts import LEVEL_STYLES, ROUTER_SYSTEM, TUTOR_SYSTEM


async def router_node(state: TutorState) -> dict:
    last = state["messages"][-1].content
    raw = await chat(
        [{"role": "system", "content": ROUTER_SYSTEM}, {"role": "user", "content": last}],
        temperature=0,
        num_predict=4,
    )
    word = raw.strip().lower()
    intent = next((i for i in ("quiz", "lesson", "tutor") if i in word), "tutor")
    return {"intent": intent}


async def tutor_node(state: TutorState) -> dict:
    difficulty = state.get("difficulty", "beginner")
    system = TUTOR_SYSTEM.format(
        module_title=state.get("module_title", ""),
        topics=", ".join(state.get("module_topics", [])),
        difficulty=difficulty,
        level_style=LEVEL_STYLES.get(difficulty, LEVEL_STYLES["beginner"]),
        lesson_context=(state.get("lesson_context") or "(none)")[:1500],
    )
    history = [
        {"role": "user" if m.type == "human" else "assistant", "content": m.content}
        for m in state["messages"][-10:]
    ]
    raw = await chat([{"role": "system", "content": system}] + history)
    text, new_level, adjust = parse_signals(raw, difficulty)
    if not text:
        text = "Let me try that again. Could you ask your question once more?"
    return {
        "messages": [AIMessage(content=text)],
        "response": text,
        "updated_difficulty": new_level,
        "lesson_adjustment": adjust,
    }


async def quiz_node(state: TutorState) -> dict:
    text = "Okay, opening the quiz for this module."
    return {"messages": [AIMessage(content=text)], "response": text}


async def lesson_node(state: TutorState) -> dict:
    text = "Okay, taking you back to the lesson."
    return {"messages": [AIMessage(content=text)], "response": text}
