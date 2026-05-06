"""PR 1 — AI grading bloat fix regression tests.

Guards: pre-fix, boss_turn handed the entire `boss_question` text (including
embedded `<img src="data:image/png;base64,...">` blobs) directly into the LLM
prompt via `json.dumps(payload)`. The 1.5MB payload blew past every provider's
input cap → HTTP 500 silent-fail → "always wrong" UX (verified empirically on
HW-20260429-019).

Each test asserts the BAD pre-fix state cannot return:
- inline base64 / svg / data: URLs leak into the prompt
- `boss_turn` raises instead of returning a verdict when the LLM is unhappy
"""
from __future__ import annotations

import pytest

from server.services import ai_orchestrator
from server.services.ai_orchestrator import (
    PromptTooLargeError,
    _sanitize_payload,
    _strip_inline_media,
    build_input_section,
)


# ── Sanitizer unit tests ──────────────────────────────────────────────────────


def test_strip_img_data_url_tag():
    text = (
        'Real prose <img src="data:image/png;base64,iVBORw0KGgoAAAA===" '
        'alt="diagram" /> more prose'
    )
    cleaned = _strip_inline_media(text)
    assert "data:" not in cleaned
    assert "iVBORw" not in cleaned
    assert "Real prose" in cleaned
    assert "more prose" in cleaned
    assert "[media]" in cleaned  # placeholder preserves structure


def test_strip_svg_block():
    text = 'Before <svg viewBox="0 0 10 10"><rect fill="red"/></svg> after'
    cleaned = _strip_inline_media(text)
    assert "<svg" not in cleaned
    assert "<rect" not in cleaned
    assert "Before" in cleaned and "after" in cleaned


def test_strip_bare_data_url():
    text = "see this data:image/jpeg;base64,/9j/4AAQSkZJRg== there"
    cleaned = _strip_inline_media(text)
    assert "data:image" not in cleaned
    assert "/9j/" not in cleaned
    assert "see this" in cleaned and "there" in cleaned


def test_sanitize_payload_recurses_into_dicts_and_lists():
    payload = {
        "q": 'top <img src="data:image/png;base64,XXX">',
        "items": [
            {"text": '<svg></svg> nested'},
            "raw data:image/png;base64,YYY here",
        ],
    }
    cleaned = _sanitize_payload(payload)
    assert "data:" not in cleaned["q"]
    assert "<svg" not in cleaned["items"][0]["text"]
    assert "data:" not in cleaned["items"][1]


def test_sanitize_payload_caps_per_field():
    big = "x" * 10000
    cleaned = _sanitize_payload({"q": big}, max_per_field=5000)
    assert len(cleaned["q"]) <= 5100  # 5000 + truncation note
    assert "[truncated" in cleaned["q"]


def test_sanitize_payload_passes_through_non_strings():
    cleaned = _sanitize_payload(
        {"n": 42, "b": True, "none": None, "lst": [1, 2.5, False]}
    )
    assert cleaned == {"n": 42, "b": True, "none": None, "lst": [1, 2.5, False]}


# ── build_input_section ───────────────────────────────────────────────────────


def test_build_input_section_serializes_normal_payload():
    out = build_input_section({"q": "How tall is the giraffe?", "ans": "5m"})
    assert out.startswith("---\n\nINPUT:\n")
    assert "giraffe" in out
    assert "5m" in out


def test_build_input_section_strips_bloat_before_serializing():
    """Regression: ~100KB of base64 in a `q` field never reaches json.dumps."""
    bloated_q = 'Real q <img src="data:image/png;base64,' + ("A" * 100000) + '">'
    out = build_input_section({"q": bloated_q})  # default cap 50000
    assert "data:" not in out
    assert "AAAAAA" not in out
    assert "Real q" in out
    assert "[media]" in out
    assert len(out) < 50000


def test_build_input_section_raises_on_oversized():
    """Cap covers a worst case where sanitization can't strip enough."""
    payload = {"items": ["x" * 9000] * 200}  # 1.8M chars worth, none strippable
    with pytest.raises(PromptTooLargeError) as excinfo:
        build_input_section(payload, max_chars=10000)
    assert excinfo.value.size > excinfo.value.cap


def test_prompt_too_large_error_carries_size_and_cap():
    err = PromptTooLargeError(size=1_500_000, cap=50_000)
    assert err.size == 1_500_000
    assert err.cap == 50_000
    msg = str(err)
    assert "1,500,000" in msg
    assert "50,000" in msg


# ── boss_turn synthetic fallback ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_boss_turn_synthetic_on_prompt_too_large(monkeypatch):
    """Regression: when build_input_section raises PromptTooLargeError, boss_turn
    must return a synthetic dict using server-computed was_correct, NOT bubble
    the exception up as a 500."""
    from server.services import tutor

    async def _never_called(*args, **kwargs):  # pragma: no cover
        pytest.fail("LLM should NOT be called when payload is too large")

    monkeypatch.setattr(ai_orchestrator, "generate_json", _never_called)

    def _too_big(payload, max_chars=50000):
        raise PromptTooLargeError(size=2_000_000, cap=max_chars)

    monkeypatch.setattr(ai_orchestrator, "build_input_section", _too_big)

    result = await tutor.boss_turn(
        boss_question="What is 2+2? " + "x" * 100,  # answer literal text doesn't matter; helper raises
        student_answer="4",
        expected_answers=["4"],
        damage_value=10,
        hp_remaining=100,
        attempt_number=1,
        subject="math-algebra",
        grade=8,
    )

    assert result["correct"] is True
    assert result["damage_dealt"] == 10
    assert result["ai_unavailable"] is True
    assert "score" in result
    assert "axis_1" in result and "axis_2" in result
    assert "boss_response" in result and result["boss_response"]


@pytest.mark.asyncio
async def test_boss_turn_synthetic_when_llm_raises_runtime_error(monkeypatch):
    """Regression: when the LLM provider raises (e.g. Kimi 503 / cascade fail),
    boss_turn must still return the server-computed verdict + a polite message."""
    from server.services import tutor

    async def _provider_dead(*args, **kwargs):
        raise RuntimeError("All AI providers failed (tried: kimi)")

    monkeypatch.setattr(ai_orchestrator, "generate_json", _provider_dead)

    # Wrong answer — fallback must report correct=False, damage=0
    result = await tutor.boss_turn(
        boss_question="What is the capital of Uzbekistan?",
        student_answer="Bishkek",
        expected_answers=["Tashkent", "Toshkent"],
        damage_value=20,
        hp_remaining=80,
        attempt_number=2,
        subject="history",
        grade=7,
    )

    assert result["correct"] is False
    assert result["damage_dealt"] == 0
    assert result["ai_unavailable"] is True
    assert result["axis_1_label"] == "Novice"
