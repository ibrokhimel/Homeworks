# Prompt: Game Breaks — Physics

You are building the Game Breaks (Phase 3) for a Physics homework session. Real practice starts here — the student applies what they learned through gamified repetition.

## Input

- Textbook page + all previous phase outputs
- Grade: G7-11 (Fizika)
- Mode: Easy | Hard

## Output

Both games, every session: Tile Match + Sentence Fill.

Mode changes the load, not the game count:
- **Easy** — Tile Match at its grade-banded board size, Sentence Fill 5-6 items, mostly 1-blank passages.
- **Hard** — Tile Match at its grade-banded board size, Sentence Fill 7-8 items, with 2-4 blank passages carrying derivations and unit conversions.

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

### What each game is for in Physics

| Game | Physics use |
|---|---|
| **Tile Match** | Formula ↔ law name, quantity ↔ unit, symbol ↔ quantity, diagram ↔ concept, cause ↔ effect, term ↔ definition. |
| **Sentence Fill** | Missing variable in a formula, missing unit, missing step in a derivation. Carries the formula-application and unit-conversion work that used to live in a quiz. |

## What goes in which game

Both games always appear, so the decision is what each one carries:
- **Formula-heavy chapter** → Sentence Fill removes the variable in use (`F = m × ___`); Tile Match carries formula ↔ law name
- **Terminology chapter** → Tile Match is term ↔ definition and symbol ↔ quantity; Sentence Fill puts the term into a physical statement
- **Multi-concept chapter** → Tile Match links formula ↔ quantity ↔ unit across `concept_family` groups; Sentence Fill carries the derivation
- **Measurement chapter** → Sentence Fill carries unit conversion as ordered multi-blank passages

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

- Physics pair types:
  - Formula ↔ law name: `"F = ma"` ↔ `"Nyuton 2-qonuni"`
  - Quantity ↔ unit: `"Kuch"` ↔ `"N (Nyuton)"`
  - Symbol ↔ quantity: `"F"` ↔ `"Kuch"`, `"m"` ↔ `"Massa"`, `"a"` ↔ `"Tezlanish"`
  - Diagram ↔ concept: `[Circuit with resistor]` ↔ `"Om qonuni"`
  - Cause ↔ effect: `"Harorat oshadi"` ↔ `"Jism kengayadi"`
- Group the board with `concept_family` — one family per law or per quantity group, so symbol, quantity and unit for the same concept sit together
- Difficulty ladder across the board: `easy` symbol ↔ quantity → `medium` formula ↔ law name → `hard` diagram ↔ concept, where the pair only resolves if the student reads the physical situation
- Every `left` and every `right` must be unique across the board — `"Kuch"` cannot be the right side of two pairs, so pick one canonical phrasing per quantity

### Sentence Fill
- Easy 5-6 items, Hard 7-8 items
- `mode`: `word_bank` for G7, `free_recall` for G8-11
- Show a formula, law statement, or derivation step with one piece missing per `___`; 1-4 blanks per passage
- The gap must test physical understanding — not random word removal
- **Units are part of the answer.** Where the blank is a quantity, the expected answer carries its unit, and where the blank IS the unit, say so in the passage.
- A derivation is a multi-blank passage, and the blanks must be in derivation order:
  - `"F = m × ___"` → answers `["a"]`
  - `"Kuchning birligi — ___"` → answers `["Nyuton"]`
  - `"Om qonuni: I = U / ___"` → answers `["R"]`
  - `"Ish = Kuch × ___"` → answers `["ko'chirish"]`
  - `"Tezlanish a = (v − v₀) / ___, uning birligi ___"` → answers `["t", "m/s²"]`
- In `word_bank` mode the distractor is the confusable quantity or the wrong unit for the right quantity (`"J"` against `"N"`, `"massa"` against `"og'irlik"`), never a random symbol
- Use `explanations` to name the confusion the distractor represents

---

## Rules

- Every item tagged: `[Bloom: LX | PISA: LX]`
- All answers must carry proper physics units
- Do not reference any game outside the Supported Games table
- Current chapter content only
- Language: Uzbek, "Siz" formal
- Visuals: if a game item needs a diagram (circuit, force vector, graph), generate inline SVG. Keep simple — under 200×150px.

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
- `tile_match.subject_family` is always `"physics"` in this file.
