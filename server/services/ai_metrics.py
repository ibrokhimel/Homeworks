"""AI Metrics — Plan 8 §8 regression dashboard aggregation.

Reads from ``ai_call_logs``, ``session_events``, ``phase_attempts``, and
``ai_eval_runs`` to produce a single dashboard payload. Each metric has a
documented denominator so the dashboard is auditable.

Default time window is the last 24 hours; callers can override.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from server.db.connection import connect

_log = logging.getLogger("nets.ai_metrics")


# Plan 8 §8 alert thresholds. Anything above these is dashboarded red.
ALERT_THRESHOLDS: dict[str, float] = {
    "question_resolution_failure_rate": 0.03,
    "screen_context_sanitized_to_empty_rate": 0.05,
    "generic_fallback_rate": 0.07,
    "boss_repetition_rate": 0.02,
    "provider_failure_rate": 0.01,
    "schema_validation_failure_rate": 0.02,
}


async def _scalar(query: str, params: tuple = ()) -> Optional[Any]:
    db = await connect()
    try:
        async with db.execute(query, params) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return row[0]
    finally:
        await db.close()


async def _ai_call_aggregates(window_hours: int) -> dict[str, Any]:
    db = await connect()
    try:
        # Total calls in window.
        async with db.execute(
            f"""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                   SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallbacks,
                   SUM(CASE WHEN error_code = 'AI_SCHEMA_VALIDATION_FAILED' THEN 1 ELSE 0 END) AS schema_failures,
                   AVG(latency_ms) AS avg_latency,
                   AVG(input_chars) AS avg_input_chars,
                   AVG(output_chars) AS avg_output_chars
            FROM ai_call_logs
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            """,
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return {
                    "total": 0,
                    "failures": 0,
                    "fallbacks": 0,
                    "schema_failures": 0,
                    "avg_latency_ms": 0,
                    "avg_input_chars": 0,
                    "avg_output_chars": 0,
                }
            d = dict(row)
            return {
                "total": int(d.get("total") or 0),
                "failures": int(d.get("failures") or 0),
                "fallbacks": int(d.get("fallbacks") or 0),
                "schema_failures": int(d.get("schema_failures") or 0),
                "avg_latency_ms": int(d.get("avg_latency") or 0),
                "avg_input_chars": int(d.get("avg_input_chars") or 0),
                "avg_output_chars": int(d.get("avg_output_chars") or 0),
            }
    finally:
        await db.close()


async def _per_task_breakdown(window_hours: int) -> list[dict]:
    db = await connect()
    try:
        async with db.execute(
            f"""
            SELECT task_type,
                   COUNT(*) AS total,
                   SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                   AVG(latency_ms) AS avg_latency
            FROM ai_call_logs
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            GROUP BY task_type
            ORDER BY total DESC
            """,
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "task_type": r["task_type"],
                    "total": int(r["total"] or 0),
                    "failures": int(r["failures"] or 0),
                    "avg_latency_ms": int(r["avg_latency"] or 0),
                }
                for r in rows
            ]
    finally:
        await db.close()


async def _attempts_aggregates(window_hours: int) -> dict[str, Any]:
    db = await connect()
    try:
        async with db.execute(
            f"""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                   AVG(confidence) AS avg_confidence,
                   SUM(CASE WHEN checker_source = 'ai_judge' AND confidence < 0.45 THEN 1 ELSE 0 END) AS low_conf_ai
            FROM phase_attempts
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            """,
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return {"total": 0, "correct_count": 0, "avg_confidence": 0.0, "low_conf_ai": 0}
            return {
                "total": int(row["total"] or 0),
                "correct_count": int(row["correct_count"] or 0),
                "avg_confidence": float(row["avg_confidence"] or 0.0),
                "low_conf_ai": int(row["low_conf_ai"] or 0),
            }
    finally:
        await db.close()


async def _review_queue_size() -> int:
    db = await connect()
    try:
        async with db.execute(
            "SELECT COUNT(*) FROM review_queue WHERE status = 'pending'"
        ) as cursor:
            row = await cursor.fetchone()
            return int(row[0] or 0) if row else 0
    finally:
        await db.close()


async def _boss_repetition_signal(window_hours: int) -> dict[str, Any]:
    """Estimate boss repetition rate from generated_boss_questions overlap.

    A "repetition" is a generated_boss_questions row whose ``question_text``
    duplicates another row in the same (session_id, hw_id) bucket. Plan 5
    rejects exact paraphrases server-side, so this number should be ~0; if
    it climbs, the rejection logic regressed.
    """
    db = await connect()
    try:
        async with db.execute(
            f"""
            SELECT session_id, hw_id, question_text, COUNT(*) AS c
            FROM generated_boss_questions
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            GROUP BY session_id, hw_id, question_text
            HAVING c > 1
            """,
        ) as cursor:
            rows = await cursor.fetchall()
            duplicates = sum(int(r["c"]) - 1 for r in rows)
        async with db.execute(
            f"""
            SELECT COUNT(*) FROM generated_boss_questions
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            """,
        ) as cursor:
            row = await cursor.fetchone()
            total = int(row[0] or 0) if row else 0
        rate = duplicates / total if total else 0.0
        return {"duplicates": duplicates, "total_generated": total, "rate": round(rate, 4)}
    finally:
        await db.close()


async def _screen_context_sanitization_signal(window_hours: int) -> dict[str, Any]:
    """Count tutor-context builds where the screen context sanitizer ran.

    A row is "sanitized to empty" when the request shipped non-empty
    screen context but every line was scrubbed by the v2 sanitizer (PII /
    answer-key markers / redaction). Rate denominator is the total number
    of sanitization runs in the window — runs where no screen context was
    provided at all are NOT counted (nothing to sanitize, would dilute the
    signal).
    """
    db = await connect()
    try:
        async with db.execute(
            f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN payload_json LIKE '%"sanitized_to_empty": true%' THEN 1 ELSE 0 END) AS sanitized_empty
            FROM session_events
            WHERE event_type = 'screen_context_sanitized'
              AND created_at >= datetime('now', '-{int(window_hours)} hours')
            """,
        ) as cursor:
            row = await cursor.fetchone()
            total = int(row["total"] or 0) if row else 0
            sanitized_empty = int(row["sanitized_empty"] or 0) if row else 0
            rate = sanitized_empty / total if total else 0.0
            return {
                "total": total,
                "sanitized_to_empty": sanitized_empty,
                "rate": round(rate, 4),
            }
    finally:
        await db.close()


