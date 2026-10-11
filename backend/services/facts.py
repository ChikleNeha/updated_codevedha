"""Answers about the learner's own progress, built from the database instead of the model's memory."""
import re
from typing import Optional

from database.db import get_db
from services.curriculum import MODULES

TOTAL = len(MODULES)
STATUS_WORDS = {"not_started": "not started yet", "in_progress": "in progress", "completed": "completed"}


async def build_facts(session_id: str, module_id: int, difficulty: str, username: str = "") -> dict:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT module_id, status, quiz_score FROM progress WHERE session_id = ?", (session_id,)
        )
        rows = await cur.fetchall()
        cur = await db.execute(
            "SELECT module_id, score, total FROM quiz_attempts WHERE session_id = ? ORDER BY id", (session_id,)
        )
        attempts = await cur.fetchall()

    status = {r["module_id"]: r["status"] for r in rows}
    score = {r["module_id"]: r["quiz_score"] or 0 for r in rows}
    modules = [
        {
            "id": mid, "title": m["title"], "minutes": m["minutes"],
            "status": status.get(mid, "not_started"), "score": score.get(mid, 0),
        }
        for mid, m in MODULES.items()
    ]
    completed = [m for m in modules if m["status"] == "completed"]
    remaining = [m for m in modules if m["status"] != "completed"]
    quiz_pcts = [round(100 * a["score"] / a["total"]) for a in attempts if a["total"]]
    return {
        "username": username,
        "difficulty": difficulty,
        "current": next(m for m in modules if m["id"] == module_id),
        "modules": modules,
        "completed": completed,
        "remaining": remaining,
        "average": round(sum(m["score"] for m in completed) / len(completed)) if completed else None,
        "minutes_left": sum(m["minutes"] for m in remaining),
        "next_up": remaining[0] if remaining else None,
        "quiz_pcts": quiz_pcts,
        "last_attempt_module": attempts[-1]["module_id"] if attempts else None,
    }


def facts_text(f: dict) -> str:
    """The same facts as plain lines, for the model to read."""
    lines = [
        f"Learner name: {f['username'] or 'unknown'}",
        f"Current level: {f['difficulty']}",
        f"Currently on module {f['current']['id']}, {f['current']['title']}",
        f"Total modules: {TOTAL}",
        f"Modules completed: {len(f['completed'])}",
        f"Modules left: {len(f['remaining'])}",
        f"Average quiz score on completed modules: {f['average'] if f['average'] is not None else 'none yet'} percent",
        f"Estimated minutes left in total: {f['minutes_left']}",
        f"Quizzes taken: {len(f['quiz_pcts'])}",
    ]
    for m in f["modules"]:
        extra = f", quiz score {m['score']} percent" if m["status"] == "completed" else ""
        lines.append(f"Module {m['id']}, {m['title']}: {STATUS_WORDS[m['status']]}, about {m['minutes']} minutes{extra}")
    return "\n".join(lines)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _names(modules: list[dict]) -> str:
    return ", ".join(f"module {m['id']}, {m['title']}" for m in modules)


def _progress(f: dict) -> str:
    done = len(f["completed"])
    if done == 0:
        text = f"You have completed 0 of {TOTAL} modules so far. You are on module {f['current']['id']}, {f['current']['title']}."
    else:
        text = f"You have completed {done} of {TOTAL} modules, with an average quiz score of {f['average']} percent."
    if f["next_up"]:
        text += f" Next up is module {f['next_up']['id']}, {f['next_up']['title']}."
    else:
        text += " You have finished every module. Well done."
    return text


def _left(f: dict) -> str:
    n = len(f["remaining"])
    if n == 0:
        return f"No modules are left. You have completed all {TOTAL}."
    return f"You have {_plural(n, 'module')} left: {_names(f['remaining'])}. That is about {f['minutes_left']} minutes in total."


def _time(f: dict) -> str:
    cur = f["current"]
    parts = []
    if cur["status"] == "completed":
        parts.append(f"You already completed module {cur['id']}.")
    else:
        parts.append(f"Module {cur['id']}, {cur['title']}, takes about {cur['minutes']} minutes.")
    n = len(f["remaining"])
    if n == 0:
        parts.append("You have finished everything.")
    else:
        parts.append(f"All {_plural(n, 'remaining module')} should take about {f['minutes_left']} minutes in total.")
    parts.append("These are rough estimates, and your own pace may differ.")
    return " ".join(parts)


def _current(f: dict) -> str:
    cur = f["current"]
    return (
        f"You are on module {cur['id']}, {cur['title']}. It is {STATUS_WORDS[cur['status']]}. "
        f"Your level is {f['difficulty']}."
    )


