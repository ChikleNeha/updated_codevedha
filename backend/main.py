from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import init_db
from graph.graph import close_graph
from routes import code, lesson, progress, quiz, tutor, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_graph()


app = FastAPI(title="CodeVedha API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (users.router, progress.router, lesson.router, tutor.router, quiz.router, code.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True}