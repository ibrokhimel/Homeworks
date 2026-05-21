"""Tests for the Homework Flow v2 Practice Arc (PR-4).

Scope:
  - Schema accepts `flow_version` + `practice_arc` as additive top-level keys.
  - Injector serialises both into JS globals (FLOW_VERSION / PRACTICE_ARC).
  - Legacy homeworks (no flow_version) keep shipping FLOW_VERSION = null and
    PRACTICE_ARC = null — the v2 engine stays dormant.
  - Template ships:
      * the new FLOW_VERSION / PRACTICE_ARC consts,
      * the PracticeArcV2 IIFE engine with the documented public surface
        (register / setStageV2 / enter / handoffToBoss / advance / reset /
        unlockGatePassed / listGames),
      * built-in adapter bootstrap for every game id the injector knows about.
  - The legacy 9-phase engine is fully untouched:
      * setStage(n) still exists,
      * gbActiveGameOrder() still owns the dynamic game-break carousel,
      * startFinalBoss() still owns the Boss handoff.
  - The plan is dynamic: PRACTICE_ARC.games[] order + count round-trip through
    the injector unmodified.
"""

import json
import re

from pydantic import ValidationError

from server.schemas.content import (
    ContentJSON,
    PracticeArc,
    PracticeArcGame,
)
from server.services.injector import (
    _PRACTICE_ARC_KNOWN_GAMES,
    _serialize_flow_version,
    _serialize_practice_arc,
    inject,
    verify_template,
)


# --------------------------------------------------------------------------- #
# Schema                                                                       #
# --------------------------------------------------------------------------- #


def test_flow_version_accepts_v1_v2_and_none():
    assert ContentJSON(flow_version="v1").flow_version == "v1"
    assert ContentJSON(flow_version="v2").flow_version == "v2"
    assert ContentJSON().flow_version is None


def test_flow_version_rejects_unknown_values():
    try:
        ContentJSON(flow_version="v9")
    except ValidationError:
        return
    raise AssertionError("flow_version must reject unknown literal values")


def test_practice_arc_schema_round_trip_with_variable_game_count():
    # Three games: explicit variable count + variable order. Real Life
    # Challenge is one game among N — NOT a dedicated phase slot.
    plan = PracticeArc(
        games=[
            PracticeArcGame(id="tm"),
            PracticeArcGame(id="rlc", label="Case-Based Decision"),
            PracticeArcGame(id="sf", required=False, config={"hint_budget": 2}),
        ],
        boss_after=True,
        unlock_required=True,
    )
    assert [g.id for g in plan.games] == ["tm", "rlc", "sf"]
    assert plan.games[2].config == {"hint_budget": 2}


def test_practice_arc_defaults_match_v2_spec():
    plan = PracticeArc(games=[PracticeArcGame(id="aq")])
    assert plan.boss_after is True
    assert plan.unlock_required is True
    assert plan.games[0].required is True


def test_contentjson_accepts_practice_arc_additive_keys():
    cj = ContentJSON(
        flow_version="v2",
        practice_arc=PracticeArc(games=[PracticeArcGame(id="rlc"), PracticeArcGame(id="tm")]),
    )
    assert cj.flow_version == "v2"
    assert cj.practice_arc is not None
    assert [g.id for g in cj.practice_arc.games] == ["rlc", "tm"]


def test_legacy_contentjson_still_renders_without_v2_keys():
    cj = ContentJSON(panels=[], flashcards=[])
    assert cj.flow_version is None
    assert cj.practice_arc is None


# --------------------------------------------------------------------------- #
# Injector serialisation                                                       #
# --------------------------------------------------------------------------- #


def test_serialize_flow_version_normalises_to_null_or_enum():
    assert _serialize_flow_version("v2") == json.dumps("v2")
    assert _serialize_flow_version("v1") == json.dumps("v1")
    assert _serialize_flow_version(None) == "null"
    assert _serialize_flow_version("garbage") == "null"


def test_serialize_practice_arc_strips_empty_ids_and_preserves_order():
    raw = {
        "games": [
            {"id": "tm"},
            {"id": ""},                  # dropped
            "not-a-dict",                # dropped
            {"id": "rlc", "label": "Decide"},
            {"id": "sf", "required": False, "config": {"hint_budget": 2}},
        ],
        "boss_after": False,
        "unlock_required": False,
    }
    js = _serialize_practice_arc(raw)
    obj = json.loads(js)
    assert obj["boss_after"] is False
    assert obj["unlock_required"] is False
    assert [g["id"] for g in obj["games"]] == ["tm", "rlc", "sf"]
    assert obj["games"][1]["label"] == "Decide"
    assert obj["games"][2]["required"] is False
    assert obj["games"][2]["config"] == {"hint_budget": 2}


def test_serialize_practice_arc_ships_null_when_absent():
    assert _serialize_practice_arc(None) == "null"
    assert _serialize_practice_arc({}) == "null"


def test_known_game_ids_cover_existing_game_break_library():
    # Sanity fence: the runtime adapter bootstrap registers every id the
    # injector documents. If we add a new game in PRACTICE_ARC.games[], we
    # also expect a registered adapter (PR-2/3 may extend the set later).
    assert "rlc" in _PRACTICE_ARC_KNOWN_GAMES
    assert "real_life" in _PRACTICE_ARC_KNOWN_GAMES
    for gb_id in ("aq", "wc", "tm", "pl", "mb", "ttt", "sf", "mp"):
        assert gb_id in _PRACTICE_ARC_KNOWN_GAMES


# --------------------------------------------------------------------------- #
# Injector → template wiring                                                   #
# --------------------------------------------------------------------------- #


def _minimal_legacy_content():
    return {
        "meta": {"title": "Legacy", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [],
        "flashcards": [],
        "memory_sprint": [],
        "boss_questions": [],
    }


def _minimal_v2_content():
    return {
        "meta": {"title": "V2 Plan", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [],
        "flashcards": [],
        "memory_sprint": [],
        "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [
                {"id": "tm"},
                {"id": "rlc"},
                {"id": "sf"},
            ],
            "boss_after": True,
            "unlock_required": True,
        },
    }


def _extract_const(html: str, name: str) -> str:
    m = re.search(rf"const\s+{re.escape(name)}\s*=\s*(.+?);", html, re.DOTALL)
    assert m, f"const {name} not found in injected template"
    return m.group(1).strip()


def test_verify_template_includes_v2_globals():
    result = verify_template()
    assert result == {"ok": True, "missing": []}


def test_inject_renders_null_globals_for_legacy_homework():
    html = inject(_minimal_legacy_content(), runtime_context={"hw_id": "HW-LEGACY"})
    assert "__FLOW_VERSION__" not in html
    assert "__PRACTICE_ARC__" not in html
    assert _extract_const(html, "FLOW_VERSION") == "null"
    assert _extract_const(html, "PRACTICE_ARC") == "null"


def test_inject_renders_v2_globals_when_authored():
    html = inject(_minimal_v2_content(), runtime_context={"hw_id": "HW-V2"})

    assert _extract_const(html, "FLOW_VERSION") == json.dumps("v2")
    plan_js = _extract_const(html, "PRACTICE_ARC")
    plan = json.loads(plan_js)
    assert [g["id"] for g in plan["games"]] == ["tm", "rlc", "sf"]
    assert plan["boss_after"] is True
    assert plan["unlock_required"] is True


