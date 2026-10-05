from typing import Optional

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph

from database.db import DB_PATH
from graph.edges import route_by_intent
from graph.nodes import lesson_node, quiz_node, router_node, tutor_node
from graph.state import TutorState

CHECKPOINT_PATH = DB_PATH.parent / "checkpoints.db"

_graph = None
_conn: Optional[aiosqlite.Connection] = None


async def get_graph():
    global _graph, _conn
    if _graph is not None:
        return _graph
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _conn = await aiosqlite.connect(CHECKPOINT_PATH)
    checkpointer = AsyncSqliteSaver(_conn)

    builder = StateGraph(TutorState)
    builder.add_node("router_node", router_node)
    builder.add_node("tutor_node", tutor_node)
    builder.add_node("lesson_node", lesson_node)
    builder.add_node("quiz_node", quiz_node)
    builder.add_edge(START, "router_node")
    builder.add_conditional_edges(
        "router_node",
        route_by_intent,
        {"tutor": "tutor_node", "quiz": "quiz_node", "lesson": "lesson_node"},
    )
    for name in ("tutor_node", "lesson_node", "quiz_node"):
        builder.add_edge(name, END)
    _graph = builder.compile(checkpointer=checkpointer)
    return _graph


async def close_graph() -> None:
    global _graph, _conn
    _graph = None
    if _conn is not None:
        await _conn.close()
        _conn = None
