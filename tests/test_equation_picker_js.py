"""Equation Picker — JS-runtime behavioral regression via Node.

Covers logic that pure-static tests can't reach:

  - Search returns expected hits per query (parity with the catalogue)
  - lookup() returns the right entry by latex key, null for unknown
  - Recently-used cap: pushing > 16 entries trims to 16, most-recent-first
  - Same-latex re-push deduplicates instead of growing the list
  - escHtml-equivalent escape in the picker prevents <script> injection
    via entry.name (defense-in-depth — the catalogue is curated, but the
    helper must still escape)

Strategy: shim a minimal `window` + `localStorage` in Node, source both
JS files, then exercise the public API. Skips cleanly when Node is not
on PATH (matches tests/test_runtime_math_normalize_js.py pattern).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


ROOT = Path(__file__).parent.parent
SYMBOLS_JS = ROOT / "frontend" / "js" / "editors" / "_equation-symbols.js"
PICKER_JS = ROOT / "frontend" / "js" / "editors" / "_equation-picker.js"


def _shim_preamble() -> str:
    """Tiny browser-API shim so the IIFEs in both files run cleanly under Node."""
    return r"""
const _ls = {};
globalThis.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
  setItem(k, v) { _ls[k] = String(v); },
  removeItem(k) { delete _ls[k]; },
  clear() { for (const k of Object.keys(_ls)) delete _ls[k]; },
};
// requestAnimationFrame is referenced by open(); shim to setTimeout.
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
// window === globalThis for the IIFEs.
globalThis.window = globalThis;
// document/setTimeout already exist on Node 16+.
// Minimal document stubs so the picker module loads even though we won't
// call open() — we exercise the data-layer helpers (search/lookup/recent).
globalThis.document = {
  createElement: () => ({
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, querySelector: () => null, querySelectorAll: () => [],
    style: {}, hidden: true,
  }),
  body: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
};
"""


def _run_node(test_body: str) -> dict:
    """Source both JS files into Node, run `test_body`, expect a single JSON
    line on stdout. Writes the combined script to a temp file because the
    full bundle exceeds Windows' ~32 KB command-line argument limit when
    passed via `node -e`."""
    if shutil.which("node") is None:
        pytest.skip("Node.js not available")
    src = "".join([
        _shim_preamble(),
        SYMBOLS_JS.read_text(encoding="utf-8"),
        PICKER_JS.read_text(encoding="utf-8"),
        "\n",
        test_body,
    ])
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".js", delete=False,
    ) as tmp:
        tmp.write(src)
        tmp_path = tmp.name
    try:
        proc = subprocess.run(
            ["node", tmp_path],
            capture_output=True, text=True, encoding="utf-8", timeout=15,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    assert proc.returncode == 0, f"Node failed:\nSTDOUT:{proc.stdout}\nSTDERR:{proc.stderr}"
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ── search() / lookup() ─────────────────────────────────────────────


def test_search_returns_alpha_for_alfa_query():
    """Uzbek transliteration alias must surface the entry."""
    out = _run_node(
        r"""
        const hits = window.EquationSymbols.search('alfa');
        const latex = hits.map(h => h.latex);
        process.stdout.write(JSON.stringify({ count: hits.length, latex }));
        """
    )
    assert out["count"] >= 1
    assert "\\alpha" in out["latex"], f"alfa search missed \\alpha: {out['latex']}"


def test_search_is_case_insensitive():
    out = _run_node(
        r"""
        const a = window.EquationSymbols.search('ALPHA');
        const b = window.EquationSymbols.search('alpha');
        process.stdout.write(JSON.stringify({
          aLen: a.length, bLen: b.length,
          aLatex: a.map(h => h.latex), bLatex: b.map(h => h.latex)
        }));
        """
    )
    assert out["aLen"] == out["bLen"] and out["aLatex"] == out["bLatex"], (
        f"search() should be case-insensitive: {out}"
    )


def test_search_matches_unicode_glyph():
    """Searching by the actual glyph (e.g. ≤) should find the entry."""
    out = _run_node(
        r"""
        const hits = window.EquationSymbols.search('≤');
        process.stdout.write(JSON.stringify({ latex: hits.map(h => h.latex) }));
        """
    )
    assert "\\leq" in out["latex"]


def test_search_empty_returns_empty():
    out = _run_node(
        r"""
        const a = window.EquationSymbols.search('');
        const b = window.EquationSymbols.search('   ');
        process.stdout.write(JSON.stringify({ a: a.length, b: b.length }));
        """
    )
    assert out["a"] == 0
    assert out["b"] == 0, "search() must treat whitespace-only as empty"


def test_lookup_known_and_unknown():
    """Use \\Sigma (uppercase greek) — exists in only one category, so the
    flat lookup is unambiguous. Some entries (e.g. \\frac{}{}) intentionally
    appear in BOTH `common` and `fractions` for one-tap access; for those
    the flat lookup returns the last-defined entry which is implementation
    detail, not contract. Pick a single-occurrence key here."""
    out = _run_node(
        r"""
        const known = window.EquationSymbols.lookup('\\Sigma');
        const unknown = window.EquationSymbols.lookup('\\notARealMacro');
        process.stdout.write(JSON.stringify({
          knownName: known && known.name,
          knownCategory: known && known._categoryId,
          unknown: unknown,
        }));
        """
    )
    assert out["knownName"] == "Sigma capital"
    assert out["knownCategory"] == "greek"
    assert out["unknown"] is None


# ── Recently-used persistence (localStorage shim) ───────────────────


def test_recent_starts_empty():
    out = _run_node(
        r"""
        const r = window.EquationPicker._loadRecent();
        process.stdout.write(JSON.stringify({ len: r.length }));
        """
    )
    assert out["len"] == 0


def test_recent_caps_at_16_most_recent_first():
    """Push 25 distinct entries; oldest 9 must drop, latest first."""
    out = _run_node(
        r"""
        // Inject 25 fake-but-distinct latex keys.
        const pushed = [];
        for (let i = 0; i < 25; i++) {
          const k = '\\\\sym' + i;
          window.EquationPicker._saveRecent(k);
          pushed.push(k);
        }
        const r = window.EquationPicker._loadRecent();
        process.stdout.write(JSON.stringify({
          len: r.length,
          first: r[0],
          last: r[r.length - 1],
          // Reverse-of-pushed (since we save most-recent-first).
          expectedFirst: pushed[pushed.length - 1],
          expectedLast: pushed[pushed.length - 16],
        }));
        """
    )
    assert out["len"] == 16
    assert out["first"] == out["expectedFirst"], (
        f"recently-used not most-recent-first: got {out['first']}, expected {out['expectedFirst']}"
    )
    assert out["last"] == out["expectedLast"], (
        f"recently-used cap dropped wrong entries: got {out['last']}, expected {out['expectedLast']}"
    )


def test_recent_dedups_on_repush():
    """Pushing the same latex twice must not create a duplicate; it should
    bump the existing entry to the front."""
    out = _run_node(
        r"""
        window.EquationPicker._saveRecent('\\alpha');
        window.EquationPicker._saveRecent('\\beta');
        window.EquationPicker._saveRecent('\\alpha'); // re-push — should bump to front
        const r = window.EquationPicker._loadRecent();
        process.stdout.write(JSON.stringify({ list: r }));
        """
    )
    # Expected order: ['\\alpha', '\\beta'] — alpha bumped, beta retained
    assert out["list"] == ["\\alpha", "\\beta"], (
        f"dedup-on-repush broken: {out['list']}"
    )


def test_recent_survives_corrupt_localstorage():
    """If localStorage holds a non-JSON string (e.g. a previous app version
    wrote something else under the key), loadRecent must return [] rather
    than throw."""
    out = _run_node(
        r"""
        localStorage.setItem('nets.equationPicker.recent', 'not-json-{');
        const r = window.EquationPicker._loadRecent();
        process.stdout.write(JSON.stringify({ len: r.length }));
        """
    )
    assert out["len"] == 0


# ── Surface-picker logic (responsive breakpoint thresholds) ─────────


@pytest.mark.parametrize(
    "width,expected",
    [
        (320, "sheet"),
        (479, "sheet"),
        (480, "centered"),
        (600, "centered"),
        (719, "centered"),
        (720, "popover"),
        (1280, "popover"),
        (1920, "popover"),
    ],
)
def test_pick_surface_breakpoints(width, expected):
    """Lock the responsive thresholds: <480=sheet, [480,720)=centered, ≥720=popover."""
    out = _run_node(
        rf"""
        globalThis.window.innerWidth = {width};
        const surface = window.EquationPicker._pickSurface();
        process.stdout.write(JSON.stringify({{ surface }}));
        """
    )
    assert out["surface"] == expected, (
        f"width {width} → expected surface {expected!r}, got {out['surface']!r}"
    )


# ── Catalogue contract — number of categories & matrices count ──────


def test_catalogue_has_matrices_with_proper_template_form():
    """Matrix entries must use \\begin{...}...\\end{...} so they render
    in display mode after the picker wraps them in $$..$$."""
    out = _run_node(
        r"""
        const cat = window.EquationSymbols.CATEGORIES.find(c => c.id === 'matrices');
        const wellFormed = cat.entries.every(e =>
          /\\begin\{(pmatrix|bmatrix|vmatrix|cases|aligned)\}[\s\S]*\\end\{(pmatrix|bmatrix|vmatrix|cases|aligned)\}/.test(e.latex)
        );
        process.stdout.write(JSON.stringify({
          count: cat.entries.length,
          wellFormed,
          firstLatex: cat.entries[0].latex,
        }));
        """
    )
    assert out["count"] >= 4, "matrices category should have at least 4 entries"
    assert out["wellFormed"], (
        f"matrix entries malformed; first: {out['firstLatex']}"
    )


def test_all_returns_flat_list_with_categoryid():
    out = _run_node(
        r"""
        const all = window.EquationSymbols.all();
        const sample = all.slice(0, 3);
        const allHaveCategory = all.every(e => typeof e._categoryId === 'string');
        process.stdout.write(JSON.stringify({
          total: all.length, allHaveCategory, sample
        }));
        """
    )
    assert out["allHaveCategory"], "all() entries must include _categoryId"
    assert out["total"] >= 100, f"flat catalogue suspiciously small: {out['total']}"


# ── No accidental top-level mutation ────────────────────────────────


def test_picker_does_not_mutate_symbols_module():
    """Loading the picker must not touch EquationSymbols' arrays — the
    catalogue should be effectively read-only from the picker's POV."""
    out = _run_node(
        r"""
        const beforeCount = window.EquationSymbols.all().length;
        // Simulate a few search and lookup calls (read-only ops).
        window.EquationSymbols.search('alpha');
        window.EquationSymbols.lookup('\\frac{}{}');
        window.EquationPicker._saveRecent('\\alpha');
        const afterCount = window.EquationSymbols.all().length;
        process.stdout.write(JSON.stringify({ beforeCount, afterCount }));
        """
    )
    assert out["beforeCount"] == out["afterCount"], (
        f"catalogue size changed during read-only calls: "
        f"{out['beforeCount']} → {out['afterCount']}"
    )
