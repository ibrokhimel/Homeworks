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
    # Basic implementation computing metrics from phase_attempts
    attempts = await list_phase_attempts(session_id, hw_id, limit=1000)
    
    total = len(attempts)
    correct_count = sum(1 for a in attempts if a.get('correct') == 1)
    incorrect_count = sum(1 for a in attempts if a.get('correct') == 0)
    partial_count = sum(1 for a in attempts if a.get('correct') is None and a.get('score', 0) > 0)
    
    accuracy = correct_count / total if total > 0 else 0.0
    
    # Placeholder logic for more complex metrics, normally would inspect answer_spec, etc.
    metrics = {
        "accuracy": accuracy,
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "partial_count": partial_count,
        "hint_count": 0,
        "avg_attempts": 1.0,
        "avg_time_ms": 0,
        "weak_topics": [],
        "strong_topics": [],
        "language_confusion_terms": [],
        "mastery_score": accuracy * 0.45,
        "boss_readiness_score": 0.0
    }
    
    await upsert_session_metrics(session_id, hw_id, metrics)
    return metrics
