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
# NOTE: wrong_path + feedback_summary are STUDENT-VISIBLE narrative (rendered by
# CaseBasedPreview.tsx from the hydration payload), so they intentionally SURVIVE
# — see test_hydration_preserves_display_content. correct_path stays stripped
# (server-only right-decision), learning_block stays stripped (arrives via the
# submit RESPONSE, not hydration).
FORBIDDEN_KEYS = [
    "answer_spec",
    "expected",
    "accepted_answers",
    "correct_path",
    "learning_block",
    "inv",
    "answer",
]


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
                    # CBP teaching text — post-submit only, must not hydrate.
                    "learning_block": "LEAK_LEARNING_BLOCK teaching text",
                    "inv": "LEAK_CBP_INV",
                    "answer": "LEAK_CBP_ANSWER",
                },
                {"question": "Q2", "answer_spec": {"expected": "x"}},
                {"question": "Q3", "answer_spec": {"expected": "y"}},
            ],
            "final_simulation": {
                # correct_path is server-only (the right decision); stripped.
                "correct_path": "LEAK_CBP_PATH",
                # wrong_path is STUDENT-VISIBLE simulation narrative; survives.
                "wrong_path": "This wrong-path text is shown to the student",
            },
            # feedback_summary is the STUDENT-VISIBLE debrief; survives hydration.
            "feedback_summary": {
                "student_understood": "You grasped the core idea",
                "mistake_appeared": "A sign slip on the second step",
                "what_to_review": "Revisit distributing the negative",
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
        # Tile-match: the leak shape — both sides share a pair id, so the DOM
        # would encode every answer. Hydration must replace this with opaque
        # per-side tokens (no shared id).
        "gb_tile_match": [
            {"id": "p0", "left": "atom", "right": "smallest unit"},
            {"id": "p1", "left": "molecule", "right": "two or more atoms"},
            {"id": "p2", "left": "ion", "right": "charged particle"},
        ],
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
    assert "Term for splitting equally?" in blob
    # Tile-match display text (concept + meaning sides) still ships — only the
    # pairing is hidden.
    assert "atom" in blob and "smallest unit" in blob


def test_hydration_preserves_simulation_and_debrief_narrative(client, v2_homework_with_secrets):
    """wrong_path + feedback_summary are STUDENT-VISIBLE (CaseBasedPreview.tsx
    renders them straight from hydration). They must SURVIVE redaction."""
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    data = resp.json()
    blob = json.dumps(data)

    sim = data["content_json"]["case_based_preview"]["final_simulation"]
    assert sim.get("wrong_path") == "This wrong-path text is shown to the student"

    fb = data["content_json"]["case_based_preview"]["feedback_summary"]
    assert fb.get("student_understood") == "You grasped the core idea"
    assert fb.get("mistake_appeared") == "A sign slip on the second step"
    assert fb.get("what_to_review") == "Revisit distributing the negative"

    # Both keys present in the payload (the UI reads them by name).
    assert '"wrong_path"' in blob and '"feedback_summary"' in blob


def _walk_keys_and_strings(node, keys: set, strings: list):
    """Recurse a JSON tree collecting every dict key + every string leaf."""
    if isinstance(node, dict):
        for k, v in node.items():
            keys.add(k)
            _walk_keys_and_strings(v, keys, strings)
    elif isinstance(node, list):
        for item in node:
            _walk_keys_and_strings(item, keys, strings)
    elif isinstance(node, str):
        strings.append(node)


def test_hydration_deep_walk_no_answer_keys_or_tokens(client, v2_homework_with_secrets):
    """Recursive walk: no forbidden key + no LEAK_* token survives at ANY depth."""
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    payload = resp.json()
    keys: set = set()
    strings: list = []
    _walk_keys_and_strings(payload, keys, strings)

    # NB: wrong_path + feedback_summary are intentionally NOT here — they are
    # student-visible narrative the UI renders from hydration.
    forbidden_keys = {
        "answer_spec", "expected", "accepted_answers", "correct_path",
        "learning_block", "inv", "answer",
        "invariant", "expected_answer", "distractors",
    }
    leaked_keys = forbidden_keys & keys
    assert not leaked_keys, f"answer-bearing keys survived hydration: {leaked_keys}"

    blob = "\n".join(strings)
    leaked_tokens = [t for t in strings if t.startswith("LEAK_")]
    assert not leaked_tokens, f"answer tokens survived hydration: {leaked_tokens}"
    assert "LEAK_LEARNING_BLOCK" not in blob


def test_hydration_tile_match_has_no_recoverable_pairing(client, v2_homework_with_secrets):
    """Tile-match hydrates as {lefts,rights} with opaque tokens — no shared id."""
    resp = client.get(f"/api/runtime/homeworks/{v2_homework_with_secrets}")
    tm = resp.json()["content_json"]["gb_tile_match"]

    # New shape: a dict with two independent token columns, NOT a pair list.
    assert isinstance(tm, dict), f"tile-match should be {{lefts,rights}} dict, got {type(tm)}"
    assert set(tm.keys()) <= {"lefts", "rights"}
    lefts, rights = tm["lefts"], tm["rights"]
    assert len(lefts) == len(rights) == 3

    # No tile carries id/left/right (the recoverable-pairing fields).
    for tile in lefts:
        assert set(tile.keys()) == {"lid", "text"}, tile
        assert "id" not in tile and "right" not in tile
    for tile in rights:
        assert set(tile.keys()) == {"rid", "text"}, tile
        assert "id" not in tile and "left" not in tile

    # The left/right tokens must be DISJOINT (no token appears on both sides),
    # so a left tile can never be matched to a right by id-equality.
    lids = {t["lid"] for t in lefts}
    rids = {t["rid"] for t in rights}
    assert lids.isdisjoint(rids), "left/right tokens overlap — pairing recoverable"

    # The display texts are present but split across columns with no link.
    left_texts = {t["text"] for t in lefts}
    right_texts = {t["text"] for t in rights}
    assert left_texts == {"atom", "molecule", "ion"}
    assert right_texts == {"smallest unit", "two or more atoms", "charged particle"}


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
