import json
from typing import Optional

from .connection import connect


async def upsert_final_report(session_id: str, hw_id: str, report: dict) -> None:
    db = await connect()
    try:
        report_json = json.dumps(report)
        await db.execute(
            """
            INSERT INTO final_reports (session_id, hw_id, report_json)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id, hw_id) DO UPDATE SET
                report_json = excluded.report_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (session_id, hw_id, report_json),
        )
        await db.commit()
    finally:
        await db.close()


async def get_final_report(session_id: str, hw_id: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT report_json, created_at, updated_at
            FROM final_reports
            WHERE session_id = ? AND hw_id = ?
            """,
            (session_id, hw_id),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            report = json.loads(row["report_json"])
            report["created_at"] = row["created_at"]
            report["updated_at"] = row["updated_at"]
            return report
    finally:
        await db.close()
