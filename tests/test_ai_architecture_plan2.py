import pytest
from server.services.ai_context import (
    extract_phase_content, 
    summarize_homework_content, 
    _find_question_in_content, 
    _redact_question_for_tutor
)

def test_extract_phase_content():
    content_json = {
        "preview": {"text": "Hello preview"},
        "final-boss": {"state": "ready"}
    }
    # Test preview subphase
    res = extract_phase_content(content_json, "preview")
    assert "preview_data" in res
    assert res["preview_data"] == {"text": "Hello preview"}

    # Test unknown subphase fallback
    res = extract_phase_content(content_json, "unknown-phase")
    assert "raw_subphase" in res
    assert res["raw_subphase"] == {}

def test_summarize_homework_content():
    content_json = {
        "title": "Algebra Basics",
        "subject": "Math",
        "grade": 8,
        "summary": "Intro to algebra.",
        "practice": {},
        "final-boss": {}
    }
    summary = summarize_homework_content(content_json)
    assert summary["title"] == "Algebra Basics"
    assert summary["grade"] == 8
    assert "practice" in summary["phases_available"]
    assert "final-boss" in summary["phases_available"]

def test_ai_context_stubs_raise_not_implemented():
    with pytest.raises(NotImplementedError, match="Question search within content JSON is not yet implemented."):
        _find_question_in_content({}, "q1")

    with pytest.raises(NotImplementedError, match="Question redaction for tutor context is not yet implemented."):
        _redact_question_for_tutor({"text": "What is 2+2?", "expected_answer": "4"})
