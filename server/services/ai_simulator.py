"""AI Simulator — Plan 8 multi-turn synthetic simulation runner.

Implements the simulation registry from Plan 8 §6 and exposes a thin
``run_simulation(name, ...)`` async API. The simulator is the multi-turn
counterpart to ``ai_evaluator`` (single-turn fixture-driven). Both feed
results into ``ai_eval_runs`` so rollout gates (§7 Gate 3) have a single
queryable surface.

Each simulation is a deterministic state machine driven by a scripted
"student persona". The persona sends a sequence of messages; after each turn
the candidate (real backend or stub) is invoked, the response is judged
against per-step rubric, and the simulation either advances or fails.

Why not call the real LLM by default?
-------------------------------------
Plan 8 §7 explicitly says simulations must run in CI to gate rollout. CI must
not depend on live API keys. So the default candidate is a deterministic
in-process stub registered per simulation; passing a real candidate (e.g. a
function that calls ``ai_gateway.generate_structured``) is opt-in.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from server.db.eval_runs_repo import create_eval_run

_log = logging.getLogger("nets.ai_simulator")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SimTurn:
    """One scripted student turn + the rubric the candidate response must satisfy."""
    student_message: str
    must_include_any: list[str] = field(default_factory=list)
    must_not_include: list[str] = field(default_factory=list)
    notes: str = ""


@dataclass
class SimulationDef:
    """A registered simulation scenario."""
    name: str
    purpose: str
    task_type: str
    turns: list[SimTurn]
    initial_state: dict = field(default_factory=dict)


@dataclass
class TurnResult:
    turn_index: int
    student_message: str
    candidate_response: str
    passed: bool
    failures: list[str] = field(default_factory=list)


@dataclass
class SimulationReport:
    name: str
    task_type: str
    total_turns: int
    passed_turns: int
    failed_turns: int
    score: float
    turn_results: list[TurnResult] = field(default_factory=list)
    final_state: dict = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        # A simulation overall passes if every turn passed. Stricter than
        # per-turn average because partial multi-turn failures still imply
        # bad UX (e.g. the tutor said the right thing on turn 1 but leaked
        # the answer on turn 3).
        return self.failed_turns == 0

    def summary(self) -> dict:
        return {
            "name": self.name,
            "task_type": self.task_type,
            "total_turns": self.total_turns,
            "passed_turns": self.passed_turns,
            "failed_turns": self.failed_turns,
            "score": round(self.score, 4),
            "passed": self.passed,
            "turns": [
                {
                    "turn_index": t.turn_index,
                    "student_message": t.student_message,
                    "passed": t.passed,
                    "failures": t.failures,
                }
                for t in self.turn_results
            ],
            "final_state": self.final_state,
        }


# ---------------------------------------------------------------------------
# Built-in simulation scenarios (Plan 8 §6 simulation table)
# ---------------------------------------------------------------------------


_SCENARIOS: dict[str, SimulationDef] = {
    "student_confused_vocab": SimulationDef(
        name="student_confused_vocab",
        purpose="Student asks word/phrase meanings inside English homework.",
        task_type="tutor_chat",
        turns=[
            SimTurn(
                student_message="according to nima degani?",
                must_include_any=["ga ko'ra", "bo'yicha", "ko'ra", "according to"],
                must_not_include=["Hey according to,"],
            ),
            SimTurn(
                student_message="rahmat, endi 'in addition' chi?",
                must_include_any=["qo'shimcha", "yana", "in addition"],
            ),
        ],
    ),
    "student_missing_context": SimulationDef(
        name="student_missing_context",
        purpose="Student says 'manabu joyga tushunmadim' — context must carry meaning.",
        task_type="tutor_chat",
        turns=[
            SimTurn(
                student_message="manabu joyga tushunmadim",
                must_include_any=["qaysi", "qaerda", "ko'rsating", "exactly"],
                notes="Without phase context the tutor must ask a clarifying question, not invent an answer.",
            ),
        ],
    ),
    "student_wrong_answer_then_hint": SimulationDef(
        name="student_wrong_answer_then_hint",
        purpose="After a wrong answer the tutor should hint, not solve.",
        task_type="tutor_chat",
        turns=[
            SimTurn(
                student_message="x = 7 dedim, lekin noto'g'ri",
                must_include_any=["ko'rib chiqing", "qaytadan", "tekshiring", "step", "qaysi qadamda"],
                must_not_include=["x = 5", "answer is 5", "x ning qiymati 5"],
            ),
        ],
    ),
    "boss_adaptive_weak_topic": SimulationDef(
        name="boss_adaptive_weak_topic",
        purpose="Boss should target weak topics and update difficulty over turns.",
        task_type="boss_question_generate",
        turns=[
            SimTurn(
                student_message="boss-start",
                must_include_any=["weak", "according_to", "meaning_in_context"],
                notes="Generated question prompt should reference weak topic.",
            ),
        ],
        initial_state={"weak_topics": ["according_to"]},
    ),
    "boss_repetition_guard": SimulationDef(
        name="boss_repetition_guard",
        purpose="Boss should not repeat a previously-asked question.",
        task_type="boss_question_generate",
        turns=[
            SimTurn(
                student_message="generate-2",
                must_not_include=["DUPLICATE_QUESTION_TEXT"],
                notes="Stub should produce a different question_text on the second turn.",
            ),
        ],
        initial_state={"asked_questions": ["DUPLICATE_QUESTION_TEXT"]},
    ),
    "final_report_accuracy": SimulationDef(
        name="final_report_accuracy",
        purpose="Final report must reference stored attempt metrics.",
        task_type="final_report",
        turns=[
            SimTurn(
                student_message="generate-final-report",
                must_include_any=["accuracy", "weak", "strong", "mastery"],
            ),
        ],
        initial_state={
            "attempts_summary": {
                "accuracy": 0.62,
                "weak_topics": ["according_to"],
                "strong_topics": ["basic_translation"],
            },
        },
    ),
}


def list_simulations() -> list[str]:
    return sorted(_SCENARIOS.keys())


def get_simulation(name: str) -> Optional[SimulationDef]:
    return _SCENARIOS.get(name)


# ---------------------------------------------------------------------------
# Default in-process candidate stub
# ---------------------------------------------------------------------------


# A candidate fn receives (turn, accumulated_state) and must return a string
# response (or any object that can be stringified). Async candidates are
# supported.
CandidateFn = Callable[[SimTurn, dict], Any]


def _default_candidate(turn: SimTurn, state: dict) -> str:
    """Hard-coded "happy-path" stub used when the caller doesn't supply one.

    Designed to satisfy the rubric of every built-in scenario so the
    simulator's own contract (loop + judge + persistence) is testable in CI
    without spending tokens. Real backend candidates are the production
    path; this stub is the regression net for the harness itself.
    """
    msg = (turn.student_message or "").lower()
    if "according to" in msg:
        return (
            "'according to' degani '...ga ko'ra' yoki '...bo'yicha'. "
            "Masalan: according to the text = matnga ko'ra."
        )
    if "in addition" in msg:
        return (
            "'in addition' degani 'qo'shimcha ravishda' yoki 'yana'. "
            "Bu ifoda yangi ma'lumot qo'shganda ishlatiladi."
        )
    if "tushunmadim" in msg:
        return (
            "Qaysi joyni tushunmadingiz? Iltimos, ekrandagi qaysi qismni "
            "ko'rsating yoki gapni qaytaring."
        )
    if "noto'g'ri" in msg or "wrong" in msg:
        return (
            "Yaxshi urinish! Qaysi qadamda xato bo'lgani ko'rib chiqing va "
            "tenglamani tekshiring."
        )
    if "boss-start" in msg:
        weak = state.get("weak_topics") or []
        return f"Boss generated targeting weak topic: {', '.join(weak) or 'meaning_in_context'}"
    if "generate-2" in msg:
        # Must NOT match the previously-asked question text.
        return "Boss generated a fresh question about prepositions of time."
    if "final-report" in msg:
        s = state.get("attempts_summary") or {}
        return (
            f"Mastery report — accuracy: {s.get('accuracy', 0)}, "
            f"weak topics: {s.get('weak_topics') or []}, "
            f"strong topics: {s.get('strong_topics') or []}."
        )
    return "Iltimos, savolingizni qaytadan yozing."


# ---------------------------------------------------------------------------
# Simulation runner
# ---------------------------------------------------------------------------


def _judge_turn(turn: SimTurn, response: Any) -> tuple[bool, list[str]]:
    """Apply the per-turn rubric. Returns (passed, failures)."""
    failures: list[str] = []
    text = response if isinstance(response, str) else json.dumps(response, ensure_ascii=False)
    norm = text.lower()

    if turn.must_include_any:
        if not any(token.lower() in norm for token in turn.must_include_any):
            failures.append(f"missing_any:{turn.must_include_any}")
    for forbidden in turn.must_not_include:
        if forbidden.lower() in norm:
            failures.append(f"forbidden_present:{forbidden!r}")
    return (not failures, failures)


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


async def run_simulation(
    name: str,
    *,
    candidate_fn: Optional[CandidateFn] = None,
    initial_state: Optional[dict] = None,
    persist: bool = True,
    model: Optional[str] = None,
    prompt_version: Optional[str] = None,
) -> SimulationReport:
    """Drive ``name`` through every turn and return a SimulationReport.

    Always persists to ``ai_eval_runs`` (best-effort) when ``persist=True``
    so dashboard queries see fresh simulation outcomes.
    """
    sim = get_simulation(name)
    if not sim:
        raise KeyError(f"unknown simulation: {name}")

    state = dict(sim.initial_state)
    if initial_state:
        state.update(initial_state)

    fn = candidate_fn or _default_candidate
    turn_results: list[TurnResult] = []
    passed_turns = 0

    for idx, turn in enumerate(sim.turns):
        try:
            raw = fn(turn, state)
            response = await _maybe_await(raw)
        except Exception as exc:
            turn_results.append(
                TurnResult(
                    turn_index=idx,
                    student_message=turn.student_message,
                    candidate_response="",
                    passed=False,
                    failures=[f"candidate_raised:{type(exc).__name__}:{exc}"],
                )
            )
            continue

        ok, failures = _judge_turn(turn, response)
        if ok:
            passed_turns += 1
        text_response = response if isinstance(response, str) else json.dumps(
            response, ensure_ascii=False
        )
        turn_results.append(
            TurnResult(
                turn_index=idx,
                student_message=turn.student_message,
                candidate_response=text_response,
                passed=ok,
                failures=failures,
            )
        )

    total_turns = len(sim.turns)
    score = passed_turns / total_turns if total_turns else 0.0
    report = SimulationReport(
        name=sim.name,
        task_type=sim.task_type,
        total_turns=total_turns,
        passed_turns=passed_turns,
        failed_turns=total_turns - passed_turns,
        score=score,
        turn_results=turn_results,
        final_state=state,
    )

    if persist:
        try:
            await create_eval_run(
                eval_name=f"sim_{sim.name}",
                task_type=sim.task_type,
                total_cases=total_turns,
                passed_cases=passed_turns,
                failed_cases=total_turns - passed_turns,
                score=score,
                model=model,
                prompt_version=prompt_version,
                details=report.summary(),
            )
        except Exception as exc:
            _log.warning("ai_eval_runs persist failed in simulator: %s", exc)

    return report


# ---------------------------------------------------------------------------
# Multi-simulation gate (Plan 8 §7 Gate 3 thresholds)
# ---------------------------------------------------------------------------


SIMULATION_GATE_THRESHOLDS: dict[str, float] = {
    "student_confused_vocab": 0.95,
    "student_missing_context": 0.90,
    "student_wrong_answer_then_hint": 0.90,
    "boss_adaptive_weak_topic": 0.90,
    "boss_repetition_guard": 0.95,
    "final_report_accuracy": 0.95,
}


def simulation_gate_threshold(name: str) -> Optional[float]:
    return SIMULATION_GATE_THRESHOLDS.get(name)
