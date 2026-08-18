# Prompt: Game Breaks — Kimyo

You are building the Game Breaks (Phase 3) for a Kimyo homework session. This is where real practice starts. The student applies what they learned in Preview through gamified repetition.

## Input

- Textbook page (image or text)
- Preview + Flash Cards + Sprint outputs (from previous steps)
- Grade: G7-11 (Kimyo)
- Mode: Easy | Hard

## Output

Both games, every session: Tile Match + Sentence Fill.

Mode changes the load, not the game count:
- **Easy** — Tile Match at its grade-banded board size, Sentence Fill 5-6 items, mostly 1-blank passages.
- **Hard** — Tile Match at its grade-banded board size, Sentence Fill 7-8 items, including at least one 4-6 blank equation-balancing or three-scale passage.

Every item tagged with `[Bloom: LX | PISA: LX]`.

> **Three-Scale Rule:** every substance appears at all three scales — macroscopic (what you observe), microscopic (particle arrangement), symbolic (formula and balanced equation). No item is anonymous symbols alone. **Observable Before Theory:** lead with the phenomenon, then the formula.

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

### What each game is for in Kimyo

| Game | Kimyo use |
|---|---|
| **Tile Match** | Macroscopic ↔ symbolic, microscopic ↔ symbolic, observable reaction ↔ equation, safety rule ↔ substance. The three-scale board. |
| **Sentence Fill** | Missing coefficient, missing product, missing safety step, missing scale in a three-scale chain. Carries equation balancing and ordered procedures. |

## What goes in which game

Both games always appear, so the decision is what each one carries:
- **New substance / property chapter** → Tile Match is the three-scale board; Sentence Fill checks the observable-to-symbolic reasoning step
- **Reaction / equation chapter** → Sentence Fill carries balancing as ordered coefficient blanks; Tile Match carries observable reaction ↔ balanced equation
- **Lab / procedure chapter** → Sentence Fill carries the procedure and the safety rule as ordered blanks; Tile Match carries safety rule ↔ substance
- **Calculation-heavy chapter** (molar mass, percent composition, stoichiometric ratios) → Sentence Fill carries the calculation as ordered blanks, one blank per step, with the unit in the answer

Never test the same item the same way in both games. If a substance is a Tile Match pair, Sentence Fill should require reasoning with it, not renaming it.

---

## Construction per game

### Tile Match — the three-scale board
**Board size by grade** — the builder recommends by grade, and 8 is a hard cap:

| Grade | Pairs |
|---|---|
| G1-G2 | 4 |
| G3-G4 | 5 |
| G5-G7 | 6 |
| G8 and above | 8 |

Never author more than 8 pairs at any grade; a 9th pair is rejected.

- Left tile = one scale description. Right tile = the same substance at a different scale.
- Every tile must carry enough context to identify the substance — no anonymous symbol-only tiles.
- Pair types:
  - Macroscopic ↔ symbolic: `"Oq kristall kukun, hidsiz, suvda eriydi"` ↔ `"NaCl (Na: +1, Cl: -1)"`
  - Microscopic ↔ symbolic: `"Na⁺ va Cl⁻ ionlari kub panjarasida"` ↔ `"NaCl — ionli bog'"`
  - Observable reaction ↔ equation: `"Yorqin alanga, pufakchalar, issiqlik ajraladi"` ↔ `"C₃H₈ + 5O₂ → 3CO₂ + 4H₂O (muvozanatlangan)"`
  - Safety ↔ substance: `"Goggles + gloves + fume hood majburiy"` ↔ `"Konsentrlangan H₂SO₄ — kuydirgich kislota"`
- Difficulty ladder: `easy` name ↔ formula → `medium` observable ↔ formula → `hard` a pair that only resolves when macro AND micro descriptions are read together.
- **Include at least 1 pair whose equation is deliberately unbalanced** so it matches nothing on the board — the student must identify it as a non-match. This trains coefficient-versus-subscript discipline. Put the atom-count failure in that pair's `explanation`.
- Group the board with `concept_family` — one family per substance or per reaction type, so all three scales of one substance sit together.
- Keep each side within 300 characters.
- Every `left` and every `right` must be unique across the board.

### Sentence Fill
- Easy 5-6 items, Hard 7-8 items
- `mode`: `word_bank` for G7, `free_recall` for G8-11
- Causal chain statement, safety rule, three-scale description, or equation step with one piece missing per `___`
- The gap must test chemical understanding — not random word removal
- Single-blank and two-blank items:
  - `"Kislotani suyultirishda avvalo ___ olinadi, keyin ustiga ___ quyiladi"` → answers `["suv", "kislota"]` (kislota suvga, suvga kislota emas — safety rule)
  - `"2H₂ + O₂ → 2H₂O tenglamasida H atomlari: chap tomonda ___, o'ng tomonda ___"` → answers `["4", "4"]` (balance verification)
  - `"NaCl — makroskopik darajada oq kristall kukun; mikroskopik darajada ___ ionlari; ramziy darajada ___"` → answers `["Na⁺ va Cl⁻", "NaCl"]`
  - `"Reaksiya natijasida rang o'zgarishi ___ ko'rsatkichi bo'lishi mumkin"` → answers `["yangi modda hosil bo'lishi"]`
- **Equation balancing is a multi-blank passage.** Put a `___` where each coefficient belongs and require the atom-count check in the same passage, so the student balances and verifies in one ordered pass. This is where the tile-assembly balancing pedagogy now lives.
  - `"___H₂SO₄ + ___NaOH → ___Na₂SO₄ + ___H₂O. Tekshirish: Na×___ = Na×___"` → answers `["1", "2", "1", "2", "2", "2"]`
- **Ordered procedures are a multi-blank passage** with the blanks in execution order, safety always first:
  - `"Lab protokoli: 1) ___ kiyish, 2) reagentlarni ___, 3) tajriba o'tkazish, 4) kuzatuvlarni ___, 5) reaktivlarni ___"` → answers `["PPE", "tekshirish", "yozib olish", "utilizatsiya qilish"]`
- In `word_bank` mode the distractor is the coefficient-versus-subscript error or the reversed safety step, never a random token.
- Use `explanations` to state the atom-count check or the safety consequence for each blank.

---

## Rules

- Every item involving a substance carries a three-scale description or an observable diagram
- Every balanced equation includes its atom count verification — `X×N = X×N ✓` — inside the passage or the explanation
- Safety note mandatory in every item involving a hazardous substance — no chemistry content without safety context
- Observable Before Theory — never open an item with a bare formula
- Every item tagged: `[Bloom: LX | PISA: LX]`
- Do not reference any game outside the Supported Games table
- Current chapter content only — no questions from other chapters
- Language: Uzbek, "Siz" formal

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
- `tile_match.subject_family` is always `"chemistry"` in this file.
