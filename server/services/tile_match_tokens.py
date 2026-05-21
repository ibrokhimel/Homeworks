"""Opaque per-side tile-match tokens — the no-shared-id leak fix.

The legacy tile-match hydration shipped `gb_tile_match` as
`[{id, left, right}]` where BOTH sides of a pair carry the SAME `id`, and the
grade is `left_id == right_id`. That means the client DOM literally encodes
every answer (which left matches which right). The legacy injector's
"side-disjoint" serializer kept the shared id too, so it never fixed this.

The real fix: hand the browser opaque per-side tokens (`L<mac>` / `R<mac>`)
that DON'T reveal pairing, and keep the index→token mapping server-side. The
grader recovers the pair index from each token via HMAC and grades by
`left_index == right_index`.

Contract: the grader route (`server/routes/ai.py`) imports `resolve_tm_pairs`
and `build_token_maps` from here. The canonical pair ORDERING produced by
`resolve_tm_pairs` MUST match `ai.py._resolve_tm_pairs` exactly, because the
token index is that ordinal — drift would mis-map every answer.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import random

_SECRET = (
    os.environ.get("TILE_MATCH_SECRET")
    or os.environ.get("SECRET_KEY")
    or "nets-tile-match-fallback-secret"
).encode()


def _tok(hw_id: str, idx: int, side: str) -> str:
    mac = hmac.new(
        _SECRET, f"{hw_id}:{idx}:{side}".encode(), hashlib.sha256
    ).hexdigest()[:12]
    return f"{side}{mac}"


def left_token(hw_id: str, idx: int) -> str:
    return _tok(hw_id, idx, "L")


def right_token(hw_id: str, idx: int) -> str:
    return _tok(hw_id, idx, "R")


def resolve_tm_pairs(content_json: dict) -> list[dict]:
    """Canonical ordered pair list: gb_tile_match wins, else gb_memory_match shim.

    Returns ``[{'left': str, 'right': str}, ...]`` in the SAME order as
    ``ai.py._resolve_tm_pairs`` (gb_tile_match items in authored order, else
    gb_memory_match ``[[a, b], ...]`` shimmed). Server-only fields
    (``explanation`` and friends) are stripped — only the display sides remain.
    """
    if not isinstance(content_json, dict):
        return []

    items = content_json.get("gb_tile_match")
    pairs: list[dict] = []
    if isinstance(items, list) and items:
        for item in items:
            if isinstance(item, dict):
                src = item
            else:
                # Pydantic model fallback — mirrors _resolve_tm_pairs.
                try:
                    src = dict(item)
                except Exception:
                    continue
            pairs.append({
                "left": str(src.get("left", "")),
                "right": str(src.get("right", "")),
            })
        return pairs

    legacy = content_json.get("gb_memory_match")
    if isinstance(legacy, list):
        for pair in legacy:
            if not (isinstance(pair, (list, tuple)) and len(pair) >= 2):
                continue
            pairs.append({"left": str(pair[0]), "right": str(pair[1])})
    return pairs


def build_token_maps(hw_id: str, num_pairs: int) -> tuple[dict, dict]:
    """Returns ``(lid_map, rid_map)`` = ``{token: pair_index}`` for the grader."""
    lid = {left_token(hw_id, i): i for i in range(num_pairs)}
    rid = {right_token(hw_id, i): i for i in range(num_pairs)}
    return lid, rid


def _seeded_shuffle(items: list, seed: int) -> list:
    """Deterministic Fisher–Yates shuffle (stable per seed)."""
    out = list(items)
    rng = random.Random(seed)
    rng.shuffle(out)
    return out


def build_hydration_tiles(hw_id: str, content_json: dict) -> dict:
    """Student-safe tile-match payload — sides independently shuffled, NO shared id.

    Returns ``{'lefts': [{'lid': str, 'text': str}, ...],
               'rights': [{'rid': str, 'text': str}, ...]}``.

    Each tile carries only an opaque per-side token + its display text. There is
    no field on any tile that links a left to its right, so the client DOM
    cannot recover the pairing. Both columns are shuffled deterministically per
    ``hw_id`` so re-hydration is stable (same student sees the same board).
    """
    pairs = resolve_tm_pairs(content_json)
    lefts = [
        {"lid": left_token(hw_id, i), "text": p.get("left", "")}
        for i, p in enumerate(pairs)
    ]
    rights = [
        {"rid": right_token(hw_id, i), "text": p.get("right", "")}
        for i, p in enumerate(pairs)
    ]
    base_seed = int(hashlib.sha256(hw_id.encode()).hexdigest()[:8], 16)
    return {
        "lefts": _seeded_shuffle(lefts, base_seed),
        # +31 so the two sides shuffle independently (no positional pairing).
        "rights": _seeded_shuffle(rights, base_seed + 31),
    }
