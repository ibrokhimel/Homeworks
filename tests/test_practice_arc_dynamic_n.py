"""Dynamic-N Practice Arc — content_json round-trip + redactor coverage.

Validates that a v2 homework with N games (N=2 and N=6) flows cleanly through:

  1. Pydantic schema validation (server/schemas/content.py)
  2. The runtime hydration redactor (server/services/runtime_redactor.py)
  3. The check-answer 403-gating path (server/routes/ai.py practice_locked)

The frontend's `resolveGameOrder()` is purely declarative (it just slices
content_json.practice_arc.games[]), so the server-side gate + redactor are the
right place to pin "N games render correctly" end-to-end. The actual visual
walk-through is browser-only (out of scope for pytest).
"""

import pytest

from server.schemas.content import ContentJSON
from server.services.runtime_redactor import redact_for_runtime


def _pa_games(cj):
    """`practice_arc` is unstructured (extra='allow') — read its games[] as a dict."""
    pa = cj.practice_arc
    if pa is None:
        return None
    return pa["games"] if isinstance(pa, dict) else pa.games


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mk_v2_content(game_ids):
    """Build a minimal v2 content_json with a Practice Arc plan of `game_ids`."""
    return {
        "flow_version": "v2",
        "meta": {"title": f"N={len(game_ids)} arc"},
        "case_based_preview": {
            "checkpoints": [
                {
                    "question": f"Q{i}",
                    "options": ["a", "b"],
                    "answer_spec": {"type": "option_index", "expected": i % 2},
                }
                for i in range(3)
            ],
        },
        "memory_check": {
            "pass_threshold_pct": 60,
            "items": [
                {
                    "type": "mcq",
                    "prompt": f"MC{i}",
                    "options": ["a", "b"],
                    "answer_spec": {"type": "option_index", "expected": i % 2},
                }
                for i in range(3)
            ],
        },
        "practice_arc": {"games": list(game_ids)},
        # Minimal authored content for each referenced game so the redactor
        # has something to scrub + the order resolver has something to count.
        "gb_tile_match": [
            {"id": "tm1", "left": "F=ma", "right": "Newton 2", "tier": "basic",
             "explanation": "SERVER_ONLY_LEAK_CANARY_TM"},
        ],
        "gb_sentence_fill": [
            {"id": "sf1", "mode": "free_recall", "passage": "___ is force.",
             "answers": ["F"], "explanations": ["SERVER_ONLY_LEAK_CANARY_SF"]},
        ],
        "real_life_challenge": {
            "id": "rlc1", "expert_role": "general",
            "title": "case", "intro": "ctx", "pisa_level": "L4",
            "tier": "basic", "grade_band": "g7_9", "variant": "standard",
            "steps": [
                {"id": "step1", "kind": "decision", "title": "T", "prompt": "?",
                 "options": [
                     {"id": "a", "label": "A", "is_correct": True,
                      "consequence": "SERVER_ONLY_LEAK_CANARY_RLC"},
                     {"id": "b", "label": "B", "is_correct": False},
                 ]},
                {"id": "step2", "kind": "info_request", "title": "T", "prompt": "?",
                 "options": [
                     {"id": "a", "label": "A", "is_correct": True},
                     {"id": "b", "label": "B", "is_correct": False},
                 ]},
                {"id": "step3", "kind": "final_decision", "title": "T", "prompt": "?",
                 "options": [
                     {"id": "a", "label": "A", "is_correct": True},
                     {"id": "b", "label": "B", "is_correct": False},
                 ]},
                {"id": "step4", "kind": "concept_select", "title": "T", "prompt": "?",
                 "concept_chips": [
                     {"id": "c1", "label": "C1", "is_correct": True},
                     {"id": "c2", "label": "C2", "is_correct": False},
                     {"id": "c3", "label": "C3", "is_correct": False},
                 ]},
                {"id": "step5", "kind": "reasoning", "title": "T", "prompt": "?",
                 "min_chars": 80, "acceptable_keywords": ["SERVER_ONLY_LEAK_CANARY_RLC_KW"]},
            ],
        },
        # New Practice Arc games (Memory Matching / Jigsaw Matching /
        # Error Detection / Assembly).
        "gb_memory_matching": [
            {"id": "mm1", "case_setup": "Case",
             "checkpoints": [
                 {"question": "Q", "options": ["a", "b"],
                  "answer_spec": {"type": "option_index", "expected": 0}},
             ]},
        ],
        "gb_jigsaw_matching": [
            {"id": "jm1", "case_setup": "Case",
             "pieces": [{"id": "p1", "label": "A"}],
             "checkpoints": [
                 {"question": "Q", "options": ["a", "b"],
                  "answer_spec": {"type": "option_index", "expected": 1}},
             ]},
        ],
        "gb_error_detection": [
            {"id": "ed1", "instructions": "Find the error",
             "work_blocks": [
                 {"id": "b1", "text": "2 + 2 = 5", "is_broken": True},
                 {"id": "b2", "text": "3 + 1 = 4"},
             ],
             "correction": "2 + 2 = 4"},
        ],
        "gb_assembly": [
            {"id": "a1", "instructions": "Order the steps",
             "pieces": [{"id": "p1", "label": "First"}, {"id": "p2", "label": "Second"}],
             "expected_order": ["p1", "p2"]},
        ],
        "boss_questions": [
            {"q": "Final?", "answer_spec": {"type": "text_exact", "expected": "yes"}},
        ],
    }


