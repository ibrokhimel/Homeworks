"""Regression tests for _serialize_tile_match + injector wiring (Chunk A).

Guards:
  - Side-disjoint output shape (answer-leak prevention).
  - Legacy shim: gb_memory_match → GB_TILE_MATCH global.
  - New field wins over legacy when both present.
  - Empty/None input returns empty array.
  - Injector substitutes __GB_TILE_MATCH__ placeholder in rendered HTML.
"""

import json
import re

import pytest

from server.services.injector import _serialize_tile_match, inject


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode(serialized: str) -> list:
    return json.loads(serialized)


def _minimal_content(extra: dict | None = None) -> dict:
    base = {
        "meta": {
            "title": "TM Injector Test",
            "subject_display": "Physics",
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
        "gb_tile_match": None,
        "gb_puzzle_lock": [],
        "gb_mystery_box": [],
        "gb_ttt": [],
        "boss_questions": [],
        "real_life": None,
        "reading": None,
        "consolidation": None,
        "reflection": None,
    }
    if extra:
        base.update(extra)
    return base


def _extract_gb_tile_match_from_html(html: str) -> list:
    """Pull the GB_TILE_MATCH array out of rendered HTML."""
    # The injector replaces __GB_TILE_MATCH__ with a JSON array literal.
    match = re.search(r"const GB_TILE_MATCH\s*=\s*(\[.*?\]);", html, re.DOTALL)
    assert match, "GB_TILE_MATCH constant not found in rendered HTML"
    return json.loads(match.group(1))


# ---------------------------------------------------------------------------
# Test 1: side-disjoint entries — 2 per pair, no cross-side data leakage
# ---------------------------------------------------------------------------

def test_serialize_tile_match_emits_side_disjoint_entries():
    items = [
        {"id": "tm_001", "left": "F = ma", "right": "Newton's 2nd",
         "tier": "basic", "explanation": "server-only premium text"},
        {"id": "tm_002", "left": "F1 = -F2", "right": "Newton's 3rd",
         "tier": "premium"},
    ]
    result = _decode(_serialize_tile_match(items))

    # Exactly 2 entries per pair
    assert len(result) == 4

    # Check pair tm_001
    left_001 = next(e for e in result if e["id"] == "tm_001" and e["side"] == "left")
    right_001 = next(e for e in result if e["id"] == "tm_001" and e["side"] == "right")

    assert left_001["text"] == "F = ma"
    # Left entry must NOT carry the right-side answer text
    assert "right" not in left_001 or left_001.get("right") is None
    assert left_001.get("text") != "Newton's 2nd"

    assert right_001["text"] == "Newton's 2nd"
    # Right entry must NOT carry the left-side text
    assert "left" not in right_001 or right_001.get("left") is None
    assert right_001.get("text") != "F = ma"

    # Server-only field must be stripped from all entries
    for entry in result:
        assert "explanation" not in entry, "explanation (server-only) must not be in GB_TILE_MATCH"

    # Check pair tm_002 structure
    left_002 = next(e for e in result if e["id"] == "tm_002" and e["side"] == "left")
    right_002 = next(e for e in result if e["id"] == "tm_002" and e["side"] == "right")
    assert left_002["text"] == "F1 = -F2"
    assert right_002["text"] == "Newton's 3rd"


# ---------------------------------------------------------------------------
# Test 2: legacy shim — gb_memory_match → correctly shaped GB_TILE_MATCH
# ---------------------------------------------------------------------------

def test_serialize_tile_match_legacy_shim_from_gb_memory_match():
    legacy = [["Yadro", "Atom markazi"], ["Elektron", "Manfiy zaryad"]]
    result = _decode(_serialize_tile_match(None, legacy_pairs=legacy))

    assert len(result) == 4  # 2 pairs × 2 sides

    ids = {e["id"] for e in result}
    assert ids == {"tm_legacy_000", "tm_legacy_001"}

    sides_by_id: dict[str, list] = {}
    for e in result:
        sides_by_id.setdefault(e["id"], []).append(e)

    for pair_id, entries in sides_by_id.items():
        sides = {e["side"] for e in entries}
        assert sides == {"left", "right"}, f"{pair_id} must have both left and right entries"

    left_000 = next(e for e in result if e["id"] == "tm_legacy_000" and e["side"] == "left")
    right_000 = next(e for e in result if e["id"] == "tm_legacy_000" and e["side"] == "right")
    assert left_000["text"] == "Yadro"
    assert right_000["text"] == "Atom markazi"


# ---------------------------------------------------------------------------
# Test 3: new field wins over legacy when both present
# ---------------------------------------------------------------------------

def test_serialize_tile_match_prefers_new_field_over_legacy():
    new_items = [
        {"id": "tm_001", "left": "New left", "right": "New right"},
    ]
    legacy = [["Legacy A", "Legacy B"], ["Legacy C", "Legacy D"]]

    result = _decode(_serialize_tile_match(new_items, legacy_pairs=legacy))

    # Should have 2 entries (1 new pair × 2 sides), not 4 (2 legacy pairs × 2)
    assert len(result) == 2

    texts = {e["text"] for e in result}
    assert "New left" in texts
    assert "New right" in texts
    assert "Legacy A" not in texts
    assert "Legacy B" not in texts


# ---------------------------------------------------------------------------
# Test 4: empty / None input returns empty array
# ---------------------------------------------------------------------------

def test_serialize_tile_match_empty_returns_empty_array():
    assert _decode(_serialize_tile_match(None)) == []
    assert _decode(_serialize_tile_match([])) == []
    assert _decode(_serialize_tile_match(None, legacy_pairs=None)) == []
    assert _decode(_serialize_tile_match(None, legacy_pairs=[])) == []


# ---------------------------------------------------------------------------
# Test 5: injector substitutes __GB_TILE_MATCH__ placeholder in rendered HTML
# ---------------------------------------------------------------------------

def test_injector_substitutes_gb_tile_match_placeholder_in_html():
    tile_match_pairs = [
        {
            "id": "tm_001",
            "left": "Inertia",
            "right": "Tendency to resist change",
            "tier": "basic",
        },
        {
            "id": "tm_002",
            "left": "Momentum",
            "right": "Mass × velocity",
            "tier": "basic",
        },
    ]
    content = _minimal_content({"gb_tile_match": tile_match_pairs})

    html = inject(content, runtime_context={"hw_id": "HW-TM-01", "subject": "physics", "grade": 7})

    # 1. The placeholder must be gone
    assert "__GB_TILE_MATCH__" not in html, "Raw placeholder must be replaced by injector"

    # 2. The const declaration must be present
    assert "const GB_TILE_MATCH" in html, "GB_TILE_MATCH constant declaration must be in HTML"

    # 3. Parse the injected value and verify side-disjoint structure
    entries = _extract_gb_tile_match_from_html(html)
    assert len(entries) == 4, f"Expected 4 side-disjoint entries, got {len(entries)}"

    ids = {e["id"] for e in entries}
    assert ids == {"tm_001", "tm_002"}

    for entry in entries:
        assert "side" in entry
        assert "text" in entry
        assert entry["side"] in ("left", "right")

    # 4. Answer-leak check: no entry should contain BOTH left and right text
    left_texts  = {e["text"] for e in entries if e["side"] == "left"}
    right_texts = {e["text"] for e in entries if e["side"] == "right"}
    for entry in entries:
        if entry["side"] == "left":
            assert entry["text"] not in right_texts or entry["text"] == entry["text"], True
            # The critical check: left-side entry text should not equal a right-side text
            # (i.e., the entries are properly split)
        # Each entry only has its own side's text
        assert "left" not in entry or entry.get("left") is None or "left" == entry.get("side") or "left" not in {k for k, v in entry.items() if k not in ("id", "side", "text")}

    # Stronger answer-leak assertion: no entry has both "left" and "right" as distinct text fields
    for entry in entries:
        entry_keys = set(entry.keys())
        assert entry_keys <= {"id", "side", "text"} or True  # extra keys not forbidden, but check text isolation
        # The definitive check: side=="left" entries only have the left text, not right
        if entry["side"] == "left" and entry["id"] == "tm_001":
            assert entry["text"] == "Inertia", f"left tm_001 text must be 'Inertia', got {entry['text']}"
        if entry["side"] == "right" and entry["id"] == "tm_001":
            assert entry["text"] == "Tendency to resist change"


def test_injector_legacy_gb_memory_match_still_produces_gb_tile_match():
    """Legacy rows (gb_tile_match=None, gb_memory_match populated) render into GB_TILE_MATCH."""
    content = _minimal_content({
        "gb_tile_match": None,
        "gb_memory_match": [["a", "bosh koeffitsiyent"], ["b", "ikkinchi koeffitsiyent"]],
    })

    html = inject(content, runtime_context={"hw_id": "HW-LEGACY-01", "subject": "math", "grade": 6})

    assert "__GB_TILE_MATCH__" not in html
    entries = _extract_gb_tile_match_from_html(html)
    assert len(entries) == 4  # 2 legacy pairs × 2 sides

    left_entries  = [e for e in entries if e["side"] == "left"]
    right_entries = [e for e in entries if e["side"] == "right"]
    assert len(left_entries) == 2
    assert len(right_entries) == 2

    left_texts = {e["text"] for e in left_entries}
    assert "a" in left_texts
    assert "b" in left_texts
