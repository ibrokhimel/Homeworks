import pytest

from server.schemas.ai_contracts import FinalReportResult
from server.services import ai_gateway


@pytest.mark.asyncio
async def test_final_report_service_uses_gateway_and_stores_metadata_only(monkeypatch):
    from server.services import final_report

    async def mock_get_homework(hw_id):
        return {
            "id": hw_id,
            "title": "Fractions",
            "subject": "math",
            "grade": 6,
            "family": "aniq-fanlar",
        }

    async def mock_get_session(session_id):
        return {"id": session_id, "homework_id": "hw_final"}

    async def mock_list_attempts(session_id, hw_id, limit=1000):
        return [
            {
                "phase": "practice",
                "question_id": "q1",
                "student_answer": "SECRET_RAW_STUDENT_ANSWER",
                "normalized_answer": "SECRET_NORMALIZED_ANSWER",
                "checker_source": "ai_judge",
                "correct": 0,
                "score": 0.25,
                "confidence": 0.9,
                "misconception_tags_json": '["fractions"]',
            }
        ]

    async def mock_get_metrics(session_id, hw_id):
        return {"mastery_score": 0.42, "weak_topics": ["fractions"], "strong_topics": []}

    async def mock_get_boss(session_id, hw_id):
        return {"status": "complete", "hp": 30, "trials_left": 0, "weak_topics": ["fractions"], "strong_topics": []}

    stored = {}
    gateway_calls = []

    async def mock_generate_structured(*args, **kwargs):
        gateway_calls.append(kwargs)
        prompt = kwargs["prompt"]
        assert "SECRET_RAW_STUDENT_ANSWER" not in prompt
        assert "SECRET_NORMALIZED_ANSWER" not in prompt
        return FinalReportResult(
            summary="Needs more fraction practice.",
            weak_topics=["fractions"],
            strong_topics=[],
            recommendation="Review equivalent fractions.",
            mastery_score=0.42,
        )

    async def mock_store(session_id, hw_id, report):
        stored["session_id"] = session_id
        stored["hw_id"] = hw_id
        stored["report"] = report

    monkeypatch.setattr("server.services.final_report.db.get_homework", mock_get_homework)
    monkeypatch.setattr("server.services.final_report.session_repo.get_session", mock_get_session)
    monkeypatch.setattr("server.services.final_report.attempts_repo.list_phase_attempts", mock_list_attempts)
    monkeypatch.setattr("server.services.final_report.session_metrics_repo.get_session_metrics", mock_get_metrics)
    monkeypatch.setattr("server.services.final_report.boss_session_repo.get_active_boss_session_for", mock_get_boss)
    monkeypatch.setattr("server.services.final_report.ai_gateway.generate_structured", mock_generate_structured)
    monkeypatch.setattr("server.services.final_report.final_report_repo.upsert_final_report", mock_store)

    result = await final_report.generate_final_report("sess_final", "hw_final")

    assert result["ok"] is True
    assert result["report"]["summary"] == "Needs more fraction practice."
    assert result["attempts_count"] == 1
    assert gateway_calls[0]["task"] == ai_gateway.AITask.FINAL_REPORT
    assert gateway_calls[0]["schema"] is FinalReportResult
    assert gateway_calls[0]["session_id"] == "sess_final"
    assert gateway_calls[0]["homework_id"] == "hw_final"
    assert stored["session_id"] == "sess_final"
    assert stored["hw_id"] == "hw_final"
    assert stored["report"]["report"]["mastery_score"] == 0.42


def test_final_report_route_accepts_homework_id_alias(client, monkeypatch):
    async def mock_generate_final_report(session_id, hw_id):
        return {
            "ok": True,
            "session_id": session_id,
            "hw_id": hw_id,
            "report": {
                "summary": "Done",
                "weak_topics": [],
                "strong_topics": ["algebra"],
                "recommendation": "Keep practicing.",
                "mastery_score": 0.9,
            },
        }

    monkeypatch.setattr(
        "server.routes.ai_plan8.final_report.generate_final_report",
        mock_generate_final_report,
    )

    resp = client.post(
        "/api/ai/session/final-report",
        json={"session_id": "sess_final", "homework_id": "hw_final"},
    )

    assert resp.status_code == 200
    assert resp.json()["hw_id"] == "hw_final"
