from typing import Annotated, Literal, Optional

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class TutorState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    session_id: str
    module_id: int
    module_title: str
    module_topics: list
    lesson_context: str
    difficulty: str
    updated_difficulty: Optional[str]
    lesson_adjustment: bool
    intent: Literal["tutor", "quiz", "lesson", "unknown"]
    response: str
    quiz_questions: list