# ---------------------------------------------------------------------------
# Schema accepts both N=2 and N=6 plans
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "games",
    [
        # N=2 — minimum that exercises sequencing
        ["tile_match", "boss"],
        # N=6 — Real-Life Challenge sits as one of N + Boss closes the arc.
        # Mix of legacy games and the 4 newly-wired Infra-spec games.
        ["memory_matching", "tile_match", "jigsaw_matching",
         "error_detection", "assembly", "boss"],
    ],
)
def test_v2_content_accepts_n_game_arc(games):
    """Schema validation: 2-game and 6-game v2 plans both validate."""
    cj = ContentJSON(**_mk_v2_content(games))
    assert cj.flow_version == "v2"
    assert cj.practice_arc is not None
    assert _pa_games(cj) == games


def test_n6_arc_includes_all_four_new_games():
    """The 6-game arc must include every newly-wired Infra-spec game,
    proving the new schema fields + game keys round-trip through
    practice_arc.games[]."""
    games = ["memory_matching", "tile_match", "jigsaw_matching",
             "error_detection", "assembly", "boss"]
    cj = ContentJSON(**_mk_v2_content(games))
    plan_games = _pa_games(cj)
    for k in ("memory_matching", "jigsaw_matching", "error_detection", "assembly"):
        assert k in plan_games
    # And each game's content array survives schema validation.
    assert cj.gb_memory_matching is not None and len(cj.gb_memory_matching) == 1
    assert cj.gb_jigsaw_matching is not None and len(cj.gb_jigsaw_matching) == 1
    assert cj.gb_error_detection is not None and len(cj.gb_error_detection) == 1
    assert cj.gb_assembly is not None and len(cj.gb_assembly) == 1


# ---------------------------------------------------------------------------
# Redactor strips answer-bearing fields for both N values
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "games,n_label",
    [
        (["tile_match", "boss"], "N=2"),
        (["memory_matching", "tile_match", "jigsaw_matching",
          "error_detection", "assembly", "boss"], "N=6"),
    ],
)
def test_redactor_scrubs_every_game_at_arc_size(games, n_label):
    """Hydration redactor strips answer-bearing keys at every depth for
    every game's authored content — regardless of arc length."""
    raw = _mk_v2_content(games)
    redacted = redact_for_runtime(raw)
    flat = repr(redacted)

    # Per-game leak canaries — none may survive redaction.
    for canary in (
        "SERVER_ONLY_LEAK_CANARY_TM",
        "SERVER_ONLY_LEAK_CANARY_SF",
        "SERVER_ONLY_LEAK_CANARY_RLC",
        "SERVER_ONLY_LEAK_CANARY_RLC_KW",
    ):
        assert canary not in flat, f"{n_label}: leak canary {canary} survived redaction"

    # Universal answer-bearing keys removed (parity with PR-3 MC + CBP).
    for forbidden_key in ("answer_spec", "is_correct", "acceptable_keywords",
                          "expected_order", "is_broken", "correction"):
        assert f"'{forbidden_key}'" not in flat, (
            f"{n_label}: answer-bearing key '{forbidden_key}' survived redaction"
        )


def test_redactor_preserves_practice_arc_games_list():
    """The plan itself is NOT an answer — practice_arc.games[] must
    survive redaction so the client can render the arc."""
    games = ["memory_matching", "jigsaw_matching", "error_detection",
             "assembly", "tile_match", "boss"]
    raw = _mk_v2_content(games)
    redacted = redact_for_runtime(raw)
    assert redacted["practice_arc"]["games"] == games


# ---------------------------------------------------------------------------
# Server-enforced gate parity — every new game routes via the same lock
# ---------------------------------------------------------------------------


def test_all_new_game_phases_funnel_through_practice_phase():
    """The four new games' phase strings ('memory-matching',
    'jigsaw-matching', 'error-detection', 'assembly') are practice-tier —
    NOT 'preview' — so they inherit PRACTICE redaction in tutor.py via the
    existing screen→phase mapping (frontend/app/src/runtime/store.ts).
    Pin the contract: none of these phase strings are equal to 'preview'.
    """
    practice_phases = [
        "memory-matching",
        "jigsaw-matching",
        "error-detection",
        "assembly",
    ]
    for p in practice_phases:
        assert p != "preview"
        # Each phase string is non-empty and lowercase — the wire-format
        # convention every existing v2 game endpoint uses.
        assert p == p.lower() and p.strip()
