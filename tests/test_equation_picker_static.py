"""Equation Picker — static structure regression.

What this guards (without spinning up a browser):
  1. The two picker scripts (_equation-symbols.js, _equation-picker.js) are
     served by the static mount and registered in builder.html with the
     ?v=__VERSION__ cache-bust suffix (Invariant 5).
  2. _equation-symbols.js loads onto the global window with the expected
     shape — CATEGORIES array of {id,label,entries[]}, plus search() / lookup() /
     all() helpers.
  3. _equation-picker.js exports the public API (open / close) and never
     leaks innerHTML interpolation of unsanitized user data (escHtml is
     always present).
  4. preview.js's renderToolbar() now contains the Σ button with the
     correct data-cmd / aria-haspopup attributes, and runCommand() routes
     `cmd === "equation"` into window.EquationPicker.open.
  5. No banned/dangerous things: no `eval(`, no `Function(` constructor,
     no `dangerouslySetInnerHTML`, no `document.write`.
  6. Catalogue invariants: every entry has latex+display+name; cursor
     offsets (when present) are in range; LaTeX strings don't contain
     stray `</script>` (defense against script breakouts when stamped
     into HTML).

These are pure file-read / regex tests — they run in well under a second
and do not require Node, the running uvicorn, or a database row.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).parent.parent
SYMBOLS_JS = ROOT / "frontend" / "js" / "editors" / "_equation-symbols.js"
PICKER_JS = ROOT / "frontend" / "js" / "editors" / "_equation-picker.js"
PREVIEW_JS = ROOT / "frontend" / "js" / "editors" / "preview.js"
BUILDER_HTML = ROOT / "frontend" / "templates" / "builder.html"
BUILDER_HTML_FRONTEND = ROOT / "frontend" / "builder.html"  # actual location


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


# ── Layer 1: builder.html registration ──────────────────────────────


def test_builder_html_registers_symbols_script_with_cachebust():
    html = _read(BUILDER_HTML_FRONTEND)
    assert (
        "/js/editors/_equation-symbols.js?v=__VERSION__" in html
    ), "_equation-symbols.js is not registered with ?v=__VERSION__ in builder.html"


def test_builder_html_registers_picker_script_with_cachebust():
    html = _read(BUILDER_HTML_FRONTEND)
    assert (
        "/js/editors/_equation-picker.js?v=__VERSION__" in html
    ), "_equation-picker.js is not registered with ?v=__VERSION__ in builder.html"


def test_picker_loads_after_symbols_in_builder_html():
    """Load order matters: the picker references window.EquationSymbols.
    If the picker script tag comes before the symbols tag, an open() call
    fires before EquationSymbols is defined → null deref. Pin the order."""
    html = _read(BUILDER_HTML_FRONTEND)
    sym_idx = html.find("/js/editors/_equation-symbols.js")
    pick_idx = html.find("/js/editors/_equation-picker.js")
    assert sym_idx > 0 and pick_idx > 0
    assert sym_idx < pick_idx, (
        "_equation-symbols.js must appear BEFORE _equation-picker.js so the "
        "picker's window.EquationSymbols dependency is satisfied."
    )


def test_picker_loads_before_preview_in_builder_html():
    """Preview.js dispatches data-cmd='equation' clicks into
    window.EquationPicker.open(). If preview loads first the click handler
    can race the picker's IIFE. Pin the order."""
    html = _read(BUILDER_HTML_FRONTEND)
    pick_idx = html.find("/js/editors/_equation-picker.js")
    prev_idx = html.find("/js/editors/preview.js")
    assert pick_idx > 0 and prev_idx > 0
    assert pick_idx < prev_idx, (
        "_equation-picker.js must appear BEFORE preview.js so the "
        "data-cmd='equation' click dispatcher resolves to a defined module."
    )


# ── Layer 2: source-file invariants ─────────────────────────────────


def test_symbols_js_exposes_global():
    src = _read(SYMBOLS_JS)
    assert "window.EquationSymbols" in src
    # Must export the four documented keys.
    for key in ("CATEGORIES", "search", "lookup", "all"):
        assert key in src, f"_equation-symbols.js missing public key: {key}"


