"""Tests for the English prompt upgrade (PR: english-prompts-upgrade).

Verifies that the 3 primary rewrites (flashcards, memory-sprint, reading) contain
all the structural patterns required by the spec.
"""
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "server" / "prompts" / "english"


def _read(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# flashcards.md — Two-Mode + Three-Cluster + Mnemonic Taxonomy
# ---------------------------------------------------------------------------


def test_flashcards_mode_a_and_mode_b_sections():
    """flashcards.md must define Mode A and Mode B card types."""
    text = _read("flashcards.md")
    assert "Mode A" in text, "flashcards.md must contain 'Mode A'"
    assert "Mode B" in text, "flashcards.md must contain 'Mode B'"


def test_flashcards_mode_b_ratio_rule():
    """flashcards.md must state a Mode B minimum ratio rule of ≥30%."""
    text = _read("flashcards.md")
    # Accept either "≥ 30%" or "30%" or "at least 30%"
    has_ratio = ("30%" in text) or ("≥ 30%" in text) or ("at least 30%" in text)
    assert has_ratio, (
        "flashcards.md must contain a Mode B ratio rule (30% or ≥ 30% or at least 30%)"
    )


def test_flashcards_three_clusters_present():
    """flashcards.md must define VOCABULARY, GRAMMAR (PATTERNS), and TRAPS clusters."""
    text = _read("flashcards.md")
    assert "VOCABULARY" in text, "flashcards.md must contain 'VOCABULARY' cluster"
    assert "GRAMMAR" in text, "flashcards.md must contain 'GRAMMAR' cluster"
    assert "TRAPS" in text, "flashcards.md must contain 'TRAPS' cluster"


def test_flashcards_buzan_mnemonic_taxonomy_five_techniques():
    """flashcards.md must name all 5 Buzan mnemonic techniques.

    PR #103 originally defined a 5-type English mnemonic taxonomy
    (Stress-dot / Cognate / Contrast pair / Word-family / Sentence diagram).
    During the #102+#103 rebase, that taxonomy was replaced by #102's Buzan
    system (Link/Peg/Major/Substitute/MIG) — the user's preferred framework.
    This test was updated to verify the Buzan techniques instead.
    """
    text = _read("flashcards.md")
    buzan_techniques = [
        "Link / Story",
        "Peg / Number",
        "Major system",
        "Substitute word",
        "MIG",
    ]
    for name in buzan_techniques:
        assert name in text, f"flashcards.md must contain Buzan technique: {name!r}"


# flashcards.md — KEEP from PR #93 (must not regress)


def test_flashcards_no_answer_leak_hint_rules_preserved():
    """flashcards.md must still contain all 5 no-answer-leak hint rules from PR #93."""
    text = _read("flashcards.md")
    required = [
        "Hint must never expose the answer",
        "Hint cannot repeat the target term",
        "Hint cannot include the exact definition",
        "Hint cannot translate the target into Uzbek",
        "Hint cannot give a sentence where the target word is the obvious missing answer",
    ]
    for phrase in required:
        assert phrase in text, f"flashcards.md must contain hint rule: {phrase!r}"


def test_flashcards_textbook_fidelity_preserved():
    """flashcards.md must still contain textbook-fidelity hard constraint from PR #93."""
    text = _read("flashcards.md")
    required = [
        "Textbook fidelity",
        "No invented examples",
        "No dictionary padding",
        "No out-of-topic facts",
    ]
    for phrase in required:
        assert phrase in text, f"flashcards.md must contain textbook fidelity rule: {phrase!r}"


def test_flashcards_honest_media_rules_preserved():
    """flashcards.md must still contain honest/concept-related media rules from PR #93."""
    text = _read("flashcards.md")
    required = [
        "concept-related visual",
        "inline SVG",
        "200",  # 200×150 size guidance
        "No decorative, generic, stock-like, or out-of-topic media",
        "omit `media`",
    ]
    for phrase in required:
        assert phrase in text, f"flashcards.md must contain media rule: {phrase!r}"


# ---------------------------------------------------------------------------
# memory-sprint.md — Current-Unit-Only + Hint No-Leak
# ---------------------------------------------------------------------------


def test_memory_sprint_current_unit_constraint():
    """memory-sprint.md must state the current-unit-only constraint."""
    text = _read("memory-sprint.md")
    has_current_unit = (
        "current unit" in text.lower()
        or "this unit" in text.lower()
        or "Current unit" in text
        or "THIS unit" in text
    )
    assert has_current_unit, (
        "memory-sprint.md must contain 'current unit' or 'this unit' "
        "(current-unit-only hard constraint)"
    )


def test_memory_sprint_no_hint_leak_block():
    """memory-sprint.md must contain an explicit hint no-leak block."""
    text = _read("memory-sprint.md")
    # The prompt must mention hint leak prohibition explicitly
    assert "Hint must never expose the answer" in text, (
        "memory-sprint.md must contain 'Hint must never expose the answer' "
        "(hint no-leak block)"
    )


def test_memory_sprint_do_not_pull_past_unit():
    """memory-sprint.md must explicitly forbid pulling from prior units."""
    text = _read("memory-sprint.md")
    has_prohibition = (
        "Do NOT pull" in text
        or "Do not pull" in text
        or "No items from other chapters" in text
        or "not from other chapters" in text.lower()
        or "prior unit" in text.lower()
    )
    assert has_prohibition, (
        "memory-sprint.md must contain a prohibition on pulling "
        "past-unit or off-chapter content"
    )


def test_memory_sprint_schema_has_hint_field():
    """memory-sprint.md output schema must include a hint field.

    PR #102 deliberately adds gated on-demand hints — the hint is present in the
    schema but revealed only when the student requests it. PR #103 originally
    omitted this field; this assertion was flipped during the #102+#103 rebase
    to keep #102's gated-hint design as the canonical approach.
    """
    text = _read("memory-sprint.md")
    import re

    # Extract the JSON block from the OUTPUT REQUIREMENT section
    match = re.search(r"```json\s*(\[.*?\])\s*```", text, re.DOTALL)
    assert match, "memory-sprint.md must have a JSON schema block in OUTPUT REQUIREMENT"
    schema_str = match.group(1)
    # The schema object must contain "hint" (gated on-demand, per #102 design)
    assert '"hint"' in schema_str, (
        "memory-sprint.md output schema must include a 'hint' field — "
        "sprint items carry gated hints that guide without exposing the answer (#102 design)"
    )


# ---------------------------------------------------------------------------
# reading.md — Required context-picture media field
# ---------------------------------------------------------------------------


def test_reading_output_schema_has_media_field():
    """reading.md output schema must include a top-level media field."""
    text = _read("reading.md")
    import re

    # Find the JSON block in OUTPUT REQUIREMENT
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    assert match, "reading.md must have a JSON schema block in OUTPUT REQUIREMENT"
    schema_str = match.group(1)
    assert '"media"' in schema_str, (
        "reading.md output schema must include a 'media' field for the context picture"
    )


def test_reading_media_illustrates_passage_or_scene():
    """reading.md must require the media to illustrate the passage/scene/context."""
    text = _read("reading.md")
    has_scene_requirement = (
        "passage" in text.lower() and (
            "scene" in text.lower()
            or "context" in text.lower()
            or "illustrate" in text.lower()
        )
    )
    assert has_scene_requirement, (
        "reading.md must require the media SVG to illustrate the "
        "passage's main scene or context (not decorative)"
    )


def test_reading_media_must_not_be_decorative():
    """reading.md must explicitly forbid decorative/stock/generic media."""
    text = _read("reading.md")
    assert "decorative" in text.lower(), (
        "reading.md must contain an explicit prohibition on decorative media"
    )
