"""Regression tests for FE-4 — expanded screen_context collection in
runtime.js (polish-pack PR).

The runtime tutor bridge previously scoped `screen_context` to just the
active element's visible text via `_extractVisibleText(active)`. That
under-served the AI: when the student is mid-question, the surrounding
panel/section text often holds the relevant problem statement, prompt,
or worked-example.

This module pins the FE-4 contract:

1. **`_extractScreenContext` exists** — a new helper distinct from
   `_extractVisibleText` (the old helper stays for back-compat).
2. **`collectRuntimeContext` uses the new helper** for the
   `screen_context` field — not the old `_extractVisibleText(active)`.
3. **Output cap is 2000 chars** — the helper slices to `.slice(0, 2000)`
   so the request body never balloons.
4. **Strip selectors include answer-key markup** so we never leak
   answers into the AI prompt.
5. **`phase_artifacts` field exists** in the `collectRuntimeContext`
   return value (forward-looking metadata; can be empty).
"""
from __future__ import annotations

import os
import re

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def runtime_js() -> str:
    path = os.path.join(_repo_root(), "server", "template", "runtime.js")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# 1. _extractScreenContext exists
# ---------------------------------------------------------------------------


def test_extract_screen_context_function_defined(runtime_js: str):
    """The new helper must exist as a function declaration."""
    assert "function _extractScreenContext(" in runtime_js, (
        "runtime.js must define `function _extractScreenContext(activeEl)` — "
        "the FE-4 helper for richer tutor context."
    )


def test_extract_visible_text_still_present_for_back_compat(runtime_js: str):
    """The old helper stays — additive change only."""
    assert "function _extractVisibleText(" in runtime_js, (
        "_extractVisibleText must remain in runtime.js for back-compat. "
        "FE-4 is additive, not a replacement."
    )


# ---------------------------------------------------------------------------
# 2. collectRuntimeContext uses _extractScreenContext for screen_context
# ---------------------------------------------------------------------------


def _collect_runtime_context_body(runtime_js: str) -> str:
    """Return the body of the function collectRuntimeContext(opts) ... up to
    the closing brace of the return object literal.
    """
    decl = "function collectRuntimeContext(opts)"
    idx = runtime_js.find(decl)
    assert idx != -1, "runtime.js missing function collectRuntimeContext(opts)"
    # Capture a generous window — far enough to include the return literal.
    return runtime_js[idx : idx + 1600]


def test_collect_runtime_context_uses_extract_screen_context(runtime_js: str):
    """The screen_context field must be filled by _extractScreenContext, NOT
    the old _extractVisibleText helper.
    """
    body = _collect_runtime_context_body(runtime_js)
    # screen_context line must reference _extractScreenContext.
    sc_match = re.search(r"screen_context\s*:\s*[^,]+", body)
    assert sc_match, "collectRuntimeContext does not assign screen_context"
    sc_line = sc_match.group(0)
    assert "_extractScreenContext(" in sc_line, (
        "screen_context must call _extractScreenContext(active). "
        f"Currently: {sc_line!r}"
    )
    assert "_extractVisibleText(active)" not in sc_line, (
        "screen_context must NOT use the old _extractVisibleText(active). "
        "FE-4 upgraded this path."
    )


# ---------------------------------------------------------------------------
# 3. Output cap at 2000 chars
# ---------------------------------------------------------------------------


def test_extract_screen_context_caps_at_2000_chars(runtime_js: str):
    """Body of _extractScreenContext must include `.slice(0, 2000)` so the
    request payload never explodes.
    """
    decl = "function _extractScreenContext("
    idx = runtime_js.find(decl)
    assert idx != -1, "runtime.js missing function _extractScreenContext"
    body = runtime_js[idx : idx + 1500]
    assert ".slice(0, 2000)" in body, (
        "_extractScreenContext must cap output at 2000 chars (`.slice(0, 2000)`)."
    )


# ---------------------------------------------------------------------------
# 4. Strip selectors include answer-key markup
# ---------------------------------------------------------------------------


REQUIRED_STRIP_SELECTORS = (
    # Original FE-4 set
    "[data-answer]",
    "[data-expected]",
    ".answer-key",
    "script",
    "style",
    # Sigma #197 follow-up — defensive expansion (PR #197 non-blocking).
    # Matches the broader scrub list already used by sanitizeScreenContext
    # in the tutor widget IIFE (perfect_homework.html ~L20502).
    "[data-correct]",
    "[data-answer-spec]",
    ".correct",
    ".is-correct",
    ".correct-answer",
    ".gb-aq-answer",
)


