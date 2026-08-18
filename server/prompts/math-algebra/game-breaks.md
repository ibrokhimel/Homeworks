# Prompt: Game Breaks — Math + Algebra

You are building the Game Breaks (Phase 3) for a Math/Algebra homework session. This is where real practice starts. The student applies what they learned in Preview through gamified repetition.

## Input

- Textbook page (image or text)
- Preview + Flash Cards + Sprint outputs (from previous steps)
- Grade: G5-6 (Matematika) or G7-9 (Algebra)
- Mode: Easy | Hard

## Output

Both games, every session: Tile Match + Sentence Fill.

Mode changes the load, not the game count:
- **Easy** — Tile Match at its grade-banded board size, Sentence Fill 5-6 items, mostly 1-blank passages.
- **Hard** — Tile Match at its grade-banded board size, Sentence Fill 7-8 items, with 2-4 blank passages carrying multi-step procedures.

Every item tagged with `[Bloom: LX | PISA: LX]`.

---

## Supported Games Only

Only two games exist in the practice arc. Use these and nothing else:

| Display name | Contract key | How it works |
|---|---|---|
| **Sentence Fill** | `sentence_fill` | Cloze passage. `___` marks each blank; the student fills every blank from a word bank or from free recall. |
| **Tile Match** | `tile_match` | Left/right concept pairs the student matches on a grade-banded board. |

**Do not reference any game outside this list.** Any unlisted, legacy, or newly
invented game is unsupported: it does not render, and its array is dropped on
import. This includes Adaptive Quiz — it is no longer offered, so never author
an `adaptive_quiz` array and never name it to the student.

**Both games run in every session.** There is no third slot to fill and no game
to choose between; Easy and Hard differ by item count and difficulty mix, not by
how many games appear. Do not invent a game to pad the arc.

### What each game is for in Math/Algebra

| Game | Math use |
|---|---|
| **Tile Match** | Formula ↔ visual, expression ↔ simplified form, term ↔ definition, formula ↔ name, number ↔ representation, equation ↔ graph, step ↔ justification. |
| **Sentence Fill** | Missing operation, missing step, missing term in a procedure. Carries the multi-step solving work that used to live in a quiz. |

## What goes in which game

Both games always appear, so the decision is what each one carries:
- **Procedural chapter** (solving methods) → Sentence Fill carries the procedure as an ordered multi-blank passage; Tile Match carries step ↔ justification
- **Vocabulary-heavy chapter** (new terms) → Tile Match is term ↔ definition; Sentence Fill puts the term back into a worked line
- **Formula-heavy chapter** → Tile Match is formula ↔ visual; Sentence Fill removes one variable or one operator from the formula in use
- **Mixed chapter** → split the Tile Match board into two `concept_family` groups and let Sentence Fill carry the procedure

Never test the same item the same way in both games. If a formula is a Tile Match pair, Sentence Fill should require applying it, not restating it.

---

## Construction per game

### Tile Match
**Board size by grade** — the builder recommends by grade, and 8 is a hard cap:

| Grade | Pairs |
|---|---|
| G1-G2 | 4 |
| G3-G4 | 5 |
| G5-G7 | 6 |
| G8 and above | 8 |

Never author more than 8 pairs at any grade; a 9th pair is rejected.

- Left tile: formula, expression, or term
- Right tile: visual, simplified form, definition, or equivalent
- G5-6: fraction ↔ visual, formula ↔ bar model, number ↔ word form, formula ↔ name
- G7-9: expression ↔ equivalent, equation ↔ graph, step ↔ justification, identity pairs, function ↔ graph
- Group the board with `concept_family` — one family per method or per formula group
- Difficulty ladder across the board: `easy` term ↔ definition → `medium` expression ↔ equivalent → `hard` step ↔ justification, where the pair only resolves if the student knows WHY the step is legal
- Every `left` and every `right` must be unique across the board

### Sentence Fill
- Easy 5-6 items, Hard 7-8 items
- `mode`: `word_bank` for G5-G7, `free_recall` for G8-9
- Show a procedure or formula with one piece missing per `___`; 1-4 blanks per passage
- The gap must test mathematical understanding — not random word removal
- A multi-step solve is a multi-blank passage, and the blanks must be in solve order so the student reconstructs the method:
  - G5-6: `"43 × 20 = 43 × ___ × 10"` → answers `["2"]`
  - G7-9: `"2x + 4 = 10 → 2x = 10 ___ 4 → x = ___"` → answers `["−", "3"]`
- G5-6 stay at single-step recall; G7-9 carry the multi-step reasoning load as `free_recall` passages with no bank to lean on
- In `word_bank` mode the distractor is the sign error or the inverse operation the student is actually likely to make (`"+"` against `"−"`, `"×"` against `"÷"`), never a random symbol
- Use `explanations` to name the error the distractor represents

---

## Rules

- Every item tagged: `[Bloom: LX | PISA: LX]`
- Do not reference any game outside the Supported Games table
- Current chapter content only
- Language: Uzbek, "Siz" formal
- Visuals: if a game item needs a diagram (graph, shape, equation visual), generate inline SVG. Keep simple — under 200×150px.

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
- `tile_match.subject_family` is always `"math"` in this file.
