"""
AI Tutor Runtime Service.

Stateless tutor endpoints called during student homework playback.
Each function loads its prompt from server/prompts/runtime/{name}.md,
sends to Gemini with request-specific context, returns typed result.
"""
from typing import Optional, Any
from pathlib import Path
import json

from ..config import PROMPTS_DIR
from . import gemini

RUNTIME_PROMPTS = PROMPTS_DIR / "runtime"


def _load_runtime_prompt(name: str) -> str:
    path = RUNTIME_PROMPTS / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Runtime prompt missing: {path}")
    return path.read_text(encoding="utf-8")


async def check_answer(
    question: str,
    student_answer: str,
    expected_answers: list[str],
    subject: str,
    grade: int,
    tier: str = "MEDIUM",
    context: Optional[str] = None,
) -> dict:
    """
    Evaluate a student's typed answer semantically.
    Returns: {
        "correct": bool,
        "score": float (0.0–1.0),
        "feedback": str (Uzbek, formal Siz, encouraging),
        "matched_expected": Optional[str] (closest expected answer if any)
    }
    """
    prompt = _load_runtime_prompt("answer-checker")
    payload = {
        "question": question,
        "student_answer": student_answer,
        "expected_answers": expected_answers,
        "subject": subject,
        "grade": grade,
        "tier": tier,
        "context": context or "",
    }
    schema = {
        "correct": "bool",
        "score": "float between 0 and 1",
        "feedback": "Uzbek string, formal Siz, 1-2 sentences",
        "matched_expected": "string or null",
    }
    return await gemini.generate_json(
        f"{prompt}\n\n---\n\nINPUT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}",
        schema_hint=schema,
        model=gemini.FAST_MODEL,
    )


async def boss_turn(
    boss_question: str,
    student_answer: str,
    expected_answers: list[str],
    damage_value: int,
    hp_remaining: int,
    attempt_number: int,
    subject: str,
    grade: int,
) -> dict:
    """
    Boss combat turn. Evaluates answer, assigns damage, generates in-character boss response.
    Returns: {
        "correct": bool,
        "damage_dealt": int (damage_value if correct, 0 otherwise),
        "boss_response": str (in-character Uzbek taunt or praise, 1 sentence),
        "hint": Optional[str] (if wrong and attempt_number >= 2, provide a hint),
        "score": float
    }
    """
    prompt = _load_runtime_prompt("boss-tutor")
    payload = {
        "boss_question": boss_question,
        "student_answer": student_answer,
        "expected_answers": expected_answers,
        "damage_value": damage_value,
        "hp_remaining": hp_remaining,
        "attempt_number": attempt_number,
        "subject": subject,
        "grade": grade,
    }
    schema = {
        "correct": "bool",
        "damage_dealt": "int (0 or damage_value)",
        "boss_response": "Uzbek string, in-character boss, 1 sentence",
        "hint": "Uzbek string or null (null if attempt 1 or if correct)",
        "score": "float 0-1",
    }
    return await gemini.generate_json(
        f"{prompt}\n\n---\n\nINPUT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}",
        schema_hint=schema,
        model=gemini.PRO_MODEL,  # boss uses stronger model
    )


async def reflection_feedback(
    homework_title: str,
    homework_summary: str,
    student_reflection: str,
    performance: dict,
    subject: str,
    grade: int,
) -> dict:
    """
    Personalized reflection response after student finishes homework.
    Returns: {
        "feedback": str (Uzbek, warm, 3-4 sentences, acknowledges strengths + one growth area),
        "next_steps": list[str] (2-3 concrete actions for next session),
        "encouragement": str (1 sentence),
    }
    """
    prompt = _load_runtime_prompt("reflection-coach")
    payload = {
        "homework_title": homework_title,
        "homework_summary": homework_summary,
        "student_reflection": student_reflection,
        "performance": performance,  # {correct: int, total: int, time_minutes: int, weak_phase: str}
        "subject": subject,
        "grade": grade,
    }
    schema = {
        "feedback": "Uzbek string, 3-4 sentences",
        "next_steps": "array of 2-3 Uzbek strings",
        "encouragement": "Uzbek string, 1 sentence",
    }
    return await gemini.generate_json(
        f"{prompt}\n\n---\n\nINPUT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}",
        schema_hint=schema,
        model=gemini.FAST_MODEL,
    )


async def tutor_help(
    phase: str,
    question: str,
    student_input: str,
    subject: str,
    grade: int,
    context: Optional[str] = None,
) -> dict:
    """
    General tutor assistant. Fallback for open-ended questions or when student asks for help.
    Returns: {
        "response": str (Uzbek, patient tutor tone, 2-3 sentences),
        "guidance_type": "hint" | "explanation" | "encouragement" | "correction",
    }
    """
    prompt = _load_runtime_prompt("tutor-assistant")
    payload = {
        "phase": phase,
        "question": question,
        "student_input": student_input,
        "subject": subject,
        "grade": grade,
        "context": context or "",
    }
    schema = {
        "response": "Uzbek string, 2-3 sentences, patient tutor tone",
        "guidance_type": "one of: hint, explanation, encouragement, correction",
    }
    return await gemini.generate_json(
        f"{prompt}\n\n---\n\nINPUT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}",
        schema_hint=schema,
        model=gemini.FAST_MODEL,
    )
