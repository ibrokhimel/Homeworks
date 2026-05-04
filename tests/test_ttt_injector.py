"""Regression tests for Tic Tac Toe vs AI runtime injection.

TTT is the optional GB_TTT game-break payload. These tests pin:
- the template constant is registered for replacement,
- non-empty payloads produce side-disjoint wire format (correct/distractors stripped,
  options[] present) after T1 injector redesign,
- empty payloads produce an empty array (runtime skips the sub-game),
- the template ships the panel + init function + minimax helpers.

Tests 1–5 are the original 5 regression tests, updated to reflect the T1
side-disjoint wire format (GB_TTT now ships {id, q, options[]} — correct and
distractors are server-only). Tests 6–9 are new T1-specific assertions.
"""

import json
import re

import server.services.injector as injector
from server.services.injector import _ARRAY_CONSTANTS, inject, verify_template


def _minimal_content_with_ttt():
    return {
        "meta": {
            "title": "TTT Smoke",
            "subject_display": "Matematika",
            "section": "",
            "cefr_level": "",
        },
        "gate_quote": {"mode": "auto"},
        "panels": [],
        "flashcards": [],
        "memory_sprint": [],
        "gb_adaptive_quiz": [],
        "gb_why_chain": [],
        "gb_memory_match": [],
        "gb_puzzle_lock": [],
        "gb_mystery_box": [],
        "gb_ttt": [
            {"q": "What is 7 x 8?", "correct": "56", "distractors": ["54", "48", "63"]},
            {"q": "What is 12 + 9?", "correct": "21", "distractors": ["19", "23", "20"]},
            {"q": "Which is prime?", "correct": "11", "distractors": ["9", "15", "21"]},
        ],
        "boss_questions": [],
        "real_life": None,
        "reading": None,
        "consolidation": None,
        "reflection": None,
    }


def _extract_ttt_constant(html: str):
    match = re.search(r"const GB_TTT\s*=\s*(\[.*?\]);", html, re.DOTALL)
    assert match, "GB_TTT constant not found"
    return json.loads(match.group(1))


def test_verify_template_covers_ttt_constant():
    assert ("gb_ttt", "GB_TTT") in _ARRAY_CONSTANTS
    result = verify_template()
    assert result == {"ok": True, "missing": []}


def test_inject_round_trips_ttt_items_without_reshaping():
    """After T1, wire items carry {id, q, options[]} — correct/distractors are server-only."""
    html = inject(
        _minimal_content_with_ttt(),
        runtime_context={"hwId": "HW-TTT", "subject": "math-algebra", "grade": 8},
    )

    items = _extract_ttt_constant(html)
    assert len(items) == 3
    assert items[0]["q"] == "What is 7 x 8?"
    # Wire format: options[] present, correct/distractors absent.
    assert "options" in items[0]
    assert "56" in items[0]["options"]          # correct appears somewhere in options
    assert "correct" not in items[0]            # stripped — server-only
    assert "distractors" not in items[0]        # stripped — server-only

    assert "gb-panel-ttt" in html
    assert "gbInitTTT" in html
    assert "gbTTTBestMove" in html
    assert "Tic Tac Toe" in html


def test_inject_handles_empty_ttt():
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = []
    html = inject(payload, runtime_context={"hwId": "HW-E", "subject": "math-algebra", "grade": 8})
    items = _extract_ttt_constant(html)
    assert items == [], "Empty TTT payload must produce empty constant — runtime skips the sub-game."


def test_preview_renders_ttt_payload(client):
    create = client.post(
        "/api/homeworks",
        json={
            "title": "TTT Preview",
            "subject": "math-algebra",
            "grade": 8,
            "mode": "hard",
            "content_json": _minimal_content_with_ttt(),
        },
    )
    assert create.status_code == 200, create.text
    hw_id = create.json()["id"]

    preview = client.get(f"/api/homeworks/{hw_id}/preview")
    assert preview.status_code == 200, preview.text

    items = _extract_ttt_constant(preview.text)
    assert len(items) == 3
    # Wire format: options[] present; correct stripped from client payload.
    assert "options" in items[0]
    assert "56" in items[0]["options"]
    assert "correct" not in items[0]
    assert "GB_TTT" in preview.text
    assert "gb-panel-ttt" in preview.text


