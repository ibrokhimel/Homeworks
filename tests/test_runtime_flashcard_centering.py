"""Static regression for FC-01 + FC-04: text-only flashcards must center
their content vertically inside the card and use a readable formula font.

Reproducer in real data: HW-20260505-006 (Nisbiy xatolik) ships with all 10
flashcards `media: ""` — without these rules, term + definition stack at
the top of the glass card and leave a tall bottom gap.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


ROOT = Path(__file__).parent.parent
RUNTIME = ROOT / "server" / "template" / "perfect_homework.html"


def _read() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def _css_block(source: str, selector: str) -> str:
    """Return the body of the first CSS rule whose selector matches."""
    pattern = re.escape(selector) + r"\s*(?:,\s*[^{}]+)?\s*\{(?P<body>[^}]*)\}"
    match = re.search(pattern, source)
    assert match, f"missing CSS block for {selector}"
    return match.group("body")


def test_no_image_front_centers_content():
    """FC-01: .fc-inner.no-image .fc-front centers term + formula + tap-hint."""
    html = _read()
    # Either combined selector (fc-front, fc-back) or separate — accept both.
    pattern = re.compile(
        r"\.fc-inner\.no-image\s+\.fc-front[^{}]*\{(?P<body>[^}]*)\}",
        re.DOTALL,
    )
    match = pattern.search(html)
    assert match, ".fc-inner.no-image .fc-front rule not found"
    body = match.group("body")
    assert "justify-content: center" in body or "justify-content:center" in body, (
        "FC-01 regression: text-only front face is not vertically centered"
    )


def test_no_image_back_centers_content():
    """FC-01: .fc-inner.no-image .fc-back also centers — definition + optional tip pill."""
    html = _read()
    pattern = re.compile(
        r"\.fc-inner\.no-image\s+\.fc-back[^{}]*\{(?P<body>[^}]*)\}",
        re.DOTALL,
    )
    match = pattern.search(html)
    assert match, ".fc-inner.no-image .fc-back rule not found"
    body = match.group("body")
    assert "justify-content: center" in body or "justify-content:center" in body, (
        "FC-01 regression: text-only back face is not vertically centered"
    )


def test_no_image_definition_font_bumped():
    """FC-04: bigger font on text-only definition. Default is 15px (raw-output
    look on math expressions); audit recommended ≥17px on no-image cards."""
    html = _read()
    body = _css_block(html, ".fc-inner.no-image .fc-definition")
    m = re.search(r"font-size:\s*(\d+)px", body)
    assert m, "FC-04 regression: .fc-inner.no-image .fc-definition lacks font-size override"
    size = int(m.group(1))
    assert size >= 17, f"FC-04 regression: definition font {size}px < 17px on text-only cards"


def test_no_image_term_still_large():
    """Sanity: the existing FC-01 baseline (28px term) must not be removed by
    the new centering rule. Audit relied on it to prevent the term shrinking."""
    html = _read()
    body = _css_block(html, ".fc-inner.no-image .fc-term")
    m = re.search(r"font-size:\s*(\d+)px", body)
    assert m, "term font-size missing on no-image cards"
    assert int(m.group(1)) >= 26, "no-image term should stay large (~28px)"
