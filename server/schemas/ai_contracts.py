"""Pydantic contracts for structured AI outputs.

These models define the expected shape of responses from the AI gateway
for each task type. They are used for validation and repair retries.
"""
from pydantic import BaseModel, Field
from typing import Optional


class TutorResponse(BaseModel):
    reply: str = Field(description="The tutor's response text")
    action: str = Field(
        default="explain",
        description="One of: explain, hint, clarify, encourage, warn, redirect",
    )
    used_screen: bool = Field(default=False)
    used_question: bool = Field(default=False)
    used_performance: bool = Field(default=False)
    detected_need: Optional[str] = Field(
        default=None,
        description="word_definition | concept_explanation | answer_help | unclear_reference",
    )
    misconception_tags: list[str] = Field(default_factory=list)


class AnswerCheckResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="Score between 0.0 and 1.0")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence between 0.0 and 1.0")
    feedback: str = Field(description="Helpful feedback for the student")
    misconception_tags: list[str] = Field(default_factory=list)
    next_hint: Optional[str] = Field(default=None)
    is_correct: Optional[bool] = Field(default=None)


class BossQuestionGenerated(BaseModel):
    question_text: str
    expected_answer: str
    rubric: list[str] = Field(default_factory=list)
    difficulty: str = Field(default="medium")
    topic_tags: list[str] = Field(default_factory=list)


class BossAnswerCheckResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    feedback: str
    is_correct: bool
    hp_delta: int = Field(default=0, description="Boss HP change")
    misconception_tags: list[str] = Field(default_factory=list)


class FinalReportResult(BaseModel):
    summary: str
    weak_topics: list[str] = Field(default_factory=list)
    strong_topics: list[str] = Field(default_factory=list)
    recommendation: str
    mastery_score: float = Field(ge=0.0, le=1.0)


class GuardrailResult(BaseModel):
    allowed: bool
    risk: str = Field(default="none", description="none | answer_leak | prompt_injection | off_topic")
    action: str = Field(
        default="continue",
        description="continue | refuse | redirect | ask_clarifying",
    )
