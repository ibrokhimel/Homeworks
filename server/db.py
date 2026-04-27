import json
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from .config import DB_PATH


_SCHEMA = """
CREATE TABLE IF NOT EXISTS homeworks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    grade INTEGER NOT NULL,
    mode TEXT NOT NULL,
    family TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'uz',
    status TEXT NOT NULL DEFAULT 'draft',
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    homework_id TEXT NOT NULL,
    student_name TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    overall_score REAL,
    phase_scores TEXT,
    FOREIGN KEY (homework_id) REFERENCES homeworks(id)
);

CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    question_id TEXT,
    answer TEXT,
    correct INTEGER,
    time_ms INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS homework_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id TEXT NOT NULL,
    content_json TEXT NOT NULL,
    title TEXT,
    saved_at TEXT NOT NULL,
    FOREIGN KEY (homework_id) REFERENCES homeworks(id)
);

CREATE INDEX IF NOT EXISTS idx_versions_hw_saved
    ON homework_versions(homework_id, saved_at DESC);
"""


# Pragmas that are per-connection and must be set every time a connection opens.
# WAL/synchronous are persistent on the DB file itself but are cheap to re-assert.
# foreign_keys and busy_timeout are strictly per-connection.
_DURABILITY_PRAGMAS = (
    "PRAGMA journal_mode = WAL;",
    "PRAGMA synchronous = FULL;",
    "PRAGMA foreign_keys = ON;",
    "PRAGMA busy_timeout = 5000;",
    "PRAGMA wal_autocheckpoint = 100;",
)

# Snapshot thresholds
_SNAPSHOT_MIN_INTERVAL_SEC = 120
_SNAPSHOT_SIZE_DELTA_BYTES = 500


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


async def _apply_pragmas(db: aiosqlite.Connection) -> None:
    for stmt in _DURABILITY_PRAGMAS:
        await db.execute(stmt)


async def _connect() -> aiosqlite.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await _apply_pragmas(db)
    return db


async def init_db() -> None:
    db = await _connect()
    try:
        # Pragmas already applied via _connect; reassert for clarity on fresh DBs.
        await _apply_pragmas(db)
        await db.executescript(_SCHEMA)
        # Migrate existing DBs that predate the `deleted_at` column.
        try:
            await db.execute("ALTER TABLE homeworks ADD COLUMN deleted_at TEXT NULL")
        except Exception:
            # Column already exists — safe to ignore.
            pass
        await db.commit()
    finally:
        await db.close()


async def checkpoint() -> None:
    """Force a full WAL checkpoint. Call on graceful shutdown or periodically."""
    async with aiosqlite.connect(DB_PATH) as db:
        await _apply_pragmas(db)
        await db.execute("PRAGMA wal_checkpoint(FULL)")
        await db.commit()


def _row_to_homework(row: aiosqlite.Row) -> dict:
    d = dict(row)
    raw = d.get("content_json")
    d["content_json"] = json.loads(raw) if raw else None
    return d


