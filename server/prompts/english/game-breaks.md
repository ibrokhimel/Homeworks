# Prompt: Game Breaks - English (Phase 5, HARD only)

You are building the Game Breaks phase for an English homework session. English has no Easy mode: always build the HARD pipeline. The student applies what they learned in Preview, Flash Cards, Memory Sprint, and Reading through system-supported game mechanics only.

## Input

- Textbook unit (image or text)
- Preview + Flash Cards + Memory Sprint + Reading outputs
- Mode from `classify.md`: always `HARD`
- Detected CEFR level: A1, A1+, A2, A2+, B1, B1+, or B2
- Grade (for content complexity calibration)

## Output

Exactly 2 games — Tile Match and Sentence Fill. Both, every session.

Sentence Fill items by CEFR level: A1: 5, A2: 5-6, B1: 6-7, B2: 8. These counts are higher than the old per-game figures because the phase now carries its whole load across two games instead of three.

Tile Match is the exception — its board size is set by grade, not by CEFR (see the table under Tile Match). It is hard-capped, so it cannot absorb extra items; anything extra goes to Sentence Fill.

Every item must come from the current textbook unit only and be tagged `[Bloom: LX | PISA: LX]`.

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

### What each game is for in English

| Game | English use |
|---|---|
| **Tile Match** | Word ↔ meaning, term ↔ UZ bridge, collocation ↔ context, IPA ↔ word, form ↔ function. |
| **Sentence Fill** | Grammar slots, tense form, register choice, collocation completion, academic cloze. Also carries short recall, form recognition, and the closed-format contrast checks that used to sit in a quiz. |

## What goes in which game

Both games always appear, so the decision is what each one carries:
- Vocabulary-heavy unit → the weight goes on Tile Match; Sentence Fill puts those words back into use in context
- Grammar-pattern unit → the weight goes on Sentence Fill; Tile Match carries form ↔ function pairs
- Mixed grammar + vocabulary → split evenly, with the Tile Match board grouped into 2-4 `concept_family` labels
- Contrast practice (the closed recognition drills that used to be a separate game) → `word_bank` Sentence Fill items where the single distractor IS the contrast form
- Short recall and form recognition → 1-blank Sentence Fill items with a short, reliably checkable answer; keep long production out of them
- B2 level → at least 1 IELTS collocation, academic cloze, register, or rhetorical-analysis item, in either game

Never test the same item the same way in both games. If a word is a Tile Match pair, Sentence Fill should require it in production, not re-ask its meaning.

---

## Construction Per Game

### Tile Match
- Left tile: target word, phrase, grammar pattern, IPA cue, or example.
- Right tile: UZ bridge, definition, form name, or real-world use.
- A1: word ↔ UZ meaning. A2: collocation ↔ natural context. B1: form ↔ function. B2: academic collocation ↔ citation/register.
- Set `concept_family` from the unit's own categories — `tense`, `register`, `word class`, `collocation type`, `false friend`, `function` are the labels that group an English board cleanly. Use 2-4 families per board.
- Difficulty ladder across the board: `easy` word ↔ meaning → `medium` collocation ↔ context → `hard` form ↔ function, where the pair only resolves if the student reads the grammatical role.
- SVG or an image is allowed inside a tile only when it directly represents textbook content.
- Every `left` and every `right` must be unique across the board.
**Board size by grade** — the builder recommends by grade, and 8 is a hard cap:

| Grade | Pairs |
|---|---|
| G1-G2 | 4 |
| G3-G4 | 5 |
| G5-G7 | 6 |
| G8 and above | 8 |

Never author more than 8 pairs at any grade; a 9th pair is rejected.

### Sentence Fill
- Items per CEFR level from the table above.
- `mode`: `word_bank` for G2-G7, `free_recall` for G8+.
- Sentence or short dialogue with one missing piece per `___`; 1-3 blanks per passage is the natural English range.
- The gap must test grammar understanding, not random word removal.
- A1: one-word form. A2: tense choice between two forms. B1: modal/perfect/conditional slot. B2: inversion, cleft, register, or academic structure.
- Use level-allowed tenses only in all model answers.
- In `word_bank` mode the distractor is the contrast form the level is actually being taught (`"has gone"` against `"went"`, `"few"` against `"a few"`), never a random word. This is where closed-format contrast practice now lives.
- B2 academic cloze lives here: an authentic collocation slot inside a source-like sentence.
- Use `explanations` to say why the distractor is wrong at this CEFR level — one per answer, or omit the key entirely.

---

## Rules

- Exactly 2 games for English HARD mode — Tile Match and Sentence Fill, both every session.
- Every item tagged `[Bloom: LX | PISA: LX]`.
- B2 must include at least 1 IELTS collocation, academic cloze, register, or rhetorical-analysis item.
- Full answer key for every game.
- Current textbook unit content only. No items from other chapters and no outside facts.
- Language: student-facing English; UZ appears only for an explicit UZ<->EN bridge.
- Level-allowed tenses only in model answers.
- Do not reference any game outside the Supported Games table.
- Visuals: inline SVG where a visual speeds recognition. Under 200x150px. Use only textbook-supported visuals; no decorative media.

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
- `tile_match.subject_family` is always `"language"` in this file.
