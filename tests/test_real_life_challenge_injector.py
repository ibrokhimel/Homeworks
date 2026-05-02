"""Regression tests for the RLC injector helpers (Chunk A).

Pins:
- _serialize_real_life_challenge strips is_correct from options.
- _serialize_real_life_challenge strips consequence from options.
- _serialize_real_life_challenge strips is_correct from concept_chips.
- _serialize_real_life_challenge strips acceptable_keywords from steps.
- Student-visible fields (id, label, prompt, title, expert_role) preserved.
- case=None emits the JSON literal "null".
- Output escapes </script> injection vectors (_safe_js_json contract).
- inject() substitutes __RLC_CASE__ placeholder in rendered HTML.
- Legacy RL_SCENARIO path still works when real_life_challenge=None.
- No cross-contamination between legacy RL_SCENARIO and new RLC_CASE.
"""
from __future__ import annotations

import json
import re

import pytest

from server.services.injector import _serialize_real_life_challenge, inject


# ---------------------------------------------------------------------------
# Shared helpers / fixtures
# ---------------------------------------------------------------------------

def _two_opts() -> list[dict]:
    return [
        {"id": "a", "label": "Option A", "is_correct": True,  "consequence": "Fire spreads"},
        {"id": "b", "label": "Option B", "is_correct": False, "consequence": "All safe"},
    ]


def _three_chips() -> list[dict]:
    return [
        {"id": "c1", "label": "Chip 1", "is_correct": True},
        {"id": "c2", "label": "Chip 2", "is_correct": False},
        {"id": "c3", "label": "Chip 3", "is_correct": False},
    ]


def _valid_case_dict() -> dict:
    """Minimal valid RLC case as a plain dict (simulates content_json.get(...))."""
    return {
        "id": "rlc_001",
        "expert_role": "fire_inspector",
        "title": "Factory Fire Risk",
        "intro": "Assess the risk scenario.",
        "pisa_level": "L4",
        "tier": "basic",
        "grade_band": "g7_9",
        "variant": "standard",
        "steps": [
            {
                "id": "step1", "kind": "decision",
                "title": "Step 1", "prompt": "Make a decision.",
                "options": _two_opts(),
            },
            {
                "id": "step2", "kind": "info_request",
                "title": "Step 2", "prompt": "Request info.",
                "options": _two_opts(),
            },
            {
                "id": "step3", "kind": "final_decision",
                "title": "Step 3", "prompt": "Final decision.",
                "options": _two_opts(),
            },
            {
                "id": "step4", "kind": "concept_select",
                "title": "Step 4", "prompt": "Select a concept.",
                "concept_chips": _three_chips(),
            },
            {
                "id": "step5", "kind": "reasoning",
                "title": "Step 5", "prompt": "Explain your reasoning.",
                "acceptable_keywords": ["fire", "risk", "hazard"],
            },
        ],
    }


def _parse(case_dict_or_none) -> dict | None:
    """Call _serialize_real_life_challenge and JSON-parse the result."""
    raw = _serialize_real_life_challenge(case_dict_or_none)
    return json.loads(raw)


