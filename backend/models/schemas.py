from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["not_started", "in_progress", "completed"]


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    session_id: str = Field(min_length=8, max_length=64)


class UserResponse(BaseModel):
    username: str
    session_id: str = ""
    created_at: Optional[str] = None


class ProgressUpdate(BaseModel):
    session_id: str
    module_id: int = Field(ge=1, le=5)
    status: Status
    quiz_score: Optional[int] = None


class ProgressItem(BaseModel):
    module_id: int
    status: Status
    quiz_score: int = 0
    completed_at: Optional[str] = None


class LessonRequest(BaseModel):
    session_id: str
    module_id: int = Field(ge=1, le=5)
    difficulty: str = "beginner"
    force: bool = False


class PrewarmRequest(BaseModel):
    session_id: str
    difficulty: str = "beginner"
    module_ids: list[int] = [2, 3, 4, 5]


class LessonResponse(BaseModel):
    module_id: int
    difficulty: str
    content: str
    cached: bool


class TutorRequest(BaseModel):
    session_id: str
    module_id: int = Field(ge=1, le=5)
    message: str = Field(min_length=1, max_length=1000)
    difficulty: str = "beginner"
    lesson_context: str = ""
    scope: Literal["lesson", "quiz", "code"] = "lesson"  # quiz: only app questions, no Python teaching
    username: str = ""


class TutorResponse(BaseModel):
    response: str
    intent: str = "tutor"
    updated_difficulty: Optional[str] = None
    lesson_adjust: bool = False


class QuizRequest(BaseModel):
    session_id: str
    module_id: int = Field(ge=1, le=5)
    difficulty: str = "beginner"


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str
    topic: str = ""


class QuizResponse(BaseModel):
    module_id: int
    difficulty: str
    questions: list[QuizQuestion]


class QuizResultRequest(BaseModel):
    session_id: str
    module_id: int = Field(ge=1, le=5)
    score: int = Field(ge=0)
    total: int = Field(ge=1)
    wrong_topics: list[str] = []
    difficulty: str = "beginner"


class QuizResultResponse(BaseModel):
    percentage: int
    passed: bool
    new_difficulty: Optional[str] = None
    message: str


class CodeRunRequest(BaseModel):
    spoken_text: str = Field(min_length=1, max_length=500)
    current_module: int = Field(default=1, ge=1, le=5)


class CodeRunResponse(BaseModel):
    code: str
    output: str = ""
    error: str = ""
    error_explanation: str = ""
    success: bool