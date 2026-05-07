"""Final session report generation.

This service turns trusted backend session artifacts into the final AI summary.
It intentionally summarizes attempts without raw student answers so prompt logs
and provider requests stay focused on grading metadata, not private free text.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

from .. import db
from ..db import attempts_repo, boss_session_repo, final_report_repo, session_metrics_repo, session_repo
from ..schemas.ai_contracts import FinalReportResult
from . import ai_gateway


_PROMPT_VERSION = "final-report:v1"


def _safe_json(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def _summarize_attempts(attempts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summarized: list[dict[str, Any]] = []
    for attempt in attempts:
        summarized.append(
            {
                "phase": attempt.get("phase"),
                "subphase": attempt.get("subphase"),
                "question_id": attempt.get("question_id") or attempt.get("item_id"),
                "attempt_number": attempt.get("attempt_number"),
                "checker_source": attempt.get("checker_source"),
                "correct": attempt.get("correct"),
                "score": attempt.get("score"),
                "confidence": attempt.get("confidence"),
                "misconception_tags": _safe_json(
                    attempt.get("misconception_tags_json"),
                    [],
                ),
            }
        )
    return summarized


def _build_prompt(payload: dict[str, Any]) -> str:
    return (
        "You are generating a concise final learning report for a completed "
        "NETS homework session.\n"
        "Use only the trusted backend metrics below. Do not invent questions, "
        "answers, topics, or scores. Keep the recommendation actionable.\n\n"
        "<TRUSTED_SESSION_REPORT_INPUT>\n"
        f"{json.dumps(payload, ensure_ascii=False, sort_keys=True)}\n"
        "</TRUSTED_SESSION_REPORT_INPUT>"
    )


async def generate_final_report(session_id: str, hw_id: str) -> dict[str, Any]:
    homework = await db.get_homework(hw_id)
    if homework is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": "HW_NOT_FOUND",
                "message": f"homework {hw_id} not found",
            },
        )

    session = await session_repo.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": "SESSION_NOT_FOUND",
                "message": f"session {session_id} not found",
            },
        )
    if session.get("homework_id") and session.get("homework_id") != hw_id:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "SESSION_HOMEWORK_MISMATCH",
                "message": "session_id does not belong to the requested homework.",
            },
        )

    attempts = await attempts_repo.list_phase_attempts(session_id, hw_id, limit=1000)
    metrics = await session_metrics_repo.get_session_metrics(session_id, hw_id)
    if metrics is None:
        metrics = await session_metrics_repo.recompute_session_metrics(session_id, hw_id)

    boss_session = await boss_session_repo.get_active_boss_session_for(session_id, hw_id)
    payload = {
        "session_id": session_id,
        "hw_id": hw_id,
        "homework": {
            "title": homework.get("title", ""),
            "subject": homework.get("subject", ""),
            "grade": homework.get("grade"),
            "family": homework.get("family", ""),
        },
        "metrics": metrics,
        "attempts_count": len(attempts),
        "attempts": _summarize_attempts(attempts),
        "boss_state": {
            "status": boss_session.get("status") if boss_session else None,
            "hp": boss_session.get("hp") if boss_session else None,
            "trials_left": boss_session.get("trials_left") if boss_session else None,
            "weak_topics": boss_session.get("weak_topics", []) if boss_session else [],
            "strong_topics": boss_session.get("strong_topics", []) if boss_session else [],
        },
    }

    result = await ai_gateway.generate_structured(
        task=ai_gateway.AITask.FINAL_REPORT,
        prompt=_build_prompt(payload),
        schema=FinalReportResult,
        session_id=session_id,
        homework_id=hw_id,
        prompt_version=_PROMPT_VERSION,
    )
    report = result.model_dump()
    response = {
        "ok": True,
        "session_id": session_id,
        "hw_id": hw_id,
        "prompt_version": _PROMPT_VERSION,
        "report": report,
        "metrics": metrics,
        "attempts_count": len(attempts),
    }
    await final_report_repo.upsert_final_report(session_id, hw_id, response)
    return response
