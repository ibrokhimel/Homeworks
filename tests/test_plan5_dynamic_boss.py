"""Plan 5 — Dynamic Boss AI regression tests.

Each test guards a specific Plan 5 contract that, if regressed, would
either silently break the boss flow or weaken the answer-leak / state-ownership
invariants. Test names describe the regression they guard, not the happy path.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import patch

import pytest

from server.services import boss_dynamic
from server.services.boss_context_builder import (
    build_boss_context,
    _scrub_dict,
)
from server.db import boss_session_repo, attempts_repo


# ---------------------------------------------------------------------------
# Pure logic — damage / difficulty (deterministic, no DB, no AI)
# ---------------------------------------------------------------------------


def test_calculate_damage_clamps_multiplier_so_model_cannot_one_shot_boss():
    # Even if the model reports damage_multiplier=99, the boss can never lose
    # >37 HP from one medium-difficulty correct answer (15 base * 1.5 cap).
    dmg = boss_dynamic.calculate_damage(score=1.0, difficulty="medium", multiplier=99.0)
    assert dmg <= 25, f"multiplier should be clamped <=1.5x base; got {dmg}"


def test_calculate_damage_zero_below_60_score_regardless_of_difficulty():
    for diff in ("easy", "medium", "hard"):
        assert boss_dynamic.calculate_damage(0.59, diff) == 0
        assert boss_dynamic.calculate_damage(0.0, diff) == 0


def test_calculate_damage_invalid_difficulty_falls_back_to_medium_not_zero():
    # Defensive: a typo in the runtime should not silently zero damage on
    # correct answers.
    dmg = boss_dynamic.calculate_damage(1.0, "ULTRA-HARD")
    assert dmg == 15, f"unknown difficulty must fall back to medium=15, got {dmg}"


def test_next_difficulty_requires_two_correct_streak_before_escalating():
    # Single 0.95 score with streak=1 stays put — prevents a lucky guess
    # ramping difficulty after one question.
    streaks = boss_dynamic.BossStreaks(correct_streak=1, wrong_streak=0)
    assert boss_dynamic.next_difficulty("medium", 0.95, streaks) == "medium"
    streaks2 = boss_dynamic.BossStreaks(correct_streak=2, wrong_streak=0)
    assert boss_dynamic.next_difficulty("medium", 0.95, streaks2) == "hard"


def test_next_difficulty_de_escalates_on_two_wrong_streak():
    streaks = boss_dynamic.BossStreaks(correct_streak=0, wrong_streak=2)
    assert boss_dynamic.next_difficulty("hard", 0.3, streaks) == "easy"


# ---------------------------------------------------------------------------
# Generated-question validation — guards the contract surface
# ---------------------------------------------------------------------------


def test_generated_question_rejected_when_missing_expected_answer():
    raw = {
        "question_text": "What is 2+2?",
        "expected_answer": {},  # empty
        "rubric": {"full_credit": ["4"]},
        "target_skill": "addition",
        "difficulty": "easy",
    }
    with pytest.raises(boss_dynamic.BossQuestionRejected) as exc:
        boss_dynamic._validate_generated_question(raw, asked_questions=[])
    assert "missing_expected_answer" in str(exc.value)


def test_generated_question_rejected_when_paraphrase_of_previous():
    asked = [{"question_text": "Solve x + 2 = 5"}]
    raw = {
        "question_text": "  solve  X + 2 = 5  ",  # same after normalize
        "expected_answer": {"canonical": "3"},
        "rubric": {"full_credit": ["3"]},
        "target_skill": "linear_eq",
        "difficulty": "medium",
    }
    with pytest.raises(boss_dynamic.BossQuestionRejected) as exc:
        boss_dynamic._validate_generated_question(raw, asked_questions=asked)
    assert "repeats_previous" in str(exc.value)


def test_generated_question_rejects_invalid_difficulty_token():
    raw = {
        "question_text": "What is the meaning of 'according to'?",
        "expected_answer": {"canonical": "as stated by"},
        "rubric": {"full_credit": ["as stated by"]},
        "target_skill": "meaning_in_context",
        "difficulty": "TRIVIAL",  # not in allowed
    }
    with pytest.raises(boss_dynamic.BossQuestionRejected) as exc:
        boss_dynamic._validate_generated_question(raw, asked_questions=[])
    assert "invalid_difficulty" in str(exc.value)


# ---------------------------------------------------------------------------
# Context builder — answer-leak invariant
# ---------------------------------------------------------------------------


def test_scrub_dict_removes_answer_leak_keys_recursively():
    payload = {
        "question_text": "x?",
        "expected": "5",
        "ans": ["5"],
        "nested": {
            "accepted_answers": ["5", "five"],
            "answer_spec": {"type": "numeric", "expected": 5.0},
            "ok_field": "keep me",
        },
    }
    cleaned = _scrub_dict(payload)
    assert "expected" not in cleaned
    assert "ans" not in cleaned
    assert "accepted_answers" not in cleaned["nested"]
    assert "answer_spec" not in cleaned["nested"]
    assert cleaned["nested"]["ok_field"] == "keep me"


# ---------------------------------------------------------------------------
# End-to-end via the FastAPI client (with mocked LLM)
# ---------------------------------------------------------------------------


def _make_homework(client, *, hw_id_hint: str = "plan5-hw") -> str:
    """Insert a homework with no `boss_questions` so we prove the dynamic
    flow does not depend on the legacy static list (Plan 5 acceptance test 1).
    """
    payload = {
        "title": f"Plan 5 dynamic boss test ({hw_id_hint})",
        "subject": "english",
        "grade": 8,
        "mode": "hard",
        "family": "til-fanlar",
        "content_json": {
            "title": f"Plan 5 dynamic boss test ({hw_id_hint})",
            "subject": "english",
            "grade": 8,
            "language": "uz",
            "preview": {"text": "according to means as stated by"},
        },
    }
    resp = client.post("/api/homeworks", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _seed_attempts(session_id: str, hw_id: str) -> None:
    """Insert phase_attempts so the context builder has weak-topic signal."""
    async def go():
        for i in range(2):
            await attempts_repo.add_phase_attempt(
                session_id=session_id, hw_id=hw_id,
                phase="practice", subphase="sentence-fill",
                question_id=f"q{i}", checker_source="ai_judge",
                correct=0, score=0.2, confidence=0.9,
                feedback="not quite",
                misconception_tags_json=json.dumps(["meaning_in_context", "according_to"]),
            )
        await attempts_repo.add_phase_attempt(
            session_id=session_id, hw_id=hw_id,
            phase="practice", subphase="sentence-fill",
            question_id="q_strong", checker_source="ai_judge",
            correct=1, score=1.0, confidence=0.95,
            feedback="great",
            misconception_tags_json=json.dumps(["basic_translation"]),
        )
    asyncio.run(go())


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_starts_without_static_boss_questions(mock_gen, client):
    """Plan 5 acceptance test 1 — homework with no boss_questions but
    completed phase metrics must still start a boss session."""
    hw_id = _make_homework(client, hw_id_hint="t1")
    sess = "plan5sess0001"
    _seed_attempts(sess, hw_id)

    resp = client.post("/api/ai/boss/start", json={
        "session_id": sess,
        "homework_id": hw_id,
        "max_hp": 100,
        "trials_left": 5,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["hp"] == 100
    assert body["max_hp"] == 100
    assert body["trials_left"] == 5
    assert body["current_difficulty"] == "medium"
    assert body["boss_session_id"].startswith("bs_")
    # Weak topics derived from seeded misconception tags.
    assert "according_to" in body["weak_topics"] or "meaning_in_context" in body["weak_topics"]
    # No LLM call on /start — generation happens only on demand.
    mock_gen.assert_not_called()


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_start_is_idempotent_for_session_refresh(mock_gen, client):
    """Plan 5 acceptance test 5 — refresh during boss should not spawn a
    new boss session; re-calling /start returns the existing one."""
    hw_id = _make_homework(client, hw_id_hint="t5")
    sess = "plan5sess0005"
    _seed_attempts(sess, hw_id)

    a = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id,
    })
    b = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id,
    })
    assert a.status_code == 200 and b.status_code == 200
    assert a.json()["boss_session_id"] == b.json()["boss_session_id"]


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_generate_question_targets_weak_topics_first(mock_gen, client):
    """Plan 5 acceptance test 2 — generated question should target a weak
    topic. We assert the LLM was given the weak-topic list, since the
    generator output itself comes from the (mocked) LLM."""
    hw_id = _make_homework(client, hw_id_hint="t2")
    sess = "plan5sess0002"
    _seed_attempts(sess, hw_id)

    mock_gen.return_value = {
        "question_text": "What does 'according to' indicate in a sentence?",
        "expected_answer": {"canonical": "the source", "accepted_variants": ["the source", "as stated by"]},
        "rubric": {"full_credit": ["the source"], "partial_credit": ["source"], "common_mistakes": []},
        "target_skill": "according_to",
        "difficulty": "medium",
        "source_phase_ids": ["preview"],
        "why_this_question": "Student missed two according_to items in practice",
    }

    started = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id,
    }).json()
    bsid = started["boss_session_id"]

    resp = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["question_id"].startswith("gbq_")
    assert body["target_skill"] == "according_to"
    assert body["difficulty"] == "medium"

    # The prompt sent to the LLM must include the student's weak topics.
    prompt_str = mock_gen.call_args[0][0]
    assert "weak_topics" in prompt_str
    assert "according_to" in prompt_str or "meaning_in_context" in prompt_str

    # Frontend-facing response must NOT carry the expected_answer / rubric.
    assert "expected_answer" not in body
    assert "rubric" not in body


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_generate_question_does_not_leak_prior_expected_answers_to_llm(mock_gen, client):
    """Anti-leak invariant — even after asking one question, the next
    generation prompt must NOT contain the prior question's expected_answer
    or rubric. This is the one mistake that would let a Plan 5 generator
    silently regress into answer leaking."""
    hw_id = _make_homework(client, hw_id_hint="t_leak")
    sess = "plan5leak0001"
    _seed_attempts(sess, hw_id)

    leak_canary = "ZQXLEAKCANARY"
    mock_gen.return_value = {
        "question_text": "What does 'concerning' mean?",
        "expected_answer": {"canonical": leak_canary, "accepted_variants": [leak_canary]},
        "rubric": {"full_credit": [leak_canary], "partial_credit": [], "common_mistakes": []},
        "target_skill": "meaning_in_context",
        "difficulty": "medium",
        "source_phase_ids": ["preview"],
        "why_this_question": "weak topic follow-up",
    }
    started = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id,
    }).json()
    bsid = started["boss_session_id"]
    # First question.
    r1 = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid})
    assert r1.status_code == 200, r1.text

    # Second generation — check the prompt does NOT contain the canary.
    mock_gen.return_value = {
        "question_text": "Use 'according to' in a sentence about sources.",
        "expected_answer": {"canonical": "any sentence with according to", "accepted_variants": []},
        "rubric": {"full_credit": ["uses according to citing source"], "partial_credit": [], "common_mistakes": []},
        "target_skill": "according_to",
        "difficulty": "medium",
        "source_phase_ids": ["preview"],
        "why_this_question": "second item",
    }
    mock_gen.reset_mock()
    # Adjust return so the new question_text isn't a paraphrase.
    r2 = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid})
    assert r2.status_code == 200, r2.text

    second_prompt = mock_gen.call_args[0][0]
    assert leak_canary not in second_prompt, (
        "prior expected_answer canary leaked into the generator prompt — "
        "asked_questions context must scrub answer keys"
    )


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_submit_answer_backend_owns_hp_not_model(mock_gen, client):
    """Plan 5 acceptance test 4 — the model cannot set HP. Even when the
    answer-checker returns a wild damage_multiplier, backend HP delta is
    bounded by the deterministic damage table and the multiplier clamp."""
    hw_id = _make_homework(client, hw_id_hint="t_hp")
    sess = "plan5hpgrd0001"
    _seed_attempts(sess, hw_id)

    started = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id, "max_hp": 100,
    }).json()
    bsid = started["boss_session_id"]

    # Step 1: generate question
    mock_gen.return_value = {
        "question_text": "Define 'according to'.",
        "expected_answer": {"canonical": "as stated by", "accepted_variants": []},
        "rubric": {"full_credit": ["as stated by"], "partial_credit": [], "common_mistakes": []},
        "target_skill": "according_to",
        "difficulty": "medium",
        "source_phase_ids": ["preview"],
        "why_this_question": "weak topic",
    }
    g = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid}).json()
    qid = g["question_id"]

    # Step 2: submit — checker returns inflated damage_multiplier; backend clamps
    mock_gen.return_value = {
        "is_correct": True,
        "score": 1.0,
        "confidence": 0.95,
        "feedback_to_student": "Correct.",
        "misconception_tags": [],
        "damage_multiplier": 99.0,  # absurd; must be clamped
        "difficulty_recommendation": "increase",
        "should_retry_same_skill": False,
    }
    resp = client.post("/api/ai/boss/submit-answer", json={
        "boss_session_id": bsid,
        "question_id": qid,
        "student_answer": "as stated by",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Medium base = 15, max multiplier = 1.5 → max damage = 22 or 23 (rounding).
    # HP must NOT be 100 - (15 * 99) = -1385.
    assert body["damage"] <= 25, f"damage not clamped: {body['damage']}"
    assert body["hp"] >= 75, f"hp not clamped: {body['hp']}"
    assert body["boss_status"] == "active"


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_state_persists_across_request_for_refresh(mock_gen, client):
    """Plan 5 acceptance test 5 — /state must return the same HP / trials
    as set by submit-answer. Guards the database round-trip."""
    hw_id = _make_homework(client, hw_id_hint="t_state")
    sess = "plan5state001"
    _seed_attempts(sess, hw_id)

    started = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id, "max_hp": 100, "trials_left": 5,
    }).json()
    bsid = started["boss_session_id"]

    mock_gen.return_value = {
        "question_text": "Pick the synonym of 'concerning'.",
        "expected_answer": {"canonical": "about", "accepted_variants": ["regarding"]},
        "rubric": {"full_credit": ["about"], "partial_credit": [], "common_mistakes": []},
        "target_skill": "meaning_in_context",
        "difficulty": "medium",
        "source_phase_ids": ["preview"],
        "why_this_question": "weak topic",
    }
    q = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid}).json()

    mock_gen.return_value = {
        "is_correct": False, "score": 0.0, "confidence": 0.9,
        "feedback_to_student": "Try again.",
        "misconception_tags": ["meaning_in_context"],
        "damage_multiplier": 1.0, "difficulty_recommendation": "stay",
        "should_retry_same_skill": True,
    }
    client.post("/api/ai/boss/submit-answer", json={
        "boss_session_id": bsid, "question_id": q["question_id"], "student_answer": "wrong",
    })

    state = client.post("/api/ai/boss/state", json={"boss_session_id": bsid}).json()
    assert state["hp"] == 100  # wrong answer = 0 damage
    assert state["trials_left"] == 4  # one attempt consumed
    assert state["boss_session_id"] == bsid


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_boss_give_up_marks_abandoned_and_blocks_further_actions(mock_gen, client):
    hw_id = _make_homework(client, hw_id_hint="t_giveup")
    sess = "plan5give001"
    _seed_attempts(sess, hw_id)

    started = client.post("/api/ai/boss/start", json={
        "session_id": sess, "homework_id": hw_id,
    }).json()
    bsid = started["boss_session_id"]
    r = client.post("/api/ai/boss/give-up", json={"boss_session_id": bsid})
    assert r.status_code == 200
    assert r.json()["status"] == "abandoned"

    # Subsequent generate must be rejected.
    rg = client.post("/api/ai/boss/generate-question", json={"boss_session_id": bsid})
    assert rg.status_code == 409


@patch("server.services.boss_dynamic.ai_orchestrator.generate_json")
def test_legacy_boss_turn_endpoint_still_intact(mock_gen, client):
    """Plan 5 §4 + CLAUDE.md — the legacy /ai/boss-turn route must keep
    working while Plan 5 ships, so old generated homework HTML keeps
    grading correctly. If this fails we have broken backward compat."""
    mock_gen.return_value = {
        "correct": True, "damage_dealt": 20, "boss_response": "Yaxshi!",
        "hint": None, "score": 1.0,
    }
    resp = client.post("/api/ai/boss-turn", json={
        "boss_question": "x²=25?",
        "student_answer": "±5",
        "expected_answers": ["±5"],
        "damage_value": 20,
        "hp_remaining": 80,
        "attempt_number": 1,
        "subject": "math-algebra",
        "grade": 8,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["correct"] is True
