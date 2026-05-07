"""Equation Picker — API integration regression.

The picker inserts LaTeX into the contenteditable as plain text wrapped
in `$…$` (inline) or `$$…$$` (display, for matrices). This test asserts
the LaTeX survives unchanged through:

  1. POST /api/homeworks                        (create with LaTeX in panel block)
  2. GET  /api/homeworks/{id}                   (raw JSON read-back)
  3. GET  /h/{id}                               (rendered template)
  4. GET  /api/homeworks/{id}/preview           (builder iframe render)
  5. PATCH /api/homeworks/{id}/content          (subsequent edits don't strip)

We pin a small but representative set of LaTeX strings — single symbol,
template with cursor, matrix in display mode, KaTeX-special characters
(backslashes, braces, ampersands), and a Cyrillic-mixed string that the
runtime is required to handle (Uzbek + math).

Why this matters:
  - Invariant 1 (frozen content_json schema) — proves we don't accidentally
    coerce LaTeX through some lossy normalization step at the API boundary.
  - Invariant 4 (tutor answer-leak) — LaTeX answers must round-trip
    byte-for-byte so deterministic grading sees the same string the
    student saw.
  - Defends against an HTML-escape regression in the runtime template
    (KaTeX needs raw `\frac` not `\\frac` in the rendered text).
"""

from __future__ import annotations

import pytest


# Representative payloads. Each is the LaTeX the picker would insert,
# pre-wrapped exactly as the picker emits it.
EQUATION_FIXTURES = [
    ("alpha-symbol",      "$\\alpha$"),
    ("less-or-equal",     "$\\leq$"),
    ("fraction-template", "$\\frac{a}{b}$"),
    ("integral-limits",   "$\\int_{0}^{1} x^2 \\, dx$"),
    ("display-matrix",    "$$\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$$"),
    ("display-cases",     "$$\\begin{cases} x, & x > 0 \\\\ -x, & x \\le 0 \\end{cases}$$"),
    ("uzbek-mixed",       "Yuza: $S = \\pi r^2$ formula bo'yicha hisoblanadi."),
    ("ampersand-in-math", "$a = b \\& c$"),
]


def _payload_with_equation(latex: str) -> dict:
    """Build a minimal valid /api/homeworks POST body with the given LaTeX
    string in the first panel's first page first block."""
    return {
        "title": "Equation roundtrip",
        "subject": "math-algebra",
        "grade": 8,
        "mode": "hard",
        "family": "aniq-fanlar",
        "content_json": {
            "meta": {
                "title": "Equation roundtrip",
                "subject_display": "Algebra",
            },
            "panels": [
                {
                    "id": 1,
                    "title": "PANEL 1",
                    "pages": [
                        {
                            "blocks": [
                                {"type": "p", "text": latex},
                            ],
                        }
                    ],
                }
            ],
            "flashcards": [],
            "boss_questions": [],
            "memory_sprint": [],
        },
    }


@pytest.mark.parametrize("label,latex", EQUATION_FIXTURES)
def test_latex_survives_post_then_get_json(client, label, latex):
    """LaTeX in a panel block must come back byte-for-byte from the JSON
    read endpoint (no normalization, no escaping)."""
    create = client.post("/api/homeworks", json=_payload_with_equation(latex))
    assert create.status_code == 200, create.text
    hw_id = create.json()["id"]

    fetch = client.get(f"/api/homeworks/{hw_id}")
    assert fetch.status_code == 200
    body = fetch.json()
    text_back = body["content_json"]["panels"][0]["pages"][0]["blocks"][0]["text"]
    assert text_back == latex, (
        f"{label}: LaTeX mutated through POST→GET cycle\n"
        f"  sent: {latex!r}\n  back: {text_back!r}"
    )


