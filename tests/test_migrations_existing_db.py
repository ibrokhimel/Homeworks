"""Regression: init_db() must not crash on a PRE-EXISTING (pre-anticheat) DB.

The bug this guards:
  `_SCHEMA` is executed FIRST via `executescript(_SCHEMA)`. On a fresh DB the
  `review_queue` table is created (by `_SCHEMA`) WITH a `kind` column, so a
  `CREATE INDEX ... ON review_queue(status, kind, created_at)` inside `_SCHEMA`
  succeeds. But on a PRE-EXISTING DB (dev + the prod Mac mini) `review_queue`
  already exists WITHOUT `kind`; `CREATE TABLE IF NOT EXISTS` is a no-op, the
  `kind` column only arrives later via the ADD COLUMN migration loop, and an
  index inside `_SCHEMA` that references `kind` raises
  `sqlite3.OperationalError: no such column: kind` -> executescript fails ->
  init_db CRASHES -> the server won't boot (next prod deploy fails identically).

The fix: the `idx_review_queue_kind` CREATE INDEX lives ONLY in init_db()'s
post-(ALTER-loop) creation, never in `_SCHEMA`, so it always runs after `kind`
has been provisioned for both fresh and upgraded DBs.

Two levels of guard below:
  1. STATIC: `idx_review_queue_kind` must appear ZERO times in `migrations._SCHEMA`.
  2. INTEGRATION: seed a temp DB with an OLD `review_queue` (no `kind`/integrity
     columns), point the app's DB at it, run init_db(), and assert it does NOT
     raise and that `kind` + the index now exist.
"""
import asyncio
import re
import sqlite3

from server.db import migrations


# ---------------------------------------------------------------------------
# 1. STATIC guard — the cheap pin that keeps the regression from coming back.
# ---------------------------------------------------------------------------

def test_idx_review_queue_kind_absent_from_schema():
    """No `CREATE INDEX ... idx_review_queue_kind` may live inside `_SCHEMA`.

    It references the `kind` column, which on an upgraded DB does not exist
    until the ADD COLUMN migration loop runs (after the _SCHEMA executescript).
    Its single source of truth is the post-loop CREATE INDEX in init_db().

    We match the actual CREATE INDEX statement rather than a bare substring so
    the cautionary comment in _SCHEMA (which names the index on purpose) does
    not trip the guard.
    """
    create_stmts = re.findall(
        r"CREATE\s+INDEX[^;]*\bidx_review_queue_kind\b",
        migrations._SCHEMA,
        flags=re.IGNORECASE,
    )
    assert create_stmts == [], (
        "idx_review_queue_kind must not be created inside _SCHEMA — it references "
        "the `kind` column, which an upgraded DB only gains via the ADD COLUMN "
        "migration loop that runs AFTER executescript(_SCHEMA). Creating it here "
        "crashes init_db on a pre-existing DB. Keep it in the post-loop creation. "
        f"Found offending statement(s): {create_stmts!r}"
    )


# ---------------------------------------------------------------------------
# Helpers for the integration guards.
# ---------------------------------------------------------------------------

# An OLD review_queue exactly as it shipped BEFORE the anti-cheat work: it has
# the Wave-D decision columns but is MISSING `kind`, `session_id`, and the two
# integrity columns. This is what the prod Mac mini DB looks like on disk.
_OLD_REVIEW_QUEUE_DDL = """
CREATE TABLE review_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    student_answer TEXT NOT NULL,
    answer_spec_json TEXT NOT NULL,
    ai_response_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    decision_json TEXT NULL,
    resolved_at TEXT NULL
);
"""


def _seed_old_db(db_file: str) -> None:
    """Create a pre-anticheat DB on disk with an OLD review_queue (no `kind`)."""
    conn = sqlite3.connect(db_file)
    try:
        conn.execute(_OLD_REVIEW_QUEUE_DDL)
        # A real row so we also prove the migration preserves existing data and
        # `kind` back-fills to its DEFAULT 'grading'.
        conn.execute(
            "INSERT INTO review_queue "
            "(question_id, student_answer, answer_spec_json, ai_response_json, "
            " status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("q1", "42", "{}", "{}", "pending", "2026-01-01T00:00:00Z"),
        )
        conn.commit()
    finally:
        conn.close()


def _columns(db_file: str, table: str):
    conn = sqlite3.connect(db_file)
    try:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


def _index_names(db_file: str, table: str):
    conn = sqlite3.connect(db_file)
    try:
        return {row[1] for row in conn.execute(f"PRAGMA index_list({table})")}
    finally:
        conn.close()


def _run_init_db_against(db_file: str, monkeypatch) -> None:
    """Point the app's DB connection at `db_file` and run init_db() to completion.

    Patches `server.db.get_db_path` (the seam `connection._resolve_db_path`
    honours via sys.modules) so connect() opens our temp DB.
    """
    from pathlib import Path
    import server.db as server_db

    monkeypatch.setattr(server_db, "get_db_path", lambda: Path(db_file))

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(migrations.init_db())
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# 2a. INTEGRATION guard — the exact prod scenario (pre-existing DB, no `kind`).
# ---------------------------------------------------------------------------

def test_init_db_on_preexisting_db_without_kind_does_not_crash(tmp_path, monkeypatch):
    """init_db() must upgrade an OLD review_queue (no `kind`) WITHOUT crashing.

    Reproduces the prod-breaking path: a pre-anticheat DB whose review_queue
    lacks `kind`. Before the fix, the `idx_review_queue_kind` CREATE INDEX
    inside `_SCHEMA` raised `no such column: kind` during executescript and
    init_db crashed. After the fix, init_db completes and provisions `kind`
    plus the index via the post-loop path.
    """
    db_file = str(tmp_path / "preexisting_old.db")
    _seed_old_db(db_file)

    # Sanity: the seeded DB really is "old" (no kind column yet).
    assert "kind" not in _columns(db_file, "review_queue")

    # Must NOT raise (regression: previously OperationalError: no such column: kind).
    _run_init_db_against(db_file, monkeypatch)

    cols = _columns(db_file, "review_queue")
    assert "kind" in cols, "init_db must add the `kind` column to an upgraded review_queue"
    # The other anti-cheat columns should land too.
    assert {"integrity_reason", "integrity_severity", "session_id"} <= cols

    # The index must now exist (post-loop creation ran after `kind` was added).
    assert "idx_review_queue_kind" in _index_names(db_file, "review_queue")

    # Existing rows survive and back-fill `kind` to its DEFAULT.
    conn = sqlite3.connect(db_file)
    try:
        row = conn.execute(
            "SELECT question_id, kind FROM review_queue WHERE question_id='q1'"
        ).fetchone()
    finally:
        conn.close()
    assert row is not None, "pre-existing row must survive the migration"
    assert row[1] == "grading", "`kind` must back-fill to its DEFAULT 'grading'"


# ---------------------------------------------------------------------------
# 2b. INTEGRATION guard — fresh DB still works end-to-end.
# ---------------------------------------------------------------------------

def test_init_db_on_fresh_db_creates_kind_and_index(tmp_path, monkeypatch):
    """init_db() on a brand-new DB must create review_queue WITH `kind` + the index.

    Guards the other half: removing the index from `_SCHEMA` must not break the
    fresh-DB path. `kind` comes from the table def in `_SCHEMA`; the index comes
    from the post-loop creation.
    """
    db_file = str(tmp_path / "fresh.db")

    _run_init_db_against(db_file, monkeypatch)

    assert "kind" in _columns(db_file, "review_queue")
    assert "idx_review_queue_kind" in _index_names(db_file, "review_queue")
