from typing import Optional, Any
from pydantic import BaseModel
from fastapi import HTTPException
from .. import db

class ResolvedAnswerTarget(BaseModel):
    session_id: str
    homework_id: str
    phase: Optional[str]
    subphase: Optional[str]
    phase_index: Optional[int]
    question_id: Optional[str]
    answer_type: str
    question_text: str
    expected_answers: list[str]
    rubric: dict[str, Any]
    trusted_source_path: str
    answer_spec: Optional[dict[str, Any]] = None


def _trusted_question_text(item: dict[str, Any]) -> str:
    for key in ("text", "q", "prompt", "question"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


async def resolve_runtime_answer(request: Any) -> ResolvedAnswerTarget:
    hw = await db.get_homework(request.homework_id)
    if hw is None:
        raise HTTPException(status_code=404, detail={
            "error_code": "HW_NOT_FOUND",
            "message": f"homework {request.homework_id} not found"
        })
    
    content = hw.get("content_json") or {}
    phase_name = request.phase or "practice"
    phase_data = content.get(phase_name, {})
    
    question_text = ""
    expected_answers = []
    rubric = {}
    trusted_source_path = ""
    answer_spec = None
    
    if not request.question_id:
        raise HTTPException(status_code=400, detail={
            "ok": False,
            "error_code": "MISSING_QUESTION_ID",
            "missing_context_flags": ["missing_question_id"],
            "message": "runtime answer grading requires a server-resolved question_id."
        })

    # Search for the question in the phase data.
    items = phase_data.get("items", []) if isinstance(phase_data, dict) else []
    for i, item in enumerate(items):
        if item.get("id") == request.question_id:
            question_text = _trusted_question_text(item)
            expected_answers = item.get("expected_answers", [])
            rubric = item.get("rubric", {})
            answer_spec = item.get("answer_spec", None)
            trusted_source_path = f"content_json.{phase_name}.items[{i}]"
            break
    else:
        raise HTTPException(status_code=404, detail={
            "ok": False,
            "error_code": "QUESTION_NOT_RESOLVED",
            "message": f"Could not resolve question_id {request.question_id} inside homework {request.homework_id} phase {phase_name}."
        })

    missing_context_flags = []
    if not question_text:
        missing_context_flags.append("empty_question_text")
    if not trusted_source_path:
        missing_context_flags.append("missing_trusted_source_path")
    if not (answer_spec or expected_answers or rubric):
        missing_context_flags.append("missing_answer_material")
    if missing_context_flags:
        raise HTTPException(status_code=422, detail={
            "ok": False,
            "error_code": "ANSWER_TARGET_NOT_GRADABLE",
            "missing_context_flags": missing_context_flags,
            "message": "runtime answer grading requires trusted question text and answer material."
        })
            
    return ResolvedAnswerTarget(
        session_id=request.session_id,
        homework_id=request.homework_id,
        phase=request.phase,
        subphase=getattr(request, "subphase", None),
        phase_index=request.phase_index,
        question_id=request.question_id,
        answer_type=request.answer_type or "text",
        question_text=question_text,
        expected_answers=expected_answers,
        rubric=rubric,
        trusted_source_path=trusted_source_path,
        answer_spec=answer_spec
    )
