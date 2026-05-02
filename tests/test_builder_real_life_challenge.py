"""
Regression tests for the Real-Life Challenge (RLC) builder editor's pure
helper functions.

Helpers live at `frontend/js/editors/_real-life-challenge-helpers.js` and are
exported on both `window.RLCHelpers` (browser) and `module.exports` (Node), so
we can drive them directly from a Node subprocess and assert their behaviour
without booting the browser surface.

Spec sources:
  - REAL_LIFE_CHALLENGE_BACKEND_PLAN.md §1 (RLC schema), §4 (editor),
    §4c (grade-band scaffolds)
  - standards/system/games/Game_Mechanics_Docs/11_Real-Life_Challenge §1
    (5-step structure + complexity table by grade band)

If `node` is unavailable, the static smoke tests at the bottom assert the
helper definitions are still present verbatim.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[1]
HELPERS_PATH = (
    REPO_ROOT / "frontend" / "js" / "editors" / "_real-life-challenge-helpers.js"
)
EDITOR_PATH = (
    REPO_ROOT / "frontend" / "js" / "editors" / "real-life-challenge.js"
)
BUILDER_JS_PATH = REPO_ROOT / "frontend" / "js" / "builder.js"
BUILDER_HTML_PATH = REPO_ROOT / "frontend" / "builder.html"


def _node_available() -> bool:
    return shutil.which("node") is not None


def _run_node(script: str) -> dict:
    """Run a Node script that loads the helpers and prints a JSON dict on stdout."""
    if not _node_available():
        pytest.skip("node binary not on PATH; falling back to regex smoke test")
    helpers_url = HELPERS_PATH.as_posix()
    full = (
        f"const RLC = require({json.dumps(helpers_url)});\n"
        f"{script}\n"
    )
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".js", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(full)
        tmp_path = tmp.name
    try:
        proc = subprocess.run(
            ["node", tmp_path], capture_output=True, text=True, timeout=10
        )
    finally:
        os.unlink(tmp_path)
    assert proc.returncode == 0, (
        f"node exited with {proc.returncode}\n"
        f"stderr:\n{proc.stderr}\nstdout:\n{proc.stdout}"
    )
    out = proc.stdout.strip().splitlines()[-1]
    return json.loads(out)


# ---------------------------------------------------------------------------
# 1. gradeBandFromGrade — band table per spec §1
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_grade_band_from_grade() -> None:
    """G1-3 → g1_3, G4-6 → g4_6, G7-9 → g7_9, G10-11 → g10_11."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "g1: RLC.gradeBandFromGrade(1),"
        "g2: RLC.gradeBandFromGrade(2),"
        "g3: RLC.gradeBandFromGrade(3),"
        "g4: RLC.gradeBandFromGrade(4),"
        "g5: RLC.gradeBandFromGrade(5),"
        "g6: RLC.gradeBandFromGrade(6),"
        "g7: RLC.gradeBandFromGrade(7),"
        "g8: RLC.gradeBandFromGrade(8),"
        "g9: RLC.gradeBandFromGrade(9),"
        "g10: RLC.gradeBandFromGrade(10),"
        "g11: RLC.gradeBandFromGrade(11),"
        "}));"
    )
    assert result["g1"] == "g1_3"
    assert result["g2"] == "g1_3"
    assert result["g3"] == "g1_3"
    assert result["g4"] == "g4_6"
    assert result["g5"] == "g4_6"
    assert result["g6"] == "g4_6"
    assert result["g7"] == "g7_9"
    assert result["g8"] == "g7_9"
    assert result["g9"] == "g7_9"
    assert result["g10"] == "g10_11"
    assert result["g11"] == "g10_11"


