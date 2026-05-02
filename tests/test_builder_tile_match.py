"""
Regression tests for the Tile Match builder editor's pure helper functions.

Helpers live at `frontend/js/editors/games/_tile-match-helpers.js` and are
exported on both `window.TileMatchHelpers` (browser) and `module.exports`
(Node), so we can drive them directly from a Node subprocess and assert their
behaviour without booting the whole browser surface.

Spec sources:
  - TILE_MATCH_BACKEND_PLAN.md §4b — grade-band defaults
  - tile-match-concept-definition.md §1 — board sizes by grade
  - tile-match-concept-definition.md §3 — Buzan colors / subject family

If `node` is unavailable (CI without Node), the static smoke test at the
bottom asserts the helper definitions are still present verbatim.
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
    REPO_ROOT / "frontend" / "js" / "editors" / "games" / "_tile-match-helpers.js"
)


def _node_available() -> bool:
    return shutil.which("node") is not None


def _run_node(script: str) -> dict:
    """Run a Node script that loads the helpers and prints a JSON dict on stdout."""
    if not _node_available():
        pytest.skip("node binary not on PATH; falling back to regex smoke test")
    helpers_url = HELPERS_PATH.as_posix()
    full = (
        f"const TM = require({json.dumps(helpers_url)});\n"
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
# defaultPairCountForGrade — board size by grade band (spec §1)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_default_pair_count_per_grade() -> None:
    """G1-2:4, G3-4:5, G5-7:6, G8+:8 (per spec §1 board sizes)."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "g1: TM.defaultPairCountForGrade(1),"
        "g2: TM.defaultPairCountForGrade(2),"
        "g3: TM.defaultPairCountForGrade(3),"
        "g4: TM.defaultPairCountForGrade(4),"
        "g5: TM.defaultPairCountForGrade(5),"
        "g7: TM.defaultPairCountForGrade(7),"
        "g8: TM.defaultPairCountForGrade(8),"
        "g11: TM.defaultPairCountForGrade(11),"
        "}));"
    )
    assert result["g1"] == 4
    assert result["g2"] == 4
    assert result["g3"] == 5
    assert result["g4"] == 5
    assert result["g5"] == 6
    assert result["g7"] == 6
    assert result["g8"] == 8
    assert result["g11"] == 8


# ---------------------------------------------------------------------------
# maxPairsForGrade — hard cap at 8 (spec §1, premium-tier max)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_max_pairs_capped_at_8() -> None:
    """All grades cap at 8 pairs per spec §1."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "g1: TM.maxPairsForGrade(1),"
        "g7: TM.maxPairsForGrade(7),"
        "g11: TM.maxPairsForGrade(11),"
        "g99: TM.maxPairsForGrade(99),"
        "}));"
    )
    assert result["g1"] == 8
    assert result["g7"] == 8
    assert result["g11"] == 8
    assert result["g99"] == 8


# ---------------------------------------------------------------------------
# subjectFamilyFromContext — uz/ru/en string mapping for Buzan colors
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_subject_family_from_context_uzbek_strings() -> None:
    """Uzbek subject names map to the SubjectFamily enum."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "matem: TM.subjectFamilyFromContext('matematika'),"
        "biolog: TM.subjectFamilyFromContext('biologiya'),"
        "tarix: TM.subjectFamilyFromContext('tarix'),"
        "adabiyot: TM.subjectFamilyFromContext('adabiyot'),"
        "fizika: TM.subjectFamilyFromContext('fizika'),"
        "kimyo: TM.subjectFamilyFromContext('kimyo'),"
        "til: TM.subjectFamilyFromContext('ona tili'),"
        "}));"
    )
    assert result["matem"] == "math"
    assert result["biolog"] == "biology"
    assert result["tarix"] == "history"
    assert result["adabiyot"] == "literature"
    assert result["fizika"] == "physics"
    assert result["kimyo"] == "chemistry"
    assert result["til"] == "language"


