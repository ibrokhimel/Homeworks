import json
from typing import Optional
from .connection import connect

async def add_session_event(session_id: str, hw_id: str, event_type: str, payload: dict, phase: Optional[str] = None, subphase: Optional[str] = None, question_id: Optional[str] = None) -> int:
    db = await connect()
    try:
        payload_json = json.dumps(payload)
        cursor = await db.execute(
            """
            INSERT INTO session_events (session_id, hw_id, phase, subphase, question_id, event_type, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, hw_id, phase, subphase, question_id, event_type, payload_json)
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()

async def list_session_events(session_id: str, hw_id: str, limit: int = 100, event_types: Optional[list[str]] = None) -> list[dict]:
    db = await connect()
    try:
        query = "SELECT * FROM session_events WHERE session_id = ? AND hw_id = ?"
        params = [session_id, hw_id]

        if event_types:
            placeholders = ",".join(["?"] * len(event_types))
            query += f" AND event_type IN ({placeholders})"
            params.extend(event_types)

        query += " ORDER BY created_at ASC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            events = []
            for row in rows:
                event = dict(row)
                event['payload'] = json.loads(event['payload_json'])
                events.append(event)
            return events
    finally:
        await db.close()

async def latest_event(session_id: str, hw_id: str, event_type: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT * FROM session_events 
            WHERE session_id = ? AND hw_id = ? AND event_type = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id, hw_id, event_type)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            event = dict(row)
            event['payload'] = json.loads(event['payload_json'])
            return event
    finally:
        await db.close()
