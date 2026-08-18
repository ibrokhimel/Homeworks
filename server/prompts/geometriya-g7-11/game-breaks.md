# Prompt: Game Breaks — Geometry

You are building the Game Breaks (Phase 3) for a Geometry homework session. This is where real practice starts. The student applies what they learned in Preview through gamified repetition.

## Input

- Textbook page (image or text)
- Preview + Flash Cards + Sprint outputs (from previous steps)
- Grade: G7-9 (Geometriya)
- Mode: Easy | Hard

## Output

Both games, every session: Tile Match + Sentence Fill.

Mode changes the load, not the game count:
- **Easy** — Tile Match at its grade-banded board size, Sentence Fill 5-6 items, mostly 1-blank passages.
- **Hard** — Tile Match at its grade-banded board size, Sentence Fill 7-8 items, including at least one 4-6 blank proof passage.

Every item tagged with `[Bloom: LX | PISA: LX]`.

> **SVG Rule:** Every diagram in every game must be actual SVG code — not a bracket description alone. Use `instruction.md` → SVG Output Rule for templates, color hex codes, and mark syntax. Every question involving a shape references a diagram.

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

### What each game is for in Geometry

| Game | Geometry use |
|---|---|
| **Tile Match** | Theorem name ↔ diagram, angle type ↔ degree range, congruence criterion ↔ marked figure, notation ↔ diagram, mark ↔ meaning, property clue ↔ shape or theorem. |
| **Sentence Fill** | Missing reason in a proof step, missing condition in a theorem, missing value in an angle chain. Carries the ordered proof and construction work. |

## What goes in which game

Both games always appear, so the decision is what each one carries:
- **Theorem chapter** → Tile Match is theorem name ↔ fully marked diagram; Sentence Fill asks for the missing condition
- **Proof chapter** → Sentence Fill carries the proof as an ordered multi-blank passage; Tile Match carries mark ↔ meaning so the student can read the figure at all
- **Angle/measurement chapter** → Sentence Fill carries the angle chain as ordered blanks; Tile Match is angle type ↔ degree range
- **Review chapter covering several theorems** (§4, §7, §13, §17, §22, §24, §26) → give the Tile Match board one `concept_family` per theorem, so identifying which theorem a marked figure belongs to is the task

Never test the same item the same way in both games. If a theorem is a Tile Match pair, Sentence Fill should require citing it in a step, not naming it again.

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

- Left tile = theorem name, angle type, congruence criterion, notation, or a property clue. Right tile = the labeled diagram.
- Every right tile must be a diagram using Visual Layer notation — no text-only pairs.
- Pair types:
  - Theorem name ↔ diagram: `"SAS belgisi"` ↔ `[Diagram: triangles ABC and DEF, one tick on AB=DE (blue), one tick on BC=EF (blue), single arc at ∠B=∠E (blue)]`
  - Angle type ↔ diagram: `"O'tmas burchak"` ↔ `[Diagram: rays BA and BC, wide arc inside showing angle > 90°, label "90° < α < 180°"]`
  - Notation ↔ diagram: `"AB ∥ CD"` ↔ `[Diagram: two horizontal lines with single arrows, gap between them, symbol ∥ labeled]`
  - Mark ↔ meaning: `[Diagram: single tick mark on segment]` ↔ `"Bu tomon boshqa bir tomon bilan teng"`
  - Property clue ↔ shape or theorem: `"Ikki tomoni teng, asos burchaklari teng"` ↔ `[Diagram: isosceles triangle with two ticks and two equal base arcs]`
- Difficulty ladder: `easy` name ↔ symbol → `medium` theorem ↔ fully marked diagram → `hard` criterion ↔ real-scenario diagram with partial marks, where the student must work out which criterion fits.
- **Include at least 1 pair whose diagram carries a deliberate wrong mark** so it does not match anything on the board — the student must identify it as a non-match. This builds error-detection instinct and is the strongest single rule in this file. Put the reason in that pair's `explanation`.
- Group the board with `concept_family` — one family per theorem or per figure type.
- Keep each side within 300 characters; a long Visual Layer description must be trimmed to its load-bearing marks.
- Every `left` and every `right` must be unique across the board.

### Sentence Fill
- Easy 5-6 items, Hard 7-8 items
- `mode`: `word_bank` for G7, `free_recall` for G8-9
- Proof step, theorem statement, or angle chain with one piece missing per `___`
- The gap must test geometric understanding — not random word removal
- Single-blank items:
  - `"∠ABC va ∠BCD — ___ burchaklar (AB ∥ CD bo'lganda)"` → answers `["almashma ichki"]`
  - `"△ABC = △DEF, chunki AB=DE, ∠B=∠E, BC=EF → ___ belgisi asosida"` → answers `["SAS"]`
  - `"Uchburchak ichki burchaklari yig'indisi ___ ga teng"` → answers `["180°"]`
- **Ordered proof passages carry the step-by-step work.** A proof or construction of 4-6 steps becomes ONE passage with 4-6 `___` markers, and `answers` must be in step order so the student reconstructs the argument in sequence — each blank only answerable once the previous one is settled. This is where the linear solve-stepper pedagogy now lives.
  - `"ABC — to'g'ri burchakli uchburchak, ∠C = ___°. Barcha burchaklar yig'indisi ___°. Demak ∠A + ∠B = ___°. ∠A = 30° bo'lsa, ∠B = ___°."` → answers `["90", "180", "90", "60"]`
- Every step that references a figure must include its Visual Layer diagram in the passage; the runtime renders inline SVG when present.
- In `word_bank` mode the distractor is the confusable criterion or the wrong angle relation (`"SSS"` against `"SAS"`, `"mos"` against `"almashma ichki"`), never a random word.
- Use `explanations` to name the theorem being applied at that blank — this is where "cite the theorem at every step" survives.

---

## Rules

- Every question involving a shape references a diagram, and every diagram is real SVG
- Every item tagged: `[Bloom: LX | PISA: LX]`
- Do not reference any game outside the Supported Games table
- Current chapter content only — no questions from other chapters
- Language: Uzbek, "Siz" formal
- Diagram labelling standard, applied to every diagram you author: label all vertices (A, B, C), all sides (AB, BC, CA) and all angles (∠A, ∠B, ∠C); mark equal sides with tick marks, equal angles with arc marks, right angles with a square corner; blue for given, orange for found or proved
- Name the theorem at the step where it is used — in the Sentence Fill `explanations` array, or in the Tile Match pair's `explanation`

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
