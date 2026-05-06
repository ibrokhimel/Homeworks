"""Grade 8 math demo runtime guardrails.

These tests pin the temporary showcase rule: G8 math/geometriya demos should
stay interactive and low-writing, so Adaptive Quiz and Puzzle Lock are skipped
without deleting authored data.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).parent.parent
RUNTIME = ROOT / "server" / "template" / "perfect_homework.html"


def _read() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def _css_block(source: str, selector: str) -> str:
    pattern = re.escape(selector) + r"\s*\{(?P<body>[^}]*)\}"
    match = re.search(pattern, source)
    assert match, f"missing CSS block for {selector}"
    return match.group("body")


def test_g8_math_demo_skip_helper_is_subject_and_grade_gated():
    html = _read()
    assert "function gbIsGrade8MathDemo()" in html
    assert "grade === 8" in html
    assert "subject === 'math-algebra'" in html
    assert "subject === 'geometriya-g7-11'" in html
    assert "return gbIsGrade8MathDemo() ? new Set(['aq', 'pl']) : new Set();" in html


def test_g8_math_demo_filters_aq_and_puzzle_lock_only_at_registry():
    html = _read()
    assert "const skipped = gbDemoSkippedGames();" in html
    assert "if (!skipped.has('aq') && Array.isArray(GB_ADAPTIVE_QUIZ)" in html
    assert "if (!skipped.has('pl') && Array.isArray(GB_PUZZLE_LOCK)" in html
    # Data declarations and panels remain available; the demo skips render order only.
    assert "const GB_ADAPTIVE_QUIZ" in html
    assert "const GB_PUZZLE_LOCK" in html
    assert 'id="gb-panel-aq"' in html
    assert 'id="gb-panel-pl"' in html


def test_tile_match_xp_pill_cannot_clip_text_mid_character():
    html = _read()
    body = _css_block(html, ".gb-tm-xp-pill")
    assert "min-width: 0" in body
    assert "overflow: hidden" in body
    assert "text-overflow: ellipsis" in body


def test_tile_match_timer_hidden_for_g8_math_demo():
    html = _read()
    css = _css_block(html, ".gb-tm-stats.demo-no-timer #gb-tm-stat-timer-card")
    assert "display: none" in css
    assert "stats.classList.toggle('demo-no-timer', gbIsGrade8MathDemo())" in html


def test_tile_match_matched_tiles_remain_solved_placeholders():
    html = _read()
    body = _css_block(html, ".gb-tm-tile.matched")
    assert "pointer-events: none" in body
    assert "opacity: 0.34" in body
    assert "max-height: 0" not in body
    assert "min-height: 0" not in body
    assert "padding-top: 0" not in body
