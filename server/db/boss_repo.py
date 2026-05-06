import json
from typing import Optional
from .connection import connect

async def create_generated_boss_question(
    question_id: str,
    session_id: str,
    hw_id: str,
    difficulty: str,
    topic_tags: list[str],
    question_text: str,
    expected_answer: dict,
    rubric: dict,
    source_context: dict
) -> None:
    db = await connect()
    try:
        topic_tags_json = json.dumps(topic_tags)
        expected_answer_json = json.dumps(expected_answer)
        rubric_json = json.dumps(rubric)
        source_context_json = json.dumps(source_context)
        
        await db.execute(
            """
            INSERT INTO generated_boss_questions (
                id, session_id, hw_id, difficulty, topic_tags_json,
                question_text, expected_answer_json, rubric_json, source_context_json, used
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                question_id, session_id, hw_id, difficulty, topic_tags_json,
                question_text, expected_answer_json, rubric_json, source_context_json
            )
        )
        await db.commit()
    finally:
        await db.close()

async def get_generated_boss_question(question_id: str, session_id: str, hw_id: str) -> Optional[dict]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT * FROM generated_boss_questions
            WHERE id = ? AND session_id = ? AND hw_id = ?
            """,
            (question_id, session_id, hw_id)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            
            q = dict(row)
            q['topic_tags'] = json.loads(q['topic_tags_json'])
            q['expected_answer'] = json.loads(q['expected_answer_json'])
            q['rubric'] = json.loads(q['rubric_json'])
            q['source_context'] = json.loads(q['source_context_json'])
            return q
    finally:
        await db.close()

async def mark_boss_question_used(question_id: str, session_id: str, hw_id: str) -> None:
    db = await connect()
    try:
        await db.execute(
            """
            UPDATE generated_boss_questions
            SET used = 1
            WHERE id = ? AND session_id = ? AND hw_id = ?
            """,
            (question_id, session_id, hw_id)
        )
        await db.commit()
    finally:
        await db.close()

async def list_used_boss_topics(session_id: str, hw_id: str) -> list[str]:
    db = await connect()
    try:
        async with db.execute(
            """
            SELECT topic_tags_json FROM generated_boss_questions
            WHERE session_id = ? AND hw_id = ? AND used = 1
            """,
            (session_id, hw_id)
        ) as cursor:
            rows = await cursor.fetchall()
            topics = set()
            for row in rows:
                tags = json.loads(row['topic_tags_json'])
                for tag in tags:
                    topics.add(tag)
            return list(topics)
    finally:
        await db.close()
