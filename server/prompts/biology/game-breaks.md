# Prompt: Game Breaks — Biology (Biologiya G5-11)

You are building the Game Breaks (Phase 3) for a Biology homework session. Real practice starts here — the student applies what they learned through gamified repetition.

## Input

- Textbook page + all previous phase outputs
- Grade: G5-11 (Biologiya)
- Mode: Easy → **2 games** | Hard → **3 games**

## Output

2 or 3 games. Each game has 5-8 items. Every item tagged with `[Bloom: LX | PISA: LX]`.

---

## Supported Games Only

Only three games exist in the practice arc. Use these and nothing else:

| Display name | Contract key | How it works |
|---|---|---|
| **Adaptive Quiz** | `adaptive_quiz` | Progressive-difficulty question flow. Each item carries its own `tier`; set `capture: true` on an item that asks the student to photograph written work. |
| **Sentence Fill** | `sentence_fill` | Cloze passage. `___` marks each blank; the student fills every blank from a word bank or from free recall. |
| **Tile Match** | `tile_match` | Left/right concept pairs the student matches on a grade-banded board. |

**Do not reference any game outside this list.** Any unlisted, legacy, or newly
invented game is unsupported: it does not render, and its array is dropped on
import.

### What each game is for in Biology

| Game | Biology use |
|---|---|
| **Adaptive Quiz** | Organism identification, process recall, structure-function reasoning. **Mandatory for Biology.** |
| **Sentence Fill** | Process descriptions with a missing step, reactant, product, or organism. |
| **Tile Match** | Structure ↔ function, organism ↔ classification, process ↔ result, cause ↔ effect, term ↔ diagram description. |

## Game Selection

**Mandatory:** Adaptive Quiz in one slot. No calculation capture anywhere in Biology — Biology has no calculation steps, so always author `capture: false`.

**Easy (2 games):** Adaptive Quiz + pick 1.

**Hard (3 games):** Adaptive Quiz + both of the others.

Pick based on chapter type:
- **Taxonomy/classification chapter** → Tile Match, organism ↔ kingdom/phylum pairs
- **Process chapter** (photosynthesis, digestion, mitosis, respiration) → Sentence Fill, missing step or product in the process
- **Structure chapter** (cell organelles, organ systems, tissue types) → Tile Match, structure ↔ function
- **Mixed chapter** → Tile Match + Sentence Fill, so terminology, classification and process are all covered

Never build two games that test the same item the same way. When a chapter needs both terminology and classification coverage, use ONE Tile Match board and separate the two families with `concept_family` rather than duplicating the game.

---

## Construction per game

### Adaptive Quiz
- 5-8 questions from THIS chapter
- Difficulty scales: first 2 EASY (name recognition), next 2-3 MEDIUM (structure-function), last 1-2 HARD (process reasoning or a classification edge case)
- `capture: false` on every item — Biology does not require calculation steps
- G5-7: MC allowed for all question types
- G8-11: open-ended identification for HARD-tier questions (student types the organism/process name)
- Bloom levels must span L1 (recall) → L3 (application) across the set
- HARD-tier items should sit on a real misconception family (e.g. "mitoz vs meyoz", "hujayra devori vs membrana", "nafas olish vs fotosintez"), not on an obscure fact

### Sentence Fill
- 5-7 items
- `mode`: `word_bank` for G5-G7, `free_recall` for G8-11
- Each `passage` carries 1-3 `___` markers; a process with three linked steps is a good 3-blank passage
- The gap must test biological understanding, not random word removal
- Biology-specific gaps:
  - `"Fotosintez jarayonida o'simlik ___ ni yutadi va ___ ajratadi"` → answers `["CO₂", "O₂"]`
  - `"Mitoz natijasida ___ ta qiz hujayra hosil bo'ladi"` → answers `["2"]`
  - `"Xloroplastdagi yashil pigment ___ deb ataladi"` → answers `["xlorofill"]`
  - `"Odam teri epiteliysi ___ to'qima turiga kiradi"` → answers `["epiteliy"]`
  - `"Zamburug'lar ___ yo'l bilan oziqlanadi"` → answers `["heterotrof"]`
- In `word_bank` mode the bank must hold every answer plus at least one distractor, and the distractor should be the misconception partner (`"O₂"` against `"CO₂"`, `"meyoz"` against `"mitoz"`), never a random word

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
- If a structure needs a diagram to be recognisable, put a small inline SVG (under 200×150px) on that side of the pair
- Every `left` and every `right` must be unique across the board

---

## Rules

- Every item tagged: `[Bloom: LX | PISA: LX]`
- `capture` is always `false` in Biology — no calculations, so nothing to photograph
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
  "adaptive_quiz": [
    {
      "q": "string",
      "tags": "[Bloom: LX | PISA: LX]",
      "tier": "EASY|MEDIUM|HARD",
      "ans": ["string"],
      "capture": false
    }
  ],
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
