from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

DB_PATH = Path(__file__).resolve().parent / "accesscode.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, session_id TEXT UNIQUE, username TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, session_id TEXT, module_id INTEGER, status TEXT DEFAULT 'not_started', quiz_score INTEGER DEFAULT 0, completed_at TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(session_id, module_id));
CREATE TABLE IF NOT EXISTS quiz_attempts (id INTEGER PRIMARY KEY, session_id TEXT, module_id INTEGER, score INTEGER, total INTEGER, wrong_topics TEXT, taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY, session_id TEXT, module_id INTEGER, difficulty TEXT, content TEXT, generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, session_id TEXT, module_id INTEGER, role TEXT, content TEXT, message_type TEXT DEFAULT 'chat', timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS difficulty_log (id INTEGER PRIMARY KEY, session_id TEXT, module_id INTEGER, old_difficulty TEXT, new_difficulty TEXT, reason TEXT, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_lessons_lookup ON lessons (module_id, difficulty, generated_at);
"""


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