# ---------------------------------------------------------------------------
# 2. defaultPisaForGradeBand — band → PISA-level default
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_default_pisa_for_grade_band() -> None:
    """g1_3:L4, g4_6:L4, g7_9:L5, g10_11:L6 (per spec §1)."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "b1: RLC.defaultPisaForGradeBand('g1_3'),"
        "b2: RLC.defaultPisaForGradeBand('g4_6'),"
        "b3: RLC.defaultPisaForGradeBand('g7_9'),"
        "b4: RLC.defaultPisaForGradeBand('g10_11'),"
        "bunknown: RLC.defaultPisaForGradeBand('garbage'),"
        "}));"
    )
    assert result["b1"] == "L4"
    assert result["b2"] == "L4"
    assert result["b3"] == "L5"
    assert result["b4"] == "L6"
    assert result["bunknown"] == "L4"


# ---------------------------------------------------------------------------
# 3. expertRoleOptions — 12-value enum mirrors Pydantic Literal
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_expert_role_options_returns_12() -> None:
    """Helper returns the full 12-role enum with expected members."""
    result = _run_node(
        "const r = RLC.expertRoleOptions();"
        "console.log(JSON.stringify({"
        "len: r.length,"
        "has_fire: r.includes('fire_inspector'),"
        "has_general: r.includes('general'),"
        "has_ethicist: r.includes('ethicist'),"
        "has_eng: r.includes('structural_engineer'),"
        "all_strings: r.every(x => typeof x === 'string'),"
        "}));"
    )
    assert result["len"] == 12
    assert result["has_fire"] is True
    assert result["has_general"] is True
    assert result["has_ethicist"] is True
    assert result["has_eng"] is True
    assert result["all_strings"] is True


# ---------------------------------------------------------------------------
# 4. uuidShort — id format
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_uuid_short_format() -> None:
    """Returns string starting with 'rlc_' and length ≥ 11; ids are distinct."""
    result = _run_node(
        "const a = RLC.uuidShort();"
        "const b = RLC.uuidShort();"
        "console.log(JSON.stringify({"
        "a, b,"
        "a_prefix: a.startsWith('rlc_'),"
        "a_len: a.length,"
        "b_prefix: b.startsWith('rlc_'),"
        "b_len: b.length,"
        "distinct: a !== b,"
        "}));"
    )
    assert result["a_prefix"] is True
    assert result["b_prefix"] is True
    assert result["a_len"] >= 11
    assert result["b_len"] >= 11
    assert result["distinct"] is True


# ---------------------------------------------------------------------------
# 5. buildScaffoldCase — g1_3 minimal scaffold
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_case_g1_3_minimal() -> None:
    """g1_3 scaffold: 5 steps in locked order, decision step has ≥2 options."""
    result = _run_node(
        "const c = RLC.buildScaffoldCase('g1_3', 'general', 'basic');"
        "console.log(JSON.stringify({"
        "n_steps: c.steps.length,"
        "kinds: c.steps.map(s => s.kind),"
        "step1_options: c.steps[0].options.length,"
        "step1_correct: c.steps[0].options.filter(o => o.is_correct).length,"
        "step3_options: c.steps[2].options.length,"
        "step4_chips: c.steps[3].concept_chips.length,"
        "}));"
    )
    assert result["n_steps"] == 5
    assert result["kinds"] == [
        "decision", "info_request", "final_decision", "concept_select", "reasoning"
    ]
    assert result["step1_options"] >= 2
    assert result["step1_correct"] == 1
    assert result["step3_options"] >= 2
    assert result["step4_chips"] >= 3


# ---------------------------------------------------------------------------
# 6. buildScaffoldCase — g7_9 has red herrings
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_case_g7_9_has_red_herrings() -> None:
    """g7_9 scaffold: decision/final steps have ≥4 options (red herrings per spec §1)."""
    result = _run_node(
        "const c = RLC.buildScaffoldCase('g7_9', 'fire_inspector', 'basic');"
        "console.log(JSON.stringify({"
        "step1_options: c.steps[0].options.length,"
        "step3_options: c.steps[2].options.length,"
        "step1_correct: c.steps[0].options.filter(o => o.is_correct).length,"
        "step3_correct: c.steps[2].options.filter(o => o.is_correct).length,"
        "}));"
    )
    assert result["step1_options"] >= 4
    assert result["step3_options"] >= 4
    assert result["step1_correct"] == 1
    assert result["step3_correct"] == 1


# ---------------------------------------------------------------------------
# 7. buildScaffoldCase — g10_11 surfaces ethical dimension in step3 prompt
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_case_g10_11_ethical_dimension() -> None:
    """g10_11 step3 prompt mentions ethical / stakeholders dimension per spec §1 L6."""
    result = _run_node(
        "const c = RLC.buildScaffoldCase('g10_11', 'lawyer', 'premium');"
        "console.log(JSON.stringify({"
        "step3_prompt: c.steps[2].prompt,"
        "step4_chips: c.steps[3].concept_chips.length,"
        "}));"
    )
    p = result["step3_prompt"].lower()
    assert any(
        marker in p
        for marker in ("etik", "ethical", "stakeholder", "manfaatdor")
    ), f"g10_11 step3 prompt should hint at ethical/stakeholders dimension; got: {p!r}"
    # G10-11 has the largest concept set per spec §1.
    assert result["step4_chips"] >= 5


# ---------------------------------------------------------------------------
# 8. buildScaffoldCase — schema-shape sanity (top-level keys)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_validates_against_schema_shape() -> None:
    """Returned object has all required RealLifeChallengeCase top-level keys."""
    result = _run_node(
        "const c = RLC.buildScaffoldCase('g4_6', 'teacher', 'basic');"
        "const required = ['id','expert_role','title','intro','pisa_level',"
        "'tier','grade_band','variant','steps'];"
        "console.log(JSON.stringify({"
        "missing: required.filter(k => !(k in c)),"
        "id_starts: c.id.startsWith('rlc_'),"
        "tier: c.tier,"
        "grade_band: c.grade_band,"
        "variant: c.variant,"
        "expert_role: c.expert_role,"
        "kinds: c.steps.map(s => s.kind),"
        "step5_min_chars: c.steps[4].min_chars,"
        "step5_kw: c.steps[4].acceptable_keywords,"
        "}));"
    )
    assert result["missing"] == []
    assert result["id_starts"] is True
    assert result["tier"] == "basic"
    assert result["grade_band"] == "g4_6"
    assert result["variant"] == "standard"
    assert result["expert_role"] == "teacher"
    assert result["kinds"] == [
        "decision", "info_request", "final_decision", "concept_select", "reasoning"
    ]
    assert result["step5_min_chars"] == 80
    assert result["step5_kw"] == []


# ---------------------------------------------------------------------------
# 9. Premium gate — basic tier never sets variant=creative_thinking
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_basic_tier_does_not_set_creative_thinking() -> None:
    """Basic-tier scaffold defaults to variant='standard' (creative_thinking is premium-only)."""
    result = _run_node(
        "const basic = RLC.buildScaffoldCase('g10_11', 'ethicist', 'basic');"
        "const premium = RLC.buildScaffoldCase('g10_11', 'ethicist', 'premium');"
        "console.log(JSON.stringify({"
        "basic_variant: basic.variant,"
        "premium_variant: premium.variant,"
        "}));"
    )
    assert result["basic_variant"] == "standard"
    # Premium also defaults to standard — creative_thinking is opt-in via UI.
    assert result["premium_variant"] == "standard"


# ---------------------------------------------------------------------------
# 10. Premium gate — basic tier never emits memory_palace_location
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_build_scaffold_basic_tier_does_not_set_memory_palace() -> None:
    """Basic-tier scaffold has no memory_palace_location (premium-only)."""
    result = _run_node(
        "const basic = RLC.buildScaffoldCase('g7_9', 'general', 'basic');"
        "console.log(JSON.stringify({"
        "has_palace: 'memory_palace_location' in basic,"
        "tier: basic.tier,"
        "}));"
    )
    assert result["has_palace"] is False
    assert result["tier"] == "basic"


# ---------------------------------------------------------------------------
# 11. Reasoning step — server-only acceptable_keywords default
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_scaffold_reasoning_step_has_server_only_keywords_array() -> None:
    """Step 5 (reasoning) ships an empty acceptable_keywords[] array (server-only)."""
    result = _run_node(
        "const c = RLC.buildScaffoldCase('g4_6', 'agronomist', 'basic');"
        "const step5 = c.steps[4];"
        "console.log(JSON.stringify({"
        "kind: step5.kind,"
        "is_array: Array.isArray(step5.acceptable_keywords),"
        "len: step5.acceptable_keywords.length,"
        "has_placeholder: typeof step5.placeholder === 'string',"
        "}));"
    )
    assert result["kind"] == "reasoning"
    assert result["is_array"] is True
    assert result["len"] == 0
    assert result["has_placeholder"] is True


# ---------------------------------------------------------------------------
# 12. expertRoleFromSubject — subject-derived default
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_expert_role_from_subject_known_subjects() -> None:
    """Known subject strings map to plausible expert roles; unknown → 'general'."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "bio: RLC.expertRoleFromSubject('biologiya'),"
        "phys: RLC.expertRoleFromSubject('fizika'),"
        "chem: RLC.expertRoleFromSubject('kimyo'),"
        "hist: RLC.expertRoleFromSubject('tarix'),"
        "lit: RLC.expertRoleFromSubject('adabiyot'),"
        "lang: RLC.expertRoleFromSubject('english'),"
        "geo: RLC.expertRoleFromSubject('geografiya'),"
        "blank: RLC.expertRoleFromSubject(''),"
        "nul: RLC.expertRoleFromSubject(null),"
        "weird: RLC.expertRoleFromSubject('art'),"
        "}));"
    )
    assert result["bio"] == "agronomist"
    assert result["phys"] == "structural_engineer"
    assert result["chem"] == "medical_diagnostician"
    assert result["hist"] == "historian"
    assert result["lit"] == "ethicist"
    assert result["lang"] == "teacher"
    assert result["geo"] == "city_planner"
    assert result["blank"] == "general"
    assert result["nul"] == "general"
    assert result["weird"] == "general"


