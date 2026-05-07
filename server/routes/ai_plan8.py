"""Plan 8 — Evaluation, Logging, and Rollout endpoints.

Net-new endpoints under ``/ai/debug/*``, ``/ai/eval/*``, ``/ai/sim/*``,
and ``/ai/metrics/*``. None of the existing routes in ``ai.py`` /
``ai_plan5.py`` are touched. Plan 8 is a Stage-0 instrumentation chunk
(Plan 8 §9), so behavior of existing AI flows is unchanged.

Security
--------
The ``/ai/debug/*`` endpoints expose session-level diagnostic state and
must be admin-gated in production. Auth model:

  - In dev / unit tests: ``AI_DEBUG_CONTEXT`` truthy OR running with
    pytest enables debug. (No auth required — local-only port.)
  - In prod: caller must send ``X-Debug-Token`` matching
    ``AI_DEBUG_ADMIN_TOKEN``. Missing/wrong token returns 403.

When neither dev nor admin-token applies, all debug endpoints return 403
so a misconfigured prod instance does not silently leak student state.
"""
from __future__ import annotations

import logging
import os
import sys
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Path as PathParam, Query
from pydantic import BaseModel, Field

from .. import db
from ..db import (
    ai_call_logs_repo,
    attempts_repo,
    boss_repo,
    boss_session_repo,
    eval_runs_repo,
    session_events_repo,
    session_metrics_repo,
)
from ..services import ai_context, ai_evaluator, ai_metrics, ai_simulator

router = APIRouter(tags=["ai-plan8-eval"])
_log = logging.getLogger("nets.ai_plan8")


# ---- Auth gate -----------------------------------------------------------


def _admin_token_configured() -> Optional[str]:
    tok = os.environ.get("AI_DEBUG_ADMIN_TOKEN", "").strip()
    return tok or None


def _is_dev_environment() -> bool:
    """Allow debug endpoints when running unit tests or local dev."""
    if "pytest" in sys.modules:
        return True
    debug_flag = os.environ.get("AI_DEBUG_CONTEXT", "").strip().lower()
    if debug_flag in {"1", "true", "yes", "on", "debug"}:
        return True
    return False


def _require_debug_access(provided_token: Optional[str]) -> None:
    """Raise 403 unless the caller has dev access or a valid admin token."""
    if _is_dev_environment():
        return
    expected = _admin_token_configured()
    if expected and provided_token and provided_token == expected:
        return
    raise HTTPException(
        status_code=403,
        detail={
            "error": "debug endpoints require AI_DEBUG_ADMIN_TOKEN in production",
            "code": "DEBUG_FORBIDDEN",
        },
    )


# ---- Request / response models ------------------------------------------


class DebugContextResponse(BaseModel):
    session_id: str
    hw_id: str
    phase: Optional[str] = None
    subphase: Optional[str] = None
    current_question_id: Optional[str] = None
    homework_found: bool
    session_found: bool
    homework_title: str = ""
    subject: str = ""
    grade: int = 0
    homework_summary_chars: int = 0
    current_phase_content_chars: int = 0
    current_question_text_chars: int = 0
    visible_screen_text_chars: int = 0
    student_work_text_chars: int = 0
    recent_chat_history_count: int = 0
    recent_attempts_count: int = 0
    metrics_present: bool = False
    missing_context_flags: list[str] = Field(default_factory=list)
    context_packet_version: str = ""
    notes: list[str] = Field(default_factory=list)


class SimulationRunRequest(BaseModel):
    name: str
    initial_state: Optional[dict] = None
    persist: bool = True


class EvalRunRequest(BaseModel):
    eval_name: str
    # If ``stub_response`` is provided, every case is judged against this
    # exact candidate string. Useful for smoke-testing the harness without
    # invoking the LLM. Real eval runs feed responses through ``run_eval``
    # in tests/CI rather than this endpoint.
    stub_response: Optional[str] = None
    persist: bool = True


# ---- /ai/debug/session/{sid}/* ------------------------------------------