def test_inject_preserves_dynamic_game_order():
    # Ship two homeworks with different orders + counts; the injector must
    # not re-sort, dedupe, or hardcode a sequence.
    content_a = _minimal_v2_content()
    content_a["practice_arc"]["games"] = [{"id": "rlc"}, {"id": "tm"}]

    content_b = _minimal_v2_content()
    content_b["practice_arc"]["games"] = [
        {"id": "tm"}, {"id": "pl"}, {"id": "rlc"}, {"id": "sf"}, {"id": "ttt"}
    ]

    html_a = inject(content_a, runtime_context={"hw_id": "HW-A"})
    html_b = inject(content_b, runtime_context={"hw_id": "HW-B"})

    plan_a = json.loads(_extract_const(html_a, "PRACTICE_ARC"))
    plan_b = json.loads(_extract_const(html_b, "PRACTICE_ARC"))

    assert [g["id"] for g in plan_a["games"]] == ["rlc", "tm"]
    assert [g["id"] for g in plan_b["games"]] == ["tm", "pl", "rlc", "sf", "ttt"]


# --------------------------------------------------------------------------- #
# Template — engine surface + adapter registry                                 #
# --------------------------------------------------------------------------- #


def _template_text() -> str:
    from server.services.injector import _TEMPLATE
    return _TEMPLATE


def test_template_declares_v2_globals():
    src = _template_text()
    assert "const FLOW_VERSION = __FLOW_VERSION__;" in src
    assert "const PRACTICE_ARC = __PRACTICE_ARC__;" in src


def test_template_defines_practice_arc_v2_engine():
    src = _template_text()
    assert "const PracticeArcV2 = (function" in src
    # Public surface — what PR-2/3 + tests rely on.
    for fn in (
        "register:",
        "setStageV2:",
        "enter:",
        "advance:",
        "handoffToBoss:",
        "reset:",
        "unlockGatePassed:",
        "listGames:",
        "getAdapter:",
    ):
        assert fn in src, f"PracticeArcV2 must expose {fn}"


def test_template_emits_phase_change_for_setstagev2():
    src = _template_text()
    # The setStageV2 emitter must still fire nets:phase-change so the
    # existing tutor widget routes through its PRACTICE / BOSS / PREVIEW
    # redaction paths unchanged.
    assert "function setStageV2(stageId)" in src
    setStageV2_block = src.split("function setStageV2(stageId)", 1)[1].split("function ", 1)[0]
    assert "nets:phase-change" in setStageV2_block
    assert "'boss'" in setStageV2_block
    assert "'practice'" in setStageV2_block


def test_template_registers_adapters_for_every_known_game():
    src = _template_text()
    # Bootstrap call site exists.
    assert "function bootstrap()" in src
    # Each known id appears as a register('<id>', ...) call site.
    for gid in _PRACTICE_ARC_KNOWN_GAMES:
        assert f"register('{gid}'," in src, f"missing adapter registration for game id={gid}"


def test_template_engine_hands_off_to_existing_boss():
    src = _template_text()
    # Boss handoff must REUSE the existing startFinalBoss — not redefine
    # boss flow. The plan explicitly forbids rebuilding the Boss Arena.
    assert "function handoffToBoss" in src
    handoff_block = src.split("function handoffToBoss", 1)[1].split("function ", 1)[0]
    assert "startFinalBoss" in handoff_block


def test_template_adapters_listen_for_practice_game_complete_event():
    src = _template_text()
    # The completion contract is a single CustomEvent. Tests, PR-2/3, and
    # PR-5 (which will wire the legacy terminators) all dispatch this event
    # to advance the engine. If this name moves, every consumer breaks.
    assert "'practice:game-complete'" in src
    assert "makeOneShotCompletion" in src


def test_template_unlock_gate_checks_global_state_flag():
    src = _template_text()
    # The gate reads NETS_GATE_STATE.cbpPassed && .mcPassed — the flags
    # PR-2 (Case-Based Preview) and PR-3 (Memory Check) will set on pass.
    # PR-4 only enforces "both required unless content opts out".
    assert "window.NETS_GATE_STATE" in src
    assert "cbpPassed" in src
    assert "mcPassed" in src
    assert "unlock_required" in src


# --------------------------------------------------------------------------- #
# Legacy untouched — regression fence                                          #
# --------------------------------------------------------------------------- #


def test_legacy_setstage_still_exists():
    src = _template_text()
    # PR-4 must NOT replace the 9-phase engine. Pin the legacy entry points.
    assert "function setStage(n)" in src
    assert "function gbActiveGameOrder()" in src
    assert "function startFinalBoss()" in src
    assert "_phaseIdByStage" in src
    assert "function startStage5" in src


# --------------------------------------------------------------------------- #
# Game modularization (PR-4) — game-complete dispatch wiring                  #
#                                                                              #
# Existing games (AQ/WC/TM/PL/MB/TTT/SF/MP) all funnel through                  #
# gbAdvanceFromGame(). RLC + legacy Real Life have their own terminators.     #
# A v2-mode dispatch hook in each terminator must signal completion to        #
# PracticeArcV2 without disturbing v1 behavior.                                 #
# --------------------------------------------------------------------------- #


def test_dispatch_helper_is_single_chokepoint():
    src = _template_text()
    # The helper is the ONLY way game terminators tell the v2 sequencer
    # "this game is done". Pin the name + that it gates on FLOW_VERSION.
    assert "function _practiceArcV2DispatchIfRunning(" in src
    helper_block = src.split(
        "function _practiceArcV2DispatchIfRunning(", 1
    )[1].split("function ", 1)[0]
    assert "FLOW_VERSION" in helper_block
    assert "PracticeArcV2._state" in helper_block or "_state.running" in helper_block
    assert "'practice:game-complete'" in helper_block


def test_panel_to_game_id_map_covers_every_gb_game():
    src = _template_text()
    # The mapping must be a single literal so adding a game doesn't grow an
    # if/else ladder. Every game-break id has a matching panel entry.
    assert "_GB_PANEL_TO_GAME_ID" in src
    map_block = src.split("_GB_PANEL_TO_GAME_ID", 1)[1].split("};", 1)[0]
    for panel, gid in [
        ("gb-panel-aq",  "aq"),
        ("gb-panel-wc",  "wc"),
        ("gb-panel-tm",  "tm"),
        ("gb-panel-pl",  "pl"),
        ("gb-panel-mb",  "mb"),
        ("gb-panel-ttt", "ttt"),
        ("gb-panel-sf",  "sf"),
        ("gb-panel-mp",  "mp"),
    ]:
        assert f"'{panel}'" in map_block, f"map missing panel {panel}"
        assert f"'{gid}'" in map_block,   f"map missing game id {gid}"


def test_gb_advance_from_game_calls_dispatch_helper_first():
    src = _template_text()
    # The hook must run BEFORE the legacy carousel walk so the v2 sequencer
    # takes over cleanly. Slice the function body and assert ordering — use
    # the literal `const order =` to find the carousel call (not the
    # function-name string, which also appears in comments).
    body = src.split("function gbAdvanceFromGame(", 1)[1].split("\n        function ", 1)[0]
    dispatch_idx = body.find("_practiceArcV2DispatchIfRunning")
    carousel_idx = body.find("const order = gbActiveGameOrder()")
    assert dispatch_idx != -1, "gbAdvanceFromGame must call the v2 dispatch helper"
    assert carousel_idx != -1, "gbAdvanceFromGame must still walk gbActiveGameOrder for v1"
    assert dispatch_idx < carousel_idx, (
        "v2 dispatch must run before the legacy carousel — otherwise the "
        "carousel side-effects (gbState.subGame, playPhaseAnnouncement) "
        "leak into v2 mode."
    )


def test_rl_show_end_placeholder_dispatches_real_life_in_v2():
    src = _template_text()
    body = src.split("function rlShowEndPlaceholder()", 1)[1].split("\n        function ", 1)[0]
    assert "_practiceArcV2DispatchIfRunning('real_life'" in body
    # Legacy startFinalBoss handoff must still exist for v1 boots.
    assert "startFinalBoss()" in body


