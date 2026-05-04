"""Regression tests for _serialize_memory_palace + injector wiring (T1).

Guards:
  - Round-trip shape: {palaces, concepts, config}.
  - Grade-band slicing: G1-4 → 3 concepts, default → 5, G8-11+premium → 7.
  - Tier filter: premium palaces hidden when hw_tier == "basic".
  - Auto-fill of missing concept.id values.
  - Null output when game is absent or palaces are empty.
  - Injector substitutes __GB_MEMORY_PALACE__ placeholder in rendered HTML.
"""

import json
import re

import pytest

from server.services.injector import _serialize_memory_palace, inject


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode(serialized: str):
    return json.loads(serialized)


def _make_palace(key: str, tier: str = "basic", n_locations: int = 5) -> dict:
    return {
        "key": key,
        "name": f"Palace {key}",
        "icon": None,
        "description": None,
        "subject_family": "universal",
        "tier": tier,
        "locations": [
            {"name": f"Location {i+1}", "sensory_cue": f"Cue {i+1}", "icon": None}
            for i in range(n_locations)
        ],
    }


def _make_concept(idx: int, with_id: bool = True) -> dict:
    c = {"term": f"Concept {idx}", "description": f"Desc {idx}", "image_cue": f"Cue {idx}"}
    if with_id:
        c["id"] = f"mp-c{idx}"
    return c


def _make_game(n_palaces: int = 4, n_concepts: int = 7, with_ids: bool = True) -> dict:
    return {
        "palaces": [_make_palace(f"palace_{i}", "basic") for i in range(n_palaces)],
        "concepts": [_make_concept(i + 1, with_ids) for i in range(n_concepts)],
    }


