"""Regression: the v2 builder autosaves the WHOLE content_json on every
keystroke via PUT /api/homeworks/{id}. Before the "server allows drafts" fix,
delivery-grade per-item completeness rules (and structural "Field required"
errors from the builder's compact() helper dropping empty strings/arrays) 400'd
the entire save, taking all the author's other edits with it.

Confirmed PROD repro: a Sentence-Fill item with a passage but no `___` blanks
yet → `gb_sentence_fill.0: "passage must contain at least one '___' blank
marker"` → HTTP 400 INVALID_CONTENT.

The fix: PUT/PATCH validate STRUCTURE + TYPES but DEFER per-item completeness
business rules during authoring (context={"authoring": True}). A new
GET /readiness endpoint re-enforces delivery-grade strictness to gate sharing.
Default (no authoring flag) stays fully strict — these tests also prove the
schema was NOT globally weakened.
"""

import pytest
from pydantic import ValidationError

from server.schemas.content import ContentJSON


def _make_v2_homework(client):
    hw = client.post(
        "/api/homeworks",
        json={"title": "Draft HW", "subject": "math-algebra", "grade": 6, "mode": "hard"},
    ).json()
    return hw["id"]


# --------------------------------------------------------------------------- #
# Part D.1/D.2 — PUT accepts in-progress (compacted) game items.
# --------------------------------------------------------------------------- #


def test_put_accepts_in_progress_sentence_fill(client):
    """An author who has typed a passage but not added blanks/answers yet must
    not lose the whole save. The builder's compact() drops empty answers/blanks,
    so the item arrives with passage only — exactly this shape.

    Was 400 (passage must contain at least one '___' blank marker) pre-fix.
    """
    hw_id = _make_v2_homework(client)
    content = {
        "flow_version": "v2",
        "meta": {"title": "Draft HW"},
        "gb_sentence_fill": [
            {"id": "sf_1", "mode": "word_bank", "passage": "typing..."}
        ],
    }
    resp = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content})
    assert resp.status_code == 200, resp.text


def test_put_accepts_empty_new_tile_match(client):
    """A freshly-added Tile Match pair before the author has typed left/right.
    compact() drops the empty left/right strings → item arrives as {id} only.
    Must structurally validate (defaults fill left/right) and skip the
    non-empty business rule under authoring mode.
    """
    hw_id = _make_v2_homework(client)
    content = {
        "flow_version": "v2",
        "meta": {"title": "Draft HW"},
        "gb_tile_match": [{"id": "tm_1"}],
    }
    resp = client.put(f"/api/homeworks/{hw_id}", json={"content_json": content})
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------- #
# Part D.3/D.4 — readiness endpoint re-enforces delivery-grade strictness.
# --------------------------------------------------------------------------- #


def test_readiness_flags_incomplete_sentence_fill(client):
    """After leniently saving the in-progress item, the readiness gate must
    report ready=False with an issue path pointing at gb_sentence_fill, so the
    builder can block the share button until the question is complete.
    """
    hw_id = _make_v2_homework(client)
    content = {
        "flow_version": "v2",
        "meta": {"title": "Draft HW"},
        "gb_sentence_fill": [
            {"id": "sf_1", "mode": "word_bank", "passage": "no blanks here"}
        ],
    }
    assert client.put(f"/api/homeworks/{hw_id}", json={"content_json": content}).status_code == 200

    r = client.get(f"/api/homeworks/{hw_id}/readiness")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ready"] is False
    assert any("gb_sentence_fill" in issue["path"] for issue in body["issues"]), body["issues"]


def test_readiness_true_for_complete_homework(client):
    """A fully-valid v2 homework (3 CBP checkpoints + complete memory check)
    passes strict validation → ready=True with no issues.
    """
    hw_id = _make_v2_homework(client)
    content = {
        "flow_version": "v2",
        "meta": {"title": "Complete HW"},
        "case_based_preview": {
            "checkpoints": [
                {"question": "Q1", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 1, "option_count": 2}},
                {"question": "Q2", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"question": "Q3", "options": ["a", "b"], "answer_spec": {"type": "option_index", "expected": 1, "option_count": 2}},
            ],
        },
        "memory_check": {
            "pass_threshold_pct": 60,
            "items": [
                {"type": "mcq", "prompt": "M1", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"type": "mcq", "prompt": "M2", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
                {"type": "mcq", "prompt": "M3", "options": ["x", "y"], "answer_spec": {"type": "option_index", "expected": 0, "option_count": 2}},
            ],
        },
    }
    assert client.put(f"/api/homeworks/{hw_id}", json={"content_json": content}).status_code == 200

    r = client.get(f"/api/homeworks/{hw_id}/readiness")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ready"] is True, body
    assert body["issues"] == []


def test_readiness_404_for_missing_homework(client):
    """Readiness on a non-existent homework returns 404 (not a 200 ready=False)."""
    r = client.get("/api/homeworks/HW-does-not-exist/readiness")
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Part D.5 — prove the schema was NOT globally weakened. Strict (no context)
# still raises; authoring context defers the same business rule.
# --------------------------------------------------------------------------- #


def test_strict_validation_unchanged_outside_authoring():
    """Direct strict validation of a 0-blank Sentence-Fill item must still raise
    (default callers — e.g. the readiness gate — keep delivery-grade rules).
    And the SAME payload with context={"authoring": True} must NOT raise,
    empirically confirming pydantic v2 propagates context to nested validators.
    """
    bad = {
        "flow_version": "v2",
        "gb_sentence_fill": [
            {"id": "sf_1", "mode": "word_bank", "passage": "no blanks here"}
        ],
    }

    # Strict (no context) still rejects the half-written item.
    with pytest.raises(ValidationError):
        ContentJSON.model_validate(bad)

    # Authoring context defers the per-item business rule → no raise.
    ContentJSON.model_validate(bad, context={"authoring": True})


def test_authoring_context_defers_compacted_field_required():
    """The builder's compact() can drop required scalars/arrays entirely. With
    structural defaults + authoring context, a near-empty item validates; strict
    validation still flags it as incomplete (not a structural crash).
    """
    compacted = {
        "flow_version": "v2",
        "gb_tile_match": [{"id": "tm_1"}],      # left/right compacted away
        "gb_sentence_fill": [{"id": "sf_1"}],   # mode/passage/answers compacted away
    }
    # Authoring mode tolerates the structural gaps (defaults fill them).
    ContentJSON.model_validate(compacted, context={"authoring": True})
    # Strict mode flags incompleteness via business rules (still no crash).
    with pytest.raises(ValidationError):
        ContentJSON.model_validate(compacted)
