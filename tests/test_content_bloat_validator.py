"""PR 2 — write-time content_json bloat validator regression tests.

Guards: pre-PR-2, the API would happily accept content_json containing inline
`<img src="data:image/png;base64,...">` blobs and 1.5MB single fields,
producing the bloat that broke AI grading on HW-20260429-019. PR 2 adds a
write-boundary validator that rejects these at POST/PUT/PATCH time.

Each test asserts the BAD pre-PR-2 state cannot return:
- bloated content_json saving silently
- existing-row PATCHes being blocked (we explicitly DON'T validate the merged
  result on PATCH so authors can incrementally fix old rows)
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from server.routes.homework import (
    _MAX_FIELD_CHARS,
    _check_no_inline_bloat,
)


# ── _check_no_inline_bloat — direct unit tests ───────────────────────────────


def test_check_passes_normal_content():
    """Sanity — typical content_json should pass without raising."""
    content = {
        "meta": {"title": "Unit 19"},
        "panels": [
            {"id": 1, "title": "Summary", "blocks": [{"type": "p", "text": "Hello"}]}
        ],
        "boss_questions": [
            {"q": "What is 2+2?", "ans": ["4"]}
        ],
    }
    _check_no_inline_bloat(content)  # no raise


def test_check_rejects_inline_data_url_in_string():
    """A string field with `data:image/...;base64,` MUST raise 422."""
    content = {
        "boss_questions": [
            {"q": 'Read this: <img src="data:image/png;base64,iVBORw0KGgoAAAA"/>'}
        ]
    }
    with pytest.raises(HTTPException) as excinfo:
        _check_no_inline_bloat(content)
    assert excinfo.value.status_code == 422
    detail = excinfo.value.detail
    assert detail["code"] == "BASE64_NOT_ALLOWED_IN_TEXT"
    assert "boss_questions" in detail["path"]
    assert ".q" in detail["path"]


def test_check_rejects_oversized_field():
    """A single string > 200KB MUST raise 422 even without base64."""
    big_text = "x" * (_MAX_FIELD_CHARS + 1)
    content = {"meta": {"section": big_text}}
    with pytest.raises(HTTPException) as excinfo:
        _check_no_inline_bloat(content)
    assert excinfo.value.status_code == 422
    detail = excinfo.value.detail
    assert detail["code"] == "CONTENT_FIELD_TOO_LARGE"
    assert detail["size"] > detail["cap"]
    assert "meta.section" in detail["path"]


def test_check_path_resolves_into_lists():
    """Field path should include list indices for clear error reporting."""
    content = {
        "panels": [
            {"id": 0, "title": "ok"},
            {"id": 1, "title": 'bad <img src="data:image/png;base64,XXX">'},
        ]
    }
    with pytest.raises(HTTPException) as excinfo:
        _check_no_inline_bloat(content)
    assert "[1]" in excinfo.value.detail["path"]
    assert ".title" in excinfo.value.detail["path"]


def test_check_ignores_non_string_leaves():
    """Numbers, bools, None should pass through silently."""
    content = {
        "n": 42,
        "f": 3.14,
        "b": True,
        "none": None,
        "lst": [1, 2.0, False, None, "ok"],
    }
    _check_no_inline_bloat(content)  # no raise


def test_check_recurses_deeply():
    """Bloat hidden 4 levels deep should still be caught."""
    content = {
        "a": {"b": {"c": [{"d": 'data:image/png;base64,XXX'}]}}
    }
    with pytest.raises(HTTPException) as excinfo:
        _check_no_inline_bloat(content)
    assert "a.b.c" in excinfo.value.detail["path"]
    assert "[0].d" in excinfo.value.detail["path"]


def test_check_caps_real_world_bloat():
    """Regression specific to HW-20260429-019: 1.5MB inline base64 in q."""
    bloated_q = 'Real q text <img src="data:image/png;base64,' + ("A" * 1_500_000) + '">'
    content = {"boss_questions": [{"q": bloated_q}]}
    with pytest.raises(HTTPException) as excinfo:
        _check_no_inline_bloat(content)
    # Either failure mode is acceptable (oversized OR base64) — both block.
    assert excinfo.value.detail["code"] in (
        "CONTENT_FIELD_TOO_LARGE",
        "BASE64_NOT_ALLOWED_IN_TEXT",
    )


# ── Integration via TestClient — POST / PUT / PATCH ──────────────────────────
# Requires the `client` fixture from tests/conftest.py (cv2 dependency).


def test_post_rejects_bloated_content(client):
    """POST /api/homeworks with inline base64 in a content field → 422."""
    body = {
        "title": "[BLOAT TEST]",
        "subject": "english",
        "grade": 8,
        "mode": "hard",
        "content_json": {
            "boss_questions": [
                {"q": 'Q with <img src="data:image/png;base64,iVBORw"/>', "ans": ["x"]}
            ]
        },
    }
    resp = client.post("/api/homeworks", json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "BASE64_NOT_ALLOWED_IN_TEXT"


def test_post_accepts_clean_content(client):
    """POST with normal content → 200 (sanity)."""
    body = {
        "title": "[clean]",
        "subject": "english",
        "grade": 8,
        "mode": "hard",
        "content_json": {
            "meta": {"title": "Test"},
            "boss_questions": [{"q": "What is 2+2?", "ans": ["4"]}],
        },
    }
    resp = client.post("/api/homeworks", json=body)
    assert resp.status_code == 200


def test_put_rejects_bloated_overwrite(client):
    """PUT a bloated content_json onto an existing row → 422."""
    # Seed a clean row first.
    seed = client.post(
        "/api/homeworks",
        json={
            "title": "[seed]",
            "subject": "english",
            "grade": 8,
            "mode": "hard",
            "content_json": {"meta": {"title": "x"}},
        },
    )
    assert seed.status_code == 200
    hw_id = seed.json()["id"]

    # PUT bloated content — must be rejected.
    resp = client.put(
        f"/api/homeworks/{hw_id}",
        json={
            "content_json": {
                "boss_questions": [
                    {"q": 'data:image/png;base64,XXXXXXXXXXXXXXXXXX', "ans": ["y"]}
                ]
            }
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "BASE64_NOT_ALLOWED_IN_TEXT"


def test_patch_rejects_bloated_incoming(client):
    """PATCH with bloated patch content → 422."""
    seed = client.post(
        "/api/homeworks",
        json={
            "title": "[seed-patch]",
            "subject": "english",
            "grade": 8,
            "mode": "hard",
            "content_json": {"meta": {"title": "x"}},
        },
    )
    hw_id = seed.json()["id"]

    resp = client.patch(
        f"/api/homeworks/{hw_id}/content",
        json={
            "content_json": {
                "boss_questions": [
                    {"q": 'data:image/png;base64,YYYYYYYY', "ans": ["z"]}
                ]
            }
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "BASE64_NOT_ALLOWED_IN_TEXT"
    assert "patch" in resp.json()["detail"]["path"]


def test_patch_does_not_block_clean_patches_on_existing_bloated_rows(client):
    """Critical: existing rows may have pre-PR-2 bloat. PATCH validates only
    the INCOMING patch dict, NOT the merged result, so authors can fix
    bloated rows incrementally. A clean patch must succeed even if the row
    already carries bloat in another field."""
    # We can't create a bloated row through the public API anymore (PR 2 blocks
    # it). Simulate the legacy state by going around the API — write directly
    # to the DB. This mirrors the real-world case where pre-PR-2 rows exist.
    import asyncio

    from server import db as db_mod

    bloated_seed = {
        "title": "[legacy-bloated]",
        "subject": "english",
        "grade": 8,
        "mode": "hard",
        "family": "til-fanlar",
        "status": "draft",
        "content_json": {
            "meta": {"title": "Legacy"},
            "boss_questions": [
                {"q": 'data:image/png;base64,LEGACYBLOAT', "ans": ["a"]}
            ],
        },
    }
    created = asyncio.run(db_mod.create_homework(bloated_seed))
    hw_id = created["id"]

    # Now a clean patch on an unrelated key should succeed.
    resp = client.patch(
        f"/api/homeworks/{hw_id}/content",
        json={"content_json": {"meta": {"title": "Updated cleanly"}}},
    )
    assert resp.status_code == 200, (
        f"Clean patch should not be blocked by pre-existing bloat in another "
        f"field. Got {resp.status_code}: {resp.text}"
    )