def test_inject_preserves_distractor_count_per_item():
    """Each TTT item is authored with exactly 3 distractors (4 options total
    when combined with `correct`). The wire format must expose all 4 as options[]."""
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = [
        {"q": "Q1", "correct": "A", "distractors": ["B", "C", "D"]},
    ]
    html = inject(payload, runtime_context={"hwId": "HW-D", "subject": "math-algebra", "grade": 8})
    items = _extract_ttt_constant(html)
    # 1 correct + 3 distractors = 4 options in wire
    assert len(items[0]["options"]) == 4


# ---------------------------------------------------------------------------
# New T1 tests — side-disjoint serialization contract
# ---------------------------------------------------------------------------

def test_inject_strips_correct_and_distractors_from_wire_format():
    """GB_TTT wire must not contain the literal substrings 'correct' or 'distractors'
    as object keys inside the array value, but must contain 'options'."""
    html = inject(
        _minimal_content_with_ttt(),
        runtime_context={"hwId": "HW-STRIP", "subject": "math", "grade": 5},
    )
    # Extract just the GB_TTT array literal from the HTML.
    match = re.search(r"const GB_TTT\s*=\s*(\[.*?\]);", html, re.DOTALL)
    assert match, "GB_TTT constant not found"
    ttt_literal = match.group(1)

    # Keys 'correct' and 'distractors' must NOT appear as JSON object keys.
    assert '"correct"' not in ttt_literal, \
        "GB_TTT wire must not contain 'correct' key — server-only field"
    assert '"distractors"' not in ttt_literal, \
        "GB_TTT wire must not contain 'distractors' key — server-only field"
    # 'options' must be present.
    assert '"options"' in ttt_literal, \
        "GB_TTT wire must contain 'options' key"


def test_inject_options_are_deterministically_shuffled_by_id():
    """Injecting the same content twice must produce identical option order
    (deterministic seed = item_id via random.Random(item_id))."""
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = [
        {"id": "ttt-seed-1", "q": "Q?", "correct": "C", "distractors": ["A", "B", "D"]},
    ]
    ctx = {"hwId": "HW-SEED", "subject": "math", "grade": 7}

    html1 = inject(payload, runtime_context=ctx)
    html2 = inject(payload, runtime_context=ctx)

    items1 = _extract_ttt_constant(html1)
    items2 = _extract_ttt_constant(html2)

    assert items1[0]["options"] == items2[0]["options"], \
        "Option order must be deterministic across renders for the same item_id seed"


def test_inject_preserves_options_count():
    """An item with 3 distractors must produce len(options) == 4 in wire format."""
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = [
        {"id": "ttt-cnt", "q": "2+2?", "correct": "4", "distractors": ["3", "5", "6"]},
    ]
    html = inject(payload, runtime_context={"hwId": "HW-CNT", "subject": "math", "grade": 4})
    items = _extract_ttt_constant(html)
    assert len(items[0]["options"]) == 4, \
        "1 correct + 3 distractors must yield 4 options in wire"


def test_inject_records_answer_key():
    """After inject(), _TTT_ANSWER_KEY[hw_id] must hold {item_id: correct}
    for each item; auto-assigned ids follow the 'ttt-{N}' (1-based) pattern."""
    hw_id = "HW-AKEY-UNIQUE"
    payload = _minimal_content_with_ttt()
    # Items without explicit id — auto-assigned ttt-1, ttt-2, ttt-3.
    payload["gb_ttt"] = [
        {"q": "Q1?", "correct": "ans1", "distractors": ["x", "y", "z"]},
        {"q": "Q2?", "correct": "ans2", "distractors": ["a", "b", "c"]},
    ]
    inject(payload, runtime_context={"hwId": hw_id, "subject": "math", "grade": 6})

    key = injector._TTT_ANSWER_KEY.get(hw_id)
    assert key is not None, f"_TTT_ANSWER_KEY must be populated for hw_id={hw_id!r}"
    assert key.get("ttt-1") == "ans1", "Auto-id ttt-1 must map to first item's correct"
    assert key.get("ttt-2") == "ans2", "Auto-id ttt-2 must map to second item's correct"