def _minimal_content_json(**overrides) -> dict:
    """Minimal content_json for inject() that won't crash on missing keys."""
    base = {
        "meta": {"title": "T", "subject_display": "Math", "section": "1", "cefr_level": ""},
        "panels": [],
        "quotes": [],
        "flashcards": [],
        "memory_sprint": [],
        "boss_questions": [],
        "gb_adaptive_quiz": [],
        "gb_why_chain": [],
        "gb_memory_match": [],
        "gb_puzzle_lock": [],
        "gb_mystery_box": [],
        "gb_ttt": [],
        "gb_sentence_fill": [],
        "gb_tile_match": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Test 1: strips is_correct from options
# ---------------------------------------------------------------------------

def test_serialize_rlc_strips_is_correct_from_options():
    """Serialized output has zero is_correct keys anywhere in any option."""
    result = _parse(_valid_case_dict())
    assert result is not None
    raw_str = json.dumps(result)
    # No is_correct key should appear anywhere in the output
    assert '"is_correct"' not in raw_str, (
        "is_correct must be stripped from all options in RLC_CASE output"
    )


# ---------------------------------------------------------------------------
# Test 2: strips consequence from options
# ---------------------------------------------------------------------------

def test_serialize_rlc_strips_consequence_from_options():
    """Serialized output has zero consequence keys anywhere in any option."""
    result = _parse(_valid_case_dict())
    raw_str = json.dumps(result)
    assert '"consequence"' not in raw_str, (
        "consequence must be stripped from all options in RLC_CASE output"
    )


# ---------------------------------------------------------------------------
# Test 3: strips is_correct from concept_chips
# ---------------------------------------------------------------------------

def test_serialize_rlc_strips_is_correct_from_concept_chips():
    """Serialized output has zero is_correct keys in concept_chips."""
    result = _parse(_valid_case_dict())
    raw_str = json.dumps(result)
    # Redundant with test 1 but explicitly tests the concept_chips path
    concept_step = next(s for s in result["steps"] if s["kind"] == "concept_select")
    for chip in concept_step["concept_chips"]:
        assert "is_correct" not in chip, (
            f"is_correct leaked into chip {chip['id']}"
        )


# ---------------------------------------------------------------------------
# Test 4: strips acceptable_keywords from steps
# ---------------------------------------------------------------------------

def test_serialize_rlc_strips_acceptable_keywords_from_steps():
    """Serialized output has zero acceptable_keywords keys in any step."""
    result = _parse(_valid_case_dict())
    for step in result["steps"]:
        assert "acceptable_keywords" not in step, (
            f"acceptable_keywords leaked into step {step['id']}"
        )


# ---------------------------------------------------------------------------
# Test 5: preserves student-visible fields
# ---------------------------------------------------------------------------

def test_serialize_rlc_preserves_student_visible_fields():
    """id, label, prompt, title, expert_role, kind are all present in output."""
    result = _parse(_valid_case_dict())
    assert result["id"] == "rlc_001"
    assert result["expert_role"] == "fire_inspector"
    assert result["title"] == "Factory Fire Risk"
    assert result["intro"] == "Assess the risk scenario."

    decision_step = result["steps"][0]
    assert decision_step["id"] == "step1"
    assert decision_step["kind"] == "decision"
    assert decision_step["title"] == "Step 1"
    assert decision_step["prompt"] == "Make a decision."

    # Option labels must be preserved
    opts = decision_step["options"]
    labels = {o["label"] for o in opts}
    assert "Option A" in labels
    assert "Option B" in labels

    # Chip labels must be preserved
    concept_step = result["steps"][3]
    chip_labels = {c["label"] for c in concept_step["concept_chips"]}
    assert "Chip 1" in chip_labels


# ---------------------------------------------------------------------------
# Test 6: case=None emits null literal
# ---------------------------------------------------------------------------

def test_serialize_rlc_none_emits_null_literal():
    """case=None → output is the JSON string 'null' so RLC_CASE = null in JS."""
    raw = _serialize_real_life_challenge(None)
    assert raw == "null", f"expected 'null', got {raw!r}"


# ---------------------------------------------------------------------------
# Test 7: uses _safe_js_json (escapes </script> injection)
# ---------------------------------------------------------------------------

def test_serialize_rlc_uses_safe_js_json():
    """Output escapes </script> so it cannot break out of a <script> tag."""
    case = _valid_case_dict()
    # Inject a malicious label
    case["steps"][0]["options"][0]["label"] = "Hack </script><script>alert(1)</script>"
    raw = _serialize_real_life_challenge(case)
    # _safe_js_json replaces </ with <\/
    assert "</script>" not in raw, (
        "</script> literal must not appear in serialized RLC output; "
        "_safe_js_json should have escaped it"
    )
    assert "<\\/script>" in raw or "\\/" in raw, (
        "Expected escaped <\\/ sequence in output"
    )


# ---------------------------------------------------------------------------
# Test 8: inject() substitutes __RLC_CASE__ placeholder
# ---------------------------------------------------------------------------

def test_injector_substitutes_rlc_case_placeholder_in_html():
    """Rendering a homework with RLC data:
    - produces const RLC_CASE = {...} in the output HTML
    - does NOT leave __RLC_CASE__ literal anywhere
    """
    cj = _minimal_content_json(real_life_challenge=_valid_case_dict())
    html = inject(cj, runtime_context={"subject": "math", "grade": 8})

    assert "__RLC_CASE__" not in html, (
        "__RLC_CASE__ placeholder was not substituted by inject()"
    )
    assert re.search(r"const RLC_CASE\s*=\s*\{", html), (
        "Expected 'const RLC_CASE = {...}' in rendered HTML"
    )
    # Confirm answer leak prevention at the rendered-HTML level
    assert '"is_correct"' not in html or _is_only_in_rl_scenario(html), (
        "is_correct leaked into rendered RLC_CASE JS global"
    )


def _is_only_in_rl_scenario(html: str) -> bool:
    """
    Check if any 'is_correct' occurrence in html is only within the legacy
    RL_SCENARIO block, not within the RLC_CASE block.
    This is a conservative helper used only when is_correct appears at all.
    In practice, our fixture has no legacy real_life, so this should not be needed.
    """
    # If there's no RLC data, is_correct being present is a leak
    rlc_match = re.search(r"const RLC_CASE\s*=\s*(\{.*?\});", html, re.DOTALL)
    if not rlc_match:
        return False
    rlc_block = rlc_match.group(1)
    return '"is_correct"' not in rlc_block


# ---------------------------------------------------------------------------
# Test 9: legacy RL_SCENARIO path still works
# ---------------------------------------------------------------------------

def test_injector_legacy_rl_scenario_path_still_works():
    """Legacy real_life content (no real_life_challenge) still produces a
    non-empty RL_SCENARIO global AND RLC_CASE = null."""
    legacy_rl = {
        "badge": "LEGACY TEST",
        "story": "A legacy story for testing.",
        "q1": {"prompt": "What is 2+2?", "ans": "4", "fb": "Correct."},
        "endTitle": "Done",
        "endSub": "Legacy phase complete.",
    }
    cj = _minimal_content_json(real_life=legacy_rl)
    html = inject(cj, runtime_context={"subject": "math", "grade": 8})

    # Legacy RL_SCENARIO must be populated (not the fallback empty badge)
    assert re.search(r"const RL_SCENARIO\s*=\s*\{", html), (
        "RL_SCENARIO must be a non-empty object in rendered HTML"
    )
    assert "LEGACY TEST" in html, (
        "Legacy badge text must appear in RL_SCENARIO output"
    )

    # New RLC_CASE must be null (no real_life_challenge set)
    assert re.search(r"const RLC_CASE\s*=\s*null\s*;", html), (
        "RLC_CASE must be null when no real_life_challenge is present"
    )

    # __RLC_CASE__ placeholder must be gone
    assert "__RLC_CASE__" not in html


# ---------------------------------------------------------------------------
# Test 10: no cross-contamination
# ---------------------------------------------------------------------------

def test_injector_no_cross_contamination_between_legacy_and_new():
    """Populating ONLY real_life_challenge:
    - RLC_CASE must be non-null JSON
    - Legacy RL_SCENARIO may be the fallback placeholder (no user data)
    - No bleed-over between the two globals
    """
    cj = _minimal_content_json(real_life_challenge=_valid_case_dict())
    html = inject(cj, runtime_context={"subject": "math", "grade": 8})

    # RLC_CASE must be populated
    assert re.search(r"const RLC_CASE\s*=\s*\{", html), (
        "RLC_CASE must be a non-empty object when real_life_challenge is set"
    )

    # RLC data must not bleed into RL_SCENARIO string
    # RL_SCENARIO will be the fallback placeholder (no real_life key set)
    assert "__RLC_CASE__" not in html, (
        "__RLC_CASE__ placeholder must be fully substituted"
    )

    # Verify the RLC_CASE actually contains our case id
    assert '"rlc_001"' in html, (
        "RLC case id rlc_001 must appear in rendered output"
    )

    # Answer-leak guard on full HTML: no server-only keys in script output
    # (is_correct, consequence, acceptable_keywords).
    # RLC_CASE appears AFTER RL_SCENARIO in the template (RL_SCENARIO at ~12109,
    # RLC_CASE inserted right after it).
    rl_start = html.find("const RL_SCENARIO")
    rlc_start = html.find("const RLC_CASE")
    # Both must exist
    assert rl_start != -1, "const RL_SCENARIO must be present in rendered HTML"
    assert rlc_start != -1, "const RLC_CASE must be present in rendered HTML"
    # RLC_CASE appears after RL_SCENARIO in the template order
    assert rlc_start > rl_start, (
        "RLC_CASE should appear after RL_SCENARIO in template (inserted after line 12172)"
    )
    # Extract text from RLC_CASE up to the next const statement as a proxy block
    stage6_state_start = html.find("const stage6State", rlc_start)
    rlc_block_approx = html[rlc_start:stage6_state_start]
    assert '"is_correct"' not in rlc_block_approx, (
        "is_correct must not appear in the RLC_CASE JS global"
    )
    assert '"consequence"' not in rlc_block_approx, (
        "consequence must not appear in the RLC_CASE JS global"
    )
    assert '"acceptable_keywords"' not in rlc_block_approx, (
        "acceptable_keywords must not appear in the RLC_CASE JS global"
    )