# ---------------------------------------------------------------------------
# Static smoke tests — no Node needed. Pin public API + registration points
# so a future refactor can't silently drop the surface.
# ---------------------------------------------------------------------------

def test_helpers_file_exists_and_exports_public_api() -> None:
    """Helpers file exists and pins the public-API function names + exports."""
    assert HELPERS_PATH.exists(), f"Helpers file missing: {HELPERS_PATH}"
    src = HELPERS_PATH.read_text(encoding="utf-8")
    # Function definitions
    assert "function gradeBandFromGrade(grade)" in src
    assert "function defaultPisaForGradeBand(band)" in src
    assert "function expertRoleOptions()" in src
    assert "function uuidShort()" in src
    assert "function buildScaffoldCase(gradeBand, expertRole, tier)" in src
    # Public exports — both browser (window) and Node (module.exports)
    assert "window.RLCHelpers" in src
    assert "module.exports" in src
    # Grade-band thresholds (must mirror Pydantic Literal)
    assert "g <= 3" in src
    assert "g <= 6" in src
    assert "g <= 9" in src


def test_editor_file_exists_and_registers_phase_editor() -> None:
    """Editor file exists, exposes 4-arg signature + both registry surfaces."""
    assert EDITOR_PATH.exists(), f"Editor file missing: {EDITOR_PATH}"
    src = EDITOR_PATH.read_text(encoding="utf-8")
    # 4-arg signature with context default
    assert "function realLifeChallengeEditor(container, data, onChange, context = {})" in src
    # Reads context dimensions
    assert "context.grade" in src
    assert "context.subject" in src
    assert "context.tier" in src
    # Registers under BOTH the legacy registry (used by builder.js) AND the
    # new PhaseEditors namespace per plan §4a.
    assert "window.Editors.realLifeChallenge" in src
    assert "window.PhaseEditors.realLifeChallenge" in src
    # Premium gating — variant + memory_palace_location are tier-gated.
    assert "creative_thinking" in src
    assert "memory_palace_location" in src


def test_builder_js_registers_real_life_challenge_phase() -> None:
    """builder.js wires the real_life_challenge phase alongside legacy real_life."""
    src = BUILDER_JS_PATH.read_text(encoding="utf-8")
    # Phase exists in name + icon + editor-key tables.
    assert "real_life_challenge:" in src
    assert "realLifeChallenge" in src
    # Phase routes through getPhaseData / applyPhaseChange.
    assert 'phase === "real_life_challenge"' in src
    # Legacy real_life still wired (coexistence — must NOT have been replaced).
    assert "real_life:" in src
    assert "realLife" in src
    # CONTRACT_KEYS includes both keys.
    assert '"real_life",' in src
    assert '"real_life_challenge",' in src


def test_builder_html_loads_editor_scripts() -> None:
    """builder.html loads helpers + editor scripts with cache-bust."""
    src = BUILDER_HTML_PATH.read_text(encoding="utf-8")
    assert "_real-life-challenge-helpers.js?v=__VERSION__" in src
    assert "real-life-challenge.js?v=__VERSION__" in src
    # Legacy editor still loaded.
    assert "real-life.js?v=__VERSION__" in src