async def list_homeworks(include_deleted: bool = False) -> list[dict]:
    db = await _connect()
    try:
        if include_deleted:
            sql = (
                "SELECT id, title, subject, grade, mode, family, language, status, "
                "created_at, updated_at, deleted_at FROM homeworks "
                "ORDER BY created_at DESC"
            )
            cursor = await db.execute(sql)
        else:
            sql = (
                "SELECT id, title, subject, grade, mode, family, language, status, "
                "created_at, updated_at, deleted_at FROM homeworks "
                "WHERE deleted_at IS NULL ORDER BY created_at DESC"
            )
            cursor = await db.execute(sql)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def list_trashed_homeworks() -> list[dict]:
    """Only soft-deleted rows — for the Trash view."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "SELECT id, title, subject, grade, mode, family, language, status, "
            "created_at, updated_at, deleted_at FROM homeworks "
            "WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_homework(id: str) -> Optional[dict]:
    """Returns the record even if soft-deleted — needed for restore + preview."""
    db = await _connect()
    try:
        cursor = await db.execute("SELECT * FROM homeworks WHERE id = ?", (id,))
        row = await cursor.fetchone()
        return _row_to_homework(row) if row else None
    finally:
        await db.close()


async def _next_id(db: aiosqlite.Connection) -> str:
    stamp = _today_stamp()
    prefix = f"HW-{stamp}-"
    cursor = await db.execute(
        "SELECT id FROM homeworks WHERE id LIKE ? ORDER BY id DESC LIMIT 1",
        (prefix + "%",),
    )
    row = await cursor.fetchone()
    if row:
        last_seq = int(row[0].rsplit("-", 1)[1])
        seq = last_seq + 1
    else:
        seq = 1
    return f"{prefix}{seq:03d}"


async def create_homework(data: dict) -> dict:
    now = _now()
    content = data.get("content_json") or {}
    content_str = json.dumps(content, ensure_ascii=False)

    db = await _connect()
    try:
        new_id = await _next_id(db)
        await db.execute(
            "INSERT INTO homeworks (id, title, subject, grade, mode, family, "
            "language, status, content_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_id,
                data["title"],
                data["subject"],
                data["grade"],
                data["mode"],
                data["family"],
                data.get("language", "uz"),
                data.get("status", "draft"),
                content_str,
                now,
                now,
            ),
        )
        await db.commit()
    finally:
        await db.close()

    record = await get_homework(new_id)
    assert record is not None
    return record


async def _get_latest_version(
    db: aiosqlite.Connection, homework_id: str
) -> Optional[aiosqlite.Row]:
    cursor = await db.execute(
        "SELECT id, content_json, title, saved_at FROM homework_versions "
        "WHERE homework_id = ? ORDER BY saved_at DESC LIMIT 1",
        (homework_id,),
    )
    return await cursor.fetchone()


def _should_snapshot(
    prior: Optional[aiosqlite.Row], new_content_str: str, now_iso: str
) -> bool:
    """Snapshot if:
      - no prior version exists, OR
      - prior snapshot is >= 120s old, OR
      - content size delta vs prior is >= 500 bytes.
    """
    if prior is None:
        return True

    prior_content = prior["content_json"] or ""
    size_delta = abs(len(new_content_str.encode("utf-8")) - len(prior_content.encode("utf-8")))
    if size_delta >= _SNAPSHOT_SIZE_DELTA_BYTES:
        return True

    try:
        prior_ts = datetime.fromisoformat(prior["saved_at"])
        now_ts = datetime.fromisoformat(now_iso)
        if (now_ts - prior_ts).total_seconds() >= _SNAPSHOT_MIN_INTERVAL_SEC:
            return True
    except (ValueError, TypeError):
        # Malformed timestamp — snapshot defensively.
        return True

    return False


async def update_homework(id: str, updates: dict) -> Optional[dict]:
    existing = await get_homework(id)
    if not existing:
        return None

    fields: list[str] = []
    values: list = []

    if "title" in updates:
        fields.append("title = ?")
        values.append(updates["title"])

    new_content_str: Optional[str] = None
    if "content_json" in updates:
        new_content_str = json.dumps(updates["content_json"], ensure_ascii=False)
        fields.append("content_json = ?")
        values.append(new_content_str)

    if not fields:
        return existing

    now_iso = _now()
    fields.append("updated_at = ?")
    values.append(now_iso)
    values.append(id)

    db = await _connect()
    try:
        # Snapshot BEFORE the update when content is changing. This preserves the
        # prior state so even if the write is later corrupted we can roll back.
        if new_content_str is not None:
            prior = await _get_latest_version(db, id)
            # Use the existing row's current content as the snapshot payload —
            # that's the state we're about to overwrite.
            snapshot_payload = existing.get("content_json")
            snapshot_str = (
                json.dumps(snapshot_payload, ensure_ascii=False)
                if snapshot_payload is not None
                else ""
            )
            if _should_snapshot(prior, new_content_str, now_iso):
                await db.execute(
                    "INSERT INTO homework_versions "
                    "(homework_id, content_json, title, saved_at) "
                    "VALUES (?, ?, ?, ?)",
                    (id, snapshot_str, existing.get("title"), now_iso),
                )

        await db.execute(
            f"UPDATE homeworks SET {', '.join(fields)} WHERE id = ?", values
        )
        await db.commit()
    finally:
        await db.close()

    return await get_homework(id)


async def delete_homework(id: str) -> bool:
    """Soft delete — sets deleted_at timestamp. Still returns True on success."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "UPDATE homeworks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
            (_now(), id),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def hard_delete_homework(id: str) -> bool:
    """Permanent deletion. Only callable from an admin route."""
    db = await _connect()
    try:
        # Clean up version history first to avoid orphaned rows.
        await db.execute(
            "DELETE FROM homework_versions WHERE homework_id = ?", (id,)
        )
        cursor = await db.execute("DELETE FROM homeworks WHERE id = ?", (id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def restore_homework(id: str) -> bool:
    """Un-soft-delete — clears deleted_at."""
    db = await _connect()
    try:
        cursor = await db.execute(
            "UPDATE homeworks SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
            (id,),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def list_versions(homework_id: str) -> list[dict]:
    db = await _connect()
    try:
        cursor = await db.execute(
            "SELECT id, homework_id, title, saved_at, length(content_json) AS size_bytes "
            "FROM homework_versions WHERE homework_id = ? ORDER BY saved_at DESC",
            (homework_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_version(version_id: int) -> Optional[dict]:
    db = await _connect()
    try:
        cursor = await db.execute(
            "SELECT id, homework_id, content_json, title, saved_at "
            "FROM homework_versions WHERE id = ?",
            (version_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        raw = d.get("content_json")
        d["content_json"] = json.loads(raw) if raw else None
        return d
    finally:
        await db.close()


async def restore_version(version_id: int) -> Optional[dict]:
    """Restore a specific version's content back onto the live homework.
    Creates a new snapshot of the current content before overwriting.
    """
    version = await get_version(version_id)
    if not version:
        return None
    hw_id = version["homework_id"]
    updates: dict = {"content_json": version["content_json"]}
    if version.get("title"):
        updates["title"] = version["title"]
    return await update_homework(hw_id, updates)


async def set_status(id: str, status: str) -> None:
    db = await _connect()
    try:
        await db.execute(
            "UPDATE homeworks SET status = ?, updated_at = ? WHERE id = ?",
            (status, _now(), id),
        )
        await db.commit()
    finally:
        await db.close()
