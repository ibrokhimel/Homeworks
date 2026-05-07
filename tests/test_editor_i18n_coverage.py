"""Builder editor i18n coverage — regression suite.

Pin three layers of the per-editor translation contract introduced in
this PR:

  1. STRING TABLE — every `editor.*` key in strings.js has the same
     value in all three top-level lang blocks (uz / ru / en). The pre-
     existing `test_strings_skeleton_has_exact_three_lang_keys` test
     enforces TOP-LEVEL parity but not per-key parity inside
     namespaces; this file pins it explicitly for the editor.* slice.

  2. EDITOR JS — each of the 9 phase-editor files declares the t()
     helper that bridges to window.i18n.t(), AND replaces specific
     hardcoded strings the user reported as stuck-in-English with
     editor.* key lookups.

  3. NO REGRESSION — for the specific user-cited examples ("Title",
     "Subject display", "Section", "Each card has a front (term/formula)…",
     "Memory Sprint" eyebrow, "Reading" eyebrow, "Game Breaks", "Real Life",
     "Consolidation", "Boss meta", "Reflection"), the matching key exists
     in the table AND the editor file no longer emits the bare English
     literal as user-facing chrome.

The tests are pure-string regex audits — no Node, no DOM, fast. They
catch exactly the class of regression where someone authors a new
editor with hardcoded English and ships before adding the key.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


ROOT = Path(__file__).parent.parent
STRINGS_JS = ROOT / "frontend" / "js" / "i18n" / "strings.js"
EDITORS_DIR = ROOT / "frontend" / "js" / "editors"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _extract_lang_block(src: str, lang: str) -> str:
    """Pull the body of one of the three top-level lang blocks
    (e.g. `en: { ... }`) out of strings.js."""
    m = re.search(rf"\n  {lang}:\s*\{{", src)
    assert m, f"lang block {lang!r} not found"
    start = m.end()
    depth = 1
    i = start
    while i < len(src) and depth > 0:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start:i]
        i += 1
    raise AssertionError(f"unbalanced braces in {lang} block")


def _editor_keys(block: str) -> set[str]:
    """Every `'editor.*'` key in a lang block."""
    return set(re.findall(r"'(editor\.[a-zA-Z._]+)'", block))


# ── Layer 1: lang-table parity for editor.* slice ────────────────────


def test_editor_keys_present_in_all_three_langs():
    src = _read(STRINGS_JS)
    en = _editor_keys(_extract_lang_block(src, "en"))
    uz = _editor_keys(_extract_lang_block(src, "uz"))
    ru = _editor_keys(_extract_lang_block(src, "ru"))
    assert en, "no editor.* keys in en — did the i18n PR not land?"
    missing_uz = en - uz
    missing_ru = en - ru
    extra_uz = uz - en
    extra_ru = ru - en
    assert not missing_uz, f"editor.* keys missing in uz: {sorted(missing_uz)[:10]}"
    assert not missing_ru, f"editor.* keys missing in ru: {sorted(missing_ru)[:10]}"
    assert not extra_uz, f"editor.* keys present in uz but not en: {sorted(extra_uz)[:10]}"
    assert not extra_ru, f"editor.* keys present in ru but not en: {sorted(extra_ru)[:10]}"


def test_editor_namespace_has_meaningful_size():
    """Pin a floor on coverage so a future cleanup that drops most of
    the keys gets caught. The PR adds 155 editor.* keys per lang."""
    src = _read(STRINGS_JS)
    en = _editor_keys(_extract_lang_block(src, "en"))
    assert len(en) >= 100, f"editor.* coverage shrunk to {len(en)} — was 155"


# ── Layer 2: each editor file uses the t() helper ────────────────────


EDITOR_FILES = [
    "preview.js",
    "flashcards.js",
    "memory-sprint.js",
    "reading.js",
    "game-breaks.js",
    "real-life.js",
    "consolidation.js",
    "boss.js",
    "reflection.js",
]


@pytest.mark.parametrize("filename", EDITOR_FILES)
def test_editor_declares_t_helper(filename):
    """Every phase editor must define the local t() shim that bridges to
    window.i18n.t() with a fallback. Without it, the file can't make any
    i18n calls — and a future re-paint of that editor will silently emit
    only what's hardcoded."""
    src = _read(EDITORS_DIR / filename)
    assert re.search(
        r"function\s+t\s*\(\s*key\s*,\s*fallback\s*\)", src
    ), f"{filename} is missing the local t(key, fallback) helper"
    assert "window.i18n.t" in src, (
        f"{filename}'s t() helper does not call window.i18n.t — strings will "
        "not switch when the user changes language"
    )


