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


def test_line_separators_escaped():
    """U+2028 / U+2029 are valid in JSON but terminate JS string
    literals — they must be escaped as \\u2028 / \\u2029. Pins down
    the additional protection PR #55's _safe_js_json adds beyond
    the minimal </script> fix."""
    from server.services.injector import _safe_js_json

    payload = {"homeworkTitle": "before   middle   after"}
    out = _safe_js_json(payload)

    # The literal U+2028/U+2029 must NOT appear in the output —
    # the HTML-then-JS parsing chain would terminate the string early.
    assert " " not in out, (
        "Raw U+2028 in output — would terminate JS string literal"
    )
    assert " " not in out, (
        "Raw U+2029 in output — would terminate JS string literal"
    )
    # The escaped form must be present:
    assert "\\u2028" in out, "Expected escaped \\u2028 in output"
    assert "\\u2029" in out, "Expected escaped \\u2029 in output"

    # Sanity: round-trip through json.loads should restore the original
    import json
    restored = json.loads(out)
    assert restored["homeworkTitle"] == "before   middle   after"


def test_all_inline_json_call_sites_use_safe_helper():
    """Meta-lint: every json.dumps() call in injector.py must either
    flow through _safe_js_json (the safe path for inline <script>
    contexts) OR carry an inline comment justifying the bypass.

    Regression rule per the new server workflow: this is the guard
    that would have caught the original injector.py:779 issue before
    PR #55 needed to fix it, AND will catch any future contributor
    adding a raw json.dumps in a script-embedding context."""
    from pathlib import Path
    import re

    src = Path("server/services/injector.py").read_text(encoding="utf-8")
    lines = src.splitlines()

    # Find every line that has a bare json.dumps call (not inside a
    # def of _safe_js_json itself).
    inside_safe_helper = False
    bad = []
    for i, line in enumerate(lines, 1):
        # Track whether we're inside the _safe_js_json definition
        if line.lstrip().startswith("def _safe_js_json"):
            inside_safe_helper = True
            continue
        if inside_safe_helper:
            # Heuristic: helper ends at the next top-level def or blank-then-non-indented line
            if line and not line.startswith((" ", "\t")) and not line.startswith("def _safe_js_json"):
                inside_safe_helper = False
            else:
                continue

        # Find unwrapped json.dumps calls
        if re.search(r"\bjson\.dumps\b", line):
            # Allow if there's an inline comment explaining the bypass
            if re.search(r"#.*(safe|bypass|not.*script|json[- ]only)", line, re.IGNORECASE):
                continue
            bad.append(f"injector.py:{i}: {line.strip()}")

    # The ONLY allowed unwrapped json.dumps is inside _safe_js_json's body
    # (which we skipped above). Anything else is a regression.
    assert not bad, (
        "Unwrapped json.dumps in injector.py — these must go through "
        "_safe_js_json or carry a justifying comment:\n  "
        + "\n  ".join(bad)
    )