def _minimal_content(extra: dict | None = None) -> dict:
    base = {
        "meta": {
            "title": "MP Injector Test",
            "subject_display": "Biology",
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


def _extract_gb_mp_from_html(html: str):
    """Extract GB_MEMORY_PALACE value from rendered HTML. Returns None if null."""
    match = re.search(r"const GB_MEMORY_PALACE\s*=\s*(null|\{.*?\});", html, re.DOTALL)
    assert match, "GB_MEMORY_PALACE constant not found in rendered HTML"
    raw = match.group(1)
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Test 1: round-trip — minimal valid game (4 palaces × 5 locations + 5 concepts)
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_round_trip():
    game = _make_game(n_palaces=4, n_concepts=5)
    result = _decode(_serialize_memory_palace(game, None, grade=6, tier="basic"))

    assert isinstance(result, dict), "Output must be a dict"
    assert "palaces" in result
    assert "concepts" in result
    assert "config" in result

    assert len(result["palaces"]) == 4
    assert len(result["concepts"]) == 5

    # Each palace has correct structure
    p = result["palaces"][0]
    assert "key" in p
    assert "name" in p
    assert "locations" in p
    assert len(p["locations"]) == 5

    # Each concept has correct structure
    c = result["concepts"][0]
    assert "id" in c
    assert "term" in c

    # Config has the three expected keys
    cfg = result["config"]
    assert "concept_count" in cfg
    assert "min_palace_options" in cfg
    assert "enable_reverse_recall" in cfg
    assert cfg["concept_count"] == 5


# ---------------------------------------------------------------------------
# Test 2: grade 1-4 → slice to 3 concepts
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_grade_low_slices_to_three_concepts():
    game = _make_game(n_palaces=4, n_concepts=5)
    result = _decode(_serialize_memory_palace(game, None, grade=3, tier="basic"))
    assert len(result["concepts"]) == 3, (
        f"Grade 3 should get 3 concepts (low override), got {len(result['concepts'])}"
    )
    assert result["config"]["concept_count"] == 3


# ---------------------------------------------------------------------------
# Test 3: grade 8-11 + tier=premium → 7 concepts
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_grade_high_premium_slices_to_seven():
    game = _make_game(n_palaces=4, n_concepts=7)
    result = _decode(_serialize_memory_palace(game, None, grade=10, tier="premium"))
    assert len(result["concepts"]) == 7, (
        f"Grade 10 premium should get 7 concepts (high override), got {len(result['concepts'])}"
    )
    assert result["config"]["concept_count"] == 7


# ---------------------------------------------------------------------------
# Test 4: grade 8-11 + tier=basic → stays at 5 (default, not high override)
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_grade_high_basic_stays_at_default():
    game = _make_game(n_palaces=4, n_concepts=7)
    result = _decode(_serialize_memory_palace(game, None, grade=10, tier="basic"))
    assert len(result["concepts"]) == 5, (
        f"Grade 10 basic should get 5 concepts (no high override), got {len(result['concepts'])}"
    )
    assert result["config"]["concept_count"] == 5


# ---------------------------------------------------------------------------
# Test 5: premium palaces filtered for basic-tier homework
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_filters_premium_palaces_for_basic_tier():
    game = {
        "palaces": [
            _make_palace("basic_1", tier="basic"),
            _make_palace("basic_2", tier="basic"),
            _make_palace("basic_3", tier="basic"),
            _make_palace("premium_1", tier="premium"),
            _make_palace("premium_2", tier="premium"),
        ],
        "concepts": [_make_concept(i + 1) for i in range(5)],
    }
    result = _decode(_serialize_memory_palace(game, None, grade=6, tier="basic"))
    assert len(result["palaces"]) == 3, (
        f"basic tier should see only 3 basic palaces, got {len(result['palaces'])}"
    )
    keys = {p["key"] for p in result["palaces"]}
    assert keys == {"basic_1", "basic_2", "basic_3"}
    assert "premium_1" not in keys
    assert "premium_2" not in keys


# ---------------------------------------------------------------------------
# Test 6: auto-fill concept ids when missing
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_auto_fills_concept_ids():
    game = {
        "palaces": [_make_palace(f"p{i}") for i in range(4)],
        "concepts": [_make_concept(i + 1, with_id=False) for i in range(5)],
    }
    result = _decode(_serialize_memory_palace(game, None, grade=6, tier="basic"))
    ids = [c["id"] for c in result["concepts"]]
    assert ids == ["mp-c1", "mp-c2", "mp-c3", "mp-c4", "mp-c5"], (
        f"Missing concept ids should be auto-filled as mp-c1..mp-c5, got {ids}"
    )


# ---------------------------------------------------------------------------
# Test 7: returns null when game is empty or absent
# ---------------------------------------------------------------------------

def test_serialize_memory_palace_returns_null_when_empty():
    # None game
    assert _decode(_serialize_memory_palace(None, None, grade=6, tier="basic")) is None

    # Empty game (no palaces)
    assert _decode(_serialize_memory_palace({}, None, grade=6, tier="basic")) is None

    # Game with empty palaces list
    assert _decode(
        _serialize_memory_palace({"palaces": [], "concepts": []}, None, grade=6, tier="basic")
    ) is None


# ---------------------------------------------------------------------------
# Test 8: full inject() substitutes __GB_MEMORY_PALACE__ in template
# ---------------------------------------------------------------------------

def test_inject_substitutes_gb_memory_palace_placeholder_in_html():
    game = _make_game(n_palaces=4, n_concepts=5)
    content = _minimal_content({
        "gb_memory_palace": game,
        "gb_memory_palace_config": None,
    })

    html = inject(
        content,
        runtime_context={"hw_id": "HW-MP-01", "subject": "biology", "grade": 7, "tier": "basic"},
    )

    # 1. Raw placeholder must be gone
    assert "__GB_MEMORY_PALACE__" not in html, "Raw placeholder must be replaced by injector"

    # 2. Const declaration must exist
    assert "const GB_MEMORY_PALACE = " in html, "GB_MEMORY_PALACE declaration must be in HTML"

    # 3. Parse and verify basic shape
    data = _extract_gb_mp_from_html(html)
    assert data is not None, "GB_MEMORY_PALACE must be non-null for a valid payload"
    assert "palaces" in data
    assert "concepts" in data
    assert "config" in data
    assert len(data["palaces"]) == 4
    assert len(data["concepts"]) == 5
