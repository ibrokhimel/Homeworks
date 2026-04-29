"""
Regression guard: long homework titles must NOT escape the card.
Caught on prod 2026-04-29: title 'AAAA...' (no whitespace) overflowed
the card and stretched across the viewport.
"""
from pathlib import Path

CSS_PATH = Path(__file__).parent.parent / "frontend" / "css" / "app.css"


def test_homework_card_clips_overflow():
    """The .homework-card rule must contain overflow:hidden so its
    children can't escape the card border."""
    css = CSS_PATH.read_text(encoding="utf-8")
    # Find the .homework-card rule and assert it has overflow clipping
    # (Use a simple regex or string search — the test must fail loudly
    # if the rule disappears.)
    assert "overflow" in css
    # Stronger: find the .homework-card { ... } block
    import re
    block = re.search(r'\.homework-card\s*\{([^}]*)\}', css)
    assert block, ".homework-card rule not found in app.css"
    body = block.group(1)
    assert "overflow" in body and "hidden" in body, (
        ".homework-card must contain overflow: hidden — without it, "
        "long unbroken titles overflow horizontally (regression caught 2026-04-29)"
    )


def test_homework_card_title_breaks_long_words():
    """The card title (h3 or .card-title) must break long unbroken
    strings on character boundaries via overflow-wrap or word-break."""
    css = CSS_PATH.read_text(encoding="utf-8")
    # Look for a rule that targets the card title with break-word
    # behavior. Be flexible about the selector — could be
    # .homework-card h3, .homework-card .card-title, etc.
    import re
    has_break = re.search(
        r'\.homework-card[^{]*\{[^}]*?(?:overflow-wrap|word-break|word-wrap)\s*:\s*break-(?:word|all)',
        css,
        re.DOTALL | re.IGNORECASE,
    )
    assert has_break, (
        "homework card title must use overflow-wrap:break-word or "
        "word-break:break-word to break long strings (regression "
        "caught 2026-04-29)"
    )
