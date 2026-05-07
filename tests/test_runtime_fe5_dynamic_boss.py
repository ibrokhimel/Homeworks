"""Regression tests for the FE-5 dynamic Final Boss loop (Plan-5 wiring).

Pins the contract introduced when the static `BOSS_QUESTIONS`-driven boss
arc was replaced with a dynamic loop powered by the Plan-5 endpoints:

  bossStart           → /api/ai/boss/start
  bossGenerateQuestion → /api/ai/boss/generate-question
  bossSubmitAnswer     → /api/ai/boss/submit-answer

The frontend reaches those endpoints via the runtime.js bridge
(`window.NETS_AI.bossStart` / `.bossGenerateQuestion` / `.bossSubmitAnswer`)
which is locked by tests/test_runtime_fe_foundation.py.

What this file pins:

1. **`bossDynamicStart`** is defined as an async function inside the boss
   IIFE in perfect_homework.html.
2. **`bossFetchNextQuestion`** is defined as an async function and
   whitelists the response (no `expected_answer` / `acceptable` / `rubric`
   / `hints` rendering) — defense-in-depth for FE-6.
3. **`startFinalBoss`** body invokes `bossDynamicStart()` (and not just
   `initBossPlan`).
4. **`bossSubmitAnswer`** has a dynamic branch that calls
   `window.NETS_AI.bossSubmitAnswer(...)`.
5. **`bossState`** carries the new dynamic-mode fields:
   `bossSessionId`, `trialsLeft`, `currentQuestion`, `useDynamicBoss`.
6. **`bossRenderQuestion`** branches on `bossState.useDynamicBoss`.
7. **`bossHandleResponse`** reads `resp.is_correct` (Plan-5) with
   legacy `resp.correct` fallback.
8. **Hint button hidden in dynamic mode** — `bossRenderQuestion` sets
   `display:none` (or `disabled = true`) on `#boss-hint-btn` when
   `useDynamicBoss` is on.
9. **`bossUseHint`** early-exits when `useDynamicBoss` is true.

Companion to:
- tests/test_runtime_final_boss_ui.py (legacy contract, still pinned)
- tests/test_runtime_fe_foundation.py (runtime.js bridge URLs)
- docs/homeworks_ai_remaining_fix_report.md §FE-5
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
def perfect_homework_html() -> str:
    path = os.path.join(_repo_root(), "server", "template", "perfect_homework.html")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Helper — extract a JS function body by walking matched braces.
# ---------------------------------------------------------------------------


def _extract_function_body(html: str, fn_name: str) -> str:
    """Return the body of the first `function fn_name(...)` (async or sync)
    by counting matched braces. Raises AssertionError if not found.
    """
    pat = re.compile(
        rf"(?:async\s+)?function\s+{re.escape(fn_name)}\s*\([^)]*\)\s*\{{"
    )
    m = pat.search(html)
    assert m, f"function `{fn_name}` not found"
    start = m.end()
    depth = 1
    i = start
    while i < len(html) and depth > 0:
        c = html[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return html[start:i]


# ---------------------------------------------------------------------------
# 1. bossDynamicStart exists as an async function
# ---------------------------------------------------------------------------


def test_boss_dynamic_start_exists(perfect_homework_html: str):
    pat = re.compile(r"async\s+function\s+bossDynamicStart\s*\(")
    assert pat.search(perfect_homework_html), (
        "bossDynamicStart must exist as an async function (FE-5 entry point "
        "for the Plan-5 dynamic boss arc)"
    )


def test_boss_dynamic_start_calls_bridge(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossDynamicStart")
    assert "window.NETS_AI.bossStart" in body, (
        "bossDynamicStart must call window.NETS_AI.bossStart(...)"
    )


def test_boss_dynamic_start_handles_failure(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossDynamicStart")
    # Must guard against null / _error / _offline and flip useDynamicBoss=false.
    assert "useDynamicBoss" in body, (
        "bossDynamicStart must read/write bossState.useDynamicBoss"
    )
    assert re.search(r"useDynamicBoss\s*=\s*false", body), (
        "bossDynamicStart must flip useDynamicBoss=false on failure"
    )
    assert ("_error" in body) or ("_offline" in body), (
        "bossDynamicStart must check for _error or _offline failure markers"
    )


# ---------------------------------------------------------------------------
# 2. bossFetchNextQuestion exists as async function and whitelists response
# ---------------------------------------------------------------------------


def test_boss_fetch_next_question_exists(perfect_homework_html: str):
    pat = re.compile(r"async\s+function\s+bossFetchNextQuestion\s*\(")
    assert pat.search(perfect_homework_html), (
        "bossFetchNextQuestion must exist as an async function"
    )


def test_boss_fetch_next_question_calls_bridge(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossFetchNextQuestion")
    assert "window.NETS_AI.bossGenerateQuestion" in body, (
        "bossFetchNextQuestion must call window.NETS_AI.bossGenerateQuestion(...)"
    )


def test_boss_fetch_next_question_whitelists_safe_fields(perfect_homework_html: str):
    """Whitelist enforcement — only safe fields end up rendered."""
    body = _extract_function_body(perfect_homework_html, "bossFetchNextQuestion")
    for field in ("question_id", "question_text", "target_skill",
                   "difficulty", "why_this_question"):
        assert field in body, (
            f"bossFetchNextQuestion must reference safe field `{field}`"
        )


def test_boss_fetch_next_question_strips_dangerous_fields(perfect_homework_html: str):
    """FE-6 defense-in-depth — even if backend leaks expected_answer /
    acceptable / rubric / hints, frontend must explicitly strip them."""
    body = _extract_function_body(perfect_homework_html, "bossFetchNextQuestion")
    for forbidden in ("expected_answer", "acceptable", "rubric", "hints"):
        assert forbidden in body, (
            f"bossFetchNextQuestion must explicitly mention `{forbidden}` "
            f"in a strip/whitelist context (defense in depth for FE-6)"
        )
        # Make sure the mention is in a delete/strip context, not a render.
        # We look for `delete safe.<field>` or a comment about stripping.
        # If the literal `safe.<field> =` appears that would be a render —
        # forbid that.
        assert not re.search(
            rf"safe\.{re.escape(forbidden)}\s*=\s*res\.",
            body,
        ), (
            f"bossFetchNextQuestion must NOT assign `safe.{forbidden} = res.{forbidden}` "
            f"(would render forbidden field)"
        )


def test_boss_fetch_next_question_caps_recent_phrases(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossFetchNextQuestion")
    assert "recentBossPhrases" in body, (
        "bossFetchNextQuestion must update bossState.recentBossPhrases"
    )


# ---------------------------------------------------------------------------
# 3. startFinalBoss invokes bossDynamicStart
# ---------------------------------------------------------------------------


def test_start_final_boss_calls_dynamic_start(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "startFinalBoss")
    assert "bossDynamicStart" in body, (
        "startFinalBoss must invoke bossDynamicStart() to mint a Plan-5 "
        "boss_session_id before rendering Q0"
    )


def test_start_final_boss_calls_fetch_next_question(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "startFinalBoss")
    assert "bossFetchNextQuestion" in body, (
        "startFinalBoss must invoke bossFetchNextQuestion() so the first "
        "question is server-generated"
    )


# ---------------------------------------------------------------------------
# 4. bossSubmitAnswer has dynamic branch routing through window.NETS_AI
# ---------------------------------------------------------------------------


def test_boss_submit_answer_has_dynamic_branch(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossSubmitAnswer")
    assert "window.NETS_AI.bossSubmitAnswer" in body, (
        "bossSubmitAnswer must contain a branch calling "
        "window.NETS_AI.bossSubmitAnswer(...) for the Plan-5 dynamic path"
    )
    assert "useDynamicBoss" in body, (
        "bossSubmitAnswer must gate the dynamic branch on bossState.useDynamicBoss"
    )


def test_boss_submit_answer_preserves_legacy_branch(perfect_homework_html: str):
    """Legacy branch (POST /api/ai/check-answer phase=final-boss) must
    still exist so older homework templates keep grading."""
    body = _extract_function_body(perfect_homework_html, "bossSubmitAnswer")
    assert "/api/ai/check-answer" in body, (
        "bossSubmitAnswer must preserve the legacy /api/ai/check-answer "
        "branch as a fallback"
    )
    assert re.search(r"phase\s*:\s*['\"]final-boss['\"]", body), (
        "bossSubmitAnswer's legacy branch must still set phase: 'final-boss'"
    )


# ---------------------------------------------------------------------------
# 5. bossState carries new dynamic-mode fields
# ---------------------------------------------------------------------------


REQUIRED_DYNAMIC_FIELDS = [
    "bossSessionId",
    "trialsLeft",
    "currentQuestion",
    "currentDifficulty",
    "recentBossPhrases",
    "useDynamicBoss",
]


@pytest.mark.parametrize("field", REQUIRED_DYNAMIC_FIELDS)
def test_boss_state_has_dynamic_field(perfect_homework_html: str, field: str):
    m = re.search(
        r"const\s+bossState\s*=\s*\{(.*?)\};",
        perfect_homework_html,
        re.DOTALL,
    )
    assert m, "bossState literal missing"
    body = m.group(1)
    assert re.search(rf"\b{field}\s*:", body), (
        f"bossState literal must declare `{field}` for the FE-5 dynamic loop"
    )


# ---------------------------------------------------------------------------
# 6. bossRenderQuestion branches on useDynamicBoss
# ---------------------------------------------------------------------------


def test_boss_render_question_branches_on_dynamic(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossRenderQuestion")
    assert "useDynamicBoss" in body, (
        "bossRenderQuestion must check bossState.useDynamicBoss to branch "
        "between the dynamic path (currentQuestion) and the legacy "
        "BOSS_QUESTIONS path"
    )
    assert "currentQuestion" in body, (
        "bossRenderQuestion's dynamic branch must read bossState.currentQuestion"
    )
    # The dynamic branch must read question_text from currentQuestion.
    assert "question_text" in body, (
        "bossRenderQuestion's dynamic branch must render currentQuestion.question_text"
    )


def test_boss_render_question_hides_hint_btn_in_dynamic(perfect_homework_html: str):
    """In dynamic mode the hint button must be hidden or disabled."""
    body = _extract_function_body(perfect_homework_html, "bossRenderQuestion")
    # Must reference the hint button.
    assert "boss-hint-btn" in body, "bossRenderQuestion must reference #boss-hint-btn"
    # In the dynamic branch, the hint button is hidden (display:none) or
    # disabled. We require BOTH assignments to appear inside the function
    # body (the legacy branch keeps disabled=false / display='').
    assert re.search(r"display\s*=\s*['\"]none['\"]", body), (
        "bossRenderQuestion must set hint button display to 'none' in dynamic mode"
    )
    assert re.search(r"disabled\s*=\s*true", body), (
        "bossRenderQuestion must set hint button disabled=true in dynamic mode"
    )


# ---------------------------------------------------------------------------
# 7. bossHandleResponse reads resp.is_correct (Plan-5) with legacy fallback
# ---------------------------------------------------------------------------


def test_boss_handle_response_reads_is_correct(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossHandleResponse")
    assert re.search(r"resp\.is_correct", body), (
        "bossHandleResponse must read resp.is_correct (Plan-5 contract)"
    )
    # Legacy fallback to resp.correct should still be supported.
    assert re.search(r"resp\.correct", body), (
        "bossHandleResponse must keep resp.correct legacy fallback"
    )


def test_boss_handle_response_mirrors_trials_left(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossHandleResponse")
    assert "trials_left" in body, (
        "bossHandleResponse must mirror resp.trials_left into bossState"
    )


def test_boss_handle_response_mirrors_difficulty(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossHandleResponse")
    assert "current_difficulty" in body, (
        "bossHandleResponse must mirror resp.current_difficulty into bossState"
    )


# ---------------------------------------------------------------------------
# 8. bossUseHint early-exits in dynamic mode
# ---------------------------------------------------------------------------


def test_boss_use_hint_early_exits_in_dynamic(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossUseHint")
    assert "useDynamicBoss" in body, (
        "bossUseHint must check bossState.useDynamicBoss and early-exit"
    )


# ---------------------------------------------------------------------------
# 9. bossHandleAction routes through bossFetchNextQuestion in dynamic mode
# ---------------------------------------------------------------------------


def test_boss_handle_action_fetches_next_question_in_dynamic(perfect_homework_html: str):
    body = _extract_function_body(perfect_homework_html, "bossHandleAction")
    assert "bossFetchNextQuestion" in body, (
        "bossHandleAction must call bossFetchNextQuestion() when advancing "
        "to the next dynamic question"
    )
    assert "useDynamicBoss" in body, (
        "bossHandleAction must gate the dynamic-advance branch on useDynamicBoss"
    )


# ---------------------------------------------------------------------------
# 10. NO hardcoded answer keys / acceptable arrays in new helpers
# ---------------------------------------------------------------------------


def test_dynamic_helpers_no_hardcoded_answer_keys(perfect_homework_html: str):
    """User-locked rule: NO hardcoding of question text or answer keys in
    the FE code. Server is the source of truth in dynamic mode."""
    for fn in ("bossDynamicStart", "bossFetchNextQuestion"):
        body = _extract_function_body(perfect_homework_html, fn)
        for forbidden in ("q.acceptable", "q.accepted", "q.ans", "q.answer_spec"):
            assert forbidden not in body, (
                f"{fn} must not reference `{forbidden}` (server-only field)"
            )
