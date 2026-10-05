from fastapi import APIRouter

from database.db import get_db
from models.schemas import ProgressItem, ProgressUpdate

router = APIRouter()


async def upsert_progress(db, session_id: str, module_id: int, status: str, quiz_score=None) -> None:
    cur = await db.execute(
        "SELECT status, quiz_score FROM progress WHERE session_id = ? AND module_id = ?",
        (session_id, module_id),
    )
    row = await cur.fetchone()
    if row is None:
        await db.execute(
            "INSERT INTO progress (session_id, module_id, status, quiz_score, completed_at) "
            "VALUES (?, ?, ?, ?, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP END)",
            (session_id, module_id, status, quiz_score or 0, status),
        )
    else:
        new_status = row["status"] if (row["status"] == "completed" and status != "completed") else status
        new_score = quiz_score if quiz_score is not None else row["quiz_score"]
        await db.execute(
            "UPDATE progress SET status = ?, quiz_score = ?, updated_at = CURRENT_TIMESTAMP, "
            "completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END "
            "WHERE session_id = ? AND module_id = ?",
            (new_status, new_score, new_status, session_id, module_id),
        )
    await db.commit()


@router.get("/progress/{session_id}", response_model=list[ProgressItem])
async def get_progress(session_id: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT module_id, status, quiz_score, completed_at FROM progress "
            "WHERE session_id = ? ORDER BY module_id",
            (session_id,),
        )
        rows = await cur.fetchall()
    return [
        ProgressItem(
            module_id=r["module_id"],
            status=r["status"],
            quiz_score=r["quiz_score"] or 0,
            completed_at=str(r["completed_at"]) if r["completed_at"] else None,
        )
        for r in rows
    ]


@router.post("/progress", response_model=ProgressItem)
async def update_progress(body: ProgressUpdate):
    async with get_db() as db:
        await upsert_progress(db, body.session_id, body.module_id, body.status, body.quiz_score)
        cur = await db.execute(
            "SELECT module_id, status, quiz_score, completed_at FROM progress WHERE session_id = ? AND module_id = ?",
            (body.session_id, body.module_id),
        )
        r = await cur.fetchone()
    return ProgressItem(
        module_id=r["module_id"],
        status=r["status"],
        quiz_score=r["quiz_score"] or 0,
        completed_at=str(r["completed_at"]) if r["completed_at"] else None,
    )
