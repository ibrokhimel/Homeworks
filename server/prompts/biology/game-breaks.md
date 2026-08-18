# Prompt: Game Breaks — Biology (Biologiya G5-11)

You are building the Game Breaks (Phase 3) for a Biology homework session. Real practice starts here — the student applies what they learned through gamified repetition.

## Input

- Textbook page + all previous phase outputs
- Grade: G5-11 (Biologiya)
- Mode: Easy | Hard

## Output

Both games, every session: Tile Match + Sentence Fill.

Mode changes the load, not the game count:
- **Easy** — Tile Match at its grade-banded board size, Sentence Fill 5-6 items, mostly 1-blank passages.
- **Hard** — Tile Match at its grade-banded board size, Sentence Fill 7-8 items, with 2-3 blank passages carrying the multi-step processes.

Every item tagged with `[Bloom: LX | PISA: LX]`. Bloom levels must span L1 (recall) → L3 (application) across the whole phase.

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

### What each game is for in Biology

| Game | Biology use |
|---|---|
| **Tile Match** | Structure ↔ function, organism ↔ classification, process ↔ result, cause ↔ effect, term ↔ diagram description. |
| **Sentence Fill** | Process descriptions with a missing step, reactant, product, or organism. Also carries the identification and structure-function recall that used to sit in a quiz. |

## What goes in which game

Both games always appear, so the decision is what each one carries:

- **Taxonomy/classification chapter** → the Tile Match board is organism ↔ kingdom/phylum; Sentence Fill checks the defining trait of each group
- **Process chapter** (photosynthesis, digestion, mitosis, respiration) → Sentence Fill carries the process as multi-blank passages; Tile Match carries process ↔ result
- **Structure chapter** (cell organelles, organ systems, tissue types) → Tile Match is structure ↔ function; Sentence Fill checks where each structure sits in the larger system
- **Mixed chapter** → split the Tile Match board into two `concept_family` groups and let Sentence Fill cover the process arc

Never test the same item the same way in both games. If a term is a Tile Match pair, Sentence Fill should ask what it *does*, not what it *is*.

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

- Biology pair types:
  - Structure ↔ function: `"Mitoxondriya"` ↔ `"ATP ishlab chiqaradi"`
  - Organism ↔ classification: `"Amyoba"` ↔ `"Sarcodina tipi"`
  - Process ↔ result: `"Fotosintez"` ↔ `"O₂ va glukoza hosil bo'ladi"`
  - Cause ↔ effect: `"Xlorofill quyosh nurini yutadi"` ↔ `"Fotosintez boshlanadi"`
  - Term ↔ diagram description: `"Yadro"` ↔ `"Dumaloq, membranali, DNAni saqlaydi"`
- Group pairs that belong to one misconception family under a shared `concept_family` (e.g. `"hujayra organoidlari"`, `"to'qima turlari"`) so the board reads as a branch, not a list
- Difficulty ladder across the board: `easy` name ↔ definition → `medium` structure ↔ function → `hard` organism ↔ classification edge case, where the pair only resolves if the student knows the defining trait
- If a structure needs a diagram to be recognisable, put a small inline SVG (under 200×150px) on that side of the pair
- Every `left` and every `right` must be unique across the board

### Sentence Fill
- Easy 5-6 items, Hard 7-8 items
- `mode`: `word_bank` for G5-G7, `free_recall` for G8-11
- Each `passage` carries 1-3 `___` markers; a process with three linked steps is a good 3-blank passage
- The gap must test biological understanding, not random word removal
- G5-7 stay at recognition and single-step recall; G8-11 carry the process-reasoning and classification-edge-case load that the harder items used to hold, as multi-blank passages the student must reason through in order
- Biology-specific gaps:
  - `"Fotosintez jarayonida o'simlik ___ ni yutadi va ___ ajratadi"` → answers `["CO₂", "O₂"]`
  - `"Mitoz natijasida ___ ta qiz hujayra hosil bo'ladi"` → answers `["2"]`
  - `"Xloroplastdagi yashil pigment ___ deb ataladi"` → answers `["xlorofill"]`
  - `"Odam teri epiteliysi ___ to'qima turiga kiradi"` → answers `["epiteliy"]`
  - `"Zamburug'lar ___ yo'l bilan oziqlanadi"` → answers `["heterotrof"]`
- In `word_bank` mode the bank must hold every answer plus at least one distractor, and the distractor should be the misconception partner (`"O₂"` against `"CO₂"`, `"meyoz"` against `"mitoz"`), never a random word
- Use `explanations` to name the misconception the distractor represents — this is where the "why the other one is wrong" teaching lives

---

## Rules

- Every item tagged: `[Bloom: LX | PISA: LX]`
- Biology has no calculations, so nothing in this phase asks the student to photograph written work
- Do not reference any game outside the Supported Games table
- Current chapter content only
- Language: Uzbek, "Siz" formal
- Visuals: if a game item references a structure or organism that students identify visually (cell organelle, leaf cross-section, organism diagram), generate an inline SVG. Keep simple — under 200×150px.

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
- `tile_match.subject_family` is always `"biology"` in this file.
