# Prompt: Game Breaks — History (O'zbekiston Tarixi + Jahon Tarixi)

You are building the Game Breaks (Phase 3) for a History homework session. This is where real practice happens. The student has just warmed up with Memory Sprint; now they apply what was learned in Preview through the 2 sequenced games.

Phase 3 is the **heaviest graded component** — **50%** of the History Hard session score.

## Input

- Textbook lesson content (extracted in orchestrator Step 1)
- Preview output + Flash Cards output + Sprint output
- Grade: G5–G11
- Subject: `O'zbekiston Tarixi` or `Jahon Tarixi`

## Output

**2 games in sequence:** Game 1 Tile Match (⭐ Von Restorff Anchor) → Game 2 Sentence Fill.

**~14–16 items total:** 6–8 tile pairs + 7–8 cloze passages. This is down from the old ~20 because the third game no longer exists. Do not pad to reach 20 and do not invent a game to hold the difference.

**Difficulty distribution across all items:** ~40% Easy / ~40% Medium / ~20% Hard (tolerance ±5%).

Every item carries an inline tag: `[Bloom: LX | PISA: Reading/Creative Thinking LX | Skill: ... | Standard: UZ-TARIX-G-TOPIC-G##-##]`.

---

## Supported Games Only

Only two games exist in the practice arc. Use these and nothing else:

| Display name | Contract key | How it works |
|---|---|---|
| **Sentence Fill** | `sentence_fill` | Cloze passage. `___` marks each blank; the student fills every blank from a word bank or from free recall. |
| **Tile Match** | `tile_match` | Left/right concept pairs the student matches on a grade-banded board. |

**Do not reference any game outside this list.** Any unlisted, legacy, or newly
invented game is unsupported: it does not render, and its array is dropped on
import.

**Both games run in every session.** There is no third slot to fill and no game
to choose between; Easy and Hard differ by item count and difficulty mix, not by
how many games appear. Do not invent a game to pad the arc.

### What each game is for in History

| Game | History use |
|---|---|
| **Tile Match** | cause ↔ effect, date ↔ event, figure ↔ achievement, figure ↔ role, place ↔ event. |
| **Sentence Fill** | historical term gaps, source-quote fills, contextual retrieval of lesson vocabulary. |

## Game sequence

- **Game 1 — Tile Match (⭐ Von Restorff Anchor).** Cause ↔ effect or figure ↔ achievement pairings that span the lesson's full arc. This is now where the anchor lives.
- **Game 2 — Sentence Fill.** Contextual retrieval of lesson terms or source quotes.

Modalities: Verbal/Logical (Tile) → Verbal/Logical (Sentence). With one game gone, the visual/spatial modality is no longer separately available; recover it inside Tile Match by writing at least two pairs whose right side is a concrete visual description (a map boundary, a monument, a battle formation) rather than an abstract phrase.

---

## Construction per game

### Game 1 — Tile Match (Von Restorff Anchor)
**Board size by grade** — the builder recommends by grade, and 8 is a hard cap:

| Grade | Pairs |
|---|---|
| G1-G2 | 4 |
| G3-G4 | 5 |
| G5-G7 | 6 |
| G8 and above | 8 |

Never author more than 8 pairs at any grade; a 9th pair is rejected.

- 6–8 pairs; at G5–G7 the band gives 6, at G8+ it gives 8. 8 is a hard cap.
- Left column: causes / dates / figures.
- Right column: effects / events / achievements.
- Preferred pair type for History: **cause ↔ effect** — it matches the family goal of causal reasoning over date memorization.
- Pairs should **trace the lesson's full causal arc** from opening event to closing consequence.
- **⭐ Von Restorff requirement:** exactly one pair carries an **outstanding fact** — unexpected scale, surprising consequence, vivid detail. Tag it `⭐ Von Restorff` in that pair's `explanation` field. This pair is the cognitive anchor students remember most, and it is the `hard` item on the board. Never mark it `easy` or `medium`.
- Group the board with `concept_family` — one family per strand of the lesson's causal arc.
- Difficulty mix within this game: ~3 Easy + ~3 Medium + 1 Hard (the anchor).
- Every `left` and every `right` must be unique across the board.

