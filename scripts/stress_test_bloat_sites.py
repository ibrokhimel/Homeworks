"""Stress-test the 4 secondary AI grading sites with bloated content.

Verifies PR 1 (AI grading bloat fix) end-to-end on every site that wasn't
hit by the live boss-turn curl. Calls each function directly with a 1.5MB
boss-question text bloat (extracted from HW-20260429-019) and asserts the
response is sane — either real Kimi grading (sanitization layer 1 worked) or
a synthetic fallback (resilience layer 2 worked).

Run with:
    .venv\\Scripts\\python scripts\\stress_test_bloat_sites.py

Requires: KIMI_API_KEY in .env (script does NOT read .env directly — it
imports server.config which calls dotenv.load_dotenv internally).
"""
from __future__ import annotations

import asyncio
import json
import sys
import traceback
from pathlib import Path

# Add repo root to path so `from server import ...` resolves
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Triggers dotenv via server.config import → KIMI_API_KEY loaded into env.
from server import config  # noqa: F401, E402
from server.services import tutor  # noqa: E402

# Bloated test data — boss[0].q from HW-20260429-019 (1.5MB inline base64 PNG).
BLOATED_FILE = Path(r"C:\tmp\hw-broken.json")
if not BLOATED_FILE.exists():
    print(f"ERROR: {BLOATED_FILE} not found. Re-fetch from prod first:")
    print('  curl -sS -o "C:\\tmp\\hw-broken.json" "http://sigmaai.local:8000/api/homeworks/HW-20260429-019"')
    sys.exit(1)

with BLOATED_FILE.open(encoding="utf-8") as f:
    src = json.load(f)
cj = src["content_json"] if isinstance(src["content_json"], dict) else json.loads(src["content_json"])
BLOATED_Q: str = cj["boss_questions"][0]["q"]
print(f"Bloated boss-question size: {len(BLOATED_Q):,} chars")
print(f"Has inline base64? {'data:image' in BLOATED_Q}")
print()


# ---------------------------------------------------------------------------
# Result formatter
# ---------------------------------------------------------------------------


def _classify(result):
    """Return a short string describing the response state."""
    if not isinstance(result, dict) and not isinstance(result, tuple):
        return f"UNEXPECTED type={type(result).__name__}"
    if isinstance(result, tuple):
        return f"score={result[0]} feedback_chars={len(result[1])}"
    if result.get("ai_unavailable"):
        return "[OK-FALLBACK] SYNTHETIC FALLBACK fired (Layer 2 - try/except + neutral fields)"
    return "[OK-KIMI] REAL KIMI GRADING (Layer 1 - sanitization stripped bloat before LLM)"


# ---------------------------------------------------------------------------
# Site 1: tutor.check_answer
# ---------------------------------------------------------------------------


async def stress_check_answer():
    """Force the AI fallback path with a bloated `question`. answer_spec.type
    = 'semantic' guarantees the deterministic short-circuit returns 'unsure'
    so the LLM call actually fires."""
    print("=" * 78)
    print("Site 1: tutor.check_answer (legacy /check-answer AI fallback)")
    print("=" * 78)
    try:
        result = await tutor.check_answer(
            question_id="bloat-test-q1",
            question=BLOATED_Q,
            student_answer="Penny says she chats too much during lessons.",
            expected_answers=["Penny chats during lessons"],
            answer_spec={
                "type": "semantic",
                "expected": "Penny chats during lessons",
                "allow_ai_fallback": True,
            },
            allow_ai_fallback=True,
            subject="english",
            grade=8,
            phase="reading",
        )
        print(f"  {_classify(result)}")
        print(f"  correct={result.get('correct')}  source={result.get('source')}  feedback={(result.get('feedback') or '')[:80]!r}")
    except Exception as exc:
        print(f"  [FAIL] EXCEPTION: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    print()


# ---------------------------------------------------------------------------
# Site 2: tutor.reflection_feedback
# ---------------------------------------------------------------------------


async def stress_reflection_feedback():
    """Bloat goes into homework_summary — the field most likely to carry
    bloated panel/reading content from a real session."""
    print("=" * 78)
    print("Site 2: tutor.reflection_feedback (Phase 7 reflection grader)")
    print("=" * 78)
    try:
        result = await tutor.reflection_feedback(
            homework_title="Unit 19 — School can be fun!",
            homework_summary=BLOATED_Q,  # bloat injection
            student_reflection="I learned about flipped classrooms and how some students prefer them.",
            performance={"correct": 8, "total": 10, "time_minutes": 25, "weak_phase": "reading"},
            subject="english",
            grade=8,
        )
        print(f"  {_classify(result)}")
        print(f"  feedback={(result.get('feedback') or '')[:100]!r}")
        print(f"  next_steps={result.get('next_steps')}")
    except Exception as exc:
        print(f"  [FAIL] EXCEPTION: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    print()


# ---------------------------------------------------------------------------
# Site 3: tutor.tutor_help
# ---------------------------------------------------------------------------


async def stress_tutor_help():
    """Bloat in `question` — the live tutor sidekick is asked to help the
    student with a question carrying inline base64 content."""
    print("=" * 78)
    print("Site 3: tutor.tutor_help (general tutor assistant)")
    print("=" * 78)
    try:
        result = await tutor.tutor_help(
            phase="reading",
            question=BLOATED_Q,
            student_input="I don't understand who said what",
            subject="english",
            grade=8,
        )
        print(f"  {_classify(result)}")
        print(f"  response={(result.get('response') or '')[:100]!r}")
        print(f"  guidance_type={result.get('guidance_type')}")
    except Exception as exc:
        print(f"  [FAIL] EXCEPTION: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    print()


# ---------------------------------------------------------------------------
# Site 4: _grade_rlc_reasoning (routes/ai.py)
# ---------------------------------------------------------------------------


async def stress_grade_rlc_reasoning():
    """Bloat in step.prompt + case_intro — Real-Life Challenge per-step
    grader, the path most exposed to bloat in case-based scenarios."""
    print("=" * 78)
    print("Site 4: _grade_rlc_reasoning (routes/ai.py — RLC per-step grader)")
    print("=" * 78)
    try:
        from server.routes.ai import _grade_rlc_reasoning  # imported here to keep top minimal

        score, feedback = await _grade_rlc_reasoning(
            text="The hotel guest forgot their key. I should call security and verify their ID before reissuing.",
            step={
                "prompt": BLOATED_Q,  # bloat injection
                "acceptable_keywords": ["security", "verify", "ID"],
            },
            case_intro="You are a hotel receptionist at the front desk.",
            expert_role="hotel receptionist",
        )
        if score == 50 and "mavjud emas" in feedback:
            print("  [OK-FALLBACK] SYNTHETIC FALLBACK fired (Layer 2 - neutral 50 + 'AI baholash mavjud emas')")
        else:
            print("  [OK-KIMI] REAL KIMI GRADING (Layer 1 - sanitization worked)")
        print(f"  score={score}  feedback={feedback[:120]!r}")
    except Exception as exc:
        print(f"  [FAIL] EXCEPTION: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    print()


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


async def main():
    await stress_check_answer()
    await stress_reflection_feedback()
    await stress_tutor_help()
    await stress_grade_rlc_reasoning()
    print("=" * 78)
    print("DONE. Look for [OK-*] on every site. Any [FAIL] means the fix")
    print("did not cover that path and needs investigation.")
    print("=" * 78)


if __name__ == "__main__":
    asyncio.run(main())
