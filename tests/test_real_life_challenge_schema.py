"""Regression tests for the RealLifeChallengeCase Pydantic schema (Chunk A).

Pins:
- Minimal valid case (5 correctly-ordered steps) passes validation.
- Exactly 5 steps required — 4 steps raises ValidationError.
- Step order is locked: wrong order raises ValidationError.
- Decision steps require ≥2 options.
- Decision steps require exactly 1 correct option (0 or 2+ → ValidationError).
- Concept-select step requires ≥3 chips.
- Concept-select step requires exactly 1 correct chip.
- Reasoning step min_chars defaults to 80 when not set.
- Reasoning step min_chars out of range [20, 1000] → ValidationError.
- creative_thinking variant requires tier=premium.
- memory_palace_location requires tier=premium.
- extra="allow" on all nested models for forward-compat.
- Legacy real_life field coexists with real_life_challenge on ContentJSON.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from server.schemas.content import (
    ContentJSON,
    RealLifeChallengeCase,
    RLCConceptChip,
    RLCDecisionOption,
    RLCStep,
)


# ---------------------------------------------------------------------------
# Helpers: builders for minimal valid case structures
# ---------------------------------------------------------------------------

def _two_opts(correct_idx: int = 0) -> list[dict]:
    """Two options, one correct at correct_idx."""
    opts = [
        {"id": "a", "label": "Option A", "is_correct": False},
        {"id": "b", "label": "Option B", "is_correct": False},
    ]
    opts[correct_idx]["is_correct"] = True
    return opts


def _three_chips(correct_idx: int = 0) -> list[dict]:
    """Three chips, one correct."""
    chips = [
        {"id": "c1", "label": "Chip 1", "is_correct": False},
        {"id": "c2", "label": "Chip 2", "is_correct": False},
        {"id": "c3", "label": "Chip 3", "is_correct": False},
    ]
    chips[correct_idx]["is_correct"] = True
    return chips


def _valid_steps() -> list[dict]:
    """Minimal 5 steps in the required order."""
    return [
        {
            "id": "step1", "kind": "decision",
            "title": "Step 1", "prompt": "Make a decision.",
            "options": _two_opts(0),
        },
        {
            "id": "step2", "kind": "info_request",
            "title": "Step 2", "prompt": "Request info.",
            "options": _two_opts(1),
        },
        {
            "id": "step3", "kind": "final_decision",
            "title": "Step 3", "prompt": "Final decision.",
            "options": _two_opts(0),
        },
        {
            "id": "step4", "kind": "concept_select",
            "title": "Step 4", "prompt": "Select a concept.",
            "concept_chips": _three_chips(2),
        },
        {
            "id": "step5", "kind": "reasoning",
            "title": "Step 5", "prompt": "Explain your reasoning.",
        },
    ]


def _valid_case(**overrides) -> dict:
    base = {
        "id": "rlc_001",
        "expert_role": "fire_inspector",
        "title": "Factory Fire Risk Assessment",
        "intro": "A factory has reported multiple fire hazards. You are the inspector.",
        "steps": _valid_steps(),
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Test 1: valid minimal round-trip
# ---------------------------------------------------------------------------

def test_rlc_case_valid_minimal_round_trip():
    """Minimal valid case (5 correctly-ordered steps) survives schema validation."""
    case = RealLifeChallengeCase(**_valid_case())
    assert case.id == "rlc_001"
    assert case.expert_role == "fire_inspector"
    assert len(case.steps) == 5
    assert [s.kind for s in case.steps] == [
        "decision", "info_request", "final_decision", "concept_select", "reasoning"
    ]


# ---------------------------------------------------------------------------
# Test 2: exactly 5 steps required
# ---------------------------------------------------------------------------

def test_rlc_case_requires_exactly_5_steps():
    """4 steps raises ValidationError."""
    steps = _valid_steps()[:4]
    with pytest.raises(ValidationError, match="exactly 5 steps"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 3: step order is locked
# ---------------------------------------------------------------------------

def test_rlc_case_requires_correct_step_order():
    """Wrong step order raises ValidationError."""
    steps = _valid_steps()
    # Swap step1 (decision) and step2 (info_request) — wrong order
    steps[0], steps[1] = steps[1], steps[0]
    with pytest.raises(ValidationError, match="step order must be"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 4: decision steps require ≥2 options
# ---------------------------------------------------------------------------

def test_rlc_decision_step_requires_at_least_2_options():
    """1 option on a decision step raises ValidationError."""
    steps = _valid_steps()
    steps[0]["options"] = [{"id": "a", "label": "Only Option", "is_correct": True}]
    with pytest.raises(ValidationError, match="≥2 options"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 5a: exactly 1 correct option (0 correct → error)
# ---------------------------------------------------------------------------

def test_rlc_decision_step_requires_exactly_1_correct_option_zero():
    """0 correct options on a decision step raises ValidationError."""
    steps = _valid_steps()
    steps[0]["options"] = [
        {"id": "a", "label": "A", "is_correct": False},
        {"id": "b", "label": "B", "is_correct": False},
    ]
    with pytest.raises(ValidationError, match="exactly 1 correct option"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 5b: exactly 1 correct option (2+ correct → error)
# ---------------------------------------------------------------------------

def test_rlc_decision_step_requires_exactly_1_correct_option_two():
    """2 correct options on a decision step raises ValidationError."""
    steps = _valid_steps()
    steps[0]["options"] = [
        {"id": "a", "label": "A", "is_correct": True},
        {"id": "b", "label": "B", "is_correct": True},
    ]
    with pytest.raises(ValidationError, match="exactly 1 correct option"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 6: concept-select requires ≥3 chips
# ---------------------------------------------------------------------------

def test_rlc_concept_select_requires_at_least_3_chips():
    """2 chips on concept_select raises ValidationError."""
    steps = _valid_steps()
    steps[3]["concept_chips"] = [
        {"id": "c1", "label": "Chip 1", "is_correct": True},
        {"id": "c2", "label": "Chip 2", "is_correct": False},
    ]
    with pytest.raises(ValidationError, match="≥3 chips"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 7a: concept-select requires exactly 1 correct chip (0 → error)
# ---------------------------------------------------------------------------

def test_rlc_concept_select_requires_exactly_1_correct_chip_zero():
    """0 correct chips on concept_select raises ValidationError."""
    steps = _valid_steps()
    steps[3]["concept_chips"] = [
        {"id": "c1", "label": "Chip 1", "is_correct": False},
        {"id": "c2", "label": "Chip 2", "is_correct": False},
        {"id": "c3", "label": "Chip 3", "is_correct": False},
    ]
    with pytest.raises(ValidationError, match="exactly 1 correct chip"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 7b: concept-select requires exactly 1 correct chip (2+ → error)
# ---------------------------------------------------------------------------

def test_rlc_concept_select_requires_exactly_1_correct_chip_two():
    """2 correct chips on concept_select raises ValidationError."""
    steps = _valid_steps()
    steps[3]["concept_chips"] = [
        {"id": "c1", "label": "Chip 1", "is_correct": True},
        {"id": "c2", "label": "Chip 2", "is_correct": True},
        {"id": "c3", "label": "Chip 3", "is_correct": False},
    ]
    with pytest.raises(ValidationError, match="exactly 1 correct chip"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 8: reasoning min_chars defaults to 80
# ---------------------------------------------------------------------------

def test_rlc_reasoning_min_chars_defaults_to_80():
    """Reasoning step without explicit min_chars gets default of 80 after validation."""
    case = RealLifeChallengeCase(**_valid_case())
    reasoning = next(s for s in case.steps if s.kind == "reasoning")
    assert reasoning.min_chars == 80


# ---------------------------------------------------------------------------
# Test 9a: reasoning min_chars too low (< 20)
# ---------------------------------------------------------------------------

def test_rlc_reasoning_min_chars_out_of_range_low():
    """min_chars=10 raises ValidationError (below minimum 20)."""
    steps = _valid_steps()
    steps[4]["min_chars"] = 10
    with pytest.raises(ValidationError, match="min_chars must be in \\[20, 1000\\]"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 9b: reasoning min_chars too high (> 1000)
# ---------------------------------------------------------------------------

def test_rlc_reasoning_min_chars_out_of_range_high():
    """min_chars=1500 raises ValidationError (above maximum 1000)."""
    steps = _valid_steps()
    steps[4]["min_chars"] = 1500
    with pytest.raises(ValidationError, match="min_chars must be in \\[20, 1000\\]"):
        RealLifeChallengeCase(**_valid_case(steps=steps))


# ---------------------------------------------------------------------------
# Test 10: creative_thinking variant requires premium tier
# ---------------------------------------------------------------------------

def test_rlc_creative_thinking_variant_requires_premium_tier():
    """variant=creative_thinking + tier=basic raises ValidationError."""
    with pytest.raises(ValidationError, match="premium-only"):
        RealLifeChallengeCase(**_valid_case(variant="creative_thinking", tier="basic"))


# ---------------------------------------------------------------------------
# Test 11: memory_palace_location requires premium tier
# ---------------------------------------------------------------------------

def test_rlc_memory_palace_requires_premium_tier():
    """memory_palace_location set + tier=basic raises ValidationError."""
    with pytest.raises(ValidationError, match="premium-only"):
        RealLifeChallengeCase(**_valid_case(
            memory_palace_location="Library Room 3",
            tier="basic",
        ))


# ---------------------------------------------------------------------------
# Test 12: extra="allow" on all nested models
# ---------------------------------------------------------------------------

def test_rlc_extra_fields_allowed_for_forward_compat():
    """Extra fields on all nested models are silently accepted (forward-compat)."""
    steps = _valid_steps()
    # Add extra fields at every nesting level
    steps[0]["future_field"] = "top-level step extra"
    steps[0]["options"][0]["future_option_field"] = "extra on option"
    steps[3]["concept_chips"][0]["future_chip_field"] = "extra on chip"
    steps[4]["future_reasoning_field"] = "extra on reasoning step"
    case_data = _valid_case(
        steps=steps,
        stakeholders=[{"id": "s1", "name": "Ali", "role": "bozorchi", "future_stakeholder_field": "x"}],
        consequences=[{"label": "Good", "impact": "positive", "future_consequence_field": "y"}],
        top_level_extra="extra on case",
    )
    case = RealLifeChallengeCase(**case_data)
    assert case.id == "rlc_001"


# ---------------------------------------------------------------------------
# Test 13: legacy real_life field coexists with real_life_challenge
# ---------------------------------------------------------------------------

def test_rlc_legacy_real_life_field_still_accepted_alongside_rlc():
    """Both real_life and real_life_challenge set on ContentJSON validates OK."""
    data = {
        "real_life": {
            "badge": "TEST",
            "story": "A legacy story.",
            "q1": {"prompt": "Question?", "ans": "ok", "fb": "OK"},
        },
        "real_life_challenge": _valid_case(),
    }
    content = ContentJSON(**data)
    assert content.real_life is not None
    assert content.real_life_challenge is not None
    assert content.real_life_challenge.id == "rlc_001"
