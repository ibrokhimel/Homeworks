"""Plan 8 — Evaluation, Logging, and Rollout regression tests.

Each test guards a specific Plan 8 contract that, if regressed, would either
silently break the dashboard / debug surface or weaken the rollout gates.
Test names describe the regression they guard.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path

import pytest

from server.db import (
    ai_call_logs_repo,
    attempts_repo,
    boss_repo,
    boss_session_repo,
    eval_runs_repo,
    session_events_repo,
    session_metrics_repo,
)
from server.services import ai_evaluator, ai_metrics, ai_simulator


# ---------------------------------------------------------------------------
# 1. ai_eval_runs migration + repo round-trip
# ---------------------------------------------------------------------------


def test_ai_eval_runs_table_round_trip_persists_score(client):
    """Regression: eval runs must persist score + details, otherwise the
    rollout-gate dashboard cannot read prior pass rates."""
    run_id = asyncio.run(eval_runs_repo.create_eval_run(
        eval_name="unit_test_eval",
        task_type="tutor_chat",
        total_cases=4,
        passed_cases=3,
        failed_cases=1,
        score=0.75,
        details={"verdicts": [{"id": "c1", "passed": True}]},
        prompt_version="tutor-assistant:v1",
        model="kimi-k2.6",
    ))
    assert run_id.startswith("eval_")
    row = asyncio.run(eval_runs_repo.get_eval_run(run_id))
    assert row is not None
    assert row["eval_name"] == "unit_test_eval"
    assert row["score"] == 0.75
    assert row["details"]["verdicts"][0]["id"] == "c1"
    assert row["prompt_version"] == "tutor-assistant:v1"


def test_list_eval_runs_filters_by_eval_name(client):
    asyncio.run(eval_runs_repo.create_eval_run(
        eval_name="filter_target", task_type="answer_check",
        total_cases=2, passed_cases=2, failed_cases=0, score=1.0,
    ))
    asyncio.run(eval_runs_repo.create_eval_run(
        eval_name="filter_other", task_type="answer_check",
        total_cases=2, passed_cases=1, failed_cases=1, score=0.5,
    ))
    rows = asyncio.run(eval_runs_repo.list_eval_runs(eval_name="filter_target"))
    assert len(rows) >= 1
    assert all(r["eval_name"] == "filter_target" for r in rows)


# ---------------------------------------------------------------------------
# 2. Eval fixture loader — regression on JSON parsing errors
# ---------------------------------------------------------------------------


def test_load_eval_cases_raises_on_corrupt_jsonl(tmp_path: Path):
    """Regression: a corrupt fixture must NOT silently pass an eval gate."""
    bad = tmp_path / "broken.jsonl"
    bad.write_text("{not valid json}\n", encoding="utf-8")
    with pytest.raises(ValueError) as exc:
        ai_evaluator.load_eval_cases("broken", fixture_dir=tmp_path)
    assert "invalid JSON" in str(exc.value)


def test_load_eval_cases_skips_blank_lines(tmp_path: Path):
    p = tmp_path / "ok.jsonl"
    p.write_text(
        '{"id": "a", "task_type": "tutor_chat", "input": {}, "expected": {}}\n'
        '\n'
        '{"id": "b", "task_type": "tutor_chat", "input": {}, "expected": {}}\n',
        encoding="utf-8",
    )
    cases = ai_evaluator.load_eval_cases("ok", fixture_dir=tmp_path)
    assert [c.id for c in cases] == ["a", "b"]


def test_all_six_planned_fixtures_exist_and_load():
    """Plan 8 §5 names six required fixture files — all must load without error."""
    expected = [
        "live_tutor_context_questions",
        "answer_checking_language",
        "answer_checking_math",
        "boss_generation",
        "boss_answer_checking",
        "final_report",
    ]
    for name in expected:
        cases = ai_evaluator.load_eval_cases(name)
        assert len(cases) > 0, f"{name}.jsonl loaded zero cases"
        for c in cases:
            assert c.id, f"{name} has a case with empty id"
            assert c.task_type, f"{name}.{c.id} has empty task_type"


# ---------------------------------------------------------------------------
# 3. Rubric judge — anti-leak, partial scoring
# ---------------------------------------------------------------------------


def test_judge_case_must_not_include_blocks_answer_leak():
    case = ai_evaluator.EvalCase(
        id="leak_test",
        task_type="tutor_chat",
        input={},
        expected={"must_not_include": ["x = 3"]},
    )
    leaked = "The answer is x = 3"
    verdict = ai_evaluator.judge_case(case, leaked)
    assert verdict.passed is False
    assert any("forbidden_present" in f for f in verdict.failures)


def test_judge_case_partial_score_when_only_some_rules_match():
    """Regression: partial-match cases must produce a score >0 but <1 so
    flaky LLM behavior is graded fairly."""
    case = ai_evaluator.EvalCase(
        id="partial",
        task_type="tutor_chat",
        input={},
        expected={
            "must_include_any": ["good_token"],
            "must_not_include": ["bad_token"],
        },
    )
    response = "good_token bad_token"
    verdict = ai_evaluator.judge_case(case, response)
    assert verdict.passed is False
    assert 0.0 < verdict.score < 1.0


def test_judge_case_passes_when_all_rules_match():
    case = ai_evaluator.EvalCase(
        id="happy",
        task_type="tutor_chat",
        input={},
        expected={"must_include_any": ["yes"], "must_not_include": ["no"]},
    )
    verdict = ai_evaluator.judge_case(case, "the answer is yes")
    assert verdict.passed is True
    assert verdict.score == 1.0


def test_judge_case_handles_dict_response_with_score_min():
    case = ai_evaluator.EvalCase(
        id="dict_score",
        task_type="answer_check",
        input={},
        expected={"score_min": 0.8, "is_correct": True},
    )
    bad = {"score": 0.5, "is_correct": True, "feedback": "wrong"}
    good = {"score": 0.9, "is_correct": True, "feedback": "right"}
    assert ai_evaluator.judge_case(case, bad).passed is False
    assert ai_evaluator.judge_case(case, good).passed is True


# ---------------------------------------------------------------------------
# 4. run_eval — end-to-end persistence
# ---------------------------------------------------------------------------


def test_run_eval_persists_to_ai_eval_runs(client):
    """Regression: run_eval must always persist a row to ai_eval_runs so
    Gate-2 thresholds query the actual latest run, not stale data."""
    name = "live_tutor_context_questions"

    def _candidate(inp: dict) -> str:
        msg = (inp.get("student_message") or "").lower()
        if "according to" in msg:
            return "according to degani: ga ko'ra. Masalan: matnga ko'ra."
        if "in addition" in msg:
            return "in addition degani: qo'shimcha ravishda."
        if "tushunmadim" in msg:
            return "Qaysi joyni ko'rsating? qaerda chalkash bo'ldi?"
        if "ephemeral" in msg:
            return "ephemeral degani: lasting only a short time, qisqa muddatli."
        return "yaxshi savol, ammo aniqroq ko'rsating"

    report = asyncio.run(ai_evaluator.run_eval(name, _candidate))
    assert report.total >= 4
    rows = asyncio.run(eval_runs_repo.list_eval_runs(eval_name=name, limit=1))
    assert len(rows) == 1
    assert rows[0]["score"] == round(report.score, 4) or abs(rows[0]["score"] - report.score) < 1e-3


def test_run_eval_blocks_answer_leak_with_score_zero(client):
    """Regression: a candidate that leaks the forbidden token must score
    zero, otherwise the Gate-2 threshold could pass an answer-leaking model."""
    def _leaky(_inp: dict) -> str:
        return "Hey according to,"

    report = asyncio.run(ai_evaluator.run_eval(
        "live_tutor_context_questions", _leaky,
    ))
    # The first case forbids exactly "Hey according to," — verdict must fail.
    first = report.case_verdicts[0]
    assert first.passed is False


# ---------------------------------------------------------------------------
# 5. Simulator — built-in scenarios + default stub all pass
# ---------------------------------------------------------------------------


def test_simulator_lists_all_six_planned_scenarios():
    expected = {
        "student_confused_vocab",
        "student_missing_context",
        "student_wrong_answer_then_hint",
        "boss_adaptive_weak_topic",
        "boss_repetition_guard",
        "final_report_accuracy",
    }
    actual = set(ai_simulator.list_simulations())
    assert expected.issubset(actual), f"missing: {expected - actual}"


def test_simulator_default_stub_passes_every_built_in_scenario(client):
    """Regression: the harness's own stub must satisfy every scenario rubric.
    If it fails, either the stub regressed or a rubric was made too strict
    without updating the stub — both are silent CI failures otherwise."""
    for name in ai_simulator.list_simulations():
        report = asyncio.run(ai_simulator.run_simulation(name, persist=False))
        assert report.passed, (
            f"simulation {name} failed: {report.summary()}"
        )


def test_simulator_persists_report_to_ai_eval_runs(client):
    name = "student_confused_vocab"
    asyncio.run(ai_simulator.run_simulation(name, persist=True))
    rows = asyncio.run(eval_runs_repo.list_eval_runs(eval_name=f"sim_{name}", limit=1))
    assert len(rows) == 1
    assert rows[0]["task_type"] == "tutor_chat"


def test_simulator_overall_passes_only_when_every_turn_passes(client):
    """Regression: a simulation with one failed turn must NOT report passed=True,
    because partial multi-turn failures still imply bad UX."""
    sim = ai_simulator.SimulationDef(
        name="test_partial_fail",
        purpose="harness check",
        task_type="tutor_chat",
        turns=[
            ai_simulator.SimTurn(student_message="ping", must_include_any=["pong"]),
            ai_simulator.SimTurn(student_message="other", must_include_any=["MISSING_TOKEN"]),
        ],
    )
    # Inject scenario via the registry without polluting the public list.
    ai_simulator._SCENARIOS["test_partial_fail"] = sim
    try:
        def _stub(turn, _state):
            if "ping" in turn.student_message:
                return "pong"
            return "wrong response"
        report = asyncio.run(ai_simulator.run_simulation(
            "test_partial_fail", candidate_fn=_stub, persist=False,
        ))
        assert report.passed_turns == 1
        assert report.failed_turns == 1
        assert report.passed is False
    finally:
        ai_simulator._SCENARIOS.pop("test_partial_fail", None)


# ---------------------------------------------------------------------------
# 6. Metrics dashboard — computes rates and alerts correctly
# ---------------------------------------------------------------------------


def test_regression_dashboard_returns_all_required_rate_keys(client):
    payload = asyncio.run(ai_metrics.regression_dashboard(window_hours=24))
    rates = payload["rates"]
    expected_keys = {
        "provider_failure_rate",
        "schema_validation_failure_rate",
        "generic_fallback_rate",
        "question_resolution_failure_rate",
        "boss_repetition_rate",
        "screen_context_sanitized_to_empty_rate",
    }
    assert expected_keys.issubset(rates.keys()), (
        f"missing rate keys: {expected_keys - rates.keys()}"
    )


def test_regression_dashboard_flags_alert_when_provider_failure_rate_high(client):
    """Regression: alerting must trigger when a metric crosses its threshold,
    otherwise the dashboard becomes an outage during a real outage."""
    # Seed enough failures to push provider_failure_rate above 0.01
    async def _seed():
        for i in range(50):
            await ai_call_logs_repo.add_ai_call_log(
                call_id=f"alert_test_{uuid.uuid4().hex[:8]}",
                session_id=None,
                homework_id=None,
                task_type="tutor_chat",
                provider="kimi",
                model="kimi-k2.6",
                input_chars=100,
                output_chars=0,
                latency_ms=10,
                success=False,
                error_code="AI_PROVIDER_FAILED",
            )
    asyncio.run(_seed())

    payload = asyncio.run(ai_metrics.regression_dashboard(window_hours=24))
    rate = payload["rates"]["provider_failure_rate"]
    threshold = ai_metrics.ALERT_THRESHOLDS["provider_failure_rate"]
    if rate > threshold:
        assert payload["alerts"]["provider_failure_rate"] is True
        assert payload["any_alert"] is True


def test_dashboard_eval_runs_includes_seeded_run(client):
    """Regression: the dashboard must echo the latest eval_run per name so
    rollout owners can see the score without a separate query."""
    asyncio.run(eval_runs_repo.create_eval_run(
        eval_name="dashboard_seed_test",
        task_type="tutor_chat",
        total_cases=3, passed_cases=3, failed_cases=0, score=1.0,
    ))
    payload = asyncio.run(ai_metrics.regression_dashboard(window_hours=24))
    names = {r["eval_name"] for r in payload["eval_runs"]}
    assert "dashboard_seed_test" in names


def test_regression_dashboard_flags_screen_context_sanitized_to_empty_rate(client):
    """Regression: ``screen_context_sanitized_to_empty_rate`` is configured in
    ALERT_THRESHOLDS but was missing from ``regression_dashboard()`` rates,
    making the alert a dead switch. Guard against the rate being dropped
    again — the dashboard must compute it from session_events and the
    threshold must actually fire when exceeded."""
    from server.db.connection import connect

    sid = f"plan8_scse_{uuid.uuid4().hex[:8]}"
    hwid = f"hw_scse_{uuid.uuid4().hex[:6]}"

    # Snapshot the pre-existing screen_context_sanitized event counts in the
    # 24h window so the assertion is deterministic even when other tests in
    # the same session emit the same event. The session-scoped temp DB lives
    # for the whole pytest run, so prior tutor-route tests can pollute it.
    async def _snapshot_existing() -> tuple[int, int]:
        db = await connect()
        try:
            async with db.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN payload_json LIKE '%"sanitized_to_empty": true%' THEN 1 ELSE 0 END) AS empties
                FROM session_events
                WHERE event_type = 'screen_context_sanitized'
                  AND created_at >= datetime('now', '-24 hours')
                """,
            ) as cursor:
                row = await cursor.fetchone()
                return (
                    int(row["total"] or 0) if row else 0,
                    int(row["empties"] or 0) if row else 0,
                )
        finally:
            await db.close()

    pre_total, pre_empties = asyncio.run(_snapshot_existing())

    # N rows where screen context was sanitized to empty (the "bad" signal).
    n_empty = 8
    # M rows where screen context survived sanitization (the "ok" signal).
    m_ok = 2

    async def _seed():
        for _ in range(n_empty):
            await session_events_repo.add_session_event(
                sid, hwid, "screen_context_sanitized",
                {"sanitized_to_empty": True, "raw_len": 120, "clean_len": 0, "redacted": True},
            )
        for _ in range(m_ok):
            await session_events_repo.add_session_event(
                sid, hwid, "screen_context_sanitized",
                {"sanitized_to_empty": False, "raw_len": 80, "clean_len": 60, "redacted": True},
            )
    asyncio.run(_seed())

    payload = asyncio.run(ai_metrics.regression_dashboard(window_hours=24))
    rates = payload["rates"]

    # (a) Rate key exists.
    assert "screen_context_sanitized_to_empty_rate" in rates

    # (c) Rate matches (pre-existing + seeded) / (pre-existing + seeded total).
    # Computed against the actual 24h-window state since the session DB is
    # shared. The seeded ratio is n_empty/(n_empty+m_ok) = 8/10 = 0.8, which
    # well exceeds the 0.05 threshold even when diluted by other rows.
    total_total = pre_total + n_empty + m_ok
    total_empties = pre_empties + n_empty
    expected_rate = round(total_empties / total_total, 4)
    assert rates["screen_context_sanitized_to_empty_rate"] == pytest.approx(
        expected_rate, abs=1e-4
    ), (
        f"expected {expected_rate} (pre={pre_empties}/{pre_total} + seed={n_empty}/{n_empty + m_ok}), "
        f"got {rates['screen_context_sanitized_to_empty_rate']}"
    )

    # The detail payload must echo the raw counts so dashboard UI can render them.
    detail = payload["screen_context_sanitization"]
    assert detail["total"] == total_total
    assert detail["sanitized_to_empty"] == total_empties

    # (d) The alert flag must fire when rate exceeds the threshold. The seed
    # contribution alone is 0.8, so unless pre-existing data is overwhelmingly
    # "ok" (impossible at this scale), the combined rate stays above 0.05.
    threshold = ai_metrics.ALERT_THRESHOLDS["screen_context_sanitized_to_empty_rate"]
    assert expected_rate > threshold, (
        f"combined rate {expected_rate} did not exceed threshold {threshold}; "
        f"adjust seed counts so the alert is exercised"
    )
    assert payload["alerts"]["screen_context_sanitized_to_empty_rate"] is True
    assert payload["any_alert"] is True


