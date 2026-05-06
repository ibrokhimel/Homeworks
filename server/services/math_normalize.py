"""Math answer normalization shared by client (gbAQAction) and server (answer_checker).

Reduces a student/expected math answer to a canonical form so equivalent notation
matches: Greek letter names (α/alfa/alpha), trig function aliases (tg/tan, ctg/cot),
unicode minus (U+2212), decimal comma vs dot, degree markers, and "lhs = rhs" prefixes.

The JS port lives inline in server/template/perfect_homework.html. Both implementations
must produce identical output for every test case in tests/test_answer_checker_math_equivalence.py
and tests/test_runtime_math_normalize_js.py.
"""

from __future__ import annotations

import re
import unicodedata


_GREEK_TO_LATIN = {
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta",
    "ε": "epsilon", "ζ": "zeta", "η": "eta", "θ": "theta",
    "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu",
    "ν": "nu", "ξ": "xi", "ο": "omicron", "π": "pi",
    "ρ": "rho", "σ": "sigma", "ς": "sigma", "τ": "tau",
    "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
}

# Uzbek/Russian transliterations of Greek letter names → Latin canonical form.
# Applied AFTER glyph→name expansion so "alfa" and "α" reduce to the same string.
_NAME_ALIASES = [
    (r"\balfa\b", "alpha"),
    (r"\bbeta\b", "beta"),
    (r"\bgamma\b", "gamma"),
    (r"\bdelta\b", "delta"),
    (r"\btetha\b", "theta"),
    (r"\bteta\b", "theta"),
    (r"\blyamda\b", "lambda"),
    (r"\bomega\b", "omega"),
    (r"\bpi\b", "pi"),
]

# Uzbek trig aliases → English canonical form. Word-boundary anchored so "ctg"
# does not match inside arbitrary text.
_TRIG_ALIASES = [
    (r"\bctg\b", "cot"),
    (r"\bcotan\b", "cot"),
    (r"\btg\b", "tan"),
    (r"\bsh\b", "sinh"),
    (r"\bch\b", "cosh"),
    (r"\bth\b", "tanh"),
    (r"\bcth\b", "coth"),
]

# Degree markers stripped (every variant the demo content uses).
_DEGREE_MARKERS = [
    "°",
    "º",  # masculine ordinal indicator (sometimes used as fake degree)
    "˚",
]
_DEGREE_WORDS = [r"\bdeg\b", r"\bdegree\b", r"\bdegrees\b", r"\bgradus\b", r"\bgradusda\b"]

# Unicode minus / dashes that look like ASCII minus.
_MINUS_VARIANTS = ["−", "–", "—", "‒", "－"]


def normalize_math(text: str) -> str:
    """Reduce *text* to a canonical math form for equality comparison.

    The transform is intentionally lossy — it preserves only what students should
    be allowed to vary on (notation, decimal style, Greek letter spelling, trig
    aliases). It does not try to symbolically simplify expressions.
    """
    if text is None:
        return ""
    s = text if isinstance(text, str) else str(text)

    # 1. NFC + casefold: stable composition; case-insensitive compare.
    s = unicodedata.normalize("NFC", s)
    s = s.casefold()

    # 2. Strip a leading "lhs =" prefix so "sin B = 0,6" reduces to "0,6".
    #    Use rsplit to keep the right-hand side when expected itself has "=".
    if "=" in s:
        s = s.rsplit("=", 1)[-1]

    # 3. Greek glyphs → English names ("α" → "alpha").
    for glyph, name in _GREEK_TO_LATIN.items():
        if glyph in s:
            s = s.replace(glyph, name)

    # 4. Unicode minus / dashes → ASCII minus. Done before regex aliases so
    #    surrounding chars in patterns remain consistent.
    for m in _MINUS_VARIANTS:
        if m in s:
            s = s.replace(m, "-")

    # 5. Uzbek/Russian transliterations of Greek names → English canonical.
    for pat, repl in _NAME_ALIASES:
        s = re.sub(pat, repl, s)

    # 6. Trig aliases (tg/ctg/sh/ch/th/cth → tan/cot/sinh/cosh/tanh/coth).
    for pat, repl in _TRIG_ALIASES:
        s = re.sub(pat, repl, s)

    # 7. Strip degree markers + words.
    for d in _DEGREE_MARKERS:
        if d in s:
            s = s.replace(d, "")
    for w in _DEGREE_WORDS:
        s = re.sub(w, "", s)

    # 8. Decimal comma between digits → dot. Done before whitespace strip so
    #    the digit-context check still sees the boundary.
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)

    # 9. Strip ALL whitespace inside the expression (formula spacing varies).
    s = re.sub(r"\s+", "", s)

    # 10. Trailing punctuation that doesn't change math meaning.
    s = s.rstrip(".,;:!?")

    return s


def is_math_equivalent(student: str, expected: str) -> bool:
    """Return True iff *student* and *expected* reduce to the same canonical form."""
    return normalize_math(student) == normalize_math(expected)
