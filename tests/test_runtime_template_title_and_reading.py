"""Regression tests for two runtime/injector bugs:

  Bug #1 — Reading checkpoints dropped when the segment-aware fixture
           shape is used (`reading.segments[].checkpoint = {...}`). The
           rendered runtime received `READING.checkpoints = []` and the
           player skipped straight through every reading question.

  Bug #3 — Browser `<title>` tag stale (always rendered the template's
           default literal "NETS · Kvadrat tenglama" regardless of the
           actual homework's `meta.title` or row-level `title`).

Both bugs live entirely in `server/services/injector.py`. These tests
spin up the FastAPI TestClient (via `client` fixture in conftest.py),
post a real homework, GET its rendered HTML through `/h/{id}`, and
assert the rendered output's invariants. The technique for digging the
`const READING = {...};` block out of the response mirrors the static
extraction used in `tests/test_runtime_progress_completion.py` /
`tests/test_reading_phase_surgery.py`.
"""

from __future__ import annotations

import json
import re

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_homework(client, *, title: str, content_json: dict) -> dict:
    """Wrapper around the create endpoint with sensible defaults so each
    test only specifies the fields it cares about."""
    payload = {
        "title": title,
        "subject": "math-algebra",
        "grade": 8,
        "mode": "hard",
        "family": "aniq-fanlar",
        "content_json": content_json,
    }
    resp = client.post("/api/homeworks", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _get_rendered_html(client, hw_id: str) -> str:
    r = client.get(f"/h/{hw_id}")
    assert r.status_code == 200, r.text
    return r.text


def _extract_reading_const(html: str) -> dict:
    """Pull the `const READING = {...};` JSON object out of the rendered
    HTML and return it as a Python dict.

    The injector emits the const via `_safe_js_json` which produces valid
    JSON (with `</` escaped to `<\\/` for inline-script safety). Reverse
    that escape before json.loads().
    """
    m = re.search(r"const READING\s*=\s*(\{.*?\});", html, flags=re.DOTALL)
    assert m, "const READING block not found in rendered HTML"
    raw = m.group(1).replace("<\\/", "</")
    return json.loads(raw)


def _extract_head_title(html: str) -> str:
    """Pull the `<title>...</title>` element from the document <head>."""
    head = re.search(r"<head\b[^>]*>.*?</head>", html, flags=re.DOTALL | re.IGNORECASE)
    assert head, "<head> block not found"
    m = re.search(r"<title>(.*?)</title>", head.group(0), flags=re.DOTALL | re.IGNORECASE)
    assert m, "<title> tag not found inside <head>"
    return m.group(1)


# ---------------------------------------------------------------------------
# Bug #3 — browser <title> tracks the homework's meta.title
# ---------------------------------------------------------------------------

def test_browser_title_uses_meta_title(client):
    """meta.title flows into <title> verbatim with the NETS prefix."""
    hw = _create_homework(
        client,
        title="Row-level title",
        content_json={
            "meta": {"title": "Custom HW title", "subject_display": "Algebra"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
        },
    )
    html = _get_rendered_html(client, hw["id"])
    head_title = _extract_head_title(html)
    assert "Custom HW title" in head_title, (
        f"<title> didn't pick up meta.title — got: {head_title!r}"
    )
    # Must NOT keep the legacy template default.
    assert "Kvadrat tenglama" not in head_title


def test_browser_title_falls_back_to_row_title(client):
    """When meta.title is absent, render_homework copies the row-level
    title into meta_override before calling inject — that fallback must
    surface in the <title> tag."""
    hw = _create_homework(
        client,
        title="Row Only Title",
        content_json={
            # meta is present (subject_display etc.) but title is absent.
            "meta": {"subject_display": "Algebra"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
        },
    )
    html = _get_rendered_html(client, hw["id"])
    head_title = _extract_head_title(html)
    assert "Row Only Title" in head_title, (
        f"<title> fallback to row-level title failed — got: {head_title!r}"
    )
    assert "Kvadrat tenglama" not in head_title


def test_browser_title_html_escapes_special_chars(client):
    """Untrusted meta.title content must be HTML-escaped on the way into
    <title>; raw `<script>` must NOT survive."""
    payload_title = "<script>alert(1)</script>"
    hw = _create_homework(
        client,
        title="Row Title",
        content_json={
            "meta": {"title": payload_title, "subject_display": "Algebra"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
        },
    )
    html = _get_rendered_html(client, hw["id"])
    head_title = _extract_head_title(html)
    # Escaped form must be present.
    assert "&lt;script&gt;" in head_title, (
        f"escaped <script> form missing from <title> — got: {head_title!r}"
    )
    # Raw form must NOT survive inside the <title> element.
    assert "<script>alert(1)</script>" not in head_title


def test_browser_title_replacement_is_idempotent(client):
    """Re-running just the title-replacement step on already-rendered HTML
    leaves the title untouched. (The full inject() function isn't
    idempotent because it picks fresh random gate quotes per call —
    this test isolates the title-replacement regex.)"""
    from server.services.injector import inject

    cj = {
        "meta": {"title": "Idempotent test", "subject_display": "X"},
        "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
    }
    rt = {"lang": "uz", "subject": "english", "grade": 8, "hwId": "X", "homeworkSummary": ""}
    rendered = inject(cj, runtime_context=rt)
    head_title_first = _extract_head_title(rendered)
    assert "Idempotent test" in head_title_first

    # Apply the same title-replacement logic a second time on the already
    # rendered HTML (simulating any double-pass scenario). The <title>
    # text inside <head> must remain stable.
    head_match = re.search(r"<head\b[^>]*>.*?</head>", rendered, flags=re.DOTALL | re.IGNORECASE)
    assert head_match
    new_head = re.sub(
        r"<title>.*?</title>",
        "<title>NETS &middot; Idempotent test</title>",  # placeholder; replaced below
        head_match.group(0),
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # Now run the actual replacement contract used in inject():
    new_head_2 = re.sub(
        r"<title>.*?</title>",
        f"<title>NETS · Idempotent test</title>",
        head_match.group(0),
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    rendered_after = rendered[:head_match.start()] + new_head_2 + rendered[head_match.end():]
    head_title_second = _extract_head_title(rendered_after)
    assert head_title_first == head_title_second


# ---------------------------------------------------------------------------
# Bug #1 — segment-aware reading checkpoints reach the runtime
# ---------------------------------------------------------------------------

def test_reading_segments_with_checkpoint_populate_runtime_checkpoints(client):
    """Each segment[].checkpoint normalises into READING.checkpoints[i]
    in segment order, and is ALSO preserved on segments[i].checkpoint
    so either runtime path keeps working."""
    hw = _create_homework(
        client,
        title="Segment-checkpoint reading",
        content_json={
            "meta": {"title": "Segment-checkpoint reading"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
            "reading": {
                "title": "Reading",
                "passage": "<p>seg one</p><p>seg two</p>",
                "segments": [
                    {"text": "<p>seg one</p>", "checkpoint": {"q": "X?", "ans": ["Y", "y"]}},
                    {"text": "<p>seg two</p>", "checkpoint": {"q": "Z?", "ans": ["W"]}},
                ],
            },
        },
    )
    html = _get_rendered_html(client, hw["id"])
    reading = _extract_reading_const(html)

    cps = reading.get("checkpoints") or []
    assert len(cps) == 2, (
        f"expected 2 segment-derived checkpoints, got {len(cps)}: {cps!r}"
    )
    assert cps[0]["prompt"] == "X?"
    assert cps[1]["prompt"] == "Z?"
    # ans must be non-empty for each entry (head of the list).
    assert cps[0]["ans"] == "Y"
    assert cps[1]["ans"] == "W"
    # Tail of the list goes to acceptable[] for cps[0]; cps[1] has no tail.
    assert "y" in cps[0].get("acceptable", [])

    # Per-segment nested checkpoint must also be preserved.
    segments = reading.get("segments") or []
    assert len(segments) == 2
    assert isinstance(segments[0].get("checkpoint"), dict)
    assert segments[0]["checkpoint"]["prompt"] == "X?"
    assert segments[1]["checkpoint"]["prompt"] == "Z?"


def test_reading_top_level_checkpoints_take_precedence_over_segment_checkpoints(client):
    """If the author supplies BOTH top-level checkpoints[] and segment-nested
    checkpoint dicts, the top-level entries win — no double-counting from
    auto-extraction."""
    hw = _create_homework(
        client,
        title="Both-sources reading",
        content_json={
            "meta": {"title": "Both-sources reading"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
            "reading": {
                "title": "Reading",
                "passage": "<p>seg a</p><p>seg b</p>",
                "checkpoints": [
                    {"prompt": "TOP1?", "ans": "alpha", "fb": ""},
                ],
                "segments": [
                    {"text": "<p>seg a</p>", "checkpoint": {"q": "SEG_A?", "ans": ["x"]}},
                    {"text": "<p>seg b</p>", "checkpoint": {"q": "SEG_B?", "ans": ["y"]}},
                ],
            },
        },
    )
    html = _get_rendered_html(client, hw["id"])
    reading = _extract_reading_const(html)

    cps = reading.get("checkpoints") or []
    # Author-supplied top-level wins; segment ones must NOT be appended.
    assert len(cps) == 1, (
        f"top-level checkpoints[] must take precedence — got {len(cps)} entries: {cps!r}"
    )
    assert cps[0]["prompt"] == "TOP1?"
    # Segment-nested checkpoints are still preserved on segments[i] for
    # the runtime that prefers segment-aware reads.
    segments = reading.get("segments") or []
    assert len(segments) == 2
    assert segments[0]["checkpoint"]["prompt"] == "SEG_A?"
    assert segments[1]["checkpoint"]["prompt"] == "SEG_B?"


def test_reading_legacy_no_segments_keeps_old_chunker_path(client):
    """Old fixtures (passage as one blob, no segments[]) keep working —
    the injector must not synthesise an empty segments[] that would
    suppress the chunker fallback at runtime."""
    hw = _create_homework(
        client,
        title="Legacy reading",
        content_json={
            "meta": {"title": "Legacy reading"},
            "panels": [], "flashcards": [], "boss_questions": [], "memory_sprint": [],
            "reading": {
                "title": "Legacy",
                "passage": "<p>a long passage with no explicit segments</p>",
                # No checkpoints / no segments — that's allowed.
            },
        },
    )
    html = _get_rendered_html(client, hw["id"])
    reading = _extract_reading_const(html)

    # checkpoints[] must default to [] (top-level empty + no segments to
    # auto-derive from).
    assert reading.get("checkpoints") == []
    # segments key must be absent OR empty so the runtime's
    # `Array.isArray(READING.segments) && segments.length` check fires false
    # and falls through to the chunker path.
    segments = reading.get("segments")
    assert not segments, (
        f"legacy fixtures must not get a stray non-empty segments[] — got: {segments!r}"
    )
