import json
from typing import Optional
from .connection import connect

async def get_session(session_id: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            session = dict(row)
            if session.get('tutor_summary_json'):
                session['tutor_summary'] = json.loads(session['tutor_summary_json'])
            if session.get('performance_summary_json'):
                session['performance_summary'] = json.loads(session['performance_summary_json'])
            if session.get('boss_state_json'):
                session['boss_state'] = json.loads(session['boss_state_json'])
            return session
    finally:
        await db.close()

async def create_session(session_id: str, homework_id: str, student_name: str, started_at: str) -> None:
    db = await connect()
    try:
        await db.execute(
            """
            INSERT INTO sessions (id, homework_id, student_name, started_at, status)
            VALUES (?, ?, ?, ?, 'active')
            """,
            (session_id, homework_id, student_name, started_at)
        )
        await db.commit()
    finally:
        await db.close()