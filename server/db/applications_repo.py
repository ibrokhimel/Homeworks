"""SQLite repo for the public application form (POST /api/applications).

The form is the only public write surface besides the homework runtime, so
field caps + IP hashing happen at the route layer; this module is just the
typed boundary onto the `applications` table.
"""
from typing import Any, Optional

from .connection import connect


_INSERT_SQL = "INSERT INTO applications (full_name, email, role, school, city, grades, subjects, phone, message, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"

_LIST_SQL_ALL = "SELECT id, created_at, full_name, email, role, school, city, grades, subjects, phone, message, status FROM applications ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"

_LIST_SQL_BY_STATUS = "SELECT id, created_at, full_name, email, role, school, city, grades, subjects, phone, message, status FROM applications WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"

_COUNT_SQL_ALL = "SELECT COUNT(*) AS n FROM applications"

_COUNT_SQL_BY_STATUS = "SELECT COUNT(*) AS n FROM applications WHERE status = ?"


async def create_application(row: dict[str, Any]) -> int:
    """Insert one application; return its rowid. All-or-nothing; raises on db error."""
    db = await connect()
    try:
        cursor = await db.execute(
            _INSERT_SQL,
            (
                row["full_name"], row["email"], row["role"],
                row.get("school"), row.get("city"),
                row.get("grades"), row.get("subjects"),
                row.get("phone"), row.get("message"),
                row.get("ip_hash"), row.get("user_agent"),
            ),
        )
        await db.commit()
        return cursor.lastrowid or 0
    finally:
        await db.close()


async def list_applications(
    limit: int = 100,
    offset: int = 0,
    status: Optional[str] = None,
) -> dict[str, Any]:
    """Paginated list for the admin view. Returns {items, total, limit, offset}."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    db = await connect()
    try:
        if status:
            count_cursor = await db.execute(_COUNT_SQL_BY_STATUS, (status,))
        else:
            count_cursor = await db.execute(_COUNT_SQL_ALL)
        count_row = await count_cursor.fetchone()
        total = int(count_row["n"]) if count_row else 0

        if status:
            rows_cursor = await db.execute(
                _LIST_SQL_BY_STATUS, (status, limit, offset),
            )
        else:
            rows_cursor = await db.execute(_LIST_SQL_ALL, (limit, offset))
        rows = await rows_cursor.fetchall()
        return {
            "items": [dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        await db.close()