# ---------------------------------------------------------------------------
# 7. Debug endpoints — auth gate + payload shape
# ---------------------------------------------------------------------------


def test_debug_session_context_returns_metadata_only(client, sample_homework):
    """Regression: the debug context endpoint must NEVER return raw question
    text or screen context — only lengths + presence flags. Otherwise an
    admin route silently leaks every student's session contents."""
    sid = "plan8debugsess001"
    hwid = sample_homework["id"]

    r = client.get(f"/api/ai/debug/session/{sid}/context", params={"hw_id": hwid})
    assert r.status_code == 200, r.text
    body = r.json()
    # Forbid any raw text fields. Only *_chars / *_count and bool flags.
    forbidden_keys = {
        "current_question_text",
        "visible_screen_text",
        "student_work_text",
        "homework_summary",
        "current_phase_content",
    }
    assert forbidden_keys.isdisjoint(body.keys()), (
        f"debug response leaked raw fields: {forbidden_keys & set(body.keys())}"
    )
    assert "homework_summary_chars" in body
    assert "current_question_text_chars" in body


def test_debug_session_context_404_homework(client):
    r = client.get(
        "/api/ai/debug/session/abc/context", params={"hw_id": "missing-hw-xyz"},
    )
    assert r.status_code == 200  # endpoint reports homework_found=False
    assert r.json()["homework_found"] is False


