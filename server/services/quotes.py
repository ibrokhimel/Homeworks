"""Gate-quote selector for Phase 0-A.

Loads quotes_database.json once at module import (mirrors injector.py:13's
caching pattern). Public API:

  all_quotes()     — full list, used by GET /api/meta/quotes
  select(quote)    — pick one quote per inject call: pinned > custom > weighted random
  migrate_legacy() — fold legacy `content_json.quotes` shapes into the new
                     `gate_quote = {mode, pinned_id?, custom?}` envelope

National-Pride distribution (NETS framework v0.2):
  origin: 55% National / 45% Global
  type:   70% fact      / 30% quote
"""

from __future__ import annotations

import json
import random as _random_module
from typing import Any

from ..config import DATA_DIR

_QUOTES_PATH = DATA_DIR / "quotes_database.json"

# Read once at module load.
with open(_QUOTES_PATH, "r", encoding="utf-8") as _f:
    _LIBRARY: list[dict] = json.load(_f)

# Index by id for O(1) pinned lookup.
_BY_ID: dict[int, dict] = {int(q["id"]): q for q in _LIBRARY if "id" in q}

# Pre-bucketed by (origin, type) for fast weighted selection.
_BUCKETS: dict[tuple[str, str], list[dict]] = {}
for _q in _LIBRARY:
    _origin = str(_q.get("origin", "National"))
    _type = str(_q.get("type", "fact"))
    _BUCKETS.setdefault((_origin, _type), []).append(_q)

_VALID_TYPES = ("fact", "quote")
_DEMO_PHRASES = (
    "yaxshi uka",
    "keep going",
    "keep poing",
)


def all_quotes() -> list[dict]:
    """Return the full library (read-only — do not mutate)."""
    return _LIBRARY


def _to_template_shape(entry: dict) -> dict:
    """Convert a library entry into the runtime template shape expected by
    perfect_homework.html: {t, a, origin, type}. Keeps id for traceability."""
    return {
        "t": str(entry.get("text", "")),
        "a": str(entry.get("author", "")),
        "origin": str(entry.get("origin", "National")),
        "type": str(entry.get("type", "fact")),
        "id": entry.get("id"),
        "category": entry.get("category"),
    }


def _is_demo_text(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in _DEMO_PHRASES)


def _normalized_allowed_types(allowed_types: tuple[str, ...] | list[str] | None) -> tuple[str, ...]:
    if not allowed_types:
        return _VALID_TYPES
    out = tuple(t for t in allowed_types if t in _VALID_TYPES)
    return out or _VALID_TYPES


def _weighted_random(rng, *, allowed_types: tuple[str, ...] | list[str] | None = None) -> dict:
    """Pick one entry applying the 55/45 + 70/30 rule.

    Falls through to nearest non-empty bucket if a target combo is missing,
    so the function never raises even if the library is unbalanced.
    """
    allowed = _normalized_allowed_types(allowed_types)
    origin = "National" if rng.random() < 0.55 else "Global"
    if allowed == ("quote",):
        qtype = "quote"
    elif allowed == ("fact",):
        qtype = "fact"
    else:
        qtype = "fact" if rng.random() < 0.70 else "quote"
    bucket = _BUCKETS.get((origin, qtype))
    if not bucket:
        # Try the same origin with the other type.
        other_type = "quote" if qtype == "fact" else "fact"
        if other_type in allowed:
            bucket = _BUCKETS.get((origin, other_type))
    if not bucket:
        # Try the other origin with the original type.
        other_origin = "Global" if origin == "National" else "National"
        bucket = _BUCKETS.get((other_origin, qtype))
    if not bucket:
        # Anything allowed we can find.
        bucket = [q for q in _LIBRARY if str(q.get("type", "fact")) in allowed] or _LIBRARY
    return _to_template_shape(rng.choice(bucket))