def _total(f: dict) -> str:
    mins = sum(m["minutes"] for m in f["modules"])
    items = "; ".join(f"module {m['id']}, {m['title']}" for m in f["modules"])
    return f"There are {TOTAL} modules: {items}. The whole course is about {mins} minutes."


def _level(f: dict) -> str:
    return (
        f"Your level is {f['difficulty']}. Score 80 percent or more on a quiz to move up a level, "
        "or below 50 percent to move down."
    )


def _quiz(f: dict) -> str:
    pcts = f["quiz_pcts"]
    if not pcts:
        return "You have not taken any quizzes yet. Press Q or say quiz to start one."
    return (
        f"You have taken {_plural(len(pcts), 'quiz')}. Your best score is {max(pcts)} percent "
        f"and your last score was {pcts[-1]} percent on module {f['last_attempt_module']}."
    )


def _name(f: dict) -> str:
    return f"Your name is {f['username']}." if f["username"] else "I do not have your name yet."


def _about(f: dict) -> str:
    return (
        "I am CodeVedha, a voice tutor for learning Python. I read lessons aloud, answer your questions, "
        "give quizzes you can answer by voice, and let you practise code by speaking. "
        "Ask me about your progress, the modules left, or how long things will take. Say help for all commands."
    )


TIME_RE = re.compile(
    r"\b(how long|how much time|how many (minutes|hours)|time (is )?(left|remaining|required|needed)|how soon|"
    r"duration|time (will|does|is) it (take|going))\b"
)
PY_TERMS = re.compile(r"\b(string|list|array|tuple|word|text|variable|name|loop|range|function|dictionary|number|sentence|file)\b")
APP_WORDS = re.compile(r"\b(module|modules|course|lesson|chapter|finish|learn|me|my)\b")
LEFT_RE = re.compile(
    r"\b(modules?|chapters?|lessons?|topics?)\b.*\b(left|remaining|remain|to go|pending|incomplete|not (done|finished|completed))\b"
    r"|\bhow many (more )?(modules?|chapters?|lessons?)\b.*\b(left|more|remaining|to (do|go|finish|complete))\b"
    r"|\bhow many more (modules?|chapters?)\b|\bwhat('?s| is| are) (left|remaining)\b|\bwhat('?s| is) next\b"
    r"|\bwhat should i (do|learn|study) next\b|\bwhat (do i|to) (do|learn) next\b"
)
QUIZ_RE = re.compile(
    r"\bquiz(zes)?\b.*\b(score|taken|attempts?|best|last|how many)\b|\bhow many quiz(zes)?\b|\b(best|last|highest) (quiz )?score\b"
)
PROGRESS_RE = re.compile(
    r"\b(progress|how am i doing|how far (am i|along)|how many (modules? |chapters? )?(have i|did i)|my (scores?|results?)|"
    r"average score|how well (am i|did i)|am i doing (well|good|ok)|what have i (done|completed|finished))\b"
)
CURRENT_RE = re.compile(
    r"\b(which|what) (module|chapter|lesson|topic)( am i| are we| is this| is it)?\b|\bwhere am i\b|\bcurrent (module|chapter|lesson|topic)\b"
)
LEVEL_RE = re.compile(
    r"\b(my level|what level|which level|my difficulty|what difficulty|current (level|difficulty))\b|\bam i (a )?(beginner|intermediate|advanced)\b"
)
TOTAL_RE = re.compile(
    r"\bhow many (modules?|chapters?|lessons?|topics?)\b|\b(what|which) (modules?|chapters?|topics?)\b.*\b(are there|in the course|do you have|will i learn|can i learn|are available)\b"
    r"|\bwhat (will|can|do) (i|we) learn\b|\b(syllabus|curriculum)\b|\blist (the |all )?(modules?|chapters?)\b"
)
NAME_RE = re.compile(r"\b(what('?s| is) my name|who am i|do you know my name)\b")
ABOUT_RE = re.compile(r"\b(what can you do|who are you|what are you|what do you do|how does this (work|website)|how do i use (this|it))\b")


def answer_meta(message: str, f: dict) -> Optional[str]:
    """A spoken answer if the message is about the learner's own progress, modules, time or level."""
    t = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", message.lower())).strip()
    if not t:
        return None
    if TIME_RE.search(t) and not (PY_TERMS.search(t) and not APP_WORDS.search(t)):
        return _time(f)
    if LEFT_RE.search(t):
        return _left(f)
    if QUIZ_RE.search(t):
        return _quiz(f)
    if PROGRESS_RE.search(t):
        return _progress(f)
    if CURRENT_RE.search(t):
        return _current(f)
    if LEVEL_RE.search(t):
        return _level(f)
    if TOTAL_RE.search(t):
        return _total(f)
    if NAME_RE.search(t):
        return _name(f)
    if ABOUT_RE.search(t):
        return _about(f)
    return None