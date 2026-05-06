from __future__ import annotations

import json
from unittest.mock import patch


def _create_homework(client, content_json: dict) -> str:
    resp = client.post(
        "/api/homeworks",
        json={
            "title": "AI context debug HW",
            "subject": "math-algebra",
            "grade": 8,
            "mode": "hard",
        },
    )
    assert resp.status_code == 200, resp.text
    hw_id = resp.json()["id"]
    put_resp = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content_json})
    assert put_resp.status_code == 200, put_resp.text
    return hw_id


def _debug_homework(client, *, expected: str = "SECRET_EXPECTED_TOKEN_123") -> str:
    return _create_homework(
        client,
        {
            "boss_questions": [
                {
                    "question_id": "debug-q1",
                    "q": "According to the passage, what does the phrase mean?",
                    "answer_spec": {
                        "type": "text_exact",
                        "expected": expected,
                        "canonical_display": expected,
                    },
                    "accepted_answers": [expected],
                    "ans": [expected],
                    "dmg": 10,
                }
            ]
        },
    )


def test_context_debug_absent_by_default(monkeypatch, client):
    monkeypatch.delenv("AI_DEBUG_CONTEXT", raising=False)
    hw_id = _debug_homework(client)

    with (
        patch("server.services.ai_orchestrator.generate") as mock_generate,
        patch("server.services.ai_orchestrator.generate_json") as mock_generate_json,
    ):
        mock_generate.return_value = "Tutor reply"
        mock_generate_json.return_value = {
            "correct": False,
            "damage_dealt": 0,
            "boss_response": "Try again.",
            "hint": None,
            "score": 0.0,
        }

        tutor_resp = client.post(
            "/api/ai/tutor/chat",
            json={
                "session_id": "sess-nodebug",
                "hw_id": hw_id,
                "phase": "practice",
                "question_id": "debug-q1",
                "message": "according to nima degani?",
                "screen_context": "Visible context line",
            },
        )
        assert tutor_resp.status_code == 200, tutor_resp.text
        assert "context_debug" not in tutor_resp.json()

        answer_resp = client.post(
            "/api/ai/check-answer",
            json={
                "question_id": "debug-q1",
                "question": "Question",
                "student_answer": "4",
                "answer_spec": {
                    "type": "numeric",
                    "expected": "4",
                    "canonical_display": "4",
                },
                "allow_ai_fallback": False,
            },
        )
        assert answer_resp.status_code == 200, answer_resp.text
        assert "context_debug" not in answer_resp.json()

        boss_resp = client.post(
            "/api/ai/boss-turn",
            json={
                "boss_question": "What is 2+2?",
                "student_answer": "wrong",
                "expected_answers": ["4"],
                "damage_value": 10,
                "hp_remaining": 50,
                "attempt_number": 1,
            },
        )
        assert boss_resp.status_code == 200, boss_resp.text
        assert "context_debug" not in boss_resp.json()


@patch("server.services.ai_orchestrator.generate")
def test_tutor_chat_context_debug_is_metadata_only(mock_generate, monkeypatch, client):
    monkeypatch.setenv("AI_DEBUG_CONTEXT", "true")
    mock_generate.return_value = "Tutor reply"
    expected = "SECRET_EXPECTED_TOKEN_456"
    hw_id = _debug_homework(client, expected=expected)
    visible_token = "VISIBLE_SCREEN_TOKEN_456"
    student_token = "STUDENT_WORK_TOKEN_456"

    resp = client.post(
        "/api/ai/tutor/chat",
        json={
            "session_id": "sess-debug-chat",
            "hw_id": hw_id,
            "phase": "practice",
            "subphase": "sentence-fill",
            "question_id": "debug-q1",
            "message": "according to nima degani?",
            "screen_context": (
                f"{visible_token} according to the passage\n"
                f"<span data-expected=\"{expected}\">{expected}</span>"
            ),
            "student_work_text": student_token,
        },
    )

    assert resp.status_code == 200, resp.text
    debug = resp.json()["context_debug"]
    assert debug["route"] == "tutor_chat"
    assert debug["question_found"] is True
    assert debug["question_text_len"] > 0
    assert debug["screen_context_raw_len"] > debug["screen_context_clean_len"]
    assert debug["student_work_text_len"] == len(student_token)
    assert debug["chat_history_count"] >= 1
    assert debug["model"]

    debug_json = json.dumps(debug, ensure_ascii=False)
    assert visible_token not in debug_json
    assert student_token not in debug_json
    assert expected not in debug_json
    assert "<UNTRUSTED>" not in debug_json

    history_resp = client.get(
        "/api/ai/tutor/history",
        params={"session_id": "sess-debug-chat", "hw_id": hw_id},
    )
    assert history_resp.status_code == 200, history_resp.text
    history_debug = history_resp.json()["context_debug"]
    assert history_debug["route"] == "tutor_history"
    assert history_debug["history_count"] >= 2
    history_debug_json = json.dumps(history_debug, ensure_ascii=False)
    assert "according to nima degani?" not in history_debug_json
    assert "Tutor reply" not in history_debug_json


