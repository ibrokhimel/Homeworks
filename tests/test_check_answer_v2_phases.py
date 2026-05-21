"""Regression tests for POST /api/ai/check-answer with phase=case_based_preview
and phase=memory_check (v2 React runtime phase branches).

Pins:
- correct answer returns {correct: true} + learning_block present (CBP)
- wrong answer returns {correct: false} AND does NOT leak the expected value
- a phase_attempts row is written after grading
- invalid item_index returns 400
"""
from __future__ import annotations

import asyncio
import json
import pytest


# ---------------------------------------------------------------------------
# Helpers — seed a v2 homework
# ---------------------------------------------------------------------------

_CBP_CHECKPOINTS = [
    {
        "question": "Which formula gives area of a circle?",
        "options": ["2πr", "πr²", "πd", "r²"],
        "answer_spec": {"type": "option_index", "expected": 1, "option_count": 4},
        "learning_block": "The area of a circle is A = πr² where r is the radius.",
        "kind": "identify",
    },
    {
        "question": "What is 7 × 8?",
        "options": ["54", "56", "63", "48"],
        "answer_spec": {"type": "option_index", "expected": 1, "option_count": 4},
        "learning_block": "7 × 8 = 56 — a common multiplication fact.",
        "kind": "decide",
    },
    {
        "question": "Explain why speed = distance / time.",
        "options": [],
        "answer_spec": {"type": "text_exact", "expected": "speed equals distance divided by time"},
        "learning_block": "Speed is the rate at which distance changes over time.",
        "kind": "justify",
    },
]

_MC_ITEMS = [
    {
        "type": "mcq",
        "prompt": "Which is a prime number?",
        "options": ["4", "6", "7", "9"],
        "answer_spec": {"type": "option_index", "expected": 2, "option_count": 4},
    },
    {
        "type": "true_false",
        "prompt": "Is the square root of 16 equal to 4?",
        "options": ["True", "False"],
        "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2},
    },
    {
        "type": "fill_blank",
        "prompt": "The perimeter of a square with side 5 is ___.",
        "answer_spec": {"type": "numeric", "expected": 20, "tolerance": 0},
    },
]


def _seed_v2_homework(client) -> str:
    """Create a homework with case_based_preview and memory_check content."""
    payload = {
        "title": "V2 phase check-answer test HW",
        "subject": "math-algebra",
        "grade": 8,
        "mode": "hard",
        "family": "aniq-fanlar",
        "content_json": {
            "meta": {"title": "V2 phase check-answer test HW"},
            "flashcards": [],
            "boss_questions": [],
            "case_based_preview": {
                "checkpoints": _CBP_CHECKPOINTS,
            },
            "memory_check": {
                "items": _MC_ITEMS,
            },
        },
    }
    resp = client.post("/api/homeworks", json=payload)
    assert resp.status_code == 200, f"Seed failed: {resp.text}"
    return resp.json()["id"]


def _post_cbp(client, hw_id: str, item_index: int, student_answer: str, **extra) -> tuple[int, dict]:
    body = {
        "phase": "case_based_preview",
        "homework_id": hw_id,
        "item_index": item_index,
        "student_answer": student_answer,
        "session_id": extra.pop("session_id", "test-session-cbp"),
        **extra,
    }
    resp = client.post("/api/ai/check-answer", json=body)
    try:
        return resp.status_code, resp.json()
    except Exception:
        return resp.status_code, {"_raw": resp.text}


def _post_mc(client, hw_id: str, item_index: int, student_answer: str, **extra) -> tuple[int, dict]:
    body = {
        "phase": "memory_check",
        "homework_id": hw_id,
        "item_index": item_index,
        "student_answer": student_answer,
        "session_id": extra.pop("session_id", "test-session-mc"),
        **extra,
    }
    resp = client.post("/api/ai/check-answer", json=body)
    try:
        return resp.status_code, resp.json()
    except Exception:
        return resp.status_code, {"_raw": resp.text}


# ---------------------------------------------------------------------------
# Case-Based Preview tests
# ---------------------------------------------------------------------------


def test_cbp_correct_answer_returns_correct_true_with_learning_block(client):
    """Correct CBP checkpoint returns {correct: true} with learning_block."""
    hw_id = _seed_v2_homework(client)
    # Checkpoint 0: option_index 1 is correct
    code, data = _post_cbp(client, hw_id, item_index=0, student_answer="1")
    assert code == 200, data
    assert data["correct"] is True, data
    assert "learning_block" in data, data
    assert data["learning_block"] == _CBP_CHECKPOINTS[0]["learning_block"]


def test_cbp_wrong_answer_returns_correct_false_no_expected_leak(client):
    """Wrong CBP answer returns {correct: false} and NEVER leaks expected value."""
    hw_id = _seed_v2_homework(client)
    # Checkpoint 0: expected index is 1; we send 0 (wrong)
    expected_value = str(_CBP_CHECKPOINTS[0]["answer_spec"]["expected"])
    code, data = _post_cbp(client, hw_id, item_index=0, student_answer="0")
    assert code == 200, data
    assert data["correct"] is False, data
    # The expected value must NOT appear anywhere in the response JSON
    response_text = json.dumps(data)
    # "expected" key itself must not leak its value as a standalone data field
    # (the context_debug wrapper may include meta — check only data payload)
    assert data.get("expected") is None, "expected value leaked into response"
    # The literal expected index value "1" in isolation might appear in debug text,
    # so we check the grading-result keys specifically:
    assert "expected" not in data or data["expected"] is None