@pytest.mark.parametrize("label,latex", EQUATION_FIXTURES)
def test_latex_appears_in_h_render(client, label, latex):
    """LaTeX must appear verbatim in the /h/{id} rendered HTML so the
    KaTeX auto-renderer can pick it up at runtime. The injector escapes
    block.text into innerHTML; KaTeX delimiters must survive that escape."""
    create = client.post("/api/homeworks", json=_payload_with_equation(latex))
    assert create.status_code == 200, create.text
    hw_id = create.json()["id"]

    rendered = client.get(f"/h/{hw_id}")
    assert rendered.status_code == 200
    body = rendered.text
    # The injector embeds LaTeX as JS-quoted JSON (panels constant). The
    # delimiters and the math body must both appear in the served HTML.
    # Backslashes get JSON-escaped (\\frac) — accept either form.
    needle_raw = latex
    needle_jsonish = latex.replace("\\", "\\\\")
    assert needle_raw in body or needle_jsonish in body, (
        f"{label}: LaTeX missing from /h/{{id}} render"
    )


@pytest.mark.parametrize("label,latex", EQUATION_FIXTURES)
def test_latex_survives_preview_endpoint(client, label, latex):
    """Builder iframe route serves the same content as /h/{id}; verify the
    LaTeX survives this path too (covers both consumption surfaces)."""
    create = client.post("/api/homeworks", json=_payload_with_equation(latex))
    assert create.status_code == 200
    hw_id = create.json()["id"]

    rendered = client.get(f"/api/homeworks/{hw_id}/preview")
    assert rendered.status_code == 200
    body = rendered.text
    needle_raw = latex
    needle_jsonish = latex.replace("\\", "\\\\")
    assert needle_raw in body or needle_jsonish in body, (
        f"{label}: LaTeX missing from /api/homeworks/{{id}}/preview render"
    )


@pytest.mark.parametrize("label,latex", EQUATION_FIXTURES)
def test_latex_survives_patch_content(client, label, latex):
    """PATCH /api/homeworks/{id}/content is the auto-save endpoint the
    builder calls on every edit. LaTeX must survive that path too — a
    sanitization regression there would silently destroy student work."""
    # Create with a placeholder, then patch in the LaTeX.
    create = client.post("/api/homeworks", json=_payload_with_equation("placeholder"))
    assert create.status_code == 200
    hw_id = create.json()["id"]

    patch_body = _payload_with_equation(latex)["content_json"]
    patched = client.patch(
        f"/api/homeworks/{hw_id}/content",
        json={"content_json": patch_body},
    )
    assert patched.status_code in (200, 204), patched.text

    fetch = client.get(f"/api/homeworks/{hw_id}")
    text_back = fetch.json()["content_json"]["panels"][0]["pages"][0]["blocks"][0]["text"]
    assert text_back == latex, (
        f"{label}: LaTeX mutated through PATCH cycle\n"
        f"  sent: {latex!r}\n  back: {text_back!r}"
    )


def test_runtime_loads_katex_for_h_route(client):
    """Sanity check: the runtime template references the KaTeX bootstrap
    so any LaTeX inserted by the picker actually renders for students."""
    create = client.post("/api/homeworks", json=_payload_with_equation("$\\pi$"))
    assert create.status_code == 200
    hw_id = create.json()["id"]
    rendered = client.get(f"/h/{hw_id}")
    body = rendered.text
    # The runtime template has its own KaTeX SRI block (separate from the
    # builder's /js/katex-render.js). Either delimiter shape proves the
    # auto-renderer is wired in.
    assert "katex" in body.lower(), (
        "/h/{id} render does not load KaTeX — picker output won't render"
    )


def test_picker_serves_static_files(client):
    """The two new picker JS modules must be served by the static mount.
    A 404 here would mean builder.html loads them with broken <script src>
    and the toolbar button silently does nothing."""
    r1 = client.get("/js/editors/_equation-symbols.js")
    assert r1.status_code == 200, "_equation-symbols.js not served"
    assert "EquationSymbols" in r1.text

    r2 = client.get("/js/editors/_equation-picker.js")
    assert r2.status_code == 200, "_equation-picker.js not served"
    assert "EquationPicker" in r2.text
