import logging
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

from server.db.homework_repo import get_homework
from server.db.session_repo import get_session
from server.db.attempts_repo import list_phase_attempts
from server.db.session_metrics_repo import get_session_metrics
from server.db.tutor_repo import list_tutor_turns

logger = logging.getLogger(__name__)

@dataclass
class TutorContextPacket:
    session_id: str
    hw_id: str
    phase: str
    subphase: Optional[str]
    current_question_id: Optional[str]
    subject: str
    grade: int
    homework_title: str
    homework_summary: str
    current_phase_content: Dict[str, Any]
    current_question_text: str
    current_question_context: Dict[str, Any]
    visible_screen_text: str
    student_work_text: str
    recent_chat_history: List[Dict[str, Any]]
    recent_attempts: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    warnings_summary: str
    missing_context_flags: List[str]


def extract_phase_content(content_json: dict, subphase: Optional[str]) -> dict:
    """
    Extract a relevant subset of phase content to reduce AI context size.
    """
    if not subphase:
        return {}

    extracted = {}
    
    # Basic logic for the slices shown in the table
    if subphase == 'preview':
        # Include current panel/page text, related title, lesson goals
        extracted['preview_data'] = content_json.get('preview', {})
    elif subphase == 'memory-sprint':
        # Include current flashcard/question stem/options without answer
        # TODO(deferred): Strip hidden answers deeply
        extracted['memory_sprint_data'] = content_json.get('memory-sprint', {})
    elif subphase == 'sentence-fill':
        # Include current sentence/passages, blank index, visible choices without answer
        # TODO(deferred): Strip expected answers deeply
        extracted['sentence_fill_data'] = content_json.get('sentence-fill', {})
    elif subphase == 'tile-match':
        # Include visible left/right tiles without matched answer key
        extracted['tile_match_data'] = content_json.get('tile-match', {})
    elif subphase == 'real-life-challenge':
        # Include current scenario step, prompt, visible options
        extracted['real_life_challenge_data'] = content_json.get('real-life-challenge', {})
    elif subphase == 'final-boss':
        # Include boss state, generated/current question, no hidden expected answer
        extracted['final_boss_data'] = content_json.get('final-boss', {})
    elif subphase == 'reflection':
        # Include session summary and performance metrics
        extracted['reflection_data'] = content_json.get('reflection', {})
    else:
        # Fallback for unknown subphases
        extracted['raw_subphase'] = content_json.get(subphase, {})

    return extracted


def summarize_homework_content(content_json: dict) -> dict:
    """
    Summarize the full homework content_json.
    """
    return {
        "title": content_json.get("title", ""),
        "subject": content_json.get("subject", ""),
        "grade": content_json.get("grade", 0),
        "summary": content_json.get("summary", ""),
        "phases_available": list(content_json.keys())
    }


def _find_question_in_content(content_json: dict, question_id: str) -> dict:
    """
    Locate a question within the content JSON by ID.
    """
    # TODO(deferred): Implement actual recursive search or lookup map
    raise NotImplementedError("Question search within content JSON is not yet implemented.")


def _redact_question_for_tutor(question: dict) -> dict:
    """
    Build safe question context.
    """
    # TODO(deferred): Remove expected answers/rubrics thoroughly
    raise NotImplementedError("Question redaction for tutor context is not yet implemented.")


async def build_tutor_context(
    *,
    session_id: str,
    hw_id: str,
    phase: Optional[str],
    subphase: Optional[str],
    question_id: Optional[str],
    screen_context: Optional[str],
    student_work_text: Optional[str]
) -> TutorContextPacket:
    
    missing_flags = []
    
    # 1. Validate session_id
    if not session_id:
        missing_flags.append("missing_session")
        
    # 2. Load homework by hw_id
    hw = await get_homework(hw_id) if hw_id else None
    if not hw:
        missing_flags.append("missing_hw")
        
    # 3. Load session row
    session_row = await get_session(session_id) if session_id else {}
    if not session_row:
        session_row = {}

    # 4. Determine phase
    resolved_phase = phase or session_row.get("current_phase") or "preview"
    if not resolved_phase:
        # According to standard fallback this won't hit since it falls back to 'preview',
        # but leaving check for safety in case 'preview' is cleared.
        missing_flags.append("missing_phase")
        
    resolved_subphase = subphase or session_row.get("current_subphase")

    # 5. Determine question ID
    resolved_question_id = question_id or session_row.get("current_question_id")
    if not resolved_question_id:
        missing_flags.append("missing_question_id")
        
    # 6. Find question inside content_json
    content_json = hw.get("content_json", {}) if hw else {}
    raw_question = {}
    if resolved_question_id:
        raw_question = _find_question_in_content(content_json, resolved_question_id)
        if not raw_question:
            missing_flags.append("question_not_found")
            
    # 7. Build safe question context
    safe_question = _redact_question_for_tutor(raw_question) if raw_question else {}
    question_text = safe_question.get("text", "")
    
    # 8. Clean screen context
    clean_screen = (screen_context or "").strip()
    if not clean_screen:
        missing_flags.append("empty_screen_context")
        
    clean_student_work = (student_work_text or "").strip()
    if not clean_student_work:
        missing_flags.append("empty_student_work")
        
    # 9. Attach recent attempts and metrics
    recent_attempts = []
    if session_id and hw_id:
        recent_attempts = await list_phase_attempts(session_id, hw_id, resolved_phase)
    
    metrics = {}
    if session_id and hw_id:
        metrics = await get_session_metrics(session_id, hw_id) or {}
        
    if not metrics:
        missing_flags.append("empty_metrics")
        
    # Load recent chat history
    recent_chat_history = []
    if session_id and hw_id:
        recent_chat_history = await list_tutor_turns(session_id, hw_id, limit=5, most_recent=True)
        
    # Slice the current phase content
    current_phase_content = extract_phase_content(content_json, resolved_subphase)
    
    # 10. Return typed packet
    return TutorContextPacket(
        session_id=session_id or "",
        hw_id=hw_id,
        phase=resolved_phase,
        subphase=resolved_subphase,
        current_question_id=resolved_question_id,
        subject=content_json.get("subject", "Unknown"),
        grade=content_json.get("grade", 0),
        homework_title=content_json.get("title", "Unknown"),
        homework_summary=content_json.get("summary", ""),
        current_phase_content=current_phase_content,
        current_question_text=question_text,
        current_question_context=safe_question,
        visible_screen_text=clean_screen,
        student_work_text=clean_student_work,
        recent_chat_history=recent_chat_history,
        recent_attempts=recent_attempts,
        metrics=metrics,
        warnings_summary="", # TODO(deferred): generate from tutor_warnings
        missing_context_flags=missing_flags
    )
