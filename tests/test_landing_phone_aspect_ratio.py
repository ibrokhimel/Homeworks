from pathlib import Path


LANDING_CSS = Path("frontend/css/landing.css")


def test_phone_frame_has_aspect_ratio():
    css = LANDING_CSS.read_text(encoding="utf-8")
    # The fix: phone-frame must declare aspect-ratio so it scales proportionally on narrow viewports.
    assert "aspect-ratio" in css
    # Specifically the iPhone-like ratio.
    assert "9 / 19.5" in css or "9/19.5" in css


def test_phone_screen_inner_no_fixed_min_height():
    css = LANDING_CSS.read_text(encoding="utf-8")
    # Regression: prevent re-introducing the fixed 620px min-height that broke aspect ratio.
    import re

    inner_block = re.search(r"\.phone-screen-inner\s*\{[^}]*\}", css, re.S).group(0)
    assert "min-height: 620px" not in inner_block