@router.get("/ai/debug/session/{session_id}/context")
async def debug_session_context(
    session_id: str = PathParam(...),
    hw_id: Optional[str] = Query(None, description="Homework id (required)"),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> DebugContextResponse:
    """Return metadata about the canonical context packet for a session.

    Mirrors what ``ai_context.build_tutor_context`` would assemble for the
    tutor — but reports only **lengths and presence flags**, never raw
    student text. Plan 8 §4: this is the first stop when the tutor "acts
    dumb" and you need to confirm the model actually had question_id /
    phase content / chat history.
    """
    _require_debug_access(x_debug_token)
    if not hw_id:
        raise HTTPException(400, detail={"error": "hw_id query parameter required"})

    homework = await db.get_homework(hw_id)
    session = await db.get_session(session_id) if hasattr(db, "get_session") else None
    notes: list[str] = []

    if not homework:
        return DebugContextResponse(
            session_id=session_id,
            hw_id=hw_id,
            homework_found=False,
            session_found=bool(session),
            notes=["homework_not_found"],
        )

    phase = None
    subphase = None
    current_question_id = None
    if session:
        phase = session.get("current_phase") or None
        subphase = session.get("current_subphase") or None
        current_question_id = session.get("current_question_id") or None

    try:
        packet = await ai_context.build_tutor_context(
            session_id=session_id,
            hw_id=hw_id,
            phase=phase or "preview",
            subphase=subphase,
            current_question_id=current_question_id,
        )
    except Exception as exc:
        notes.append(f"context_build_error:{type(exc).__name__}")
        return DebugContextResponse(
            session_id=session_id,
            hw_id=hw_id,
            phase=phase,
            subphase=subphase,
            current_question_id=current_question_id,
            homework_found=True,
            session_found=bool(session),
            homework_title=homework.get("title") or "",
            subject=homework.get("subject") or "",
            grade=int(homework.get("grade") or 0),
            notes=notes,
        )

    return DebugContextResponse(
        session_id=session_id,
        hw_id=hw_id,
        phase=packet.phase,
        subphase=packet.subphase,
        current_question_id=packet.current_question_id,
        homework_found=True,
        session_found=bool(session),
        homework_title=packet.homework_title,
        subject=packet.subject,
        grade=packet.grade,
        homework_summary_chars=len(packet.homework_summary or ""),
        current_phase_content_chars=len(str(packet.current_phase_content or "")),
        current_question_text_chars=len(packet.current_question_text or ""),
        visible_screen_text_chars=len(packet.visible_screen_text or ""),
        student_work_text_chars=len(packet.student_work_text or ""),
        recent_chat_history_count=len(packet.recent_chat_history or []),
        recent_attempts_count=len(packet.recent_attempts or []),
        metrics_present=bool(packet.metrics),
        missing_context_flags=list(packet.missing_context_flags or []),
        context_packet_version=packet.context_packet_version,
        notes=notes,
    )


@router.get("/ai/debug/session/{session_id}/events")
async def debug_session_events(
    session_id: str = PathParam(...),
    hw_id: str = Query(..., description="Homework id"),
    limit: int = Query(100, ge=1, le=500),
    event_type: Optional[str] = Query(None),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    types = [event_type] if event_type else None
    events = await session_events_repo.list_session_events(
        session_id=session_id, hw_id=hw_id, limit=limit, event_types=types,
    )
    return {"session_id": session_id, "hw_id": hw_id, "count": len(events), "events": events}


@router.get("/ai/debug/session/{session_id}/ai-calls")
async def debug_session_ai_calls(
    session_id: str = PathParam(...),
    task_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    rows = await ai_call_logs_repo.list_ai_call_logs(
        session_id=session_id, task_type=task_type, limit=limit,
    )
    return {"session_id": session_id, "count": len(rows), "ai_calls": rows}


@router.get("/ai/debug/session/{session_id}/metrics")
async def debug_session_metrics(
    session_id: str = PathParam(...),
    hw_id: str = Query(..., description="Homework id"),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    metrics = await session_metrics_repo.get_session_metrics(session_id, hw_id)
    attempts = await attempts_repo.list_phase_attempts(session_id, hw_id, limit=200)
    return {
        "session_id": session_id,
        "hw_id": hw_id,
        "metrics": metrics or {},
        "attempts_count": len(attempts),
    }


@router.get("/ai/debug/boss/{boss_session_id}")
async def debug_boss_session(
    boss_session_id: str = PathParam(...),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    state = await boss_session_repo.get_boss_session(boss_session_id)
    if not state:
        raise HTTPException(404, detail={"error": "boss session not found"})
    questions = await boss_repo.list_generated_boss_questions(
        state["session_id"], state["homework_id"], limit=50,
    )
    return {
        "boss_session_id": boss_session_id,
        "state": state,
        "generated_questions_count": len(questions),
        "generated_questions": questions,
    }


# ---- /ai/eval/* ----------------------------------------------------------


@router.get("/ai/eval/cases/{eval_name}")
async def list_eval_cases(
    eval_name: str = PathParam(...),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    """Return loaded fixture rows for a named eval suite (admin-only)."""
    _require_debug_access(x_debug_token)
    try:
        cases = ai_evaluator.load_eval_cases(eval_name)
    except FileNotFoundError as exc:
        raise HTTPException(404, detail={"error": str(exc), "code": "EVAL_NOT_FOUND"})
    except ValueError as exc:
        raise HTTPException(422, detail={"error": str(exc), "code": "EVAL_INVALID_FIXTURE"})
    return {
        "eval_name": eval_name,
        "count": len(cases),
        "cases": [
            {"id": c.id, "task_type": c.task_type, "expected_keys": list(c.expected.keys())}
            for c in cases
        ],
    }


@router.get("/ai/eval/runs")
async def list_eval_runs(
    eval_name: Optional[str] = Query(None),
    task_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    rows = await eval_runs_repo.list_eval_runs(
        eval_name=eval_name, task_type=task_type, limit=limit,
    )
    return {"count": len(rows), "runs": rows}


@router.post("/ai/eval/run")
async def run_eval_endpoint(
    req: EvalRunRequest,
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    """Run a single-turn eval with a stub candidate. CI / smoke use only.

    The real eval driver lives in tests; this endpoint exists so an admin
    can sanity-check the harness from a deployed environment.
    """
    _require_debug_access(x_debug_token)
    try:
        cases = ai_evaluator.load_eval_cases(req.eval_name)
    except FileNotFoundError as exc:
        raise HTTPException(404, detail={"error": str(exc), "code": "EVAL_NOT_FOUND"})

    stub = req.stub_response or ""

    def _candidate(_inp: dict) -> str:
        return stub

    report = await ai_evaluator.run_eval(
        req.eval_name,
        _candidate,
        persist=req.persist,
    )
    threshold = ai_evaluator.gate_threshold(req.eval_name)
    return {
        "report": report.summary(),
        "gate_threshold": threshold,
        "gate_passed": (
            report.score >= threshold if threshold is not None else None
        ),
        "case_count": len(cases),
    }


# ---- /ai/sim/* -----------------------------------------------------------


@router.get("/ai/sim/list")
async def list_simulations(
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    return {
        "simulations": [
            {
                "name": name,
                "purpose": sim.purpose,
                "task_type": sim.task_type,
                "turn_count": len(sim.turns),
                "gate_threshold": ai_simulator.simulation_gate_threshold(name),
            }
            for name in ai_simulator.list_simulations()
            for sim in [ai_simulator.get_simulation(name)]
            if sim
        ]
    }


@router.post("/ai/sim/run")
async def run_simulation_endpoint(
    req: SimulationRunRequest,
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    _require_debug_access(x_debug_token)
    if not ai_simulator.get_simulation(req.name):
        raise HTTPException(404, detail={"error": f"unknown simulation: {req.name}"})
    report = await ai_simulator.run_simulation(
        req.name,
        initial_state=req.initial_state,
        persist=req.persist,
    )
    threshold = ai_simulator.simulation_gate_threshold(req.name)
    return {
        "report": report.summary(),
        "gate_threshold": threshold,
        "gate_passed": (report.score >= threshold) if threshold is not None else None,
    }


# ---- /ai/metrics/regression-dashboard -----------------------------------


@router.get("/ai/metrics/regression-dashboard")
async def regression_dashboard(
    window_hours: int = Query(24, ge=1, le=720),
    x_debug_token: Optional[str] = Header(None, alias="X-Debug-Token"),
) -> dict[str, Any]:
    """Plan 8 §8 dashboard payload — all rates, alerts, and eval scoreboards."""
    _require_debug_access(x_debug_token)
    return await ai_metrics.regression_dashboard(window_hours=window_hours)