def test_debug_endpoint_blocks_without_token_in_prod(monkeypatch, client):
    """Regression: when neither dev mode nor admin token applies, debug
    endpoints must 403 — never silently return data."""
    from server.routes import ai_plan8

    monkeypatch.setattr(ai_plan8, "_is_dev_environment", lambda: False)
    monkeypatch.setenv("AI_DEBUG_ADMIN_TOKEN", "expected-secret")

    r = client.get(
        "/api/ai/debug/session/abc/context",
        params={"hw_id": "any"},
        headers={"X-Debug-Token": "wrong-token"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "DEBUG_FORBIDDEN"


def test_debug_endpoint_allows_correct_admin_token(monkeypatch, client, sample_homework):
    from server.routes import ai_plan8
    monkeypatch.setattr(ai_plan8, "_is_dev_environment", lambda: False)
    monkeypatch.setenv("AI_DEBUG_ADMIN_TOKEN", "expected-secret")

    r = client.get(
        f"/api/ai/debug/session/abc/context",
        params={"hw_id": sample_homework["id"]},
        headers={"X-Debug-Token": "expected-secret"},
    )
    assert r.status_code == 200


def test_debug_session_events_returns_stored_events(client, sample_homework):
    sid = "plan8eventsess001"
    hwid = sample_homework["id"]
    asyncio.run(session_events_repo.add_session_event(
        sid, hwid, "session_started", {"phase_index": 0},
    ))
    r = client.get(
        f"/api/ai/debug/session/{sid}/events", params={"hw_id": hwid},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["events"][0]["event_type"] == "session_started"


def test_debug_session_ai_calls_filters_by_task_type(client):
    sid = "plan8aicallsess001"
    async def _seed():
        for task in ("tutor_chat", "answer_check"):
            await ai_call_logs_repo.add_ai_call_log(
                call_id=f"plan8_{task}_{uuid.uuid4().hex[:6]}",
                session_id=sid,
                homework_id=None,
                task_type=task,
                provider="kimi",
                model="kimi-k2.6",
                input_chars=10,
                output_chars=20,
                latency_ms=50,
                success=True,
            )
    asyncio.run(_seed())
    r = client.get(
        f"/api/ai/debug/session/{sid}/ai-calls",
        params={"task_type": "tutor_chat"},
    )
    assert r.status_code == 200
    body = r.json()
    assert all(c["task_type"] == "tutor_chat" for c in body["ai_calls"])


def test_debug_boss_endpoint_404_when_unknown(client):
    r = client.get("/api/ai/debug/boss/no-such-boss-id")
    assert r.status_code == 404


def test_debug_boss_endpoint_returns_state_and_questions(client, sample_homework):
    sid = "plan8bosssess001"
    hwid = sample_homework["id"]
    bsid = f"bs_test_{uuid.uuid4().hex[:8]}"

    async def _seed():
        await boss_session_repo.create_boss_session(
            bsid, sid, hwid, weak_topics=["according_to"],
        )
        await boss_repo.create_generated_boss_question(
            question_id=f"gbq_test_{uuid.uuid4().hex[:6]}",
            session_id=sid, hw_id=hwid,
            difficulty="medium",
            topic_tags=["according_to"],
            question_text="What does according to mean?",
            expected_answer={"canonical": "as stated by"},
            rubric={"full_credit": ["as stated by"]},
            source_context={"phase": "boss"},
        )
    asyncio.run(_seed())

    r = client.get(f"/api/ai/debug/boss/{bsid}")
    assert r.status_code == 200
    body = r.json()
    assert body["state"]["id"] == bsid
    assert body["generated_questions_count"] >= 1


# ---------------------------------------------------------------------------
# 8. /ai/eval and /ai/sim endpoints
# ---------------------------------------------------------------------------


def test_eval_run_endpoint_with_stub_response(client):
    r = client.post("/api/ai/eval/run", json={
        "eval_name": "live_tutor_context_questions",
        "stub_response": "according to degani: ga ko'ra",
        "persist": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "report" in body
    assert "gate_threshold" in body
    assert body["report"]["total"] >= 4


def test_eval_run_endpoint_404_unknown_fixture(client):
    r = client.post("/api/ai/eval/run", json={
        "eval_name": "this_fixture_does_not_exist",
    })
    assert r.status_code == 404


def test_sim_list_returns_all_scenarios_with_thresholds(client):
    r = client.get("/api/ai/sim/list")
    assert r.status_code == 200
    body = r.json()
    names = {s["name"] for s in body["simulations"]}
    assert {"student_confused_vocab", "boss_repetition_guard"}.issubset(names)
    for s in body["simulations"]:
        assert "gate_threshold" in s
        assert s["turn_count"] > 0


def test_sim_run_endpoint_returns_gate_pass_decision(client):
    r = client.post("/api/ai/sim/run", json={
        "name": "student_confused_vocab",
        "persist": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report"]["name"] == "student_confused_vocab"
    assert body["gate_threshold"] == 0.95
    assert "gate_passed" in body


def test_regression_dashboard_endpoint_responds(client):
    r = client.get("/api/ai/metrics/regression-dashboard")
    assert r.status_code == 200
    body = r.json()
    assert "rates" in body
    assert "alerts" in body
    assert body["window_hours"] == 24


def test_eval_runs_listing_endpoint(client):
    asyncio.run(eval_runs_repo.create_eval_run(
        eval_name="endpoint_listing_test",
        task_type="tutor_chat",
        total_cases=2, passed_cases=2, failed_cases=0, score=1.0,
    ))
    r = client.get("/api/ai/eval/runs", params={"eval_name": "endpoint_listing_test"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert all(row["eval_name"] == "endpoint_listing_test" for row in body["runs"])


# ---------------------------------------------------------------------------
# 9. Gate threshold lookups
# ---------------------------------------------------------------------------


def test_eval_gate_thresholds_match_plan_doc():
    """Regression: thresholds in code must match Plan 8 §7 table exactly,
    or rollout decisions silently use wrong gates."""
    expected = {
        "live_tutor_context_questions": 0.95,
        "answer_checking_language": 0.90,
        "answer_checking_math": 0.95,
        "boss_generation": 0.90,
        "boss_answer_checking": 0.90,
    }
    for name, want in expected.items():
        assert ai_evaluator.gate_threshold(name) == want, (
            f"threshold for {name} drifted: got {ai_evaluator.gate_threshold(name)}, want {want}"
        )


def test_simulation_gate_thresholds_match_plan_doc():
    expected = {
        "student_confused_vocab": 0.95,
        "student_missing_context": 0.90,
        "student_wrong_answer_then_hint": 0.90,
        "boss_adaptive_weak_topic": 0.90,
        "boss_repetition_guard": 0.95,
        "final_report_accuracy": 0.95,
    }
    for name, want in expected.items():
        assert ai_simulator.simulation_gate_threshold(name) == want


def test_alert_thresholds_match_plan_doc():
    expected = {
        "question_resolution_failure_rate": 0.03,
        "screen_context_sanitized_to_empty_rate": 0.05,
        "generic_fallback_rate": 0.07,
        "boss_repetition_rate": 0.02,
        "provider_failure_rate": 0.01,
        "schema_validation_failure_rate": 0.02,
    }
    for name, want in expected.items():
        assert ai_metrics.ALERT_THRESHOLDS[name] == want
