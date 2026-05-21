"""Regression fence for the React hydration redaction boundary (F1).

GET /api/runtime/homeworks/{id} must NEVER ship answer-bearing fields to the
browser. This mirrors the spirit of the tutor MAGIC_TOKEN leak tests
(test_tutor_chat.py) but guards the *hydration* path — the new delivery
mechanism that replaces the legacy injector's per-game stripping.

If any of these assertions fail, every v2 homework leaks its answer key to
every student. Treat a failure here as a release blocker.
"""

import json

import pytest

from server.services.runtime_redactor import redact_for_runtime


# ---- Endpoint-level: v2 shapes (case_based_preview + memory_check) ----

LEAK_TOKENS = [
    "LEAK_CBP_EXPECTED",
    "LEAK_CBP_ACCEPTED",
    "LEAK_CBP_PATH",
    "LEAK_MC_EXPECTED",
    "LEAK_MC_ACCEPTED",
]
FORBIDDEN_KEYS = ["answer_spec", "expected", "accepted_answers", "correct_path"]


@pytest.fixture
def v2_homework_with_secrets(client):
    hw = client.post(
        "/api/homeworks",
        json={"title": "Redaction fence HW", "subject": "math-algebra", "grade": 8, "mode": "hard"},
    ).json()
    hw_id = hw["id"]
    content = {
        "flow_version": "v2",
        "meta": {"title": "Redaction fence HW", "subject_display": "Algebra"},
        "case_based_preview": {
            "checkpoints": [
                {
                    "question": "Which operation splits a quantity equally?",
                    "options": ["multiply", "divide"],
                    "answer_spec": {"expected": "LEAK_CBP_EXPECTED", "accepted_answers": ["LEAK_CBP_ACCEPTED"]},
                },
                {"question": "Q2", "answer_spec": {"expected": "x"}},
                {"question": "Q3", "answer_spec": {"expected": "y"}},
            ],
            "final_simulation": {
                "correct_path": "LEAK_CBP_PATH",
                "wrong_path": "This wrong-path text is shown to the student",
            },
        },
        "memory_check": {
            "pass_threshold_pct": 60,
            "items": [
                {
                    "prompt": "Term for splitting equally?",
                    "options": ["division", "addition"],
                    "answer_spec": {"expected": "LEAK_MC_EXPECTED", "accepted_answers": ["LEAK_MC_ACCEPTED"]},
                    "correct": 0,
                }
            ],
        },
    }
    resp = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content})
    assert resp.status_code == 200, resp.text
    return hw_id


def test_hydration_strips_all_answer_tokens(client, v2_homework_with_secrets):
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    assert resp.status_code == 200, resp.text
    blob = json.dumps(resp.json())
    leaked = [t for t in LEAK_TOKENS if t in blob]
    assert not leaked, f"Hydration payload leaked answer values: {leaked}"


def test_hydration_strips_answer_key_names(client, v2_homework_with_secrets):
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    blob = json.dumps(resp.json())
    present = [k for k in FORBIDDEN_KEYS if f'"{k}"' in blob]
    assert not present, f"Hydration payload exposed answer-key fields: {present}"


def test_hydration_preserves_display_content(client, v2_homework_with_secrets):
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    blob = json.dumps(resp.json())
    assert "Which operation splits a quantity equally?" in blob
    assert "This wrong-path text is shown to the student" in blob
    assert "Term for splitting equally?" in blob


def test_gate_state_fresh_session_locked(client, v2_homework_with_secrets):
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}/gate-state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["practice_arc_unlocked"] is False
    assert data["cbp"]["checkpoints_total"] == 3
    assert data["cbp"]["threshold"] == 2
    assert data["mc"]["threshold_pct"] == 60


def test_hydration_404_for_missing(client):
    resp = client.get("/api/runtime/homeworks/HW-DOES-NOT-EXIST")
    assert resp.status_code == 404


# ---- Unit-level: legacy game deny-lists (no PUT, no strict-schema fight) ----
# Proves the shared redaction_constants deny-lists strip the per-game
# server-only fields the injector historically stripped.

def test_redactor_strips_legacy_game_answers():
    raw = {
        "boss_questions": [{"q": "Explain.", "ans": ["LEAK_BOSS_ANS"], "answer_spec": {"expected": "LEAK_BOSS_EXP"}}],
        "gb_tile_match": [{"left": "a", "right": "b", "explanation": "LEAK_TM"}],
        "gb_sentence_fill": [{"passage": "fill _", "answers": ["LEAK_SF"], "explanations": ["LEAK_SFX"]}],
        "real_life_challenge": {
            "steps": [{"options": [{"label": "opt", "is_correct": True, "consequence": "LEAK_RLC", "acceptable_keywords": ["LEAK_KW"]}]}]
        },
    }
    safe = redact_for_runtime(raw)
    blob = json.dumps(safe)
    for tok in ["LEAK_BOSS_ANS", "LEAK_BOSS_EXP", "LEAK_TM", "LEAK_SF", "LEAK_SFX", "LEAK_RLC", "LEAK_KW"]:
        assert tok not in blob, f"legacy game answer leaked: {tok}"
    # display content survives
    assert "Explain." in blob and "opt" in blob and "fill _" in blob


def test_redactor_does_not_mutate_input():
    raw = {"case_based_preview": {"checkpoints": [{"answer_spec": {"expected": "keep"}}]}}
    redact_for_runtime(raw)
    # original still has the answer (deep-copied, not mutated)
    assert raw["case_based_preview"]["checkpoints"][0]["answer_spec"]["expected"] == "keep"