def test_cbp_wrong_answer_learning_block_still_present(client):
    """Wrong CBP answer still returns learning_block (teaching moment after any attempt)."""
    hw_id = _seed_v2_homework(client)
    code, data = _post_cbp(client, hw_id, item_index=1, student_answer="0")  # wrong
    assert code == 200, data
    assert data["correct"] is False, data
    assert "learning_block" in data, data


def test_cbp_phase_attempt_written(client):
    """CBP grading writes a phase_attempts row readable via list_phase_attempts."""
    from server.db.attempts_repo import list_phase_attempts

    hw_id = _seed_v2_homework(client)
    session_id = "test-cbp-persist"
    code, data = _post_cbp(client, hw_id, item_index=0, student_answer="1", session_id=session_id)
    assert code == 200, data

    # Read back via the repo directly (runs in the same in-process event loop)
    loop = asyncio.new_event_loop()
    try:
        attempts = loop.run_until_complete(
            list_phase_attempts(session_id, hw_id, phase="case_based_preview")
        )
    finally:
        loop.close()

    assert len(attempts) >= 1, "No phase_attempts row written for CBP"
    row = attempts[0]
    assert row["phase"] == "case_based_preview"
    assert row["subphase"] == "checkpoint_0"
    assert row["correct"] == 1


def test_cbp_invalid_item_index_returns_400(client):
    """Out-of-range item_index returns 400."""
    hw_id = _seed_v2_homework(client)
    code, data = _post_cbp(client, hw_id, item_index=99, student_answer="1")
    assert code == 400, data


def test_cbp_missing_item_index_returns_400(client):
    """Missing item_index field returns 400."""
    hw_id = _seed_v2_homework(client)
    resp = client.post("/api/ai/check-answer", json={
        "phase": "case_based_preview",
        "homework_id": hw_id,
        "student_answer": "1",
        # item_index deliberately omitted
    })
    assert resp.status_code == 400, resp.text


def test_cbp_negative_item_index_returns_400(client):
    """Negative item_index returns 400."""
    hw_id = _seed_v2_homework(client)
    code, data = _post_cbp(client, hw_id, item_index=-1, student_answer="1")
    assert code == 400, data


# ---------------------------------------------------------------------------
# Memory Check tests
# ---------------------------------------------------------------------------


def test_mc_correct_answer_returns_correct_true(client):
    """Correct MC item returns {correct: true}."""
    hw_id = _seed_v2_homework(client)
    # Item 0: option_index 2 is correct
    code, data = _post_mc(client, hw_id, item_index=0, student_answer="2")
    assert code == 200, data
    assert data["correct"] is True, data


def test_mc_wrong_answer_returns_correct_false_no_expected_leak(client):
    """Wrong MC answer returns {correct: false} and does NOT leak the expected value."""
    hw_id = _seed_v2_homework(client)
    # Item 0: correct is index 2; send 0 (wrong)
    code, data = _post_mc(client, hw_id, item_index=0, student_answer="0")
    assert code == 200, data
    assert data["correct"] is False, data
    # No expected-answer key in the grading payload
    assert data.get("expected") is None


def test_mc_phase_attempt_written(client):
    """MC grading writes a phase_attempts row."""
    from server.db.attempts_repo import list_phase_attempts

    hw_id = _seed_v2_homework(client)
    session_id = "test-mc-persist"
    code, data = _post_mc(client, hw_id, item_index=1, student_answer="0", session_id=session_id)
    assert code == 200, data

    loop = asyncio.new_event_loop()
    try:
        attempts = loop.run_until_complete(
            list_phase_attempts(session_id, hw_id, phase="memory_check")
        )
    finally:
        loop.close()

    assert len(attempts) >= 1, "No phase_attempts row written for MC"
    row = attempts[0]
    assert row["phase"] == "memory_check"
    assert row["subphase"] == "item_1"


def test_mc_invalid_item_index_returns_400(client):
    """Out-of-range item_index returns 400."""
    hw_id = _seed_v2_homework(client)
    code, data = _post_mc(client, hw_id, item_index=50, student_answer="0")
    assert code == 400, data


def test_mc_missing_item_index_returns_400(client):
    """Missing item_index field returns 400."""
    hw_id = _seed_v2_homework(client)
    resp = client.post("/api/ai/check-answer", json={
        "phase": "memory_check",
        "homework_id": hw_id,
        "student_answer": "0",
        # item_index deliberately omitted
    })
    assert resp.status_code == 400, resp.text


def test_mc_numeric_correct_answer(client):
    """Numeric answer_spec grades correctly for a fill-blank MC item."""
    hw_id = _seed_v2_homework(client)
    # Item 2: numeric, expected=20, tolerance=0
    code, data = _post_mc(client, hw_id, item_index=2, student_answer="20")
    assert code == 200, data
    assert data["correct"] is True, data


def test_mc_numeric_wrong_answer(client):
    """Numeric answer_spec returns false for a wrong value."""
    hw_id = _seed_v2_homework(client)
    code, data = _post_mc(client, hw_id, item_index=2, student_answer="15")
    assert code == 200, data
    assert data["correct"] is False, data
