import json

from server.services.injector import inject


def _decode_const(rendered: str, const_name: str):
    marker = f"const {const_name} = "
    start = rendered.index(marker) + len(marker)
    value, end = json.JSONDecoder().raw_decode(rendered[start:])
    assert rendered[start + end] == ";"
    return value


def test_injector_preserves_js_constants_when_content_contains_brace_semicolon():
    tricky = "Student text can mention code like if (x) {}; and still render."
    rendered = inject(
        {
            "meta": {"title": "Brace semicolon", "subject_display": "Math"},
            "panels": [{"id": 1, "title": tricky, "pages": []}],
            "flashcards": [],
            "memory_sprint": [],
            "reading": {
                "title": tricky,
                "passage": tricky,
                "checkpoints": [{"prompt": tricky, "ans": "hidden", "fb": tricky}],
            },
            "consolidation": {
                "title": tricky,
                "mnemonic": tricky,
                "bullets": [tricky],
                "check_prompt": tricky,
                "check_answer": "hidden",
            },
            "reflection": {
                "summary": tricky,
                "question": tricky,
                "spaced_rep": tricky,
                "closing": tricky,
            },
            "real_life": {
                "title": tricky,
                "story": tricky,
                "questions": [{"prompt": tricky}],
                "closure": {"title": tricky, "message": tricky},
            },
            "boss_questions": [{"id": "b1", "prompt": tricky, "acceptable": ["hidden"], "hints": [tricky]}],
        },
        runtime_context={
            "apiBase": "",
            "subject": "math-algebra",
            "grade": 8,
            "homeworkTitle": "Brace semicolon",
            "homeworkSummary": "",
            "hwId": "HW-BRACE-SEMICOLON",
            "lang": "uz",
        },
    )

    assert _decode_const(rendered, "READING")["title"] == tricky
    assert _decode_const(rendered, "CONSOLIDATION")["mnemonic"] == tricky
    assert _decode_const(rendered, "REFLECTION")["summary"] == tricky
    assert _decode_const(rendered, "RL_SCENARIO")["story"] == tricky
    assert _decode_const(rendered, "BOSS_QUESTIONS")[0]["prompt"] == tricky
    assert "const stage6State" in rendered
