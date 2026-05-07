"""AI Evaluator — Plan 8 single-turn evaluation harness.

Loads JSONL fixtures from ``tests/ai_eval_cases/`` and judges each case using
deterministic rubric checks (``must_include_any`` / ``must_not_include`` /
``equals`` / ``regex_match``). Aggregated results are persisted to
``ai_eval_runs`` so rollout gates can query pass rates per eval suite.

Why deterministic-only by default
---------------------------------
Plan 8 explicitly separates Gate 2 (single-turn evals) from Gate 3 (multi-turn
LLM-judge simulations). Gate 2 must be reproducible in CI without spending
tokens, so the rubric language here is intentionally string-level. Multi-turn
LLM-judge work lives in ``ai_simulator.py``.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from server.db.eval_runs_repo import create_eval_run

_log = logging.getLogger("nets.ai_evaluator")

# ---------------------------------------------------------------------------
# Fixture root resolution
# ---------------------------------------------------------------------------

# Repo root is two levels up from this file (server/services/ai_evaluator.py).
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE_DIR = _REPO_ROOT / "tests" / "ai_eval_cases"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class EvalCase:
    """One row of an evaluation fixture."""
    id: str
    task_type: str
    input: dict
    expected: dict
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict) -> "EvalCase":
        return cls(
            id=str(raw.get("id") or raw.get("name") or ""),
            task_type=str(raw.get("task_type") or "unknown"),
            input=dict(raw.get("input") or {}),
            expected=dict(raw.get("expected") or {}),
            notes=str(raw.get("notes") or ""),
        )


@dataclass
class CaseVerdict:
    """Result of running one case through a candidate response."""
    case_id: str
    passed: bool
    score: float
    failures: list[str] = field(default_factory=list)
    matched_rules: list[str] = field(default_factory=list)


@dataclass
class EvalReport:
    """Aggregate result of an eval pass."""
    eval_name: str
    task_type: str
    total: int
    passed: int
    failed: int
    score: float
    case_verdicts: list[CaseVerdict] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            "eval_name": self.eval_name,
            "task_type": self.task_type,
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "score": round(self.score, 4),
            "verdicts": [
                {
                    "case_id": v.case_id,
                    "passed": v.passed,
                    "score": v.score,
                    "failures": v.failures,
                }
                for v in self.case_verdicts
            ],
        }


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------


def load_eval_cases(
    eval_name: str,
    fixture_dir: Optional[Path] = None,
) -> list[EvalCase]:
    """Load JSONL cases from ``<fixture_dir>/<eval_name>.jsonl``.

    Each line must be a valid JSON object. Blank lines are skipped. Malformed
    lines raise ``ValueError`` early so a corrupt fixture cannot silently
    pass an eval gate.
    """
    base = fixture_dir or DEFAULT_FIXTURE_DIR
    path = base / f"{eval_name}.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Eval fixture not found: {path}")
    cases: list[EvalCase] = []
    with path.open("r", encoding="utf-8") as fp:
        for lineno, raw_line in enumerate(fp, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"Eval fixture {path.name} line {lineno}: invalid JSON ({exc})"
                ) from exc
            cases.append(EvalCase.from_dict(row))
    return cases


# ---------------------------------------------------------------------------
# Rubric checks (deterministic, single-turn)
# ---------------------------------------------------------------------------


def _normalize(text: Any) -> str:
    return str(text or "").strip().lower()


def judge_case(
    case: EvalCase,
    candidate_response: Any,
) -> CaseVerdict:
    """Score one case against a candidate response.

    ``candidate_response`` may be a string (tutor reply) or a dict
    (structured tool output). The judge searches the stringified form for
    the rubric keywords.

    Supported rubric keys (all optional, all combine with AND):

      must_include_any: [str]    — at least one of these substrings must appear
      must_include_all: [str]    — every substring must appear
      must_not_include: [str]    — none of these may appear
      equals: str                — exact string match (case-insensitive)
      regex_match: str           — must match this regex
      score_min: float           — candidate dict must have score >= value
      is_correct: bool           — candidate dict must have is_correct == value
    """
    expected = case.expected or {}
    failures: list[str] = []
    matched: list[str] = []

    text_form = (
        candidate_response
        if isinstance(candidate_response, str)
        else json.dumps(candidate_response, ensure_ascii=False)
    )
    norm = _normalize(text_form)

    if "equals" in expected:
        if _normalize(expected["equals"]) != norm:
            failures.append(f"equals_mismatch:expected={expected['equals']!r}")
        else:
            matched.append("equals")

    inc_any = expected.get("must_include_any") or []
    if inc_any:
        if any(_normalize(token) in norm for token in inc_any):
            matched.append("must_include_any")
        else:
            failures.append(f"missing_any:{inc_any}")

    inc_all = expected.get("must_include_all") or []
    if inc_all:
        missing = [t for t in inc_all if _normalize(t) not in norm]
        if missing:
            failures.append(f"missing_all:{missing}")
        else:
            matched.append("must_include_all")

    forbidden = expected.get("must_not_include") or []
    if forbidden:
        leaked = [t for t in forbidden if _normalize(t) in norm]
        if leaked:
            failures.append(f"forbidden_present:{leaked}")
        else:
            matched.append("must_not_include")

    if "regex_match" in expected:
        try:
            if re.search(expected["regex_match"], text_form, re.IGNORECASE | re.DOTALL):
                matched.append("regex_match")
            else:
                failures.append(f"regex_no_match:{expected['regex_match']!r}")
        except re.error as exc:
            failures.append(f"regex_invalid:{exc}")

    if isinstance(candidate_response, dict):
        if "score_min" in expected:
            cand_score = candidate_response.get("score")
            if cand_score is None or float(cand_score) < float(expected["score_min"]):
                failures.append(f"score_below_min:{expected['score_min']}")
            else:
                matched.append("score_min")
        if "is_correct" in expected:
            cand_correct = candidate_response.get("is_correct")
            if cand_correct != expected["is_correct"]:
                failures.append(f"is_correct_mismatch:expected={expected['is_correct']}")
            else:
                matched.append("is_correct")

    passed = not failures
    # Score: 1.0 if every active rule matched; else proportion.
    total_rules = len(matched) + len(failures)
    score = 1.0 if passed else (len(matched) / total_rules if total_rules else 0.0)
    return CaseVerdict(
        case_id=case.id,
        passed=passed,
        score=score,
        failures=failures,
        matched_rules=matched,
    )


# ---------------------------------------------------------------------------
# Eval driver
# ---------------------------------------------------------------------------


# A candidate fn takes an EvalCase.input and returns either:
#   - a string (free text)
#   - a dict (structured AI output)
CandidateFn = Callable[[dict], Any]


async def run_eval(
    eval_name: str,
    candidate_fn: CandidateFn,
    *,
    task_type: Optional[str] = None,
    fixture_dir: Optional[Path] = None,
    persist: bool = True,
    model: Optional[str] = None,
    prompt_version: Optional[str] = None,
) -> EvalReport:
    """Run every case in ``<eval_name>.jsonl`` through ``candidate_fn``.

    When ``persist=True``, the aggregate result is saved to ``ai_eval_runs``.
    The judge per case is :func:`judge_case`; for LLM-judged simulations use
    ``ai_simulator.run_simulation`` instead.
    """
    cases = load_eval_cases(eval_name, fixture_dir=fixture_dir)
    verdicts: list[CaseVerdict] = []
    resolved_task = task_type or (cases[0].task_type if cases else "unknown")
    passed = 0
    score_total = 0.0

    for case in cases:
        try:
            response = candidate_fn(case.input)
            # If candidate returns an awaitable, the caller should pass an
            # async wrapper. We keep this sync-first for simplicity; an
            # async runner can wrap with asyncio.run before passing the fn.
        except Exception as exc:
            verdicts.append(
                CaseVerdict(
                    case_id=case.id,
                    passed=False,
                    score=0.0,
                    failures=[f"candidate_raised:{type(exc).__name__}:{exc}"],
                )
            )
            continue
        verdict = judge_case(case, response)
        verdicts.append(verdict)
        if verdict.passed:
            passed += 1
        score_total += verdict.score

    total = len(cases)
    aggregate_score = score_total / total if total else 0.0
    report = EvalReport(
        eval_name=eval_name,
        task_type=resolved_task,
        total=total,
        passed=passed,
        failed=total - passed,
        score=aggregate_score,
        case_verdicts=verdicts,
    )

    if persist:
        try:
            await create_eval_run(
                eval_name=eval_name,
                task_type=resolved_task,
                total_cases=total,
                passed_cases=passed,
                failed_cases=total - passed,
                score=aggregate_score,
                model=model,
                prompt_version=prompt_version,
                details=report.summary(),
            )
        except Exception as exc:
            _log.warning("ai_eval_runs persist failed (best-effort): %s", exc)

    return report


# ---------------------------------------------------------------------------
# Gate thresholds (Plan 8 §7)
# ---------------------------------------------------------------------------


# Minimum pass-rate per eval suite. Used by the rollout-gate query in routes.
EVAL_GATE_THRESHOLDS: dict[str, float] = {
    "live_tutor_context_questions": 0.95,
    "answer_checking_language": 0.90,
    "answer_checking_math": 0.95,
    "boss_generation": 0.90,
    "boss_answer_checking": 0.90,
    "final_report": 0.90,
}


def gate_threshold(eval_name: str) -> Optional[float]:
    return EVAL_GATE_THRESHOLDS.get(eval_name)
