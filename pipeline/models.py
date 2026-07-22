from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any


class QuestionKind(str, Enum):
    ACADEMIC = "academic"
    PROFILE = "profile"
    EVALUATION = "evaluation"
    NPS = "nps"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class Presentation:
    presentation_id: str
    title: str
    session_date: date
    href: str
    source_hash: str | None = None
    captured_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialize(asdict(self))


@dataclass(frozen=True, slots=True)
class Session:
    session_id: str
    presentation_id: str
    session_date: date
    participants: int
    interactive_slides: int
    complete: bool = False

    def to_dict(self) -> dict[str, Any]:
        return _serialize(asdict(self))


@dataclass(frozen=True, slots=True)
class Question:
    question_id: str
    presentation_id: str
    slide_index: int
    title: str
    kind: QuestionKind
    choices: tuple[str, ...] = ()
    correct_indices: tuple[int, ...] = ()
    taxonomy: str | None = None
    topic: str | None = None
    analysis_role: str | None = None
    subtopic: str | None = None
    cognitive_task: str | None = None
    bloom: str | None = None
    predicted_difficulty: str | None = None
    ai_confidence: float | None = None
    ai_rationale: str | None = None
    ai_status: str | None = None
    taxonomy_version: str | None = None
    needs_review: bool = False
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialize(asdict(self))


@dataclass(frozen=True, slots=True)
class Response:
    response_id: str
    session_id: str
    question_id: str
    participant_id: str
    value: str | int | float | None
    is_correct: bool | None = None
    submitted_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialize(asdict(self))


def _serialize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value
