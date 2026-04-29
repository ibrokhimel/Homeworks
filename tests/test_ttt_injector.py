"""Regression tests for Tic Tac Toe vs AI runtime injection.

TTT is the optional GB_TTT game-break payload. These tests pin:
- the template constant is registered for replacement,
- non-empty payloads round-trip through inject() without shape changes
  (TTT items are flat — no adapter — so the wire format equals the storage
  format),
- empty payloads produce an empty array (runtime skips the sub-game),
- the template ships the panel + init function + minimax helpers.
"""

import json
import re

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
    html = inject(
        _minimal_content_with_ttt(),
        runtime_context={"hw_id": "HW-TTT", "subject": "math-algebra", "grade": 8},
    )

    items = _extract_ttt_constant(html)
    assert len(items) == 3
    assert items[0]["q"] == "What is 7 x 8?"
    assert items[0]["correct"] == "56"
    assert items[0]["distractors"] == ["54", "48", "63"]

    assert "gb-panel-ttt" in html
    assert "gbInitTTT" in html
    assert "gbTTTBestMove" in html
    assert "Tic Tac Toe" in html


def test_inject_handles_empty_ttt():
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = []
    html = inject(payload, runtime_context={"hw_id": "HW-E", "subject": "math-algebra", "grade": 8})
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
    assert items[0]["correct"] == "56"
    assert "GB_TTT" in preview.text
    assert "gb-panel-ttt" in preview.text


def test_inject_preserves_distractor_count_per_item():
    """Each TTT item is authored with exactly 3 distractors (4 options total
    when combined with `correct`). The injector must not strip or pad."""
    payload = _minimal_content_with_ttt()
    payload["gb_ttt"] = [
        {"q": "Q1", "correct": "A", "distractors": ["B", "C", "D"]},
    ]
    html = inject(payload, runtime_context={"hw_id": "HW-D", "subject": "math-algebra", "grade": 8})
    items = _extract_ttt_constant(html)
    assert len(items[0]["distractors"]) == 3
