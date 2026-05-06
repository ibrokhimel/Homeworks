import json
from typing import Optional
from .connection import connect
from .attempts_repo import list_phase_attempts

async def upsert_session_metrics(session_id: str, hw_id: str, metrics: dict) -> None:
    db = await connect()
    try:
        metrics_json = json.dumps(metrics)
        await db.execute(
            """
            INSERT INTO session_metrics (session_id, hw_id, metrics_json)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id, hw_id) DO UPDATE SET
                metrics_json = excluded.metrics_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (session_id, hw_id, metrics_json)
        )
        await db.commit()
    finally:
        await db.close()

async def get_session_metrics(session_id: str, hw_id: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT metrics_json FROM session_metrics 
            WHERE session_id = ? AND hw_id = ?
            """,
            (session_id, hw_id)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return json.loads(row['metrics_json'])
    finally:
        await db.close()

async def recompute_session_metrics(session_id: str, hw_id: str) -> dict:
    """Recompute metrics from phase_attempts."""
    attempts = await list_phase_attempts(session_id, hw_id, limit=1000)

    total = len(attempts)
    correct_count = sum(1 for a in attempts if a.get("correct") == 1)
    incorrect_count = sum(1 for a in attempts if a.get("correct") == 0)
    partial_count = sum(
        1 for a in attempts if a.get("correct") is None and a.get("score", 0) > 0
    )

    accuracy = correct_count / total if total > 0 else 0.0

    # Average attempts per distinct question
    from collections import Counter
    question_attempt_counts = Counter(
        a.get("question_id") or a.get("item_id") or f"q_{i}"
        for i, a in enumerate(attempts)
    )
    avg_attempts = (
        sum(question_attempt_counts.values()) / len(question_attempt_counts)
        if question_attempt_counts
        else 0.0
    )

    # Average time_ms
    times = [a.get("time_ms") for a in attempts if a.get("time_ms") is not None]
    avg_time_ms = sum(times) / len(times) if times else 0

    # Weak topics from misconception_tags_json
    weak_topics: set[str] = set()
    for a in attempts:
        tags_raw = a.get("misconception_tags_json")
        if tags_raw:
            try:
                tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
                if isinstance(tags, list):
                    weak_topics.update(str(t) for t in tags if t)
            except (json.JSONDecodeError, TypeError):
                pass

    # Strong topics: from correct attempts, look at answer_spec tags if present
    strong_topics: set[str] = set()
    for a in attempts:
        if a.get("correct") != 1:
            continue
        spec_raw = a.get("answer_spec_json")
        if spec_raw:
            try:
                spec = json.loads(spec_raw) if isinstance(spec_raw, str) else spec_raw
                if isinstance(spec, dict):
                    tags = spec.get("tags")
                    if isinstance(tags, list):
                        strong_topics.update(str(t) for t in tags if t)
            except (json.JSONDecodeError, TypeError):
                pass

    # Boss readiness: weighted blend of accuracy and independence
    # Higher accuracy + fewer attempts per question = more ready
    independence = max(0.0, 1.0 - (avg_attempts - 1.0) * 0.3)
    boss_readiness_score = round(accuracy * 0.6 + independence * 0.4, 2)

    # Mastery score from Plan 2 formula
    mastery_score = round(
        accuracy * 0.45
        + independence * 0.20
        + max(0.0, (accuracy - 0.5)) * 0.20  # improvement proxy
        + (1.0 if avg_time_ms > 0 else 0.0) * 0.05  # speed score placeholder
        + boss_readiness_score * 0.10,
        2,
    )

    metrics = {
        "accuracy": round(accuracy, 2),
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "partial_count": partial_count,
        "hint_count": 0,  # Requires session_events hint tracking (not yet implemented)
        "avg_attempts": round(avg_attempts, 2),
        "avg_time_ms": int(avg_time_ms),
        "weak_topics": sorted(weak_topics),
        "strong_topics": sorted(strong_topics),
        "language_confusion_terms": [],  # Requires NLP pipeline (not yet implemented)
        "mastery_score": mastery_score,
        "boss_readiness_score": boss_readiness_score,
    }

    await upsert_session_metrics(session_id, hw_id, metrics)
    return metrics

