import re
from typing import Optional

LEVELS = ["beginner", "intermediate", "advanced"]


def adapt_difficulty(current: str, score: int, total: int, wrong_topics: list[str]) -> Optional[str]:
    """Score >= 80% moves up one level, < 50% moves down one level, otherwise no change."""
    if current not in LEVELS or total <= 0:
        return None
    pct = score / total
    i = LEVELS.index(current)
    if pct >= 0.8 and i < len(LEVELS) - 1:
        return LEVELS[i + 1]
    if pct < 0.5 and i > 0:
        return LEVELS[i - 1]
    return None


_DIFF_RE = re.compile(r"^\s*DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)\s*$", re.I | re.M)
_ADJUST_RE = re.compile(r"^\s*LESSON_ADJUST:\s*true\s*$", re.I | re.M)


def parse_signals(raw: str, current: str) -> tuple[str, Optional[str], bool]:
    """Split a tutor reply into (spoken text, new difficulty or None, lesson_adjust)."""
    m = _DIFF_RE.search(raw)
    new_level = m.group(1).lower() if m else None
    if new_level == current:
        new_level = None
    adjust = bool(_ADJUST_RE.search(raw))
    text = _ADJUST_RE.sub("", _DIFF_RE.sub("", raw)).strip()
    return text, new_level, adjust
