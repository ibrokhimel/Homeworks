"""Regression tests: anti-leak hint rules across every non-English subject.

User report (2026-05-06): "hints should not give clear answers, they should
give just hints. The fix English already has must apply to math, biology,
geometry, history, kimyo, physics — I saw hints on multiple-option parts
revealing the answer."

The Boss / Final Challenge `hint` field passes through
`server/services/injector.py::adapt_boss_questions`, which splits the
single string by newline / `|` / `•` into up to 3 ladder stages. If the
LLM puts the literal answer in that field, every Boss hint level shows
the answer.

The flashcards `hint` field is mapped to `back.hook` by
`server/services/injector.py::adapt_homework_data['flashcards']` and
rendered as the on-card "Tip" pill. Same leak risk if unconstrained.

These tests pin the anti-leak guards in every non-English subject's
`final-challenge.md` and `flashcards.md` so a future "let me simplify
this prompt" PR can't quietly re-open the leak in any single subject.
The English prompts are covered separately by
`tests/test_english_prompt_instruction.py`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

PROMPTS_ROOT = Path(__file__).resolve().parents[1] / "server" / "prompts"

# All non-English subject directories. Every entry must be hardened.
NON_ENGLISH_SUBJECTS = [
    "math-algebra",
    "biology",
    "geometriya-g7-11",
    "history",
    "kimyo-g7-11",
    "physics",
]


def _read(subject: str, filename: str) -> str:
    return (PROMPTS_ROOT / subject / filename).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Final Challenge — every subject must carry the explicit anti-leak block.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_final_challenge_has_anti_leak_section_header(subject: str) -> None:
    """Every subject's final-challenge must declare an Anti-leak rules section.

    Without this header, prompt readers / future editors miss the load-
    bearing rule that Hint 3 cannot show the literal answer. The Boss
    runtime treats the hint as a 3-stage ladder, so a single answer-y
    string leaks at every level.
    """
    body = _read(subject, "final-challenge.md")
    assert "Anti-leak rules" in body, (
        f"{subject}/final-challenge.md missing 'Anti-leak rules' section. "
        f"Without it, the LLM may put the literal answer in the `hint` "
        f"field and the Boss runtime will surface it as Hint 1."
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_final_challenge_forbids_literal_answer(subject: str) -> None:
    """Every subject's final-challenge must explicitly forbid quoting the
    model answer verbatim somewhere in the hint section."""
    body = _read(subject, "final-challenge.md")
    # Tolerate either phrasing — both lock the same rule.
    forbids = (
        "must never quote the model answer" in body
        or "must never quote the model answer" in body.lower()
        or "must never write" in body
        or "literal answer never appears" in body
        or "name the theorem" in body  # geometry's wording
    )
    assert forbids, (
        f"{subject}/final-challenge.md does not forbid quoting the model "
        f"answer in hints. Add a rule like 'Hint must never quote the "
        f"model answer verbatim or in any equivalent reduced form.'"
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_final_challenge_ships_bad_good_examples(subject: str) -> None:
    """Every subject's final-challenge must show at least one BAD/GOOD
    example pair so the LLM has a concrete contrast for the rule."""
    body = _read(subject, "final-challenge.md")
    assert "BAD" in body and "GOOD" in body, (
        f"{subject}/final-challenge.md missing BAD/GOOD example pair. "
        f"Without a worked contrast, the rule text alone tends to be "
        f"ignored by the LLM under tight token budgets."
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_final_challenge_documents_hint_format_split(subject: str) -> None:
    """Every subject's final-challenge must document the single-string
    encoding for the 3-stage hint ladder (newline / `|` / `•`).

    The Boss injector splits on these delimiters — if the prompt doesn't
    say so, the LLM emits one paragraph and all 3 hints are duplicates
    of that paragraph. A single answer-leaning sentence then becomes
    EVERY hint level.
    """
    body = _read(subject, "final-challenge.md")
    assert "Hint format" in body or "single-string encoding" in body, (
        f"{subject}/final-challenge.md does not document the hint "
        f"format. Add a 'Hint format (single-string encoding)' note "
        f"telling the LLM to join 3 stages with ` | `."
    )
    # The split delimiters must be mentioned so the LLM picks a valid one.
    has_pipe = "`|`" in body or " | " in body
    assert has_pipe, (
        f"{subject}/final-challenge.md must mention the `|` separator — "
        f"the injector splits the hint string on it."
    )


# ---------------------------------------------------------------------------
# Flashcards — the `hint` mnemonic field renders as the on-card Tip pill.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_flashcards_has_hint_anti_leak_section(subject: str) -> None:
    """Every subject's flashcards must declare hint anti-leak rules.

    The runtime injector maps `card.hint` -> `back.hook`, rendered as
    the on-card "Tip" pill. An unconstrained `hint` becomes a translated
    or paraphrased version of the back-side definition — the answer
    in disguise.
    """
    body = _read(subject, "flashcards.md")
    has_section = (
        "## Hint" in body  # any "## Hint ..." heading
        or "Hint rules (hard constraints)" in body
    )
    assert has_section, (
        f"{subject}/flashcards.md missing a Hint rules section. The "
        f"`hint` field renders as the on-card Tip pill — without "
        f"anti-leak rules the mnemonic can leak the back-side answer."
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_flashcards_forbids_back_side_paraphrase(subject: str) -> None:
    """Every subject's flashcards must forbid the hint from quoting the
    back-side definition/formula verbatim."""
    body = _read(subject, "flashcards.md")
    # Look for either phrasing in the hint rules.
    forbids = (
        "never expose the back-side" in body
        or "never expose the back" in body
        or "never expose the answer" in body
    )
    assert forbids, (
        f"{subject}/flashcards.md hint rules don't forbid the mnemonic "
        f"from exposing the back-side definition. Add: 'Hint must never "
        f"expose the back-side definition or formula verbatim or in any "
        f"close paraphrase.'"
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_flashcards_forbids_translation_leak(subject: str) -> None:
    """The mnemonic must not be a translation of the term/definition into
    another language — translation is the answer in disguise."""
    body = _read(subject, "flashcards.md")
    mentions_translation = (
        "translate" in body.lower()
        and ("uzbek" in body.lower() or "russian" in body.lower() or "english" in body.lower() or "language" in body.lower())
    )
    assert mentions_translation, (
        f"{subject}/flashcards.md hint rules don't address the "
        f"translation-leak case (mnemonic = back side translated into "
        f"Uzbek/Russian/English). Add a rule banning translations that "
        f"reveal the definition."
    )


@pytest.mark.parametrize("subject", NON_ENGLISH_SUBJECTS)
def test_flashcards_ships_bad_good_examples(subject: str) -> None:
    """Every subject's flashcards must show BAD/GOOD mnemonic pairs so
    the LLM has a concrete contrast for the rule."""
    body = _read(subject, "flashcards.md")
    assert "BAD" in body and "GOOD" in body, (
        f"{subject}/flashcards.md missing BAD/GOOD mnemonic pair. "
        f"Without a worked contrast, the rule text tends to be ignored."
    )


# ---------------------------------------------------------------------------
# English is the reference (post-PR #102) — these tests should also pass
# for it. Run them as a parity check in case English ever drifts.
# ---------------------------------------------------------------------------


def test_english_remains_protected() -> None:
    """English already passes its own dedicated test suite, but pin the
    same load-bearing markers here so a regression there shows up in
    this parametrized cross-subject view too.
    """
    fc = (PROMPTS_ROOT / "english" / "final-challenge.md").read_text(encoding="utf-8")
    flash = (PROMPTS_ROOT / "english" / "flashcards.md").read_text(encoding="utf-8")
    assert "Anti-leak rules" in fc
    assert "BAD" in fc and "GOOD" in fc
    # English flashcards uses the existing Buzan section; the load-bearing
    # phrase is "never expose the answer" rather than "back-side".
    assert "never expose the answer" in flash
