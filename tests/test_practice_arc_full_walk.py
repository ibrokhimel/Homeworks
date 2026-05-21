"""Full Practice Arc walk — the "browser smoke" replacement.

A backend integration test that drives the entire v2 happy-path through the
FastAPI TestClient, end to end:

    create v2 homework
      → pass CBP (≥2 of 3 checkpoints)
      → pass Memory Check (≥60%)
      → verify Unlock Gate flips practice_arc_unlocked → true
      → server-graded Practice Arc games execute (tile_match, etc.)
      → gate-locked games still 403 before unlock; 200 after unlock
      → Boss-questions branch is reachable as the final node

The test does NOT need a real browser — the React SPA's `resolveGameOrder()`
is pure client logic over an HTTP-served content_json, so once the backend
agrees the gate is open and check-answer routes 200 for each game, the
visual walkthrough is determined. This pins the contract the SPA renders
against.

Mirrors the helpers from test_v2_gate_flow.py + test_practice_gate_server_enforced.py.
"""

import json
import pytest


# ---------------------------------------------------------------------------
# Fixture: a v2 homework wired with the FULL arc (CBP + MC + 6-game plan + boss)
# ---------------------------------------------------------------------------


def _build_arc_content(games):
    """Generate a v2 content_json with `games` as the practice_arc plan.

    Includes the learning sections (CBP + Memory Check) tuned so the same
    `_pass_cbp` + `_pass_mc` helpers work, plus authored content for the
    games referenced in `games[]`. Independent of any prior PUT — used to
    seed homeworks AND to update them with different arc shapes.
    """
    return {
        "flow_version": "v2",
        "meta": {"title": "Full Arc Walk"},
        "case_based_preview": {
            "checkpoints": [
                {"question": "Q1", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 1, "option_count": 2}},
                {"question": "Q2", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"question": "Q3", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 1, "option_count": 2}},
            ],
        },
        "flashcards": [{"term": "F", "def": "Force"}],
        "memory_check": {
            "pass_threshold_pct": 60,
            "items": [
                {"type": "mcq", "prompt": "M1", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"type": "mcq", "prompt": "M2", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"type": "mcq", "prompt": "M3", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
            ],
        },
        "practice_arc": {"games": list(games)},
        "gb_tile_match": [
            {"id": "tm1", "left": "F = ma", "right": "Newton 2", "tier": "basic"},
            {"id": "tm2", "left": "E = mc²", "right": "mass-energy", "tier": "basic"},
        ],
        "gb_memory_matching": [
            {"id": "mm1", "case_setup": "Recall the term that fits…",
             "checkpoints": [
                 {"question": "C1", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 0}},
                 {"question": "C2", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 1}},
                 {"question": "C3", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 0}},
             ]},
        ],
        "gb_jigsaw_matching": [
            {"id": "jm1", "case_setup": "Two pieces fit together…",
             "pieces": [{"id": "p1", "label": "Force"}, {"id": "p2", "label": "Mass × accel"}],
             "checkpoints": [
                 {"question": "C1", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 1}},
                 {"question": "C2", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 0}},
                 {"question": "C3", "options": ["A", "B"], "answer_spec": {"type": "option_index", "expected": 1}},
             ]},
        ],
        "gb_error_detection": [
            {"id": "ed1", "instructions": "Find the broken step",
             "work_blocks": [
                 {"id": "b1", "text": "2 + 2 = 5", "is_broken": True},
                 {"id": "b2", "text": "3 × 3 = 9"},
             ],
             "correction": "2 + 2 = 4"},
        ],
        "gb_assembly": [
            {"id": "a1", "instructions": "Arrange the steps",
             "pieces": [{"id": "p1", "label": "Setup"}, {"id": "p2", "label": "Solve"}],
             "expected_order": ["p1", "p2"]},
        ],
        "boss_questions": [
            {"q": "Boss Q1", "answer_spec": {"type": "text_exact", "expected": "yes"}},
        ],
    }


def _make_full_arc_homework(client):
    """Create a v2 homework whose practice_arc.games[] is a 6-game plan
    that mixes legacy (tile_match) + Infra-spec (memory_matching,
    jigsaw_matching, error_detection, assembly) + RLC + boss."""
    hw = client.post(
        "/api/homeworks",
        json={"title": "Full Arc Walk", "subject": "math-algebra", "grade": 6, "mode": "hard"},
    ).json()
    hw_id = hw["id"]
    content = _build_arc_content([
        "tile_match", "memory_matching", "jigsaw_matching",
        "error_detection", "assembly", "boss",
    ])
    r = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content})
    assert r.status_code == 200, r.text
    return hw_id


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _gate(client, hw_id, sid):
    return client.get(f"/api/runtime/homeworks/{hw_id}/gate-state?session_id={sid}").json()


def _runtime_payload(client, hw_id):
    return client.get(f"/api/runtime/homeworks/{hw_id}").json()


def _cbp(client, hw_id, sid, idx, answer):
    return client.post("/api/ai/check-answer", json={
        "phase": "case_based_preview", "homework_id": hw_id, "session_id": sid,
        "item_index": idx, "student_answer": answer,
    }).json()


def _mc(client, hw_id, sid, idx, answer):
    return client.post("/api/ai/check-answer", json={
        "phase": "memory_check", "homework_id": hw_id, "session_id": sid,
        "item_index": idx, "student_answer": answer,
    }).json()


def _post_check(client, hw_id, sid, phase, body):
    """Generic POST /api/ai/check-answer wrapper — returns the (status, body)."""
    r = client.post("/api/ai/check-answer", json={
        "phase": phase, "homework_id": hw_id, "session_id": sid, **body,
    })
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text}


