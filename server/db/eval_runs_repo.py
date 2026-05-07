"""Repo for ai_eval_runs — Plan 8 Layer-4 evaluation outcomes.

Each row is one evaluation pass over a fixture suite (single-turn or
multi-turn simulation). Stored separately from ai_call_logs because:

  - eval runs aggregate across many ai_call_logs rows
  - eval pass/fail is a higher-level judgement than per-call success
  - rollout gates query by eval_name + score threshold
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from .connection import connect


async def create_eval_run(
    eval_name: str,
    task_type: str,
    total_cases: int,
    passed_cases: int,
    failed_cases: int,
    *,
    prompt_version: Optional[str] = None,
    model: Optional[str] = None,
    score: Optional[float] = None,
    details: Optional[dict] = None,
    run_id: Optional[str] = None,
) -> str:
    """Insert one eval run row. Returns the run id."""
    rid = run_id or f"eval_{uuid.uuid4().hex[:16]}"
    details_json = json.dumps(details or {})
    db = await connect()
    try:
        await db.execute(
            """
            INSERT INTO ai_eval_runs (
                id, eval_name, task_type, prompt_version, model,
                total_cases, passed_cases, failed_cases, score,
                details_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                rid,
                eval_name,
                task_type,
                prompt_version,
                model,
                int(total_cases),
                int(passed_cases),
                int(failed_cases),
                float(score) if score is not None else None,
                details_json,
            ),
        )
        await db.commit()
    finally:
        await db.close()
    return rid


async def get_eval_run(run_id: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute(
            "SELECT * FROM ai_eval_runs WHERE id = ?", (run_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            d["details"] = json.loads(d.get("details_json") or "{}")
            return d
    finally:
        await db.close()


async def list_eval_runs(
    eval_name: Optional[str] = None,
    task_type: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    db = await connect()
    try:
        query = "SELECT * FROM ai_eval_runs WHERE 1=1"
        params: list = []
        if eval_name:
            query += " AND eval_name = ?"
            params.append(eval_name)
        if task_type:
            query += " AND task_type = ?"
            params.append(task_type)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            out = []
            for row in rows:
                d = dict(row)
                d["details"] = json.loads(d.get("details_json") or "{}")
                out.append(d)
            return out
    finally:
        await db.close()


async def latest_eval_run(eval_name: str) -> Optional[dict]:
    rows = await list_eval_runs(eval_name=eval_name, limit=1)
    return rows[0] if rows else None