async def _question_resolution_failures(window_hours: int) -> dict[str, Any]:
    """Count tutor-chat session events whose payload reports a resolution failure."""
    db = await connect()
    try:
        async with db.execute(
            f"""
            SELECT
                SUM(CASE WHEN event_type IN ('tutor_response_sent', 'student_message_sent') THEN 1 ELSE 0 END) AS tutor_total,
                SUM(CASE WHEN event_type = 'tutor_response_sent' AND payload_json LIKE '%"question_resolved": false%' THEN 1 ELSE 0 END) AS unresolved
            FROM session_events
            WHERE created_at >= datetime('now', '-{int(window_hours)} hours')
            """,
        ) as cursor:
            row = await cursor.fetchone()
            tutor_total = int(row["tutor_total"] or 0) if row else 0
            unresolved = int(row["unresolved"] or 0) if row else 0
            rate = unresolved / tutor_total if tutor_total else 0.0
            return {
                "tutor_total": tutor_total,
                "unresolved": unresolved,
                "rate": round(rate, 4),
            }
    finally:
        await db.close()


async def _eval_runs_summary(limit_per_eval: int = 1) -> list[dict]:
    """Latest scores per eval suite — feeds the rollout-gate red/green panel."""
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT eval_name, MAX(created_at) AS latest_at
            FROM ai_eval_runs
            GROUP BY eval_name
            ORDER BY latest_at DESC
            LIMIT 50
            """,
        ) as cursor:
            names = [r["eval_name"] for r in await cursor.fetchall()]
        out: list[dict] = []
        for name in names:
            async with db.execute(
                """
                SELECT * FROM ai_eval_runs
                WHERE eval_name = ?
                ORDER BY created_at DESC LIMIT ?
                """,
                (name, limit_per_eval),
            ) as cursor:
                rows = await cursor.fetchall()
                for r in rows:
                    d = dict(r)
                    out.append(
                        {
                            "eval_name": d["eval_name"],
                            "task_type": d["task_type"],
                            "total": int(d["total_cases"] or 0),
                            "passed": int(d["passed_cases"] or 0),
                            "failed": int(d["failed_cases"] or 0),
                            "score": float(d["score"]) if d["score"] is not None else None,
                            "model": d.get("model"),
                            "prompt_version": d.get("prompt_version"),
                            "created_at": d["created_at"],
                        }
                    )
        return out
    finally:
        await db.close()


def _ratio(numer: int, denom: int) -> float:
    return round(numer / denom, 4) if denom else 0.0


async def regression_dashboard(window_hours: int = 24) -> dict[str, Any]:
    """Return the full regression dashboard payload (Plan 8 §8).

    Output keys map directly to the metric names from the plan doc so a
    later UI surface can render this without re-mapping.
    """
    ai_calls = await _ai_call_aggregates(window_hours)
    per_task = await _per_task_breakdown(window_hours)
    attempts = await _attempts_aggregates(window_hours)
    review_size = await _review_queue_size()
    boss_rep = await _boss_repetition_signal(window_hours)
    qres = await _question_resolution_failures(window_hours)
    screen_ctx = await _screen_context_sanitization_signal(window_hours)
    evals = await _eval_runs_summary()

    provider_failure_rate = _ratio(ai_calls["failures"], ai_calls["total"])
    schema_failure_rate = _ratio(ai_calls["schema_failures"], ai_calls["total"])
    fallback_rate = _ratio(ai_calls["fallbacks"], ai_calls["total"])

    metrics = {
        "window_hours": window_hours,
        "ai_calls": ai_calls,
        "per_task": per_task,
        "attempts": attempts,
        "review_queue_pending": review_size,
        "rates": {
            "provider_failure_rate": provider_failure_rate,
            "schema_validation_failure_rate": schema_failure_rate,
            "generic_fallback_rate": fallback_rate,
            "question_resolution_failure_rate": qres["rate"],
            "boss_repetition_rate": boss_rep["rate"],
            "screen_context_sanitized_to_empty_rate": screen_ctx["rate"],
        },
        "boss_repetition": boss_rep,
        "question_resolution": qres,
        "screen_context_sanitization": screen_ctx,
        "eval_runs": evals,
        "alert_thresholds": dict(ALERT_THRESHOLDS),
    }

    # Compute per-metric alert flags so the UI can render red rows directly.
    alerts: dict[str, bool] = {}
    for name, threshold in ALERT_THRESHOLDS.items():
        value = metrics["rates"].get(name)
        alerts[name] = bool(value is not None and value > threshold)
    metrics["alerts"] = alerts
    metrics["any_alert"] = any(alerts.values())

    return metrics