def test_rlc_handle_action_complete_branch_dispatches_rlc_in_v2():
    src = _template_text()
    # Slice the complete branch only.
    body = src.split("async function rlcHandleAction()", 1)[1].split("\n        function ", 1)[0]
    assert "_practiceArcV2DispatchIfRunning('rlc'" in body
    # Legacy Consolidation → Boss chain must still exist for v1 boots.
    assert "showConsolidationScreen" in body
    assert "startFinalBoss" in body


def test_v1_terminators_remain_unchanged():
    src = _template_text()
    # Each game's terminator still funnels into gbAdvanceFromGame — we
    # didn't rewrite any of them. Pin the existing call sites.
    assert "gbAdvanceFromGame(0, 'gb-panel-aq')"  in src   # AQ
    assert "gbAdvanceFromGame(1, 'gb-panel-wc')"  in src   # Why Chain
    assert "gbAdvanceFromGame(2, 'gb-panel-tm')"  in src   # Tile Match
    assert "gbAdvanceFromGame(3, 'gb-panel-pl')"  in src   # Puzzle Lock
    assert "gbAdvanceFromGame(4, 'gb-panel-mb')"  in src   # Mystery Box
    assert "gbAdvanceFromGame(5, 'gb-panel-ttt')" in src   # Tic Tac Toe
    assert "gbAdvanceFromGame(6, 'gb-panel-sf')"  in src   # Sentence Fill
    assert "gbAdvanceFromGame(7, 'gb-panel-mp')"  in src   # Memory Palace


def test_dispatch_helper_no_op_when_flow_version_absent():
    # The injector ships FLOW_VERSION = null for legacy homeworks. The
    # helper must be a pure no-op in that case — pin via the source code
    # that the early-return covers both `typeof === 'undefined'` and
    # `!== 'v2'`.
    src = _template_text()
    helper_block = src.split(
        "function _practiceArcV2DispatchIfRunning(", 1
    )[1].split("function ", 1)[0]
    assert "typeof FLOW_VERSION === 'undefined'" in helper_block
    assert "FLOW_VERSION !== 'v2'" in helper_block
    # And it returns false (not undefined) so callers can rely on the
    # boolean contract.
    assert "return false;" in helper_block


# --------------------------------------------------------------------------- #
# Real Life Challenge — one game among N (PR-4)                                #
#                                                                              #
# RLC is registered as a normal adapter. It can appear anywhere in            #
# content_json.practice_arc.games[] — first, middle, or last — and is        #
# never assumed to be a fixed phase. The adapter:                              #
#   - reuses startRLCStage6 (existing 5-step runtime, no rewrite)              #
#   - reuses rlcState (rlcInit re-initialises on every start)                  #
#   - reuses the existing playPhaseAnnouncement('phase.real_life', ...) intro #
#   - reuses the existing rlcHandleAction.complete terminator                  #
#   - emits nets:phase-change with phase 'practice' via setStageV2             #
# --------------------------------------------------------------------------- #


def test_rlc_adapter_is_registered_in_bootstrap():
    src = _template_text()
    # The adapter must be wired into the registry at DOMContentLoaded.
    assert "register('rlc'," in src
    bootstrap_block = src.split("function bootstrap()", 1)[1].split("\n            }", 1)[0]
    assert "adapterForRLC()" in bootstrap_block


def test_rlc_adapter_wraps_existing_runtime_does_not_rebuild():
    src = _template_text()
    # The adapter must call the existing startRLCStage6 function — NOT
    # redefine RLC navigation. If this assertion ever breaks, someone is
    # rebuilding RLC from scratch instead of wrapping it.
    block = src.split("function adapterForRLC()", 1)[1].split("\n            function ", 1)[0]
    assert "startRLCStage6()" in block
    # The 5-step state machine + rlcInit are NOT *called* by the adapter
    # (rlcInit is invoked transitively via startRLCStage6 → playPhaseAnnouncement).
    # Look for the call site, not the substring — comments mentioning the
    # name are fine; a direct invocation `rlcInit(` is not.
    assert "rlcInit(" not in block, (
        "adapter must NOT call rlcInit directly — startRLCStage6 owns "
        "the announce → init sequence; bypassing it skips the phase intro"
    )


def test_rlc_adapter_listens_for_practice_game_complete():
    src = _template_text()
    block = src.split("function adapterForRLC()", 1)[1].split("\n            function ", 1)[0]
    assert "makeOneShotCompletion('rlc'" in block, (
        "RLC adapter must arm a one-shot listener on the engine's "
        "'practice:game-complete' event keyed to gameId='rlc'"
    )


def test_rlc_adapter_destroy_cleans_up_screen():
    src = _template_text()
    block = src.split("function adapterForRLC()", 1)[1].split("\n            function ", 1)[0]
    # destroy() must hide #rlc-screen so the next adapter (any of N-1 other
    # games) gets a clean canvas. The screen's inline opacity/transition
    # styling from startRLCStage6's fade-in must be cleared, otherwise the
    # next adapter inherits stale CSS.
    destroy_block = block.split("destroy: function", 1)[1]
    assert "'rlc-screen'" in destroy_block
    assert "classList.remove('active')" in destroy_block
    assert "style.opacity" in destroy_block
    assert "style.transition" in destroy_block


def test_rlc_adapter_skips_gracefully_when_no_content():
    src = _template_text()
    block = src.split("function adapterForRLC()", 1)[1].split("\n            function ", 1)[0]
    # When RLC_CASE is null (no real_life_challenge in content_json), the
    # adapter must invoke onComplete immediately so the sequencer can
    # advance — NOT throw and NOT mount an empty screen.
    assert "RLC_CASE === 'undefined' || !RLC_CASE" in block
    assert "skipped: true" in block


def test_rlc_dispatch_hook_uses_v2_gated_helper():
    src = _template_text()
    # rlcHandleAction's complete branch must go through the SAME
    # _practiceArcV2DispatchIfRunning chokepoint as every other terminator.
    # No bespoke dispatch path.
    body = src.split("async function rlcHandleAction()", 1)[1].split("\n        function ", 1)[0]
    assert "_practiceArcV2DispatchIfRunning('rlc'" in body
    # And it must short-circuit BEFORE the legacy Consolidation→Boss chain.
    dispatch_idx  = body.find("_practiceArcV2DispatchIfRunning('rlc'")
    legacy_idx    = body.find("showConsolidationScreen")
    assert dispatch_idx < legacy_idx, (
        "v2 dispatch must run before the legacy Consolidation → Boss "
        "handoff — otherwise both engines race to navigate"
    )


def test_rlc_setstagev2_routes_to_practice_tutor_phase():
    src = _template_text()
    # When the engine reaches RLC, setStageV2('practice.game-N') must emit
    # phase='practice' on nets:phase-change. The existing tutor PRACTICE
    # redaction (server/services/tutor.py) already handles redaction for
    # all answer-bearing fields in the RLC steps.
    setStageV2_block = src.split("function setStageV2(stageId)", 1)[1].split("function ", 1)[0]
    # Any stage starting with 'practice.game-' (RLC included, regardless of
    # its index) routes to 'practice'.
    assert "'practice.game-'" in setStageV2_block
    assert "= 'practice'" in setStageV2_block


# --------------------------------------------------------------------------- #
# RLC can appear anywhere in practice_arc.games[] — schema + injector pin     #
# --------------------------------------------------------------------------- #


