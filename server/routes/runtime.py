"""React runtime read API — the student-facing hydration + gate boundary.

Two GET endpoints, grouped here so the entire student read path is auditable
in one file:

  GET /api/runtime/homeworks/{id}              -> redacted content_json
  GET /api/runtime/homeworks/{id}/gate-state   -> server-authoritative gates

The redaction (runtime_redactor) is the delivery-mechanism replacement for the
legacy injector's per-game stripping. Gating is server-verified: the client
can't compute "passed" because it never receives the answers.
"""

import math
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import get_homework
from ..db.attempts_repo import list_phase_attempts
from ..services.content_json_compat import normalize_content_json_for_runtime
from ..services.runtime_redactor import redact_for_runtime

router = APIRouter(tags=["runtime"])

CBP_PHASE = "case_based_preview"
MC_PHASE = "memory_check"
CBP_MIN_CORRECT = 2          # locked rule: ≥2 of 3 checkpoints
DEFAULT_MC_THRESHOLD_PCT = 60


def _latest_correct_by_key(attempts: list[dict]) -> dict[str, bool]:
    """Last attempt wins per item (soft-retry: a later correct overrides earlier wrong)."""
    latest: dict[str, bool] = {}
    for a in attempts:  # list_phase_attempts returns created_at ASC
        key = a.get("question_id") or a.get("item_id") or a.get("subphase") or str(a.get("id"))
        latest[str(key)] = bool(a.get("correct"))
    return latest


@router.get("/runtime/homeworks/{hw_id}")
async def runtime_hydrate(hw_id: str):
    """Student-safe hydration payload. Answers stripped server-side."""
    hw = await get_homework(hw_id)
    if not hw:
        raise HTTPException(status_code=404, detail={"error": "Homework not found", "code": "NOT_FOUND"})
    if hw.get("deleted_at"):
        raise HTTPException(status_code=409, detail={"error": "Homework trashed", "code": "TRASHED"})

    normalized = normalize_content_json_for_runtime(hw.get("content_json") or {})
    safe = redact_for_runtime(normalized)
    meta = safe.get("meta") or {}
    return {
        "id": hw.get("id"),
        "title": meta.get("title") or hw.get("title"),
        "subject": hw.get("subject"),
        "grade": hw.get("grade"),
        "lang": meta.get("lang") or hw.get("language") or "uz",
        "flow_version": safe.get("flow_version"),
        "content_json": safe,
    }


@router.get("/runtime/homeworks/{hw_id}/gate-state")
async def runtime_gate_state(hw_id: str, session_id: Optional[str] = Query(default=None)):
    """Server-authoritative gate state for the two Learning Sections.

    practice_arc_unlocked is true only when BOTH learning sections pass. Without
    a session_id we report the structure with zero progress (a fresh student).
    """
    hw = await get_homework(hw_id)
    if not hw:
        raise HTTPException(status_code=404, detail={"error": "Homework not found", "code": "NOT_FOUND"})

    content = normalize_content_json_for_runtime(hw.get("content_json") or {})
    cbp = content.get("case_based_preview") or {}
    mc = content.get("memory_check") or {}
    cbp_total = len(cbp.get("checkpoints") or []) or 3
    mc_items = mc.get("items") or []
    mc_total = len(mc_items)
    mc_threshold = int(mc.get("pass_threshold_pct") or DEFAULT_MC_THRESHOLD_PCT)
    # CBP threshold generalizes: ≥2 OR ≥60% of however many checkpoints exist.
    cbp_threshold = max(CBP_MIN_CORRECT, math.ceil(0.6 * cbp_total))

    cbp_correct = 0
    mc_correct = 0
    if session_id:
        cbp_attempts = await list_phase_attempts(session_id, hw_id, phase=CBP_PHASE, limit=500)
        mc_attempts = await list_phase_attempts(session_id, hw_id, phase=MC_PHASE, limit=500)
        cbp_correct = sum(1 for v in _latest_correct_by_key(cbp_attempts).values() if v)
        mc_correct = sum(1 for v in _latest_correct_by_key(mc_attempts).values() if v)

    cbp_passed = cbp_correct >= cbp_threshold
    mc_score_pct = round(100 * mc_correct / mc_total) if mc_total else 0
    mc_passed = mc_total > 0 and mc_score_pct >= mc_threshold

    return {
        "cbp": {
            "passed": cbp_passed,
            "checkpoints_correct": cbp_correct,
            "checkpoints_total": cbp_total,
            "threshold": cbp_threshold,
        },
        "mc": {
            "passed": mc_passed,
            "score_pct": mc_score_pct,
            "correct": mc_correct,
            "total": mc_total,
            "threshold_pct": mc_threshold,
        },
        "practice_arc_unlocked": bool(cbp_passed and mc_passed),
    }
