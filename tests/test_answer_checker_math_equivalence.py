"""Regression tests for AC-01 + AC-02: math-equivalence in answer_checker.

Covers the variants the demo audit flagged on real homework data:
  - U+2212 minus vs ASCII minus  (HW-20260505-010 Boss "(a−4b)…")
  - decimal comma vs decimal dot (HW-20260505-005 AQ Q3 "0,6" / "0.6")
  - "lhs = rhs" prefix stripping  (HW-20260505-005 AQ Q3 "sin B = 0,6")
  - α ↔ alfa ↔ alpha             (geometry trig formulas)
  - tg ↔ tan, ctg ↔ cot          (geometry trig formulas)
  - degree marker stripping      (HW-20260505-005 Boss 0 "52" / "52°")
"""

from __future__ import annotations

import pytest

from server.services.answer_checker import check
from server.services.math_normalize import normalize_math, is_math_equivalent


# ---------- normalize_math (low-level) ---------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        # Greek glyphs → English names
        ("α", "alpha"),
        ("β + α", "beta+alpha"),
        ("π", "pi"),
        # Uzbek/Russian transliterations of Greek names
        ("alfa", "alpha"),
        ("Alfa + Beta", "alpha+beta"),
        ("teta", "theta"),
        # Trig aliases (Uzbek tg/ctg → tan/cot)
        ("tg(45°)", "tan(45)"),
        ("ctg α", "cotalpha"),
        ("cotan β", "cotbeta"),
        # Unicode minus
        ("−1.5", "-1.5"),
        ("(a−4b)(a²+4ab+16b²)", "(a-4b)(a²+4ab+16b²)"),
        # Decimal comma → dot only between digits (don't break "x, y" lists)
        ("0,6", "0.6"),
        ("3,14", "3.14"),
        # "lhs = rhs" prefix stripped
        ("sin B = 0,6", "0.6"),
        ("x = 5", "5"),
        ("ctg α = tg(90 − α)", "tan(90-alpha)"),
        # Degree markers / words stripped
        ("52°", "52"),
        ("52 deg", "52"),
        ("52 gradus", "52"),
        ("90°−α", "90-alpha"),
        # Whitespace fully collapsed
        (" 2 x  +  3 ", "2x+3"),
        # NFC + casefold
        ("ALPHA", "alpha"),
        # Trailing punctuation
        ("0.6.", "0.6"),
        # None / empty
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_math(raw, expected):
    assert normalize_math(raw) == expected


@pytest.mark.parametrize(
    "a,b",
    [
        ("α", "alfa"),
        ("α", "alpha"),
        ("alfa", "alpha"),
        ("tg(α)", "tan(alpha)"),
        ("ctg β", "cot beta"),
        ("(a−4b)(a²+4ab+16b²)", "(a-4b)(a²+4ab+16b²)"),
        ("0,6", "0.6"),
        ("sin B = 0,6", "0.6"),
        ("52°", "52"),
        ("52", "52 gradus"),
        ("x = 5", "5"),
        ("90° − α", "90-alpha"),
    ],
)
def test_is_math_equivalent_true(a, b):
    assert is_math_equivalent(a, b), f"{a!r} should equal {b!r}"


@pytest.mark.parametrize(
    "a,b",
    [
        ("alpha", "beta"),
        ("tan", "cot"),
        ("0.6", "0.7"),
        ("(a-4b)(a²+4ab+16b²)", "(a+4b)(a²-4ab+16b²)"),
        ("52", "53"),
        ("sin B = 0.6", "0.7"),
    ],
)
def test_is_math_equivalent_false(a, b):
    assert not is_math_equivalent(a, b), f"{a!r} should NOT equal {b!r}"


# ---------- _check_numeric (AC-02) -------------------------------------------

def test_numeric_accepts_unicode_minus():
    spec = {"type": "numeric", "expected": -1.5, "tolerance": 0.01, "canonical_display": "-1.5"}
    assert check(spec, "−1.5")["verdict"] == "correct"   # U+2212
    assert check(spec, "–1.5")["verdict"] == "correct"   # en dash
    assert check(spec, "—1.5")["verdict"] == "correct"   # em dash


def test_numeric_accepts_internal_whitespace():
    spec = {"type": "numeric", "expected": 1.5, "tolerance": 0.01, "canonical_display": "1.5"}
    assert check(spec, "  1 . 5  ")["verdict"] == "correct"


def test_numeric_combined_unicode_minus_and_comma():
    spec = {"type": "numeric", "expected": -0.6, "tolerance": 0.01, "canonical_display": "-0.6"}
    assert check(spec, "−0,6")["verdict"] == "correct"


# ---------- _check_text_exact (AC-01) ----------------------------------------

def test_text_exact_strict_path_unchanged():
    """Existing strict matches still pass via the literal _clean_text_exact path."""
    spec = {"type": "text_exact", "expected": "Toshkent", "canonical_display": "Toshkent"}
    res = check(spec, "toshkent")
    assert res["verdict"] == "correct"
    assert res["reason"] == "exact match"


def test_text_exact_math_equivalent_unicode_minus():
    """HW-20260505-010 Boss 1: expected "(a−4b)(a²+4ab+16b²)" — student types ASCII -."""
    spec = {
        "type": "text_exact",
        "expected": "(a−4b)(a²+4ab+16b²)",
        "canonical_display": "(a−4b)(a²+4ab+16b²)",
    }
    res = check(spec, "(a-4b)(a²+4ab+16b²)")
    assert res["verdict"] == "correct"
    assert res["reason"] == "math-equivalent"


def test_text_exact_math_equivalent_lhs_prefix():
    """HW-20260505-005 AQ Q3: expected "0.6" — student echoes "sin B = 0,6"."""
    spec = {
        "type": "text_exact",
        "expected": "0.6",
        "canonical_display": "0.6",
    }
    res = check(spec, "sin B = 0,6")
    assert res["verdict"] == "correct"
    assert res["reason"] == "math-equivalent"


def test_text_exact_math_equivalent_greek_alias():
    """Geometry uses α / alfa / alpha interchangeably."""
    spec = {"type": "text_exact", "expected": "ctg α", "canonical_display": "ctg α"}
    assert check(spec, "cot alpha")["verdict"] == "correct"
    assert check(spec, "kotangens alfa")["verdict"] == "unsure"  # "kotangens" not aliased; honest no-match
    assert check(spec, "ctg alfa")["verdict"] == "correct"


def test_text_exact_math_equivalent_degree_strip():
    """Boss 0 expected "52" or "52°" — both forms accepted from student."""
    spec = {"type": "text_exact", "expected": "52", "canonical_display": "52"}
    assert check(spec, "52°")["verdict"] == "correct"
    assert check(spec, "52 deg")["verdict"] == "correct"
    assert check(spec, "52 gradus")["verdict"] == "correct"


def test_text_exact_non_equivalent_still_unsure():
    """When mathNormalize forms differ, result remains unsure (not falsely correct)."""
    spec = {"type": "text_exact", "expected": "0.6", "canonical_display": "0.6"}
    res = check(spec, "0.7")
    assert res["verdict"] == "unsure"
