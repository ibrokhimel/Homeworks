"""Wave J.2 — unit tests for _sanitize_screen_context.

Covers:
 1. Empty input → ""
 2. None input → ""
 3. Plain prose with no answer markers → unchanged (modulo truncation)
 4. Line containing data-correct="true" → that line removed, rest kept
 5. Line with class="gb-aq-answer correct" → removed
 6. Line with data-expected="42" → removed
 7. expected_value="42" passed in → standalone "42" stripped (but "420" stays)
 8. Truncation: 5000-char input → result is exactly 2000 chars
 9. Multiple offending lines mixed with good prose → only bad lines removed

Run:
    python -m pytest tests/test_tutor_screen_context_sanitizer.py -v
"""

from __future__ import annotations

import pytest

from server.services.tutor import _sanitize_screen_context


# ---------------------------------------------------------------------------
# 1. Empty input → ""
# ---------------------------------------------------------------------------


def test_empty_string_returns_empty():
    assert _sanitize_screen_context("") == ""


# ---------------------------------------------------------------------------
# 2. None input → ""
# ---------------------------------------------------------------------------


def test_none_returns_empty():
    assert _sanitize_screen_context(None) == ""


# ---------------------------------------------------------------------------
# 3. Plain prose with no answer markers → unchanged (modulo truncation)
# ---------------------------------------------------------------------------


def test_plain_prose_unchanged():
    prose = "This is a normal sentence about photosynthesis."
    result = _sanitize_screen_context(prose)
    assert result == prose


def test_plain_prose_multiline_unchanged():
    prose = "Line one about algebra.\nLine two about geometry.\nLine three."
    result = _sanitize_screen_context(prose)
    assert result == prose


# ---------------------------------------------------------------------------
# 4. Line containing data-correct="true" → that line removed, rest kept
# ---------------------------------------------------------------------------


def test_data_correct_true_line_removed():
    text = (
        "Some safe content\n"
        '<span data-correct="true">Answer text</span>\n'
        "More safe content"
    )
    result = _sanitize_screen_context(text)
    assert "data-correct" not in result
    assert "Some safe content" in result
    assert "More safe content" in result


def test_data_correct_true_no_quotes_removed():
    """data-correct=true without quotes should also be stripped."""
    text = "good line\n<div data-correct=true>hidden</div>\nstill good"
    result = _sanitize_screen_context(text)
    assert "data-correct" not in result
    assert "good line" in result
    assert "still good" in result


# ---------------------------------------------------------------------------
# 5. Line with class="gb-aq-answer correct" → removed
# ---------------------------------------------------------------------------


def test_class_correct_line_removed():
    text = (
        "Question text shown to student\n"
        '<div class="gb-aq-answer correct">42</div>\n'
        "Explanation text"
    )
    result = _sanitize_screen_context(text)
    assert "correct" not in result or "class=" not in result
    # Safer: check the specific offending line is gone
    assert 'class="gb-aq-answer correct"' not in result
    assert "Question text shown to student" in result
    assert "Explanation text" in result


def test_class_is_correct_line_removed():
    text = (
        "Before\n"
        '<li class="answer is-correct">x = 7</li>\n'
        "After"
    )
    result = _sanitize_screen_context(text)
    assert "is-correct" not in result
    assert "Before" in result
    assert "After" in result


def test_class_answer_key_line_removed():
    text = (
        "Safe line\n"
        '<span class="answer-key">SECRET</span>\n'
        "Another safe line"
    )
    result = _sanitize_screen_context(text)
    assert "answer-key" not in result
    assert "Safe line" in result
    assert "Another safe line" in result


# ---------------------------------------------------------------------------
# 6. Line with data-expected="42" → removed
# ---------------------------------------------------------------------------


def test_data_expected_line_removed():
    text = (
        "Visible question text\n"
        '<input data-expected="42" type="text">\n'
        "Submit button text"
    )
    result = _sanitize_screen_context(text)
    assert "data-expected" not in result
    assert "Visible question text" in result
    assert "Submit button text" in result


def test_data_answer_line_removed():
    """data-answer= attribute should also be stripped."""
    text = (
        "Context line\n"
        '<div data-answer="correct-value">clue</div>\n'
        "Footer line"
    )
    result = _sanitize_screen_context(text)
    assert "data-answer" not in result
    assert "Context line" in result
    assert "Footer line" in result


# ---------------------------------------------------------------------------
# 7. expected_value="42" → standalone "42" stripped, "420" stays
# ---------------------------------------------------------------------------


def test_expected_value_stripped_whole_token():
    text = "The student typed 42 as the answer, not 420."
    result = _sanitize_screen_context(text, expected_value="42")
    # "42" standalone should be gone
    assert "42" not in result or "420" in result  # "420" has "42" as substring
    # More precisely: standalone "42" removed but "420" intact
    # Split on whitespace and check tokens
    tokens = result.split()
    assert "42" not in tokens, f"Standalone '42' still present: {result!r}"
    assert any("420" in t for t in tokens), f"'420' was incorrectly removed: {result!r}"


def test_expected_value_none_no_error():
    """Passing None as expected_value should work without error."""
    text = "Hello 42 world"
    result = _sanitize_screen_context(text, expected_value=None)
    assert "42" in result  # not stripped when expected_value is None


def test_expected_value_empty_string_no_error():
    """Passing empty string as expected_value should not strip anything."""
    text = "Hello world"
    result = _sanitize_screen_context(text, expected_value="")
    assert result == "Hello world"


# ---------------------------------------------------------------------------
# 8. Truncation: 5000-char input → result is exactly 2000 chars
# ---------------------------------------------------------------------------


def test_truncation_5000_chars():
    text = "A" * 5000
    result = _sanitize_screen_context(text)
    assert len(result) == 2000


def test_truncation_at_2000_boundary():
    text = "B" * 2000
    result = _sanitize_screen_context(text)
    assert len(result) == 2000


def test_no_truncation_under_limit():
    text = "C" * 100
    result = _sanitize_screen_context(text)
    assert len(result) == 100


# ---------------------------------------------------------------------------
# 9. Multiple offending lines mixed with good prose → only bad lines removed
# ---------------------------------------------------------------------------


def test_mixed_offending_and_safe_lines():
    text = (
        "First good line\n"
        '<div data-correct="true">Answer A</div>\n'
        "Second good line\n"
        '<span class="is-correct">Answer B</span>\n'
        "Third good line\n"
        '<input data-expected="99">\n'
        "Fourth good line"
    )
    result = _sanitize_screen_context(text)

    # Offending lines are gone
    assert "data-correct" not in result
    assert "is-correct" not in result
    assert "data-expected" not in result

    # Good lines remain
    assert "First good line" in result
    assert "Second good line" in result
    assert "Third good line" in result
    assert "Fourth good line" in result