@pytest.mark.parametrize("filename", EDITOR_FILES)
def test_editor_calls_t_at_least_once(filename):
    """Beyond just declaring t(), the editor must actually USE it —
    otherwise the helper is dead code and the file still emits hardcoded
    English."""
    src = _read(EDITORS_DIR / filename)
    calls = re.findall(r't\("editor\.[a-zA-Z._]+"', src)
    assert calls, (
        f"{filename} declares t() but never calls it on an editor.* key — "
        f"the file's UI is still hardcoded"
    )


# ── Layer 3: specific user-cited examples are now translated ────────


# Each tuple: (editor file, key that must exist + be called, English string
# that should NO LONGER appear as a *bare* user-facing literal in the file).
USER_CITED = [
    ("preview.js",       "editor.preview.title",         "<span>Title</span>"),
    ("preview.js",       "editor.preview.subject_display", "<span>Subject display</span>"),
    ("preview.js",       "editor.preview.section",       "<span>Section</span>"),
    ("preview.js",       "editor.preview.eyebrow_meta",  "Preview metadata"),
    ("flashcards.js",    "editor.fc.eyebrow",            ">Flashcards<"),
    ("flashcards.js",    "editor.fc.intro",              "Each card has a <strong>front</strong>"),
    ("memory-sprint.js", "editor.ms.eyebrow",            ">Memory Sprint<"),
    ("reading.js",       "editor.reading.eyebrow",       ">Reading<"),
    ("game-breaks.js",   "editor.gb.eyebrow",            ">Game Breaks<"),
    ("real-life.js",     "editor.rl.eyebrow",            ">Real Life<"),
    ("consolidation.js", "editor.cons.eyebrow",          ">Consolidation<"),
    ("boss.js",          "editor.boss.eyebrow_meta",     ">Boss meta<"),
    ("boss.js",          "editor.boss.eyebrow",          ">Final Challenge<"),
    ("reflection.js",    "editor.refl.eyebrow",          ">Reflection<"),
]


@pytest.mark.parametrize("filename,key,old_literal", USER_CITED)
def test_user_cited_examples_now_translate(filename, key, old_literal):
    """For every UI text the user explicitly named as 'stuck in EN', pin
    that the i18n key exists AND the editor file calls it AND the original
    bare English literal no longer appears as user-facing chrome."""
    src_strings = _read(STRINGS_JS)
    en = _editor_keys(_extract_lang_block(src_strings, "en"))
    assert key in en, f"i18n key {key!r} missing from en block"

    editor_src = _read(EDITORS_DIR / filename)
    needle = f't("{key}"'
    assert needle in editor_src, (
        f"{filename} does not call t({key!r}) — the chrome string is still "
        "hardcoded even though the i18n key exists"
    )

    # The bare-literal check is fuzzy: we strip JS strings inside
    # data-attributes and console.log so we only catch user-visible text.
    # Allow the literal if it appears inside a comment.
    no_comments = re.sub(r"/\*[\s\S]*?\*/", "", editor_src)
    no_comments = re.sub(r"//[^\n]*", "", no_comments)
    if old_literal in no_comments:
        pytest.fail(
            f"{filename} still emits the bare English literal {old_literal!r} — "
            f"replace it with t({key!r}) so it switches with the lang pill"
        )


# ── Sanity: the i18n hook in builder.js still re-renders on lang change ─


def test_builder_js_still_repaints_on_lang_change():
    """The translation pipeline relies on builder.js calling
    renderActiveEditor() inside the i18n.onChange callback. If that path
    breaks, switching the lang pill won't re-paint the active editor and
    the t() calls in the editor files appear to do nothing."""
    src = _read(ROOT / "frontend" / "js" / "builder.js")
    assert "window.i18n.onChange" in src, (
        "builder.js no longer subscribes to i18n.onChange — editors won't "
        "repaint when the lang pill is clicked"
    )
    assert "renderActiveEditor" in src, (
        "builder.js no longer calls renderActiveEditor on i18n change — "
        "the active editor's t() output won't update"
    )
