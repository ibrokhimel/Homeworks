"""Regression tests for MemoryPalaceGame / MemoryPalaceConfig Pydantic schema (T1).

Guards:
  - Valid minimal payload validates green.
  - Palace key uniqueness enforced.
  - Concept id auto-fill (missing id → "mp-c{n}").
  - Concept id uniqueness enforced after auto-fill.
  - Palace locations count 3–7 (too few / too many raise).
  - extra="allow" via _Permissive base passes through unknown fields.
  - MemoryPalaceConfig accepts partial and full and empty payloads.
"""

import pytest
from pydantic import ValidationError

from server.schemas.content import (
    ContentJSON,
    MemoryPalace,
    MemoryPalaceConcept,
    MemoryPalaceConfig,
    MemoryPalaceGame,
    MemoryPalaceLocation,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_location(name: str = "Front door") -> dict:
    return {"name": name, "sensory_cue": "Hear the key.", "icon": None}


def _make_palace(key: str, n_locations: int = 5, tier: str = "basic") -> dict:
    return {
        "key": key,
        "name": f"Palace {key}",
        "icon": "🏠",
        "description": None,
        "subject_family": "universal",
        "tier": tier,
        "locations": [_make_location(f"loc_{i}") for i in range(n_locations)],
    }


def _make_concept(idx: int, include_id: bool = True) -> dict:
    c = {"term": f"Term {idx}", "description": f"Desc {idx}", "image_cue": f"Cue {idx}"}
    if include_id:
        c["id"] = f"mp-c{idx}"
    return c


def _make_game(n_palaces: int = 4, n_concepts: int = 5) -> dict:
    return {
        "palaces": [_make_palace(f"palace_{i}") for i in range(n_palaces)],
        "concepts": [_make_concept(i + 1) for i in range(n_concepts)],
    }


# ---------------------------------------------------------------------------
# Test 1: minimal valid payload validates green
# ---------------------------------------------------------------------------

def test_mp_game_accepts_minimal_valid_payload():
    game = MemoryPalaceGame(**_make_game(n_palaces=4, n_concepts=5))
    assert len(game.palaces) == 4
    assert len(game.concepts) == 5
    # All palace locations count == 5
    for p in game.palaces:
        assert len(p.locations) == 5
    # Concept ids are set
    for idx, c in enumerate(game.concepts):
        assert c.id == f"mp-c{idx + 1}"


# ---------------------------------------------------------------------------
# Test 2: duplicate palace keys must raise ValidationError
# ---------------------------------------------------------------------------

def test_mp_palace_keys_must_be_unique():
    raw = _make_game(n_palaces=2)
    # Force duplicate keys
    raw["palaces"][0]["key"] = "same_key"
    raw["palaces"][1]["key"] = "same_key"
    with pytest.raises(ValidationError) as exc_info:
        MemoryPalaceGame(**raw)
    err = str(exc_info.value).lower()
    assert "unique" in err or "key" in err


# ---------------------------------------------------------------------------
# Test 3: concept ids auto-filled when missing
# ---------------------------------------------------------------------------

def test_mp_concept_ids_auto_filled_when_missing():
    raw = {
        "palaces": [_make_palace(f"p{i}") for i in range(4)],
        "concepts": [_make_concept(i + 1, include_id=False) for i in range(5)],
    }
    game = MemoryPalaceGame(**raw)
    ids = [c.id for c in game.concepts]
    assert ids == ["mp-c1", "mp-c2", "mp-c3", "mp-c4", "mp-c5"], (
        f"Auto-filled ids should be mp-c1..mp-c5, got {ids}"
    )


# ---------------------------------------------------------------------------
# Test 4: pre-supplied colliding concept ids must raise
# ---------------------------------------------------------------------------

def test_mp_concept_ids_must_be_unique_after_autofill():
    raw = {
        "palaces": [_make_palace(f"p{i}") for i in range(4)],
        "concepts": [
            {"id": "mp-c1", "term": "A"},
            {"id": "mp-c1", "term": "B"},  # deliberate collision
        ],
    }
    with pytest.raises(ValidationError) as exc_info:
        MemoryPalaceGame(**raw)
    err = str(exc_info.value).lower()
    assert "unique" in err or "id" in err


# ---------------------------------------------------------------------------
# Test 5: palace locations count 3–7 enforced
# ---------------------------------------------------------------------------

def test_mp_palace_locations_count_in_range_3_to_7():
    # 2 locations → fail
    with pytest.raises(ValidationError) as exc_info:
        MemoryPalaceGame(**{
            "palaces": [_make_palace("p_bad_low", n_locations=2)],
            "concepts": [],
        })
    assert "3" in str(exc_info.value) or "locations" in str(exc_info.value).lower()

    # 8 locations → fail
    with pytest.raises(ValidationError) as exc_info:
        MemoryPalaceGame(**{
            "palaces": [_make_palace("p_bad_high", n_locations=8)],
            "concepts": [],
        })
    assert "7" in str(exc_info.value) or "locations" in str(exc_info.value).lower()

    # 5 locations → pass
    game = MemoryPalaceGame(**{
        "palaces": [_make_palace("p_ok", n_locations=5)],
        "concepts": [],
    })
    assert len(game.palaces[0].locations) == 5

    # Boundary: 3 locations → pass
    game3 = MemoryPalaceGame(**{
        "palaces": [_make_palace("p_ok3", n_locations=3)],
        "concepts": [],
    })
    assert len(game3.palaces[0].locations) == 3

    # Boundary: 7 locations → pass
    game7 = MemoryPalaceGame(**{
        "palaces": [_make_palace("p_ok7", n_locations=7)],
        "concepts": [],
    })
    assert len(game7.palaces[0].locations) == 7


# ---------------------------------------------------------------------------
# Test 6: extra fields allowed (_Permissive base)
# ---------------------------------------------------------------------------

def test_mp_extra_fields_allowed():
    """Undeclared fields on palace, location, concept all pass through."""
    raw = {
        "palaces": [{
            "key": "p0",
            "name": "Test Palace",
            "tier": "basic",
            "locations": [
                {"name": "loc1", "sensory_cue": "smell", "icon": None, "future_field": "xyz"},
                {"name": "loc2", "sensory_cue": "sound", "icon": None},
                {"name": "loc3", "sensory_cue": "touch", "icon": None},
                {"name": "loc4", "sensory_cue": "sight", "icon": None},
                {"name": "loc5", "sensory_cue": "taste", "icon": None},
            ],
            "subject_family": "universal",
            "extra_palace_field": True,
        }],
        "concepts": [
            {"id": "mp-c1", "term": "A", "extra_concept_field": 42},
        ],
        "top_level_extra": "allowed",
    }
    # Should not raise
    game = MemoryPalaceGame(**raw)
    assert len(game.palaces) == 1
    assert len(game.concepts) == 1

    # ContentJSON level also accepts the new field
    content = ContentJSON(gb_memory_palace=raw, gb_memory_palace_config=None)
    assert content.gb_memory_palace is not None


# ---------------------------------------------------------------------------
# Test 7: MemoryPalaceConfig — partial, full, and empty all validate
# ---------------------------------------------------------------------------

def test_mp_config_grade_overrides_optional():
    # Only concept_count provided
    cfg1 = MemoryPalaceConfig(concept_count=5)
    assert cfg1.concept_count == 5
    assert cfg1.min_palace_options is None
    assert cfg1.concept_count_grade_overrides is None

    # Full config
    cfg2 = MemoryPalaceConfig(
        concept_count=5,
        min_palace_options=4,
        enable_reverse_recall=False,
        concept_count_grade_overrides={"low": 3, "high": 7},
    )
    assert cfg2.concept_count_grade_overrides == {"low": 3, "high": 7}

    # Completely empty config (all defaults)
    cfg3 = MemoryPalaceConfig()
    assert cfg3.concept_count is None
    assert cfg3.min_palace_options is None
    assert cfg3.enable_reverse_recall is None
    assert cfg3.concept_count_grade_overrides is None
