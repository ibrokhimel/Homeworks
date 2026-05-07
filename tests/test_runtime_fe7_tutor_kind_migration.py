"""Regression tests for FE-7 — tutor kind migration off the bare
`kind: 'tutor'` event dispatcher.

PR #192 introduced `kind: 'tutor-chat'` routing in the runtime event
bridge so dispatchers go through `tutorChat` (`/api/ai/tutor/chat`)
which carries cap / warning / deduction logic. Templates that still
dispatched `kind: 'tutor'` were silently routing through the legacy
`tutor()` (`/api/ai/tutor`) endpoint and skipping that logic.

This module pins the migration:

1. **Zero bare `kind: 'tutor'` in `server/template/`** — every
   dispatcher must use either `'tutor-chat'` (new path) or
   `'legacy-tutor'` (explicit legacy fallback). A bare `'tutor'`
   matches the back-compat alias in runtime.js but is silent —
   we want every caller to declare its intent.
2. **At least one `kind: 'tutor-chat'` reference exists** somewhere
   in `server/template/` (runtime.js counts) — proves the new path
   is wired.
3. **Event bridge mapping for `'tutor-chat'` → tutorChat** — re-pins
   the runtime.js routing established in PR #192 so this scope is
   self-contained.
"""
from __future__ import annotations

import os
import re

import pytest


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _walk_template_files() -> list[str]:
    template_dir = os.path.join(_repo_root(), "server", "template")
    paths: list[str] = []
    for root, _, files in os.walk(template_dir):
        for fname in files:
            if fname.endswith(".html") or fname.endswith(".js"):
                paths.append(os.path.join(root, fname))
    return paths


@pytest.fixture(scope="module")
def runtime_js() -> str:
    path = os.path.join(_repo_root(), "server", "template", "runtime.js")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# 1. Zero bare `kind: 'tutor'` dispatchers in templates
# ---------------------------------------------------------------------------


def test_no_template_dispatches_kind_tutor():
    """Bare `kind: 'tutor'` matches the runtime back-compat alias but bypasses
    cap/warning/deduction logic. Every dispatcher must declare its intent
    explicitly — either `'tutor-chat'` (new path) or `'legacy-tutor'`
    (explicit legacy).
    """
    # Match `kind: 'tutor'` and `kind: "tutor"` but NOT `'tutor-chat'` or
    # `'legacy-tutor'`. The negative lookahead/lookbehind enforces this.
    pattern = re.compile(r"kind:\s*['\"]tutor['\"](?![-\w])")
    offenders: list[tuple[str, int]] = []
    for fpath in _walk_template_files():
        with open(fpath, "r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if pattern.search(line):
                    offenders.append((fpath, lineno))
    assert offenders == [], (
        "Found bare `kind: 'tutor'` dispatcher(s) in server/template/. "
        "Migrate to 'tutor-chat' (new architecture) or 'legacy-tutor' "
        "(explicit legacy). Offenders: "
        f"{offenders}"
    )


# ---------------------------------------------------------------------------
# 2. At least one `kind: 'tutor-chat'` reference in templates / runtime
# ---------------------------------------------------------------------------


def test_at_least_one_tutor_chat_reference_in_templates():
    """Proves the new `tutor-chat` kind is wired somewhere under
    `server/template/`. runtime.js counts (the event bridge maps
    `kind === 'tutor-chat'` → tutorChat).
    """
    pattern = re.compile(r"['\"]tutor-chat['\"]")
    hits: list[str] = []
    for fpath in _walk_template_files():
        with open(fpath, "r", encoding="utf-8") as f:
            if pattern.search(f.read()):
                hits.append(fpath)
    assert hits, (
        "No `'tutor-chat'` reference found anywhere under server/template/. "
        "The new tutor-chat path is unwired."
    )


# ---------------------------------------------------------------------------
# 3. Event bridge maps 'tutor-chat' → tutorChat (runtime.js)
# ---------------------------------------------------------------------------


def _event_bridge_body(runtime_js: str) -> str:
    match = re.search(
        r"document\.addEventListener\('nets:submit',\s*async\s*\(ev\)\s*=>\s*\{(.*?)\n\s*\}\);",
        runtime_js,
        re.DOTALL,
    )
    assert match, "nets:submit listener not found in runtime.js"
    return match.group(1)


def test_event_bridge_routes_tutor_chat_to_tutor_chat_fn(runtime_js: str):
    """re-pin of the FE-foundation contract: kind: 'tutor-chat' must route
    to `await tutorChat(payload)`. Self-contained for FE-7 scope.
    """
    body = _event_bridge_body(runtime_js)
    pattern = r"kind\s*===\s*'tutor-chat'\s*\)\s*result\s*=\s*await\s+tutorChat\("
    assert re.search(pattern, body), (
        "nets:submit kind 'tutor-chat' must route to await tutorChat(payload)."
    )


def test_event_bridge_legacy_tutor_kind_still_works(runtime_js: str):
    """The explicit `'legacy-tutor'` kind must keep routing to the legacy
    tutor() implementation — that's the path FE-7 callers (real-life
    challenge AI verdict) opt into.
    """
    body = _event_bridge_body(runtime_js)
    pattern = r"kind\s*===\s*'legacy-tutor'\s*\)\s*result\s*=\s*await\s+tutor\("
    assert re.search(pattern, body), (
        "nets:submit kind 'legacy-tutor' must route to await tutor(payload)."
    )
