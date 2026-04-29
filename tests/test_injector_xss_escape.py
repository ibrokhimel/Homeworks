"""
Regression guard: stored XSS via homework title.

A homework title containing the literal substring "</script>" must
NOT close the inline <script> tag when the runtime template is
rendered. The fix is to escape "</" -> "<\\/" in the json.dumps output
that goes into the script context.

Caught 2026-04-29 via Sigma's audit during PR #53 review.
"""
import re

from server.services.injector import inject

# Minimum valid content_json — injector has fallbacks for all keys so this
# is sufficient to produce a fully-rendered HTML page.
_MINIMAL_CONTENT = {
    "meta": {
        "title": "Algebra",
        "subject_display": "Algebra",
    },
    "panels": [],
    "flashcards": [],
    "boss_questions": [],
    "memory_sprint": [],
}

_RUNTIME_CTX_XSS = {
    "apiBase": "",
    "subject": "math-algebra",
    "grade": 8,
    "homeworkTitle": "</script><script>alert('XSS')</script>",
    "homeworkSummary": "",
    "hwId": "HW-XSS-TEST",
    "lang": "uz",
}


def test_homework_title_with_script_close_does_not_break_html():
    """A title containing '</script>' must be escaped so the inline
    script tag isn't prematurely closed by the HTML tokenizer."""
    rendered = inject(
        _MINIMAL_CONTENT,
        meta_override={"title": "</script><script>alert('XSS')</script>"},
        runtime_context=_RUNTIME_CTX_XSS,
    )

    # Locate the NETS_CTX assignment block produced by the injector.
    nets_ctx_blocks = re.findall(
        r'window\.NETS_CTX\s*=\s*([^;]+);',
        rendered,
    )
    assert nets_ctx_blocks, "NETS_CTX assignment not found in rendered HTML"

    for block in nets_ctx_blocks:
        # The bare </script> sequence must not appear in the JSON literal.
        # The escaped <\/script> form is fine.
        assert "</script>" not in block, (
            f"NETS_CTX JSON literal contains unescaped </script> — "
            f"this enables stored XSS via homework title. "
            f"Block was: {block[:200]}..."
        )

    # Sanity: the escaped form must actually be present in the rendered HTML,
    # confirming the fix ran rather than the field simply being absent.
    assert "<\\/script>" in rendered or "<\\u002fscript>" in rendered, (
        "Expected escaped form of </script> in rendered HTML — "
        "the XSS escape may not have been applied."
    )


def test_xss_escape_applied_to_runtime_context_field():
    """Directly verify that the JSON emitted for NETS_CTX never contains the
    bare </script> sequence, regardless of which field carries the payload."""
    payload_ctx = {
        "apiBase": "",
        "subject": "math-algebra",
        "grade": 8,
        "homeworkTitle": "Safe title",
        "homeworkSummary": "</script><img src=x onerror=alert(2)>",
        "hwId": "HW-XSS-TEST-2",
        "lang": "uz",
    }

    rendered = inject(_MINIMAL_CONTENT, runtime_context=payload_ctx)

    # Find the raw JSON blob between window.NETS_CTX = ... ;
    match = re.search(r'window\.NETS_CTX\s*=\s*(\{.*?\});', rendered, re.DOTALL)
    assert match, "NETS_CTX block not found"
    json_blob = match.group(1)

    assert "</script>" not in json_blob, (
        "Unescaped </script> found in NETS_CTX JSON — XSS escape not applied."
    )


def test_other_dangerous_substrings_also_escaped_optional():
    """Non-blocking: verify the fix doesn't break a normal homework title
    (i.e., no unintended mutation of safe content)."""
    safe_ctx = {
        "apiBase": "",
        "subject": "math-algebra",
        "grade": 8,
        "homeworkTitle": "Quadratic Equations — Chapter 3",
        "homeworkSummary": "Solve using the quadratic formula.",
        "hwId": "HW-SAFE-001",
        "lang": "uz",
    }

    rendered = inject(_MINIMAL_CONTENT, runtime_context=safe_ctx)

    assert "window.NETS_CTX" in rendered
    assert "Quadratic Equations" in rendered