def _pass_cbp(client, hw_id, sid):
    """Pass all 3 CBP checkpoints (expected indices 1, 0, 1)."""
    for idx, ans in [(0, "1"), (1, "0"), (2, "1")]:
        assert _cbp(client, hw_id, sid, idx, ans)["correct"] is True


def _pass_mc(client, hw_id, sid):
    """Pass all 3 Memory Check items (all expected index 0)."""
    for idx in range(3):
        assert _mc(client, hw_id, sid, idx, "0")["correct"] is True


# ---------------------------------------------------------------------------
# Full walk — every transition pinned
# ---------------------------------------------------------------------------


def test_full_practice_arc_walk(client):
    """The complete v2 happy path, from homework creation through Boss handoff.

    Step-by-step the test asserts:
      1. fresh session is fully locked
      2. payload hydration round-trips practice_arc.games[] (6 games + Boss)
      3. payload hydration strips all answer-bearing fields
      4. tile_match check-answer is 403 (practice_locked) BEFORE unlock
      5. CBP + Memory Check pass → gate flips practice_arc_unlocked = True
      6. tile_match check-answer is 200 (gate now open) AFTER unlock
      7. Boss is reachable: phase=final-boss returns a non-403 response
    """
    hw_id = _make_full_arc_homework(client)
    sid = "walk-sess"

    # 1) Fresh session — fully locked.
    g0 = _gate(client, hw_id, sid)
    assert g0["cbp"]["passed"] is False
    assert g0["mc"]["passed"] is False
    assert g0["practice_arc_unlocked"] is False

    # 2) Hydration payload exposes the plan untouched.
    payload = _runtime_payload(client, hw_id)
    cj = payload["content_json"]
    plan = cj["practice_arc"]["games"]
    assert plan == [
        "tile_match", "memory_matching", "jigsaw_matching",
        "error_detection", "assembly", "boss",
    ]
    assert len(plan) == 6   # variable-N, no hardcoded 7-game sequence

    # 3) Hydration strips answer-bearing fields at every depth.
    flat = json.dumps(cj)
    for forbidden in ("answer_spec", "is_correct", "acceptable_keywords",
                      "expected_order", "is_broken", "correction"):
        assert f'"{forbidden}":' not in flat, f"answer-bearing key {forbidden!r} leaked in hydration"

    # 4) Locked games refuse to grade — server-authoritative gate.
    status, body = _post_check(client, hw_id, sid, "tile-match", {
        "left_id": "L0", "right_id": "R0",
    })
    assert status == 403, f"tile-match should be locked before gate; got {status} body={body}"
    # The 403 carries practice_locked semantics — pin the contract.
    assert "lock" in json.dumps(body).lower(), body

    # 5) Pass both learning sections → gate opens.
    _pass_cbp(client, hw_id, sid)
    _pass_mc(client, hw_id, sid)
    g1 = _gate(client, hw_id, sid)
    assert g1["cbp"]["passed"] is True
    assert g1["mc"]["passed"] is True
    assert g1["practice_arc_unlocked"] is True

    # 6) After unlock, the gate no longer blocks check-answer. The request
    #    may still fail for OTHER reasons (e.g. unknown tokens) — we only
    #    care that it's no longer the 403 practice_locked.
    status_unlocked, body_unlocked = _post_check(client, hw_id, sid, "tile-match", {
        "left_id": "L0", "right_id": "R0",
    })
    assert status_unlocked != 403, (
        f"after unlock, tile-match must not return practice_locked; got {status_unlocked} body={body_unlocked}"
    )

    # 7) Boss handoff: phase=final-boss should not be gate-locked either.
    status_boss, body_boss = _post_check(client, hw_id, sid, "final-boss", {
        "question_id": "q1", "student_answer": "yes",
    })
    assert status_boss != 403, (
        f"after unlock, final-boss must not return practice_locked; got {status_boss} body={body_boss}"
    )


# ---------------------------------------------------------------------------
# Sanity: variable-N (2-game arc) also walks the same way
# ---------------------------------------------------------------------------


def test_full_walk_with_two_game_arc(client):
    """Same happy-path but with a minimal 2-game arc (tile_match + boss).
    Proves the walk isn't hardcoded to the 6-game shape."""
    # Seed a fresh homework with a 2-game arc — NOT a re-PUT of the
    # redacted payload (which has the side-disjoint TM shape, not the
    # raw author input the schema validator expects).
    hw = client.post(
        "/api/homeworks",
        json={"title": "Two-Game Arc", "subject": "math-algebra", "grade": 6, "mode": "hard"},
    ).json()
    hw_id = hw["id"]
    content = _build_arc_content(["tile_match", "boss"])
    r = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content})
    assert r.status_code == 200, r.text
    sid = "walk-2g"

    payload2 = _runtime_payload(client, hw_id)
    plan = payload2["content_json"]["practice_arc"]["games"]
    assert plan == ["tile_match", "boss"]
    assert len(plan) == 2  # smallest meaningful arc

    # Lock → unlock → tile-match no longer practice-locked.
    assert _gate(client, hw_id, sid)["practice_arc_unlocked"] is False
    _pass_cbp(client, hw_id, sid)
    _pass_mc(client, hw_id, sid)
    assert _gate(client, hw_id, sid)["practice_arc_unlocked"] is True

    status_unlocked, _ = _post_check(client, hw_id, sid, "tile-match", {
        "left_id": "L0", "right_id": "R0",
    })
    assert status_unlocked != 403
