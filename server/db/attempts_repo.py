import json
from typing import Optional, Any
from .connection import connect

async def add_phase_attempt(
    session_id: str,
    hw_id: str,
    phase: str,
    checker_source: str,
    subphase: Optional[str] = None,
    question_id: Optional[str] = None,
    item_id: Optional[str] = None,
    step_id: Optional[str] = None,
    attempt_number: int = 1,
    student_answer: Optional[str] = None,
    normalized_answer: Optional[str] = None,
    answer_spec_json: Optional[str] = None,
    correct: Optional[int] = None,
    score: Optional[float] = None,
    confidence: Optional[float] = None,
    feedback: Optional[str] = None,
    misconception_tags_json: Optional[str] = None,
    time_ms: Optional[int] = None
) -> int:
    db = await connect()
    try:
        cursor = await db.execute(
            """
            INSERT INTO phase_attempts (
                session_id, hw_id, phase, subphase, question_id, item_id, step_id,
                attempt_number, student_answer, normalized_answer, answer_spec_json,
                checker_source, correct, score, confidence, feedback,
                misconception_tags_json, time_ms
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id, hw_id, phase, subphase, question_id, item_id, step_id,
                attempt_number, student_answer, normalized_answer, answer_spec_json,
                checker_source, correct, score, confidence, feedback,
                misconception_tags_json, time_ms
            )
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()

async def list_phase_attempts(session_id: str, hw_id: str, phase: Optional[str] = None, limit: int = 100) -> list[dict]:
    db = await connect()
    try:
        query = "SELECT * FROM phase_attempts WHERE session_id = ? AND hw_id = ?"
        params: list[Any] = [session_id, hw_id]

        if phase:
            query += " AND phase = ?"
            params.append(phase)

        query += " ORDER BY created_at ASC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    finally:
        await db.close()

async def attempts_for_question(session_id: str, hw_id: str, question_id: str) -> list[dict]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT * FROM phase_attempts 
            WHERE session_id = ? AND hw_id = ? AND question_id = ?
            ORDER BY created_at ASC
            """,
            (session_id, hw_id, question_id)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    finally:
        await db.close()
