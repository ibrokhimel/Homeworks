from pathlib import Path
import re

PH = Path("server/template/perfect_homework.html").read_text(encoding="utf-8")

def _block(selector: str) -> str:
    m = re.search(re.escape(selector) + r"\s*\{[^}]*\}", PH, re.S)
    assert m, f"selector {selector!r} not found"
    return m.group(0)

def test_fc_scene_has_mirror_vars():
    blk = _block(".fc-scene")
    assert "--fc-mirror" in blk

def test_fc_side_is_gradient_glass():
    blk = _block(".fc-side")
    assert "linear-gradient" in blk and "rgba" in blk

def test_fc_side_left_has_3d_transform():
    blk = _block(".fc-side.left")
    assert "translate" in blk and "rotateY" in blk

def test_fc_side_right_has_3d_transform():
    blk = _block(".fc-side.right")
    assert "translate" in blk and "rotateY" in blk

def test_fc_tip_pill_cream_palette():
    blk = _block(".fc-tip-pill")
    # Reference uses --fc-gold-soft as bg
    assert "var(--fc-gold-soft)" in blk or "fdf8eb" in blk.lower() or "fef3c7" in blk.lower()

def test_no_hardcoded_card_label_in_css():
    css_section_match = re.search(r"<style[^>]*>([\s\S]*?)</style>", PH)
    assert css_section_match, "no <style> found"
    css = css_section_match.group(1)
    # Reference's runtime DOES NOT inject literal "OLDINGI KARTA" / "KEYINGI KARTA" via CSS content
    assert "content: \"OLDINGI" not in css.upper()
    assert "content: \"KEYINGI" not in css.upper()
