from fastapi import APIRouter, HTTPException

from database.db import get_db
from models.schemas import UserCreate, UserResponse

router = APIRouter()


@router.post("/users", response_model=UserResponse)
async def create_user(body: UserCreate):
    name = body.username.strip()[:40] or "Learner"
    async with get_db() as db:
        await db.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (name,))
        await db.execute(
            "INSERT OR IGNORE INTO sessions (session_id, username) VALUES (?, ?)",
            (body.session_id, name),
        )
        await db.commit()
        cur = await db.execute("SELECT username, created_at FROM users WHERE username = ?", (name,))
        row = await cur.fetchone()
    return UserResponse(username=row["username"], session_id=body.session_id, created_at=str(row["created_at"]))


@router.get("/users/{username}", response_model=UserResponse)
async def get_user(username: str):
    async with get_db() as db:
        cur = await db.execute("SELECT username, created_at FROM users WHERE username = ?", (username,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        cur = await db.execute(
            "SELECT session_id FROM sessions WHERE username = ? ORDER BY id DESC LIMIT 1", (username,)
        )
        session = await cur.fetchone()
    return UserResponse(
        username=row["username"],
        session_id=session["session_id"] if session else "",
        created_at=str(row["created_at"]),
    )