### Game 2 — Sentence Fill

- **7–8 items** (8 for a Hard session, 7 when the lesson is thin).
- `mode`: `word_bank` for G5–G7, `free_recall` for G8+.
- Show a sentence from the lesson (or paraphrased) with ONE word or short phrase missing per `___`. 1–3 blanks per passage; use a 3-blank passage to make the student reconstruct a sequence of events in order.
- The gap must test **historical understanding** — not random word removal.
- Two sub-types:
  - **Concept/term fill** — e.g. `"Bu maʼmuriy birliklar ___ deb nomlandi."` → answers `["tuman"]`
  - **Source-quote fill** — pulled from a primary source the lesson cites. E.g. `"Namoz ___ uchunmi yoki Tarmashirin uchunmi?"` → answers `["Xudo"]`
- **Include ≥1 source-quote fill** if the lesson contains a primary source (Panel 3 content).
- In `word_bank` mode the distractor is the plausible rival — the other date, the other figure, the other administrative term — never a random word.
- Use `explanations` to state what makes the distractor historically wrong.
- Difficulty mix: ~3 Easy + ~3 Medium + ~2 Hard.

---

## Rules

- **Exactly 2 games** in the order Tile Match → Sentence Fill.
- **Every item tagged** with Bloom / PISA / Skill / Standard. Game-level defaults are acceptable; per-item overrides when difficulty differs.
- **Von Restorff anchor on the Tile Match board** — always. Tag the outstanding pair explicitly and give it `difficulty: "hard"`.
- **Textbook fidelity** — every pair and every sentence-fill from the source lesson.
- **Current chapter only** — no cross-chapter content.
- **No calculation in History** — nothing in this phase asks the student to photograph written work.
- **Do not reference any game outside the Supported Games table.**
- **Difficulty target:** 40/40/20 across all items in the 2 games (tolerance ±5%). Within any single game, do NOT load more than ~20% Hard items.
- **PISA tag MUST include L level.** Write `Reading L1`, `Reading L2`, `Creative Thinking L2`, etc. Never just `Reading` alone.
- **Language:** Uzbek, `Siz` when addressing student. Never `sen`.
- **Weight:** Phase 3 = 50% of session score (heaviest graded component).

---

## OUTPUT REQUIREMENT

Return valid JSON matching this exact schema. **Omit optional game arrays only
when that game is not selected** — never emit an empty array, and never emit a
key for a game you did not build.

```json
{
  "sentence_fill": [
    {
      "id": "sf_001",
      "mode": "word_bank|free_recall",
      "passage": "Text with ___ marking each blank.",
      "answers": ["one entry per ___, in blank order"],
      "word_bank": ["every answer", "plus at least one distractor"],
      "explanations": ["one per answer, or omit the key"],
      "tags": "[Bloom: LX | PISA: LX]",
      "difficulty": "easy|medium|hard",
      "pisa_level": "L1|L2|L3|L4|L5"
    }
  ],
  "tile_match": [
    {
      "id": "tm_001",
      "left": "concept side, 300 chars max",
      "right": "definition side, 300 chars max",
      "concept_family": "grouping label",
      "subject_family": "math|biology|history|literature|physics|chemistry|language|geography|general",
      "difficulty": "easy|medium|hard",
      "pisa_level": "L1|L2|L3|L4|L5|L6"
    }
  ]
}
```

The server validates every one of these (`server/schemas/content.py`):

- `sentence_fill.passage` must contain 1-6 `___` markers. `answers` length must equal the marker count, in blank order.
- `sentence_fill.mode` is `word_bank` (G2-G7) or `free_recall` (G8+). When `word_bank`, the `word_bank` key is required, must contain every answer, and must carry at least one extra distractor.
- `sentence_fill.explanations`, when present, must be exactly as long as `answers`.
- `tile_match` holds 0-8 pairs. `left` and `right` must each be non-empty and 300 characters or fewer.
- Every `tile_match.id` is unique, every `left` is unique, and every `right` is unique — a repeated side breaks the distractor logic and the whole board is rejected.
- `tile_match.subject_family` is always `"history"` in this file.