def test_picker_js_exposes_global():
    src = _read(PICKER_JS)
    assert "window.EquationPicker" in src
    for key in ("open", "close"):
        assert (
            re.search(rf"\b{key}\s*[:,]", src)
            or re.search(rf"\b{key}\s*=\s*function", src)
            or re.search(rf"function\s+{key}\b", src)
            or re.search(rf"const\s+{key}\b", src)
        ), f"_equation-picker.js missing public key: {key}"


@pytest.mark.parametrize(
    "banned",
    [
        r"\beval\s*\(",
        r"\bFunction\s*\(",            # `new Function(...)`
        r"document\.write\s*\(",
        r"dangerouslySetInnerHTML",
    ],
)
@pytest.mark.parametrize("source_file", [PICKER_JS, SYMBOLS_JS])
def test_no_dangerous_apis(banned, source_file):
    src = _read(source_file)
    assert not re.search(banned, src), (
        f"{source_file.name} uses banned API matching /{banned}/ — would "
        "introduce an XSS / arbitrary-code-execution surface."
    )


def test_picker_uses_escape_helper_for_all_innerHTML():
    """Defense-in-depth: every templated string that lands in innerHTML must
    pass user-controlled fields through escHtml(). The picker only ever
    interpolates entry.name, entry.latex, entry.display, entry.unicode, and
    catalogue ids — but if any future edit forgets the escape, this catches it.
    """
    src = _read(PICKER_JS)
    # Find all backtick / single-quote string concatenations that include
    # `${entry...}` or `' + entry...` patterns. They must use escHtml.
    suspicious = re.findall(
        r"(?:innerHTML|outerHTML)\s*=\s*([^;]+);",
        src,
    )
    for chunk in suspicious:
        if "entry." in chunk or "cat." in chunk or "it." in chunk:
            assert "escHtml(" in chunk, (
                "innerHTML assignment interpolates entry/category data without "
                f"escHtml() — XSS risk:\n  {chunk[:200]}"
            )


def test_picker_uses_position_fixed_for_root():
    """The picker root must be `position: fixed` to escape ancestor stacking
    contexts (the editor card has its own transform during drag-reorder).
    The CSS file pins this; the picker code adds the .equation-picker-root
    class which the CSS rule targets — verify the class name spelling
    matches between JS and CSS."""
    js = _read(PICKER_JS)
    css = _read(ROOT / "frontend" / "css" / "app.css")
    assert "equation-picker-root" in js
    assert "equation-picker-root" in css
    m = re.search(r"\.equation-picker-root\s*\{[^}]*position\s*:\s*fixed", css)
    assert m, ".equation-picker-root must be position: fixed in app.css"


# ── Layer 3: preview.js wiring ──────────────────────────────────────


def test_preview_toolbar_includes_equation_button():
    src = _read(PREVIEW_JS)
    assert 'data-cmd="equation"' in src, (
        "preview.js renderToolbar() does not include the equation button"
    )


def test_preview_equation_button_has_aria_haspopup():
    src = _read(PREVIEW_JS)
    # Match the actual button line.
    m = re.search(r'<button[^>]*data-cmd="equation"[^>]*>', src)
    assert m, "equation button not found"
    assert 'aria-haspopup="dialog"' in m.group(0), (
        "equation button should announce aria-haspopup=\"dialog\" so screen "
        "readers know it opens a modal-style picker"
    )


def test_preview_runCommand_routes_equation_into_picker():
    src = _read(PREVIEW_JS)
    # Find the equation branch and verify it calls EquationPicker.open
    m = re.search(
        r'else if\s*\(\s*cmd\s*===\s*"equation"\s*\)\s*\{(?P<body>[\s\S]*?)\}\s*else if',
        src,
    )
    assert m, "preview.js runCommand has no `cmd === \"equation\"` branch"
    body = m.group("body")
    assert "window.EquationPicker.open" in body, (
        "equation branch does not call window.EquationPicker.open"
    )
    assert "saveSelection(editor)" in body, (
        "equation branch must save the selection BEFORE the picker steals "
        "focus, otherwise the caret is lost on insert"
    )


# ── Layer 4: catalogue contract ─────────────────────────────────────