def test_check_answer_context_debug_is_metadata_only(monkeypatch, client):
    monkeypatch.setenv("AI_DEBUG_CONTEXT", "true")
    expected = "SECRET_EXPECTED_TOKEN_789"

    resp = client.post(
        "/api/ai/check-answer",
        json={
            "question_id": "debug-answer-q",
            "question": "Repeat the token",
            "student_answer": expected,
            "answer_spec": {
                "type": "text_exact",
                "expected": expected,
                "canonical_display": expected,
            },
            "allow_ai_fallback": False,
            "phase": "practice",
        },
    )

    assert resp.status_code == 200, resp.text
    debug = resp.json()["context_debug"]
    assert debug["route"] == "check_answer"
    assert debug["checker_path"] == "deterministic"
    assert debug["source"] == "deterministic"
    assert debug["result_action"] == "accepted"
    assert debug["answer_spec_type"] == "text_exact"
    assert expected not in json.dumps(debug, ensure_ascii=False)


@patch("server.services.ai_orchestrator.generate_json")
def test_boss_turn_context_debug_is_metadata_only(mock_generate_json, monkeypatch, client):
    monkeypatch.setenv("AI_DEBUG_CONTEXT", "true")
    expected = "UNIQUE_BOSS_ANSWER_TOKEN_999"
    mock_generate_json.return_value = {
        "correct": False,
        "damage_dealt": 0,
        "boss_response": "Try again.",
        "hint": None,
        "score": 0.0,
    }

    resp = client.post(
        "/api/ai/boss-turn",
        json={
            "boss_question": "What is 2+2?",
            "student_answer": "wrong",
            "expected_answers": [expected],
            "damage_value": 10,
            "hp_remaining": 50,
            "attempt_number": 1,
            "session_id": "sess-boss-debug",
            "homework_id": "hw-debug",
            "question_id": "boss-q1",
        },
    )

    assert resp.status_code == 200, resp.text
    debug = resp.json()["context_debug"]
    assert debug["route"] == "boss_turn"
    assert debug["mode"] == "fixed_boss"
    assert debug["question_source"] == "frontend_payload"
    assert debug["hp_before"] == 50
    assert debug["hp_after"] == 50
    assert debug["damage_dealt"] == 0
    assert debug["model"]
    assert expected not in json.dumps(debug, ensure_ascii=False)


@patch("server.services.ai_orchestrator.generate_json")
def test_boss_plan_context_debug_is_metadata_only(mock_generate_json, monkeypatch, client):
    monkeypatch.setenv("AI_DEBUG_CONTEXT", "true")
    expected = "UNIQUE_BOSS_PLAN_EXPECTED_TOKEN"
    hw_id = _debug_homework(client, expected=expected)
    mock_generate_json.return_value = {
        "ordered": [
            {
                "question_id": "debug-q1",
                "framing_text": "Use what you practiced.",
            }
        ],
        "persona_traits": ["mentor"],
    }

    resp = client.post(
        "/api/ai/tutor/boss-plan",
        json={"session_id": "sess-boss-plan", "hw_id": hw_id},
    )

    assert resp.status_code == 200, resp.text
    debug = resp.json()["context_debug"]
    assert debug["route"] == "tutor_boss_plan"
    assert debug["mode"] == "fixed_boss"
    assert debug["boss_questions_count"] == 1
    assert debug["question_source"] == "content_json"
    assert debug["model"]
    assert expected not in json.dumps(debug, ensure_ascii=False)