def select(content_quote: Any, *, rng=None, allowed_types: tuple[str, ...] | list[str] | None = None) -> dict:
    """Return one gate quote in template shape.

    content_quote: the value of `content_json.gate_quote` (or the legacy
    `content_json.quotes`). Accepted shapes:

      {mode: "auto"}                         → weighted random
      {mode: "pinned", pinned_id: <int>}     → look up by id, fall back to auto
      {mode: "custom", custom: {text, author}} → return the custom verbatim
      None / {}                              → weighted random
      legacy ["string", ...] / [{t,a}, ...]  → migrate_legacy first

    rng: optional `random.Random` instance for deterministic tests.
    """
    if rng is None:
        rng = _random_module
    allowed = _normalized_allowed_types(allowed_types)
    envelope = migrate_legacy(content_quote)
    mode = envelope.get("mode", "auto")

    if mode == "custom":
        custom = envelope.get("custom") or {}
        text = str(custom.get("text", "")).strip()
        qtype = str(custom.get("type", "quote"))
        if not text or _is_demo_text(text) or qtype not in allowed:
            return _weighted_random(rng, allowed_types=allowed)
        return {
            "t": text,
            "a": str(custom.get("author", "")),
            "origin": str(custom.get("origin", "National")),
            "type": qtype,
            "id": None,
            "category": None,
        }

    if mode == "pinned":
        pid = envelope.get("pinned_id")
        try:
            pid_int = int(pid) if pid is not None else None
        except (TypeError, ValueError):
            pid_int = None
        if pid_int is not None and pid_int in _BY_ID:
            entry = _BY_ID[pid_int]
            if str(entry.get("type", "fact")) in allowed:
                return _to_template_shape(entry)
        # Pinned id missing or invalid → fall through to auto.

    return _weighted_random(rng, allowed_types=allowed)


def select_sequence(content_quote: Any, *, rng=None) -> list[dict]:
    """Return the runtime quote/fact sequence.

    Slot 0 is the gate before preview, so it is quote-only. Slot 1 is the
    first-third break between preview and flashcards, where facts and quotes
    may mix. Slot 2 is shown after flashcards and is fact-only.
    """
    if rng is None:
        rng = _random_module
    return [
        select(content_quote, rng=rng, allowed_types=("quote",)),
        select({"mode": "auto"}, rng=rng),
        select({"mode": "auto"}, rng=rng, allowed_types=("fact",)),
    ]


def migrate_legacy(value: Any) -> dict:
    """Normalize any historical `content_json.quotes` shape into the new
    gate_quote envelope `{mode, pinned_id?, custom?}`.

    Rules:
      None | {} | []                        → {mode: "auto"}
      already-an-envelope dict              → returned as-is (after light fix)
      ["string", ...]                       → custom from first non-empty
      [{t, a, ...}, ...]                    → custom from first entry
      something else                        → {mode: "auto"} (defensive)
    """
    if value is None:
        return {"mode": "auto"}

    # Already in new shape (or close enough).
    if isinstance(value, dict):
        mode = value.get("mode")
        if mode in ("auto", "pinned", "custom"):
            return value
        # Looks like a single library row? Treat as a pinned lookup if id present.
        if "id" in value and "text" in value:
            return {"mode": "pinned", "pinned_id": value["id"]}
        # Looks like a {t, a} runtime row? Treat as custom.
        if "t" in value or "a" in value:
            return {
                "mode": "custom",
                "custom": {
                    "text": str(value.get("t", "")),
                    "author": str(value.get("a", "")),
                },
            }
        return {"mode": "auto"}

    if isinstance(value, list):
        # Scan for the first non-empty entry — empty leading slots are
        # historical artefacts from "+ Add quote" buttons that were never
        # filled in.
        for entry in value:
            if isinstance(entry, str) and entry.strip():
                text = entry.strip()
                if _is_demo_text(text):
                    continue
                return {
                    "mode": "custom",
                    "custom": {"text": text, "author": ""},
                }
            if isinstance(entry, dict):
                text = entry.get("t") or entry.get("text") or ""
                author = entry.get("a") or entry.get("author") or ""
                text_str = str(text).strip()
                if text_str and not _is_demo_text(text_str):
                    return {
                        "mode": "custom",
                        "custom": {"text": text_str, "author": str(author).strip()},
                    }
        return {"mode": "auto"}

    if isinstance(value, str) and value.strip() and not _is_demo_text(value.strip()):
        return {"mode": "custom", "custom": {"text": value.strip(), "author": ""}}

    return {"mode": "auto"}