def _scrub_constant_body(runtime_js: str) -> str:
    """Locate the unified _ANSWER_SCRUB_SELECTORS constant and return its
    array literal body. Both _extractVisibleText and _extractScreenContext
    must consume this constant — refactored so adding a selector in one
    place is honored everywhere.
    """
    decl = "_ANSWER_SCRUB_SELECTORS"
    idx = runtime_js.find(decl)
    assert idx != -1, "runtime.js missing _ANSWER_SCRUB_SELECTORS constant"
    # Window from declaration through end of array literal.
    return runtime_js[idx : idx + 800]


@pytest.mark.parametrize("selector", REQUIRED_STRIP_SELECTORS)
def test_answer_scrub_constant_includes_required_selectors(runtime_js: str, selector: str):
    """The unified scrub constant must include every selector the tutor
    cannot be allowed to see, including Sigma #197's defensive additions.
    """
    body = _scrub_constant_body(runtime_js)
    # Match exact quoted string ('selector' or "selector").
    quoted_single = f"'{selector}'"
    quoted_double = f'"{selector}"'
    assert quoted_single in body or quoted_double in body, (
        f"_ANSWER_SCRUB_SELECTORS must include `{selector}` so neither "
        "_extractVisibleText nor _extractScreenContext leaks it."
    )


def test_extract_screen_context_uses_unified_scrub_constant(runtime_js: str):
    """_extractScreenContext must reference _ANSWER_SCRUB_SELECTORS (not
    inline a separate list) so the unified constant is the single source
    of truth.
    """
    decl = "function _extractScreenContext("
    idx = runtime_js.find(decl)
    assert idx != -1, "runtime.js missing function _extractScreenContext"
    body = runtime_js[idx : idx + 1500]
    assert "_ANSWER_SCRUB_SELECTORS" in body, (
        "_extractScreenContext must reference the unified _ANSWER_SCRUB_SELECTORS "
        "constant rather than inlining a separate selector list."
    )


def test_extract_visible_text_uses_unified_scrub_constant(runtime_js: str):
    """_extractVisibleText (legacy helper kept for back-compat) must also
    consume the unified constant so it doesn't drift behind.
    """
    decl = "function _extractVisibleText("
    idx = runtime_js.find(decl)
    assert idx != -1, "runtime.js missing function _extractVisibleText"
    body = runtime_js[idx : idx + 800]
    assert "_ANSWER_SCRUB_SELECTORS" in body, (
        "_extractVisibleText must also reference _ANSWER_SCRUB_SELECTORS."
    )


def test_strip_answer_attrs_helper_present(runtime_js: str):
    """A node may carry data-answer / data-expected as ATTRIBUTES rather
    than as nested elements (e.g., a question wrapper that holds the
    expected answer in a data-* attribute for client-side checking). The
    _stripAnswerAttrs helper removes those attributes from surviving nodes.
    """
    assert "function _stripAnswerAttrs(" in runtime_js, (
        "runtime.js must define _stripAnswerAttrs(clone) helper to strip "
        "leaky data-* attributes from surviving DOM nodes."
    )
    # Both extractors must call it.
    decl_screen = runtime_js.find("function _extractScreenContext(")
    decl_visible = runtime_js.find("function _extractVisibleText(")
    body_screen = runtime_js[decl_screen : decl_screen + 1500]
    body_visible = runtime_js[decl_visible : decl_visible + 800]
    assert "_stripAnswerAttrs(" in body_screen, (
        "_extractScreenContext must call _stripAnswerAttrs(clone)."
    )
    assert "_stripAnswerAttrs(" in body_visible, (
        "_extractVisibleText must call _stripAnswerAttrs(clone)."
    )


# ---------------------------------------------------------------------------
# 5. phase_artifacts field present in collectRuntimeContext return value
# ---------------------------------------------------------------------------


def test_collect_runtime_context_returns_phase_artifacts(runtime_js: str):
    """The return value must include a `phase_artifacts` key — forward-looking
    metadata for the AI side. May be an empty object when no dataset crumbs
    exist on the active element.
    """
    body = _collect_runtime_context_body(runtime_js)
    assert re.search(r"phase_artifacts\s*:", body), (
        "collectRuntimeContext return value must include `phase_artifacts: ...` "
        "(FE-4 metadata channel)."
    )


def test_extract_phase_artifacts_function_defined(runtime_js: str):
    """The artifact extractor helper must exist so the field is sourced
    consistently (not inline in collectRuntimeContext).
    """
    assert "function _extractPhaseArtifacts(" in runtime_js, (
        "runtime.js must define `function _extractPhaseArtifacts(activeEl)` — "
        "FE-4 helper that captures whitelisted dataset crumbs."
    )