@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_subject_family_from_context_russian_strings() -> None:
    """Russian subject names map to the SubjectFamily enum."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "istor: TM.subjectFamilyFromContext('история'),"
        "khim: TM.subjectFamilyFromContext('химия'),"
        "lang: TM.subjectFamilyFromContext('русский язык'),"
        "fiz: TM.subjectFamilyFromContext('физика'),"
        "lit: TM.subjectFamilyFromContext('литература'),"
        "}));"
    )
    assert result["istor"] == "history"
    assert result["khim"] == "chemistry"
    assert result["lang"] == "language"
    assert result["fiz"] == "physics"
    assert result["lit"] == "literature"


@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_subject_family_from_context_unknown_returns_general() -> None:
    """Unmappable / empty / null input → 'general' (safe default)."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "art: TM.subjectFamilyFromContext('art'),"
        "blank: TM.subjectFamilyFromContext(''),"
        "nul: TM.subjectFamilyFromContext(null),"
        "undef: TM.subjectFamilyFromContext(undefined),"
        "weird: TM.subjectFamilyFromContext('   '),"
        "}));"
    )
    assert result["art"] == "general"
    assert result["blank"] == "general"
    assert result["nul"] == "general"
    assert result["undef"] == "general"
    assert result["weird"] == "general"


# ---------------------------------------------------------------------------
# uuidShort — stable id format
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_uuid_short_format() -> None:
    """Returns string starting with 'tm_' and length ≥ 11."""
    result = _run_node(
        "const a = TM.uuidShort();"
        "const b = TM.uuidShort();"
        "console.log(JSON.stringify({"
        "a, b,"
        "a_prefix: a.startsWith('tm_'),"
        "a_len: a.length,"
        "b_prefix: b.startsWith('tm_'),"
        "b_len: b.length,"
        "distinct: a !== b,"
        "}));"
    )
    assert result["a_prefix"] is True
    assert result["b_prefix"] is True
    assert result["a_len"] >= 11
    assert result["b_len"] >= 11
    # crypto.randomUUID is available in Node 14.17+/16+ — distinct ids expected.
    assert result["distinct"] is True


# ---------------------------------------------------------------------------
# migrateLegacyToNew — legacy [[a,b],...] → [{id, left, right, tier}, ...]
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_migrate_legacy_to_new_shape_preserves_left_right() -> None:
    """Two-tuple legacy pairs become full TileMatchPair-shaped objects."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "out: TM.migrateLegacyToNew([['a', 'b'], ['c', 'd']]),"
        "}));"
    )
    out = result["out"]
    assert len(out) == 2
    assert out[0]["left"] == "a"
    assert out[0]["right"] == "b"
    assert out[0]["tier"] == "basic"
    assert out[0]["id"] == "tm_legacy_000"
    assert out[1]["left"] == "c"
    assert out[1]["right"] == "d"
    assert out[1]["tier"] == "basic"
    assert out[1]["id"] == "tm_legacy_001"


@pytest.mark.skipif(not _node_available(), reason="node not installed")
def test_migrate_legacy_returns_empty_for_non_array() -> None:
    """Defensive: null / object / undefined input → empty array (no throw)."""
    result = _run_node(
        "console.log(JSON.stringify({"
        "nul: TM.migrateLegacyToNew(null),"
        "undef: TM.migrateLegacyToNew(undefined),"
        "obj: TM.migrateLegacyToNew({}),"
        "num: TM.migrateLegacyToNew(42),"
        "}));"
    )
    assert result["nul"] == []
    assert result["undef"] == []
    assert result["obj"] == []
    assert result["num"] == []


# ---------------------------------------------------------------------------
# Static smoke test — runs without Node. Pins the public API + grade-band
# thresholds so a future refactor touching the boundary fails loudly.
# ---------------------------------------------------------------------------

def test_helpers_file_exists_and_exports_the_public_api() -> None:
    """Static smoke test — runs without Node. Pins the public API."""
    assert HELPERS_PATH.exists(), f"Helpers file missing: {HELPERS_PATH}"
    src = HELPERS_PATH.read_text(encoding="utf-8")
    # Function definitions
    assert "function defaultPairCountForGrade(grade)" in src
    assert "function maxPairsForGrade(_grade)" in src
    assert "function subjectFamilyFromContext(subject)" in src
    assert "function uuidShort()" in src
    assert "function migrateLegacyToNew(legacyPairs)" in src
    # Public exports — both browser (window) and Node (module.exports)
    assert "window.TileMatchHelpers" in src
    assert "module.exports" in src
    # Grade-band thresholds
    assert "g <= 2" in src
    assert "g <= 4" in src
    assert "g <= 7" in src
    # Hard cap (spec §1)
    assert "return 8" in src
