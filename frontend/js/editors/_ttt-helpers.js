// frontend/js/editors/_ttt-helpers.js
// Pure helpers for the Tic Tac Toe (TTT) builder editor.
//
// Mirrors `_real-life-challenge-helpers.js` and `_boss-helpers.js` shape so
// regression tests can drive helpers directly from Node (no browser surface).
// Exposed on `window.TTTHelpers` for the browser editor and on
// `module.exports` for Node tests.
//
// Spec sources:
//   TIC_TAC_TOE_BACKEND_PLAN.md §4 (builder lane spec)
//   T4 dispatch brief (grade-band scaffolds, validateItem, pisaHintForBand)

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Grade band mapping
  // Per spec: 1–3 → "L1-L2", 4–6 → "L2-L3", 7–9 → "L3-L4", 10–11 → "L4+"
  // Default to "L3-L4" when grade is missing or non-numeric.
  // ---------------------------------------------------------------------------

  function gradeBandFor(grade) {
    const g = Number(grade);
    if (!Number.isFinite(g)) return "L3-L4";
    if (g <= 3) return "L1-L2";
    if (g <= 6) return "L2-L3";
    if (g <= 9) return "L3-L4";
    return "L4+";
  }

  // ---------------------------------------------------------------------------
  // Grade-band scaffold builder
  // Returns 3 starter {q, correct, distractors} items appropriate to the band.
  // Each item: 1 correct + 3 plausible distractors.
  // ---------------------------------------------------------------------------

  function scaffoldForBand(band) {
    if (band === "L1-L2") {
      return [
        {
          q: "What is 5 + 3?",
          correct: "8",
          distractors: ["6", "9", "7"],
        },
        {
          q: "Which number is bigger: 7 or 4?",
          correct: "7",
          distractors: ["4", "They are equal", "Cannot tell"],
        },
        {
          q: "What is 10 – 4?",
          correct: "6",
          distractors: ["5", "7", "4"],
        },
      ];
    }

    if (band === "L2-L3") {
      return [
        {
          q: "3/6 equals?",
          correct: "1/2",
          distractors: ["1/3", "2/3", "3/4"],
        },
        {
          q: "What is 15% of 200?",
          correct: "30",
          distractors: ["25", "35", "15"],
        },
        {
          q: "What is 2³ (2 to the power of 3)?",
          correct: "8",
          distractors: ["6", "9", "16"],
        },
      ];
    }

    if (band === "L3-L4") {
      return [
        {
          q: "Solve: 3x = 18. What is x?",
          correct: "6",
          distractors: ["3", "9", "15"],
        },
        {
          q: "What is the square root of 81?",
          correct: "9",
          distractors: ["8", "10", "7"],
        },
        {
          q: "Which property states a × (b + c) = a×b + a×c?",
          correct: "Distributive property",
          distractors: [
            "Commutative property",
            "Associative property",
            "Identity property",
          ],
        },
      ];
    }

    // L4+ — multi-step reasoning
    return [
      {
        q: "If f(x) = 2x + 3 and x = 4, what is f(x)?",
        correct: "11",
        distractors: ["10", "14", "8"],
      },
      {
        q: "A rectangle has perimeter 36 cm and width 7 cm. What is its length?",
        correct: "11 cm",
        distractors: ["9 cm", "14 cm", "18 cm"],
      },
      {
        q: "What is the slope of the line passing through (0, 2) and (4, 10)?",
        correct: "2",
        distractors: ["3", "1", "4"],
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // ID helper — pure function (does NOT mutate item)
  // Returns the existing id if non-empty, otherwise "ttt-<idx+1>"
  // ---------------------------------------------------------------------------

  function ensureItemId(item, idx) {
    if (item && typeof item.id === "string" && item.id.trim()) {
      return item.id;
    }
    return "ttt-" + (idx + 1);
  }

  // ---------------------------------------------------------------------------
  // Validation — returns {ok: bool, errors: string[]}
  // Soft checks surfaced in the UI (warnings, not blockers).
  // ---------------------------------------------------------------------------

  function validateItem(item) {
    const errors = [];
    const obj = item && typeof item === "object" ? item : {};

    // q must be non-empty / non-whitespace
    const q = typeof obj.q === "string" ? obj.q.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    if (!q) {
      errors.push("Question (q) is empty.");
    }

    // correct must be non-empty
    const correct = typeof obj.correct === "string" ? obj.correct.trim() : "";
    if (!correct) {
      errors.push("Correct answer is empty.");
    }

    // distractors must be an array of ≥3 non-empty strings
    const distractors = Array.isArray(obj.distractors) ? obj.distractors : [];
    if (distractors.length < 3) {
      errors.push("Need at least 3 distractors.");
    } else {
      for (let i = 0; i < 3; i++) {
        const d = typeof distractors[i] === "string" ? distractors[i].trim() : "";
        if (!d) {
          errors.push(`Distractor ${i + 1} is empty.`);
        }
      }
    }

    // No duplicates between correct and distractors
    const allChoices = [correct, ...distractors.slice(0, 3).map((d) => (typeof d === "string" ? d.trim() : ""))];
    const nonEmpty = allChoices.filter(Boolean);
    const unique = new Set(nonEmpty.map((s) => s.toLowerCase()));
    if (unique.size < nonEmpty.length) {
      errors.push("Correct answer and distractors must all be different.");
    }

    return { ok: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------------------
  // PISA band hint — short user-facing label (Uzbek + English mix)
  // Mirrors how RLC editor surfaces per-band hints to the builder.
  // ---------------------------------------------------------------------------

  function pisaHintForBand(band) {
    if (band === "L1-L2") return "L1–L2 — oddiy hisob / basic arithmetic";
    if (band === "L2-L3") return "L2–L3 — kasr va foiz / fractions & percentages";
    if (band === "L3-L4") return "L3–L4 — bir bosqichli algebra / short-step algebra";
    if (band === "L4+") return "L4+ — ko'p bosqichli masala / multi-step reasoning";
    return "";
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const api = {
    gradeBandFor,
    scaffoldForBand,
    ensureItemId,
    validateItem,
    pisaHintForBand,
  };

  if (typeof window !== "undefined") {
    window.TTTHelpers = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
