"""Server-side redaction boundary for the React runtime hydration payload.

`GET /api/runtime/homeworks/{id}` returns the student-safe content_json. This
module strips every answer-bearing field BEFORE the JSON ever reaches the
browser — the delivery-mechanism replacement for the legacy injector's
per-game stripping (which only happened because the injector built the client
JS globals).

Fail-closed design:
  - The entire `answer_spec` subtree is deleted wherever it appears.
  - Every key in ANSWER_BEARING_KEYS is deleted at every nesting depth.
  - Recursion covers dicts + lists, so nested options/checkpoints/steps are
    all scrubbed.

This is intentionally a DENY-list over a sprawling display schema (titles,
prompts, options, story, front/back, etc. must pass through), backed by the
ANSWER_BEARING_KEYS single-source set + a regression test that asserts no
answer substrings survive.
"""

from __future__ import annotations

import copy
from typing import Any

from .redaction_constants import ANSWER_BEARING_KEYS


def _scrub(node: Any) -> Any:
    """Recursively remove answer-bearing keys from a dict/list tree (in place)."""
    if isinstance(node, dict):
        for key in list(node.keys()):
            if key in ANSWER_BEARING_KEYS:
                del node[key]
                continue
            node[key] = _scrub(node[key])
        return node
    if isinstance(node, list):
        return [_scrub(item) for item in node]
    return node


def redact_for_runtime(content_json: dict | None) -> dict:
    """Return a deep-copied, student-safe view of content_json.

    The input is never mutated (the DB row + builder read path keep the full
    answers). Safe to call on any flow_version — it only removes answer fields,
    leaving all display content intact.
    """
    if not content_json:
        return {}
    safe = copy.deepcopy(content_json)
    return _scrub(safe)