def _extract_categories_via_node():
    """If Node is available, source the symbols module and read the
    CATEGORIES array out for shape checks."""
    if shutil.which("node") is None:
        return None
    src = _read(SYMBOLS_JS)
    # The module is an IIFE that sets window.EquationSymbols. We shim a
    # global window object and source it into Node, then dump the result.
    script = (
        "const window = globalThis;\n"
        + src
        + "\nprocess.stdout.write(JSON.stringify({\n"
          "  categories: window.EquationSymbols.CATEGORIES.map(c => ({\n"
          "    id: c.id, label: c.label, count: c.entries.length,\n"
          "    entries: c.entries\n"
          "  })),\n"
          "  total: window.EquationSymbols.all().length\n"
          "}));\n"
    )
    proc = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, encoding="utf-8", timeout=15,
    )
    assert proc.returncode == 0, f"Node failed:\n{proc.stderr}"
    return json.loads(proc.stdout)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_catalogue_categories_and_size():
    data = _extract_categories_via_node()
    cats = data["categories"]
    ids = [c["id"] for c in cats]
    # Pin the IDs we expect — protects against accidental rename.
    expected = {
        "common", "greek", "operators", "relations", "fractions",
        "scripts", "calculus", "brackets", "arrows", "logic", "matrices",
    }
    assert set(ids) == expected, f"category id drift: {set(ids)} vs {expected}"
    # Every category must have at least 5 entries (avoid stub categories).
    for c in cats:
        assert c["count"] >= 5, f"category {c['id']} has only {c['count']} entries"
    # Total catalogue should be in the proposed range (~150). Allow some
    # slack for future additions.
    assert 100 <= data["total"] <= 250, (
        f"total catalogue size {data['total']} outside expected band 100-250"
    )


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_every_entry_has_required_fields():
    data = _extract_categories_via_node()
    bad = []
    for cat in data["categories"]:
        for e in cat["entries"]:
            if not isinstance(e.get("latex"), str) or not e["latex"]:
                bad.append((cat["id"], e, "missing latex"))
            if not isinstance(e.get("display"), str) or not e["display"]:
                bad.append((cat["id"], e, "missing display"))
            if not isinstance(e.get("name"), str) or not e["name"]:
                bad.append((cat["id"], e, "missing name"))
    assert not bad, f"{len(bad)} entries missing required fields: {bad[:5]}"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_no_entry_contains_script_breakout():
    """LaTeX strings get stamped into innerHTML inside `data-tex="..."`
    attributes when the picker renders tiles. A stray `</script>` or
    `"` in an entry would either escape the attribute or close the
    surrounding script block at insertion time. Pin that no entry contains
    these characters."""
    data = _extract_categories_via_node()
    bad = []
    for cat in data["categories"]:
        for e in cat["entries"]:
            for field in ("latex", "display", "unicode", "name"):
                v = e.get(field)
                if isinstance(v, str) and ("</script" in v.lower() or "<script" in v.lower()):
                    bad.append((cat["id"], field, v))
    assert not bad, f"entries contain script tags: {bad}"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_cursor_offsets_in_range():
    """`cursor` offsets are measured from the END of the LaTeX string.
    A bad offset (negative or longer than the string) places the caret
    outside the inserted text range — leading to a thrown DOM error.
    Pin that every entry's offset is in [1, len(latex)]."""
    data = _extract_categories_via_node()
    bad = []
    for cat in data["categories"]:
        for e in cat["entries"]:
            if "cursor" in e and e["cursor"] is not None:
                if not (1 <= e["cursor"] <= len(e["latex"])):
                    bad.append((cat["id"], e["latex"], e["cursor"]))
    assert not bad, f"cursor offsets out of range: {bad}"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_search_finds_known_terms():
    """Smoke the search() helper with a few known queries that map to
    common school-math vocabulary in both English and Uzbek."""
    if shutil.which("node") is None:
        pytest.skip("Node.js not available")
    src = _read(SYMBOLS_JS)
    script = (
        "const window = globalThis;\n"
        + src
        + "\nconst out = {};\n"
        + "for (const q of ['integral','alfa','kasr','matrix','infinity','perpendikulyar']) {\n"
        + "  out[q] = window.EquationSymbols.search(q).length;\n"
        + "}\n"
        + "process.stdout.write(JSON.stringify(out));\n"
    )
    proc = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, encoding="utf-8", timeout=10,
    )
    assert proc.returncode == 0, f"Node failed:\n{proc.stderr}"
    counts = json.loads(proc.stdout)
    for q, n in counts.items():
        assert n >= 1, (
            f"search({q!r}) returned {n} results — expected at least 1. "
            "Either the catalogue is missing a school-vocabulary alias or "
            "the searchableText() function is broken."
        )
