"""Repo for ai_call_logs table."""
from typing import Optional
from .connection import connect


async def add_ai_call_log(
    call_id: str,
    session_id: Optional[str],
    homework_id: Optional[str],
    task_type: str,
    provider: str,
    model: str,
    input_chars: int,
    output_chars: int,
    latency_ms: int,
    success: bool,
    error_code: Optional[str] = None,
    fallback_used: bool = False,
    prompt_version: Optional[str] = None,
) -> None:
    db = await connect()
    try:
        await db.execute(
            """
            INSERT INTO ai_call_logs (
                id, session_id, homework_id, task_type, provider, model,
                prompt_version, input_chars, output_chars, latency_ms,
                success, error_code, fallback_used, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                call_id,
                session_id,
                homework_id,
                task_type,
                provider,
                model,
                prompt_version,
                input_chars,
                output_chars,
                latency_ms,
                1 if success else 0,
                error_code,
                1 if fallback_used else 0,
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def list_ai_call_logs(
    session_id: Optional[str] = None,
    task_type: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    db = await connect()
    try:
        query = "SELECT * FROM ai_call_logs WHERE 1=1"
        params: list = []
        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
        if task_type:
            query += " AND task_type = ?"
            params.append(task_type)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    finally:
        await db.close()