def _v2_with_rlc_at(*positions):
    """Build a v2 content_json where `rlc` sits at every position listed.

    `positions` are the indices we want `rlc` to occupy. Other slots are
    filled with arbitrary game ids so the test asserts only the *position*
    of rlc, not the surrounding ids.
    """
    games = []
    filler = ["aq", "tm", "wc", "sf", "pl", "mb", "ttt", "mp"]
    fi = 0
    target = set(positions)
    total = max(positions) + 1
    for i in range(total):
        if i in target:
            games.append({"id": "rlc"})
        else:
            games.append({"id": filler[fi % len(filler)]})
            fi += 1
    return {
        "meta": {"title": "RLC-pos", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {"games": games, "boss_after": True, "unlock_required": False},
    }


def test_rlc_can_be_first_game():
    html = inject(_v2_with_rlc_at(0), runtime_context={"hw_id": "HW-RLC-FIRST"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["games"][0]["id"] == "rlc"


def test_rlc_can_be_middle_game():
    html = inject(_v2_with_rlc_at(2), runtime_context={"hw_id": "HW-RLC-MID"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["games"][2]["id"] == "rlc"
    assert plan["games"][0]["id"] != "rlc"
    assert plan["games"][1]["id"] != "rlc"


def test_rlc_can_be_last_game_before_boss():
    html = inject(_v2_with_rlc_at(3), runtime_context={"hw_id": "HW-RLC-LAST"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["games"][-1]["id"] == "rlc"
    assert plan["boss_after"] is True, (
        "even when RLC is the final game, boss_after must remain True so "
        "the sequencer hands off to Boss Arena (not stops at RLC)"
    )


def test_rlc_can_appear_multiple_times_in_plan():
    # The schema does NOT enforce uniqueness — author may legitimately
    # author two RLC cases in one homework. Each entry's `config` can
    # carry the case-specific tuning when PR-2/3 extend the schema.
    html = inject(_v2_with_rlc_at(0, 2), runtime_context={"hw_id": "HW-RLC-DUP"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    ids = [g["id"] for g in plan["games"]]
    assert ids.count("rlc") == 2


# --------------------------------------------------------------------------- #
# Memory Matching — Tile Match (`tm`) is the modern impl; `mm` is the         #
# back-compat alias. Both share gb-panel-tm but call different init           #
# functions (gbInitTM / gbInitMM). PR-4 only ADDS the dynamic registration —  #
# zero rewrites of the matching gameplay.                                      #
# --------------------------------------------------------------------------- #


def test_memory_matching_mm_id_is_known_to_injector():
    # The injector's known-id set must include `mm` so the schema +
    # injector + runtime registry stay aligned.
    assert "mm" in _PRACTICE_ARC_KNOWN_GAMES
    assert "tm" in _PRACTICE_ARC_KNOWN_GAMES


def test_memory_matching_mm_adapter_registered_in_bootstrap():
    src = _template_text()
    # The `mm` adapter is registered alongside `tm`. Order is irrelevant
    # to the engine; both must exist.
    bootstrap_block = src.split("function bootstrap()", 1)[1].split("\n            }", 1)[0]
    assert "register('mm'," in bootstrap_block
    assert "register('tm'," in bootstrap_block


def test_memory_matching_mm_adapter_wraps_legacy_init():
    src = _template_text()
    bootstrap_block = src.split("function bootstrap()", 1)[1].split("\n            }", 1)[0]
    # mm must call gbInitMM (the legacy raw-tuple init), NOT gbInitTM
    # (modern). Slice the `mm` registration line to verify.
    mm_line = [l for l in bootstrap_block.splitlines()
               if "register('mm'," in l or "gbInitMM" in l]
    mm_chunk = "\n".join(mm_line[:6]) if mm_line else ""
    assert "gbInitMM" in mm_chunk, (
        "the mm adapter must reuse the existing gbInitMM function — "
        "creating a new memory-match engine is forbidden by the "
        "'do not rebuild existing games' rule"
    )


def test_memory_matching_mm_and_tm_share_dom_panel():
    src = _template_text()
    # Both adapters must use 'gb-panel-tm' — sharing the DOM panel means
    # dark-mode, reduced-motion, and the Apple-glass styling are inherited
    # for free (no parallel visual system).
    bootstrap_block = src.split("function bootstrap()", 1)[1].split("\n            }", 1)[0]
    # Find each register call's argument tuple
    for game_id in ('mm', 'tm'):
        # The bootstrap call layout is: register('<id>', adapterForGB('<id>', ..., '<panel>', ...))
        # Pull the chunk between register('<id>', and the closing ));
        marker = f"register('{game_id}',"
        idx = bootstrap_block.find(marker)
        assert idx != -1, f"missing registration for {game_id}"
        chunk = bootstrap_block[idx:idx + 400]
        assert "'gb-panel-tm'" in chunk, f"{game_id} must mount #gb-panel-tm"


def test_dispatch_prefers_engine_active_game_id_over_panel_default():
    src = _template_text()
    # Critical wiring for shared-panel adapters: when mm + tm share
    # gb-panel-tm but the engine is running `mm`, the dispatch must emit
    # gameId='mm' (the active adapter), NOT gameId='tm' (the panel default).
    helper_block = src.split(
        "function _practiceArcV2DispatchIfRunning(", 1
    )[1].split("function ", 1)[0]
    assert "PRACTICE_ARC.games" in helper_block
    assert "_state.gameIndex" in helper_block
    assert "panelGameId" in helper_block, (
        "the dispatched event must include panelGameId (the panel-derived "
        "fallback) for debuggability — the engine's resolved id is the "
        "primary gameId, but listeners may inspect panelGameId for tracing"
    )


def test_memory_matching_adapter_publishes_config_to_window():
    src = _template_text()
    # Generic GB adapter must forward `config` from
    # practice_arc.games[].config into window.__practiceArcGameConfig[<id>]
    # so wrapped games (gbInitTM, gbInitMM, ...) can read tuning without
    # changes to their signatures. Pin the publishing channel.
    body = src.split("function adapterForGB(", 1)[1].split(
        "\n            function ", 1)[0]
    assert "window.__practiceArcGameConfig" in body
    assert "[gameId] = " in body
    # And destroy() must clean the per-game config so re-entry / replays
    # don't inherit stale values.
    destroy_block = body.split("destroy: function", 1)[1]
    assert "__practiceArcGameConfig" in destroy_block
    assert "delete" in destroy_block


def test_memory_matching_can_appear_anywhere_in_plan():
    # mm at first, tm at middle — verify the injector accepts both ids
    # and preserves order. No hardcoded sequencing.
    content = {
        "meta": {"title": "MM-pos", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [{"id": "mm"}, {"id": "aq"}, {"id": "tm"}, {"id": "sf"}],
            "boss_after": True, "unlock_required": False,
        },
    }
    html = inject(content, runtime_context={"hw_id": "HW-MM-POS"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert [g["id"] for g in plan["games"]] == ["mm", "aq", "tm", "sf"]


def test_memory_matching_config_round_trips_through_injector():
    # `config` must survive injection — that's how authors will tune
    # board size / hint budget per-game-instance once the runtime reads
    # window.__practiceArcGameConfig[<id>].
    content = {
        "meta": {"title": "MM-conf", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [
                {"id": "tm", "config": {"board_size": 6, "hint_budget": 2}},
                {"id": "mm", "config": {"shuffle_seed": 42}},
            ],
            "boss_after": True, "unlock_required": False,
        },
    }
    html = inject(content, runtime_context={"hw_id": "HW-MM-CONF"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["games"][0]["config"] == {"board_size": 6, "hint_budget": 2}
    assert plan["games"][1]["config"] == {"shuffle_seed": 42}


def test_tile_match_answer_leak_prevention_not_regressed():
    # The pedagogical contract of Tile Match (per spec): concept-pair
    # matching IS the gameplay; rote memorization is what the spec
    # forbids. The runtime ships SIDE-DISJOINT pair entries so the client
    # never sees both sides of one pair in a single JS object — the
    # check-answer endpoint is the only place where (left, right) collide.
    # PR-4 must not regress this contract.
    content = {
        "meta": {"title": "TM-ped", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {"games": [{"id": "tm"}], "boss_after": False, "unlock_required": False},
        "gb_tile_match": [
            {"id": "tm_001", "left": "F = ma", "right": "Newton's 2nd law",
             "tier": "basic", "concept_family": "mechanics",
             "subject_family": "physics", "pisa_level": "L3", "difficulty": "medium",
             "explanation": "SERVER_ONLY_LEAK_CANARY"},
            {"id": "tm_002", "left": "E = mc²", "right": "Mass-energy equivalence",
             "tier": "basic", "concept_family": "relativity",
             "subject_family": "physics", "pisa_level": "L4", "difficulty": "hard",
             "explanation": "SERVER_ONLY_LEAK_CANARY_2"},
        ],
    }
    html = inject(content, runtime_context={"hw_id": "HW-TM-PED"})
    tm_js = _extract_const(html, "GB_TILE_MATCH")
    pairs = json.loads(tm_js)
    # Side-disjoint shape: every entry has exactly id + side + text.
    sides = {(p["id"], p["side"]) for p in pairs}
    assert ("tm_001", "left")  in sides
    assert ("tm_001", "right") in sides
    assert ("tm_002", "left")  in sides
    assert ("tm_002", "right") in sides
    for entry in pairs:
        # No entry may carry both texts.
        assert "left" not in entry or "right" not in entry
    # Server-only `explanation` field must NEVER reach the client.
    assert "SERVER_ONLY_LEAK_CANARY" not in tm_js, (
        "Tile Match server-only `explanation` field must be stripped by "
        "the existing _serialize_tile_match — PR-4 must not regress this"
    )


# --------------------------------------------------------------------------- #
# Assembly / Jigsaw Matching / Error Detection (PR-4 new-mechanic adapters)   #
#                                                                              #
# Lightweight aliases registered against existing reusable panels + init      #
# functions. The engine's active-id-wins dispatch (turn 4) means completion   #
# events still carry the adapter's own id even though the DOM is shared.      #
# --------------------------------------------------------------------------- #


def test_new_mechanic_ids_are_known_to_injector():
    from server.services.injector import _PRACTICE_ARC_ALIAS_BASE
    for gid in ("asm", "jm", "ed"):
        assert gid in _PRACTICE_ARC_KNOWN_GAMES, f"{gid} must be a known game id"
    # Spec mapping is explicit.
    assert _PRACTICE_ARC_ALIAS_BASE == {"asm": "sf", "jm": "tm", "ed": "aq"}


def test_assembly_adapter_registered_and_reuses_sentence_fill():
    src = _template_text()
    bootstrap_block = src.split("function bootstrap()", 1)[1].split(
        "\n            }", 1)[0]
    # Registered with id `asm`, mounts the existing Sentence Fill panel,
    # calls the existing gbInitSF — no new screen, no new init.
    asm_idx = bootstrap_block.find("register('asm',")
    assert asm_idx != -1, "Assembly adapter must be registered as 'asm'"
    asm_chunk = bootstrap_block[asm_idx:asm_idx + 400]
    assert "gbInitSF" in asm_chunk
    assert "'gb-panel-sf'" in asm_chunk


def test_jigsaw_matching_adapter_registered_and_reuses_tile_match():
    src = _template_text()
    bootstrap_block = src.split("function bootstrap()", 1)[1].split(
        "\n            }", 1)[0]
    jm_idx = bootstrap_block.find("register('jm',")
    assert jm_idx != -1, "Jigsaw Matching adapter must be registered as 'jm'"
    jm_chunk = bootstrap_block[jm_idx:jm_idx + 400]
    assert "gbInitTM" in jm_chunk
    assert "'gb-panel-tm'" in jm_chunk


def test_error_detection_adapter_registered_and_reuses_adaptive_quiz():
    src = _template_text()
    bootstrap_block = src.split("function bootstrap()", 1)[1].split(
        "\n            }", 1)[0]
    ed_idx = bootstrap_block.find("register('ed',")
    assert ed_idx != -1, "Error Detection adapter must be registered as 'ed'"
    ed_chunk = bootstrap_block[ed_idx:ed_idx + 400]
    assert "gbInitAQ" in ed_chunk
    assert "'gb-panel-aq'" in ed_chunk


def test_new_adapters_round_trip_through_injector():
    # All three ids accepted by the schema + serialized through the
    # injector without re-ordering / dropping / coercing.
    content = {
        "meta": {"title": "ASM-JM-ED", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [
                {"id": "ed",  "label": "Spot the slip-up"},
                {"id": "asm", "config": {"steps_required": 4}},
                {"id": "jm",  "label": "Match the halves"},
            ],
            "boss_after": True,
            "unlock_required": False,
        },
    }
    html = inject(content, runtime_context={"hw_id": "HW-NEW-ADAPTERS"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    ids = [g["id"] for g in plan["games"]]
    assert ids == ["ed", "asm", "jm"], "order must be preserved"
    # Labels survive
    assert plan["games"][0]["label"] == "Spot the slip-up"
    assert plan["games"][2]["label"] == "Match the halves"
    # Config survives
    assert plan["games"][1]["config"] == {"steps_required": 4}


def test_new_adapters_can_share_plan_with_existing_games():
    # The dynamic plan must accept any mix of existing + new ids — the
    # engine treats them all uniformly through the adapter registry.
    content = {
        "meta": {"title": "MIX", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [
                {"id": "asm"}, {"id": "rlc"}, {"id": "jm"},
                {"id": "mm"},  {"id": "ed"},  {"id": "ttt"},
            ],
            "boss_after": True,
            "unlock_required": False,
        },
    }
    html = inject(content, runtime_context={"hw_id": "HW-MIX"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert [g["id"] for g in plan["games"]] == [
        "asm", "rlc", "jm", "mm", "ed", "ttt"
    ]


def test_new_adapters_inherit_engine_active_id_dispatch_resolution():
    # The same dispatch chokepoint that fixes mm/tm shared-panel resolution
    # automatically covers asm/sf, jm/tm, ed/aq. No new branches needed.
    src = _template_text()
    helper_block = src.split(
        "function _practiceArcV2DispatchIfRunning(", 1
    )[1].split("function ", 1)[0]
    # Pin: the helper reads PRACTICE_ARC.games[gameIndex] and prefers
    # that id over the caller-supplied panel default — which is exactly
    # what asm/jm/ed need (their adapter's id is `asm`/`jm`/`ed`, but
    # the gbAdvanceFromGame call site passes the panel default
    # `sf`/`tm`/`aq`). The engine resolves to the alias id.
    assert "PRACTICE_ARC.games" in helper_block
    assert "_state.gameIndex" in helper_block


def test_new_adapters_do_not_introduce_new_screens_or_panels():
    src = _template_text()
    # No `gb-panel-asm` / `gb-panel-jm` / `gb-panel-ed` screens — alias
    # adapters MUST reuse the existing panels. Pin the lightweight
    # constraint so a future PR can't silently fork a parallel visual
    # system.
    for panel in ("gb-panel-asm", "gb-panel-jm", "gb-panel-ed"):
        assert f'id="{panel}"' not in src, (
            f"new mechanic adapters must not introduce {panel}; reuse "
            "existing gb-panel-sf / gb-panel-tm / gb-panel-aq via the "
            "alias registration in bootstrap()"
        )


# --------------------------------------------------------------------------- #
# Visual integration pass (PR-4 turn 6)                                       #
#                                                                              #
# Two scoped DOM nodes (#practice-arc-shell, #practice-boss-interstitial)     #
# rendered while the v2 sequencer is running. Class vocabulary mirrors the    #
# landing system (.section-inner / .feature-card / .pill / .eyebrow--blue /   #
# .section-title / .dark-section / .launch-shell) but is scoped under the    #
# v2 roots so legacy DOM is never affected.                                    #
# --------------------------------------------------------------------------- #


def test_practice_arc_shell_exists_in_template():
    src = _template_text()
    assert 'id="practice-arc-shell"' in src
    # Required landing-vocabulary classes are present, scoped to the shell.
    shell_block = src.split('id="practice-arc-shell"', 1)[1].split('</div>\n    </div>', 1)[0]
    assert 'class="section-inner"' in shell_block
    assert 'eyebrow--blue' in shell_block
    assert 'class="section-title"' in shell_block
    # The pill row is the dynamic current-game indicator.
    assert 'practice-arc-pillrow' in shell_block


def test_practice_arc_shell_starts_hidden():
    src = _template_text()
    # The shell defaults to display:none; only PracticeArcV2 toggles
    # `.is-visible`. Pin the rule so a regression can't reveal v2 UI
    # on legacy boots.
    css_block = src.split('#practice-arc-shell {', 1)[1].split('}', 1)[0]
    assert 'display: none' in css_block


def test_boss_interstitial_exists_and_mirrors_launch_shell():
    src = _template_text()
    assert 'id="practice-boss-interstitial"' in src
    inter_block = src.split('id="practice-boss-interstitial"', 1)[1].split(
        '<!-- ── Wave F4', 1)[0]
    # Required landing classes are present.
    assert 'class="dark-section"' in inter_block
    assert 'class="launch-shell"' in inter_block
    assert 'eyebrow--blue' in inter_block
    assert 'class="section-title"' in inter_block
    # Interstitial defaults to hidden.
    css_block = src.split('#practice-boss-interstitial {', 1)[1].split('}', 1)[0]
    assert 'display: none' in css_block


def test_boss_handoff_does_not_rebuild_boss_arena():
    src = _template_text()
    # Boss Arena DOM is at #screen-boss / #boss-intro-card / #boss-shell —
    # those must NOT be duplicated under the v2 interstitial. The
    # interstitial is purely a *handoff card*; it hands off into the
    # existing Boss Arena via startFinalBoss().
    inter_block = src.split('id="practice-boss-interstitial"', 1)[1].split(
        '<!-- ── Wave F4', 1)[0]
    for forbidden in ('id="screen-boss"', 'id="boss-intro-card"',
                      'id="boss-shell"', 'id="boss-battle"', 'id="boss-hp-bar"'):
        assert forbidden not in inter_block, (
            "PR-4 must NOT duplicate Boss Arena DOM inside the interstitial — "
            f"found {forbidden}"
        )


def test_handoff_to_boss_calls_interstitial_before_startfinalboss():
    src = _template_text()
    body = src.split("function handoffToBoss()", 1)[1].split(
        "\n            function ", 1)[0]
    # Pin actual CALL sites — substring matches in comments don't count.
    show_idx   = body.find("_paShowBossInterstitial(")
    launch_idx = body.find("startFinalBoss(")
    assert show_idx != -1, "handoffToBoss must invoke the interstitial helper"
    assert launch_idx != -1, "handoffToBoss must still call startFinalBoss"
    assert show_idx < launch_idx, (
        "the interstitial must appear BEFORE startFinalBoss so the student "
        "sees the handoff card; the launch is scheduled via setTimeout/launch()"
    )
    # And the launch is deferred — setTimeout wires the interstitial fade
    # before the Boss Arena mounts (reduced-motion users get 0 ms).
    assert "setTimeout(launch, waitMs)" in body or "setTimeout(launch," in body


def test_setstagev2_drives_visual_helpers():
    src = _template_text()
    body = src.split("function setStageV2(stageId)", 1)[1].split(
        "function ", 1)[0]
    assert "_paRenderUiForStage" in body, (
        "setStageV2 must drive the v2 visual layer so the progress strip "
        "and boss interstitial follow the engine's stage transitions"
    )


def test_render_progress_shows_current_game_via_pill():
    src = _template_text()
    body = src.split("function _paRenderProgress(", 1)[1].split(
        "\n            function ", 1)[0]
    # Pin the pill class names — the current game uses .pill.is-current,
    # past games use .pill.is-done, future games use plain .pill.
    assert "'pill'"      in body or '"pill"'      in body or "= 'pill';" in body
    assert "is-current" in body
    assert "is-done"    in body


def test_reduced_motion_is_respected_by_v2_visuals():
    src = _template_text()
    # CSS rule disables transitions on both v2 nodes under prefers-reduced-motion.
    # Find the @media block that mentions both ids.
    rm_block_start = src.find("@media (prefers-reduced-motion: reduce)")
    assert rm_block_start != -1
    # There may be multiple @media blocks; scan all of them.
    src_from_rm = src[rm_block_start:]
    assert "#practice-arc-shell" in src_from_rm
    assert "#practice-boss-interstitial" in src_from_rm

    # And the JS interstitial wait honors prefers-reduced-motion → 0 ms.
    body = src.split("function _paBossInterstitialDuration()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "prefers-reduced-motion: reduce" in body
    assert "return 0" in body


def test_v2_visuals_reuse_existing_runtime_css_tokens():
    src = _template_text()
    # The visuals must NOT introduce a parallel token system. Confirm
    # they pull from the existing :root variables (--accent / --text /
    # --text-muted / --surface / --shadow-card) so dark-mode adapts
    # automatically.
    shell_css_start = src.find("#practice-arc-shell {")
    inter_css_start = src.find("#practice-boss-interstitial {")
    assert shell_css_start != -1 and inter_css_start != -1
    css_chunk = src[shell_css_start: inter_css_start + 2000]
    for token in ("var(--surface", "var(--accent", "var(--text", "var(--text-muted"):
        assert token in css_chunk, f"v2 visuals must reuse runtime token {token}"


def test_legacy_boss_intro_card_untouched():
    src = _template_text()
    # The existing Boss Arena intro card (#boss-intro-card) must be
    # unchanged — PR-4 only adds the small handoff interstitial BEFORE
    # startFinalBoss, never modifies the Boss Arena's own intro.
    assert 'id="boss-intro-card"' in src
    assert 'class="boss-intro-card"' in src
    assert 'data-boss-name' in src
    assert 'boss-intro-label' in src


def test_render_ui_for_stage_hides_visuals_outside_practice():
    src = _template_text()
    body = src.split("function _paRenderUiForStage(", 1)[1].split(
        "\n            function ", 1)[0]
    # Non-v2 boot → both visuals hidden.
    assert "FLOW_VERSION !== 'v2'" in body
    assert "_paHideShell" in body
    assert "_paHideBossInterstitial" in body
    # Hub / unlock / practice.done stages tear down both visuals.
    assert "Any other stage" in body or "tear down" in body.lower()


# --------------------------------------------------------------------------- #
# Tutor coupling — final QA fence (PR-4 turn 7)                                #
#                                                                              #
# The v2 engine emits nets:phase-change events. The persistent tutor widget   #
# (perfect_homework.html ~L22199) normalizes detail.phase to one of            #
# {'practice','boss','preview'} and server/services/tutor.py's                  #
# _redact_question_for_tutor uses the same vocabulary to drive its              #
# answer-leak redaction. ANY new phase string here would silently fall        #
# through to 'preview' (no redaction) — a security regression. These tests    #
# pin that PR-4 emits ONLY the three known strings, for every game id, with   #
# the right strings at the right transitions.                                  #
# --------------------------------------------------------------------------- #


def test_setstagev2_emits_only_tutor_recognized_phases():
    src = _template_text()
    body = src.split("function setStageV2(stageId)", 1)[1].split(
        "function ", 1)[0]
    # The function only assigns `phaseName = ` to one of three literals.
    # If a regression introduces 'review' / 'consolidation' / etc., the
    # widget normalises it to 'preview' and the answer-leak guard
    # silently disables. Pin the vocabulary.
    assignments = re.findall(r"phaseName\s*=\s*'([a-z_.-]+)'", body)
    assert set(assignments).issubset({"preview", "practice", "boss"}), (
        "setStageV2 must only assign tutor-recognized phase strings — "
        f"found unknown phase(s): {set(assignments) - {'preview', 'practice', 'boss'}}"
    )
    assert "practice" in assignments
    assert "boss"     in assignments
    assert "preview"  in assignments


def test_tutor_widget_normalizes_to_known_phases():
    src = _template_text()
    # The widget's listener allow-lists ONLY 'practice' and 'boss' —
    # everything else collapses to 'preview'. If this normalization
    # changes, the v2 setStageV2 emissions must be re-audited.
    listener_block_start = src.find("document.addEventListener('nets:phase-change'")
    assert listener_block_start != -1
    listener_block = src[listener_block_start: listener_block_start + 1500]
    assert "phase === 'practice'" in listener_block
    assert "phase === 'boss'"     in listener_block
    assert ": 'preview'" in listener_block or '? phase : "preview"' in listener_block


def test_server_redaction_vocabulary_unchanged_by_pr4():
    # PR-4 must NOT touch the tutor redaction contract. The phase values
    # that bypass redaction (preview only) and trigger redaction
    # (practice / boss / anything-else) must match what setStageV2 emits.
    from server.services.tutor import _redact_question_for_tutor

    leak_payload = {"q": "hi", "answer_spec": {"expected": "LEAK_TOKEN"}, "expected": "LEAK_TOKEN"}
    # preview is the explicit pass-through.
    assert _redact_question_for_tutor(leak_payload, "preview") == leak_payload
    # practice + boss strip everything not in the safe key allow-list.
    for phase in ("practice", "boss"):
        scrubbed = _redact_question_for_tutor(leak_payload, phase)
        assert "answer_spec" not in scrubbed
        # `expected` is not in _TUTOR_CONTEXT_SAFE_KEYS so it must be gone too.
        assert scrubbed.get("expected") is None
        assert "LEAK_TOKEN" not in json.dumps(scrubbed)


# --------------------------------------------------------------------------- #
# End-to-end QA battery — variable game count, RLC anywhere, boss handoff     #
# --------------------------------------------------------------------------- #


def _v2_plan(game_ids, *, boss_after=True, unlock_required=False):
    """Build a minimal v2 content_json with a given sequence of game ids."""
    return {
        "meta": {"title": "QA", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {
            "games": [{"id": gid} for gid in game_ids],
            "boss_after": boss_after,
            "unlock_required": unlock_required,
        },
    }


def test_qa_two_game_homework_round_trips():
    html = inject(_v2_plan(["tm", "rlc"]), runtime_context={"hw_id": "HW-2G"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert [g["id"] for g in plan["games"]] == ["tm", "rlc"]
    assert plan["boss_after"] is True


def test_qa_six_game_homework_round_trips():
    plan_ids = ["aq", "tm", "rlc", "sf", "ttt", "mp"]
    html = inject(_v2_plan(plan_ids), runtime_context={"hw_id": "HW-6G"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert [g["id"] for g in plan["games"]] == plan_ids


def test_qa_rlc_at_every_position_in_six_game_plan():
    """RLC is one game among N — pin that it round-trips at every position
    in a 6-game plan without reordering / dropping."""
    base = ["aq", "tm", "sf", "ttt", "mp", "wc"]
    for i in range(6):
        plan_ids = list(base)
        plan_ids[i] = "rlc"
        html = inject(_v2_plan(plan_ids), runtime_context={"hw_id": f"HW-RLC-AT-{i}"})
        plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
        assert [g["id"] for g in plan["games"]] == plan_ids
        assert plan["games"][i]["id"] == "rlc"


def test_qa_unlock_gate_required_when_unlock_required_true():
    # When the plan opts INTO the gate, PracticeArcV2.enter must route
    # to setStageV2('unlock') and refuse to start games until the gate
    # passes — pin the source code path.
    src = _template_text()
    enter_block = src.split("function enter()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "unlockGatePassed()" in enter_block
    assert "setStageV2('unlock')" in enter_block
    # When unlock_required=false the gate is bypassed; the code must
    # NOT silently skip when unlock_required=true and the flag is absent.
    gate_block = src.split("function unlockGatePassed()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "PRACTICE_ARC.unlock_required === false" in gate_block
    assert "cbpPassed" in gate_block and "mcPassed" in gate_block


def test_qa_unlock_required_true_in_v2_plan_round_trips():
    content = _v2_plan(["tm", "rlc"], unlock_required=True)
    html = inject(content, runtime_context={"hw_id": "HW-UNLOCK"})
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["unlock_required"] is True


def test_qa_boss_handoff_when_boss_after_true():
    src = _template_text()
    handoff_block = src.split("function handoffToBoss()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "setStageV2('practice.boss')" in handoff_block
    assert "startFinalBoss" in handoff_block


def test_qa_boss_skipped_when_boss_after_false():
    src = _template_text()
    handoff_block = src.split("function handoffToBoss()", 1)[1].split(
        "\n            function ", 1)[0]
    # `boss_after === false` short-circuits to practice.done so authors
    # can build plans that don't end at a boss (e.g., review-only flows).
    assert "boss_after !== false" in handoff_block
    assert "'practice.done'" in handoff_block


def test_qa_one_shot_listener_cleans_itself_up():
    src = _template_text()
    # makeOneShotCompletion arms a single listener that ALSO removes
    # itself once it fires — preventing accumulation across many
    # sequential games and across repeated runs of the engine.
    body = src.split("function makeOneShotCompletion(", 1)[1].split(
        "\n            function ", 1)[0]
    assert "document.addEventListener('practice:game-complete'" in body
    assert "document.removeEventListener('practice:game-complete'" in body
    # And the listener is keyed to its own gameId so two concurrent
    # one-shots can coexist without cross-firing.
    assert "ev.detail.gameId !== gameId" in body


def test_qa_no_orphaned_completion_listeners_after_reset():
    src = _template_text()
    # PracticeArcV2.reset() must tear down the active adapter so any
    # in-flight listener is canceled via the adapter's destroy(). Pin
    # that reset calls destroy() if there's an active adapter.
    body = src.split("function reset()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "destroy()" in body
    assert "v2State.active" in body or "_state.active" in body


def test_qa_no_duplicate_progression_logic():
    src = _template_text()
    # All progression must funnel through PracticeArcV2.startGameAt /
    # advance / handoffToBoss. No new bespoke navigation can be added
    # without colliding. Pin: there is only ONE place that dispatches
    # the completion event from the carousel.
    occurrences = src.count("document.dispatchEvent(new CustomEvent('practice:game-complete'")
    # The dispatch lives only inside _practiceArcV2DispatchIfRunning. If
    # a future PR adds another dispatch site (e.g., directly inside a
    # game's terminator), this count goes up and the test fires.
    assert occurrences == 1, (
        f"practice:game-complete must be dispatched from a single chokepoint "
        f"(_practiceArcV2DispatchIfRunning); found {occurrences} dispatch sites"
    )


def test_qa_legacy_setstage_emits_recognized_phase_strings_only():
    src = _template_text()
    # Legacy v1 setStage(n) → phaseName derivation block. Pin the
    # vocabulary so a refactor can't accidentally introduce a string
    # the tutor widget doesn't recognize (which would silently disable
    # the answer-leak guard for that stage).
    body = src.split("function setStage(n)", 1)[1].split(
        "\n        function ", 1)[0]
    phases = re.findall(r"phaseName\s*=\s*'([a-z]+)'", body)
    assert set(phases).issubset({"preview", "practice", "boss"})


def test_qa_setstagev2_dispatches_event_with_questionid_null():
    src = _template_text()
    # Stage-boundary emissions carry questionId=null — the per-question
    # phase-changes are dispatched by each game's underlying init/render
    # function (existing behaviour, untouched by PR-4). Pin the contract.
    body = src.split("function setStageV2(stageId)", 1)[1].split(
        "function ", 1)[0]
    assert "questionId: null" in body


def test_qa_practice_phase_only_emitted_for_game_stages():
    src = _template_text()
    body = src.split("function setStageV2(stageId)", 1)[1].split(
        "function ", 1)[0]
    # 'practice' is assigned only when the stage starts with
    # 'practice.game-' — NOT for 'practice.boss' (that's 'boss') and
    # NOT for 'practice.done' (that's 'preview').
    # Match the literal guard.
    assert "stageId.indexOf('practice.game-') === 0" in body
    assert "stageId === 'practice.boss'" in body


def test_qa_legacy_v1_homework_keeps_legacy_engine():
    # The dispatcher signal: when flow_version is absent or 'v1', the
    # PRACTICE_ARC and FLOW_VERSION constants ship as null/null, the
    # v2 engine stays dormant, and the legacy setStage(0) → 9-phase
    # pipeline drives the page.
    html = inject(_minimal_legacy_content(), runtime_context={"hw_id": "HW-LEGACY-QA"})
    assert _extract_const(html, "FLOW_VERSION") == "null"
    assert _extract_const(html, "PRACTICE_ARC") == "null"
    # And the legacy boot path is still present.
    assert "function setStage(n)" in html
    assert "function gbActiveGameOrder()" in html
    assert "function startFinalBoss()" in html


def test_qa_engine_state_resets_between_runs():
    src = _template_text()
    # PracticeArcV2.reset() must zero gameIndex + running + active so
    # the engine can be re-entered cleanly (e.g., session restore /
    # replay / explicit reset after a fail-to-reflection bypass).
    body = src.split("function reset()", 1)[1].split(
        "\n            function ", 1)[0]
    assert "v2State.gameIndex = -1" in body
    assert "v2State.running = false" in body
    assert "v2State.active = null" in body
    assert "v2State.stageV2 = null" in body


def test_qa_no_setinterval_no_polling_in_v2_engine():
    src = _template_text()
    # Pin that the engine never spins a polling timer — completion is
    # purely event-driven (practice:game-complete). setInterval anywhere
    # in the engine block would be a memory-leak red flag.
    engine_block_start = src.find("const PracticeArcV2 = (function ()")
    assert engine_block_start != -1
    engine_block = src[engine_block_start: engine_block_start + 30000].split("})();", 1)[0]
    assert "setInterval(" not in engine_block, (
        "the v2 engine must remain event-driven — no setInterval polling"
    )


def test_qa_all_registered_game_ids_map_to_practice_phase():
    # Every adapter id that ships in the bootstrap must be a 'practice'-
    # phase game; tutor redaction depends on it. Pin this by verifying
    # the bootstrap registers ids only against panels owned by the
    # 'practice' phase mapping in setStageV2.
    from server.services.injector import _PRACTICE_ARC_KNOWN_GAMES
    src = _template_text()
    bootstrap_block = src.split("function bootstrap()", 1)[1].split(
        "\n            }", 1)[0]
    for gid in _PRACTICE_ARC_KNOWN_GAMES:
        # Every known id must have a register call.
        assert f"register('{gid}'," in bootstrap_block, (
            f"known game id '{gid}' has no register() call in the v2 bootstrap"
        )


def test_v2_visuals_do_not_link_external_stylesheets():
    src = _template_text()
    # The visual layer must remain self-contained — no <link> to
    # landing.css or other external CSS for v2. The class names mirror
    # landing's vocabulary but the rules live inline in the template's
    # existing <style> block.
    # Count occurrences of href="frontend or similar — there should be
    # zero new external CSS imports introduced by PR-4.
    assert 'href="/static/frontend/css/landing' not in src
    assert 'href="frontend/css/landing' not in src


def test_new_adapters_route_to_practice_tutor_phase():
    # asm/jm/ed all live under setStageV2('practice.game-N'); tutor
    # widget already treats every 'practice.game-*' as the PRACTICE
    # phase. Pin the routing rule end-to-end.
    src = _template_text()
    setStageV2_block = src.split("function setStageV2(stageId)", 1)[1].split(
        "function ", 1)[0]
    assert "indexOf('practice.game-') === 0" in setStageV2_block
    assert "= 'practice'" in setStageV2_block


def test_legacy_memory_match_tuples_still_shim_into_tile_match():
    # Authors with legacy `gb_memory_match` raw-tuple content (no
    # `gb_tile_match`) must STILL render correctly when their homework
    # references `mm` in practice_arc.games[]. The injector's existing
    # shim path (_serialize_tile_match accepting legacy_pairs) is
    # untouched by PR-4 — pin that here.
    content = {
        "meta": {"title": "MM-shim", "subject_display": "Math", "section": "", "cefr_level": ""},
        "gate_quote": {"mode": "auto"},
        "panels": [], "flashcards": [], "memory_sprint": [], "boss_questions": [],
        "flow_version": "v2",
        "practice_arc": {"games": [{"id": "mm"}], "boss_after": False, "unlock_required": False},
        "gb_memory_match": [["3 × 4", "12"], ["5 + 5", "10"]],
    }
    html = inject(content, runtime_context={"hw_id": "HW-MM-SHIM"})
    tm_js = _extract_const(html, "GB_TILE_MATCH")
    pairs = json.loads(tm_js)
    assert len(pairs) == 4   # 2 source pairs × 2 sides each
    texts = {p["text"] for p in pairs}
    assert texts == {"3 × 4", "12", "5 + 5", "10"}


def test_rlc_is_not_treated_as_phase_by_injector():
    # Sanity fence: `practice_arc` shipping `rlc` MUST NOT alter the
    # existing RLC_CASE / real_life_challenge wiring — the per-question
    # answer-leak prevention still flows through _serialize_real_life_challenge.
    # PR-4 only adds the PLAN-of-games global; per-game answer keys
    # continue to use their existing constants.
    content = _v2_with_rlc_at(1)
    content["real_life_challenge"] = {
        "id": "rlc_test_001",
        "expert_role": "general",
        "title": "Test Case",
        "intro": "A small case.",
        "pisa_level": "L4",
        "tier": "basic",
        "grade_band": "g7_9",
        "variant": "standard",
        "steps": [
            {"id": "step1", "kind": "decision", "title": "Decide", "prompt": "?",
             "options": [{"id": "a", "label": "A", "is_correct": True},
                         {"id": "b", "label": "B", "is_correct": False}]},
            {"id": "step2", "kind": "info_request", "title": "Info", "prompt": "?",
             "options": [{"id": "a", "label": "A", "is_correct": True},
                         {"id": "b", "label": "B", "is_correct": False}]},
            {"id": "step3", "kind": "final_decision", "title": "Final", "prompt": "?",
             "options": [{"id": "a", "label": "A", "is_correct": True},
                         {"id": "b", "label": "B", "is_correct": False}]},
            {"id": "step4", "kind": "concept_select", "title": "Concept", "prompt": "?",
             "concept_chips": [{"id": "c1", "label": "C1", "is_correct": True},
                               {"id": "c2", "label": "C2", "is_correct": False},
                               {"id": "c3", "label": "C3", "is_correct": False}]},
            {"id": "step5", "kind": "reasoning", "title": "Reason", "prompt": "?",
             "min_chars": 80, "acceptable_keywords": ["leak-key"]},
        ],
    }
    html = inject(content, runtime_context={"hw_id": "HW-RLC-LEAK"})
    # The per-step answer keys MUST still be stripped from the client wire
    # by the existing RLC serializer — practice_arc plan-shipping has no
    # bearing on that contract.
    rlc_js = _extract_const(html, "RLC_CASE")
    assert "leak-key" not in rlc_js
    assert '"is_correct": true' not in rlc_js and '"is_correct":true' not in rlc_js
    assert '"acceptable_keywords"' not in rlc_js
    # And the plan still ships rlc at position 1.
    plan = json.loads(_extract_const(html, "PRACTICE_ARC"))
    assert plan["games"][1]["id"] == "rlc"
