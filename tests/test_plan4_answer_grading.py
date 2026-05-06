import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from server.services.runtime_answer_resolver import resolve_runtime_answer, ResolvedAnswerTarget

class DummyRequest(BaseModel):
    session_id: str
    homework_id: str
    phase: str
    phase_index: int = 1
    question_id: str
    answer_type: str = "text"
    student_answer: str = "test"
    student_work_text: str = ""
    attempt_number: int = 1

@pytest.mark.asyncio
async def test_resolve_runtime_answer_hw_not_found(monkeypatch):
    async def mock_get_homework(hw_id): return None
    monkeypatch.setattr("server.db.get_homework", mock_get_homework)
    
    req = DummyRequest(session_id="sess1", homework_id="hw99", phase="practice", question_id="q1")
    
    with pytest.raises(HTTPException) as excinfo:
        await resolve_runtime_answer(req)
    
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail["error_code"] == "HW_NOT_FOUND"

@pytest.mark.asyncio
async def test_resolve_runtime_answer_question_not_found(monkeypatch):
    async def mock_get_homework(hw_id): 
        return {"content_json": {"practice": {"items": []}}}
    monkeypatch.setattr("server.db.get_homework", mock_get_homework)
    
    req = DummyRequest(session_id="sess1", homework_id="hw1", phase="practice", question_id="q1")
    
    with pytest.raises(HTTPException) as excinfo:
        await resolve_runtime_answer(req)
        
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail["error_code"] == "QUESTION_NOT_RESOLVED"

@pytest.mark.asyncio
async def test_resolve_runtime_answer_success(monkeypatch):
    async def mock_get_homework(hw_id):
        return {
            "content_json": {
                "practice": {
                    "items": [
                        {
                            "id": "q1", 
                            "text": "What is 2+2?", 
                            "expected_answers": ["4"], 
                            "rubric": {"detail": "basic"}
                        }
                    ]
                }
            }
        }
    monkeypatch.setattr("server.db.get_homework", mock_get_homework)
    
    req = DummyRequest(session_id="sess1", homework_id="hw1", phase="practice", question_id="q1")
    
    target = await resolve_runtime_answer(req)
    assert isinstance(target, ResolvedAnswerTarget)
    assert target.question_text == "What is 2+2?"
    assert target.expected_answers == ["4"]
    assert target.trusted_source_path == "content_json.practice.items[0]"

@pytest.mark.asyncio
async def test_process_runtime_answer_deterministic_correct(monkeypatch):
    from server.services.tutor import process_runtime_answer
    
    # Mock db add_phase_attempt to do nothing
    async def mock_add(*args, **kwargs): pass
    monkeypatch.setattr("server.db.attempts_repo.add_phase_attempt", mock_add)
    monkeypatch.setattr("server.services.tutor._validate_session_id", lambda x: x)
    
    target = {
        "session_id": "sess1",
        "answer_spec": {"type": "text_exact", "expected": "4"},
        "expected_answers": ["4"],
    }
    
    res = await process_runtime_answer(target, "4")
    assert res["ok"] is True
    assert res["grading_method"] == "deterministic"
    assert res["is_correct"] is True
    assert res["score"] == 1.0

@pytest.mark.asyncio
async def test_process_runtime_answer_ai_judge_tiers(monkeypatch):
    from server.services.tutor import process_runtime_answer
    
    async def mock_add(*args, **kwargs): pass
    monkeypatch.setattr("server.db.attempts_repo.add_phase_attempt", mock_add)
    monkeypatch.setattr("server.services.tutor._validate_session_id", lambda x: x)
    
    # Force fallback to AI Judge
    target = {
        "session_id": "sess1",
        "answer_spec": {"type": "semantic"}, # Will fail deterministic
        "answer_type": "text",
        "phase": "practice"
    }

    # Helper to mock orchestrator returning specific confidence
    async def run_tier(score, confidence):
        async def mock_generate(*args, **kwargs):
            return {"score": score, "confidence": confidence, "feedback": "test"}
        monkeypatch.setattr("server.services.ai_orchestrator.generate_json", mock_generate)
        return await process_runtime_answer(target, "test")

    # >= 0.90 confidence
    res = await run_tier(0.95, 0.95)
    assert res["confidence"] == 0.95
    assert res["is_correct"] is True
    assert res["requires_review"] is False

    # 0.75 - 0.89 confidence
    res = await run_tier(0.85, 0.80)
    assert res["confidence"] == 0.80
    assert res["is_correct"] is True
    assert res["requires_review"] is False
    assert "medium_confidence" in res["misconception_tags"]

    # 0.60 - 0.74 confidence
    res = await run_tier(0.80, 0.65)
    assert res["confidence"] == 0.65
    assert res["is_correct"] is False
    assert res["requires_review"] is False

    # < 0.60 confidence
    res = await run_tier(0.50, 0.50)
    assert res["confidence"] == 0.50
    assert res["is_correct"] is False
    assert res["requires_review"] is True
    assert res["score"] == 0.0

def test_prompt_file_shapes():
    import os
    prompts = [
        "server/prompts/runtime/answer-checker-language.md",
        "server/prompts/runtime/answer-checker-math.md",
        "server/prompts/runtime/answer-checker-boss.md"
    ]
    for p in prompts:
        path = os.path.join(os.path.dirname(__file__), "..", p)
        assert os.path.exists(path), f"Prompt file missing: {p}"
        with open(path, "rb") as f:
            raw = f.read()
            
        assert not raw.startswith(b"\xef\xbb\xbf"), f"{p} has BOM"
        assert b"\r\n" not in raw, f"{p} has CRLF line endings"
        assert b"\x0c" not in raw, f"{p} has form-feed control char"
