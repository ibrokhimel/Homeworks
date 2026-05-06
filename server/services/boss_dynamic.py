"""Plan 5 — Dynamic Boss state machine.

Owns:
  * server-side damage formula (LLM never sets HP)
  * adaptive difficulty policy (correct streak → harder, wrong streak → easier)
  * the generation prompt path (LLM generates one question at a time, never
    receiving answer keys from prior phases)
  * the answer-check prompt path (deterministic-friendly judgement; the
    backend clamps any model-supplied damage_multiplier and it never trusts
    the LLM for HP/trials updates)

Hard rules (Plan 5 §4 + §13 + the answer-leak invariant in CLAUDE.md):

  - ``answer_spec.expected``, ``ans``, ``accepted_answers``, and ``correct``
    must never appear in any prompt this module sends.
  - HP / trials / difficulty mutations live here, not in the model output.
  - The legacy ``/ai/boss-turn`` endpoint stays untouched as a fallback.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from . import ai_orchestrator
from ..config import PROMPTS_DIR


_log = logging.getLogger("nets.boss_dynamic")


# ---- Damage / difficulty policy --------------------------------------------

BASE_DAMAGE: dict[str, int] = {
    "easy": 10,
    "medium": 15,
    "hard": 25,
}

ALLOWED_DIFFICULTIES: tuple[str, ...] = ("easy", "medium", "hard")
DEFAULT_DIFFICULTY = "medium"

# Hard cap on the model-supplied damage_multiplier — even if the boss-answer
# checker tries to set 99x, the backend clamps to this range. Plan 5 §7 says
# "The model may recommend a multiplier, but backend must clamp it."
_MULTIPLIER_MIN = 0.0
_MULTIPLIER_MAX = 1.5


def calculate_damage(score: float, difficulty: str, multiplier: float = 1.0) -> int:
    """Plan 5 §7 damage table, with a clamped optional multiplier.

    ``score`` is 0..1; ``difficulty`` is one of ALLOWED_DIFFICULTIES.
    Anything outside the allowed set falls back to medium so the runtime
    never deals indeterminate damage.
    """
    diff = difficulty if difficulty in BASE_DAMAGE else DEFAULT_DIFFICULTY
    base = BASE_DAMAGE[diff]
    s = max(0.0, min(1.0, float(score)))
    if s >= 0.90:
        raw = base
    elif s >= 0.60:
        raw = int(base * 0.5)
    else:
        raw = 0
    m = max(_MULTIPLIER_MIN, min(_MULTIPLIER_MAX, float(multiplier or 1.0)))
    return int(round(raw * m))


@dataclass
class BossStreaks:
    correct_streak: int = 0
    wrong_streak: int = 0


def next_difficulty(
    current: str,
    score: float,
    streaks: BossStreaks,
) -> str:
    """Plan 5 §8 policy. Adaptive but never unfair.

    >= 0.90 with 2+ in a row right → bump to hard.
    < 0.50 with 2+ in a row wrong  → ease back to easy.
    Otherwise stay where we are (clamped to medium if invalid).
    """
    cur = current if current in ALLOWED_DIFFICULTIES else DEFAULT_DIFFICULTY
    s = max(0.0, min(1.0, float(score)))
    if s >= 0.90 and streaks.correct_streak >= 2:
        return "hard"
    if s < 0.50 and streaks.wrong_streak >= 2:
        return "easy"
    return cur


# ---- Prompt loading --------------------------------------------------------

_RUNTIME_PROMPTS = PROMPTS_DIR / "runtime"


def _load_prompt(name: str) -> str:
    path = _RUNTIME_PROMPTS / f"{name}.md"
    return path.read_text(encoding="utf-8")


# ---- Generation -----------------------------------------------------------

@dataclass
class GeneratedBossQuestion:
    question_text: str
    expected_answer: dict[str, Any]
    rubric: dict[str, Any]
    target_skill: str
    difficulty: str
    source_phase_ids: list[str] = field(default_factory=list)
    why_this_question: str = ""

    def to_storage_dict(self) -> dict[str, Any]:
        return {
            "question_text": self.question_text,
            "expected_answer": self.expected_answer,
            "rubric": self.rubric,
            "target_skill": self.target_skill,
            "difficulty": self.difficulty,
            "source_phase_ids": list(self.source_phase_ids),
            "why_this_question": self.why_this_question,
        }


class BossQuestionRejected(Exception):
    """Raised when the generator output fails validation (Plan 5 §6)."""

    def __init__(self, reason: str, *, raw: Optional[dict[str, Any]] = None):
        super().__init__(reason)
        self.reason = reason
        self.raw = raw or {}


_REQUIRED_GENERATION_KEYS: tuple[str, ...] = (
    "question_text",
    "expected_answer",
    "rubric",
    "target_skill",
    "difficulty",
)


def _validate_generated_question(
    raw: dict[str, Any],
    *,
    asked_questions: list[dict[str, Any]],
    max_question_length: int = 900,
) -> GeneratedBossQuestion:
    """Plan 5 §6 backend validation."""
    if not isinstance(raw, dict):
        raise BossQuestionRejected("not_a_dict", raw=None)
    for key in _REQUIRED_GENERATION_KEYS:
        if key not in raw:
            raise BossQuestionRejected(f"missing_field:{key}", raw=raw)

    question_text = str(raw.get("question_text") or "").strip()
    if not question_text:
        raise BossQuestionRejected("empty_question_text", raw=raw)
    if len(question_text) > max_question_length:
        raise BossQuestionRejected("question_too_long", raw=raw)

    expected = raw.get("expected_answer")
    if not isinstance(expected, dict) or not (
        expected.get("canonical")
        or expected.get("accepted_variants")
    ):
        raise BossQuestionRejected("missing_expected_answer", raw=raw)

    rubric = raw.get("rubric")
    if not isinstance(rubric, dict) or not (
        rubric.get("full_credit")
        or rubric.get("partial_credit")
    ):
        raise BossQuestionRejected("missing_rubric", raw=raw)

    target_skill = str(raw.get("target_skill") or "").strip()
    if not target_skill:
        raise BossQuestionRejected("missing_target_skill", raw=raw)

    difficulty = raw.get("difficulty")
    if difficulty not in ALLOWED_DIFFICULTIES:
        raise BossQuestionRejected("invalid_difficulty", raw=raw)

    # Anti-repetition check: the new question must not be a near-exact
    # duplicate of any question we've already asked. We use a normalized
    # whitespace-collapsed comparison rather than string equality so trivial
    # paraphrases ("Solve x + 2 = 5" vs "solve  x + 2 = 5  .") still trip.
    norm_new = " ".join(question_text.lower().split())
    for prev in asked_questions or []:
        prev_text = " ".join(str(prev.get("question_text") or "").lower().split())
        if prev_text and prev_text == norm_new:
            raise BossQuestionRejected("repeats_previous", raw=raw)

    return GeneratedBossQuestion(
        question_text=question_text,
        expected_answer=expected,
        rubric=rubric,
        target_skill=target_skill,
        difficulty=difficulty,
        source_phase_ids=list(raw.get("source_phase_ids") or []),
        why_this_question=str(raw.get("why_this_question") or ""),
    )


_GENERATION_SCHEMA: dict[str, Any] = {
    "question_text": "string — the question to ask the student, <=900 chars",
    "expected_answer": {
        "canonical": "canonical correct answer string",
        "accepted_variants": "list[string]",
        "notes": "optional grader note",
    },
    "rubric": {
        "full_credit": "list[string]",
        "partial_credit": "list[string]",
        "common_mistakes": "list[string]",
    },
    "target_skill": "skill tag (e.g. according_to, factoring)",
    "difficulty": "easy | medium | hard",
    "source_phase_ids": "list[string] (phase ids used as source)",
    "why_this_question": "1-sentence rationale",
}


async def generate_boss_question(
    boss_context: dict[str, Any],
    *,
    difficulty: str,
) -> GeneratedBossQuestion:
    """Call the LLM to generate one new boss question, validate, and return.

    Plan 5 §6 — boss-question-generator prompt + strict JSON output.
    Raises BossQuestionRejected if validation fails. Caller should retry once
    or fall back to a deterministic stem.
    """
    diff = difficulty if difficulty in ALLOWED_DIFFICULTIES else DEFAULT_DIFFICULTY
    prompt = _load_prompt("boss-question-generator")
    payload = dict(boss_context)
    payload["target_difficulty"] = diff

    try:
        input_section = ai_orchestrator.build_input_section(payload)
        raw = await ai_orchestrator.generate_json(
            f"{prompt}\n\n{input_section}",
            schema_hint=_GENERATION_SCHEMA,
            model=ai_orchestrator.PRO_MODEL,
        )
    except (ai_orchestrator.PromptTooLargeError, RuntimeError) as exc:
        _log.warning(
            "generate_boss_question AI unavailable (%s: %s)",
            exc.__class__.__name__, exc,
        )
        raise BossQuestionRejected("ai_unavailable") from exc

    return _validate_generated_question(
        raw,
        asked_questions=list(boss_context.get("asked_questions") or []),
        max_question_length=int((boss_context.get("boss_policy") or {}).get("max_question_length") or 900),
    )


# ---- Answer checking ------------------------------------------------------

@dataclass
class BossAnswerVerdict:
    is_correct: bool
    score: float
    confidence: float
    feedback_to_student: str
    misconception_tags: list[str] = field(default_factory=list)
    damage_multiplier: float = 1.0
    difficulty_recommendation: str = "stay"
    should_retry_same_skill: bool = False
    ai_unavailable: bool = False


_ANSWER_CHECK_SCHEMA: dict[str, Any] = {
    "is_correct": "bool",
    "score": "float 0..1",
    "confidence": "float 0..1",
    "feedback_to_student": "1-2 sentence feedback in student's language",
    "misconception_tags": "list[string]",
    "damage_multiplier": "float 0..1.5",
    "difficulty_recommendation": "increase | decrease | stay",
    "should_retry_same_skill": "bool",
}


def _verdict_from_raw(raw: dict[str, Any]) -> BossAnswerVerdict:
    diff_rec = str(raw.get("difficulty_recommendation") or "stay")
    if diff_rec not in {"increase", "decrease", "stay"}:
        diff_rec = "stay"
    return BossAnswerVerdict(
        is_correct=bool(raw.get("is_correct")),
        score=max(0.0, min(1.0, float(raw.get("score") or 0.0))),
        confidence=max(0.0, min(1.0, float(raw.get("confidence") or 0.0))),
        feedback_to_student=str(raw.get("feedback_to_student") or ""),
        misconception_tags=[
            t for t in (raw.get("misconception_tags") or []) if isinstance(t, str)
        ],
        damage_multiplier=max(_MULTIPLIER_MIN, min(_MULTIPLIER_MAX, float(raw.get("damage_multiplier") or 1.0))),
        difficulty_recommendation=diff_rec,
        should_retry_same_skill=bool(raw.get("should_retry_same_skill") or False),
    )


async def check_boss_answer(
    *,
    question_text: str,
    expected_answer: dict[str, Any],
    rubric: dict[str, Any],
    student_answer: str,
    target_skill: str,
    difficulty: str,
) -> BossAnswerVerdict:
    """Plan 5 §7 — boss-answer-checker prompt path.

    NOTE: ``expected_answer`` IS sent to the checker (it has to grade against
    something). It is NEVER sent to the boss persona / response model. Keep
    that boundary clear if you ever wire the response phrasing through a
    second model call.
    """
    prompt = _load_prompt("boss-answer-checker")
    payload = {
        "question_text": question_text,
        "expected_answer": expected_answer,
        "rubric": rubric,
        "student_answer": student_answer,
        "target_skill": target_skill,
        "difficulty": difficulty,
    }
    try:
        input_section = ai_orchestrator.build_input_section(payload)
        raw = await ai_orchestrator.generate_json(
            f"{prompt}\n\n{input_section}",
            schema_hint=_ANSWER_CHECK_SCHEMA,
            model=ai_orchestrator.PRO_MODEL,
        )
    except (ai_orchestrator.PromptTooLargeError, RuntimeError) as exc:
        _log.warning(
            "check_boss_answer AI unavailable (%s: %s)",
            exc.__class__.__name__, exc,
        )
        return _synthetic_verdict(
            student_answer=student_answer, expected_answer=expected_answer,
        )

    if not isinstance(raw, dict):
        return _synthetic_verdict(
            student_answer=student_answer, expected_answer=expected_answer,
        )
    return _verdict_from_raw(raw)


def _synthetic_verdict(
    *,
    student_answer: str,
    expected_answer: dict[str, Any],
) -> BossAnswerVerdict:
    """When the LLM checker is unavailable, fall back to a deterministic
    case-insensitive normalized compare. Better than 500ing in the runtime.
    """
    canonical = str(expected_answer.get("canonical") or "")
    variants = [str(v) for v in (expected_answer.get("accepted_variants") or [])]
    accepted = [v.strip().lower() for v in [canonical, *variants] if v]
    is_correct = student_answer.strip().lower() in accepted if accepted else False
    return BossAnswerVerdict(
        is_correct=is_correct,
        score=1.0 if is_correct else 0.0,
        confidence=0.55,
        feedback_to_student=(
            "AI tafsiloti vaqtinchalik mavjud emas. Javobingiz qabul qilindi."
            if is_correct
            else "AI tafsiloti vaqtinchalik mavjud emas. Hali to'g'ri emas."
        ),
        misconception_tags=[],
        damage_multiplier=1.0,
        difficulty_recommendation="stay",
        should_retry_same_skill=not is_correct,
        ai_unavailable=True,
    )


__all__ = [
    "BASE_DAMAGE",
    "ALLOWED_DIFFICULTIES",
    "DEFAULT_DIFFICULTY",
    "calculate_damage",
    "next_difficulty",
    "BossStreaks",
    "GeneratedBossQuestion",
    "BossQuestionRejected",
    "generate_boss_question",
    "BossAnswerVerdict",
    "check_boss_answer",
]
