// frontend/js/editors/_real-life-challenge-helpers.js
// Pure helpers for the Real-Life Challenge (RLC) builder editor.
//
// Mirrors `_tile-match-helpers.js` shape so tests can drive helpers under
// Node directly (no browser surface). Exposed on `window.RLCHelpers` for the
// browser editor and on `module.exports` for Node regression tests.
//
// Spec sources:
//   REAL_LIFE_CHALLENGE_BACKEND_PLAN.md §1 (schema), §4 (editor), §4c (grade-band scaffolds)
//   standards/system/games/Game_Mechanics_Docs/11_Real-Life_Challenge §1 (5-step structure +
//   complexity table by grade band).

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Grade band + PISA defaults
  // ---------------------------------------------------------------------------

  function gradeBandFromGrade(grade) {
    const g = Number(grade);
    if (!Number.isFinite(g)) return "g7_9";
    if (g <= 3) return "g1_3";
    if (g <= 6) return "g4_6";
    if (g <= 9) return "g7_9";
    return "g10_11";
  }

  function defaultPisaForGradeBand(band) {
    const map = { g1_3: "L4", g4_6: "L4", g7_9: "L5", g10_11: "L6" };
    return map[band] || "L4";
  }

  // 12 expert roles per spec §1 ExpertRole enum (must match the Pydantic Literal)
  function expertRoleOptions() {
    return [
      "fire_inspector",
      "structural_engineer",
      "business_consultant",
      "medical_diagnostician",
      "agronomist",
      "teacher",
      "lawyer",
      "city_planner",
      "epidemiologist",
      "ethicist",
      "historian",
      "general",
    ];
  }

  function pisaLevelOptions() {
    return ["L1", "L2", "L3", "L4", "L5", "L6"];
  }

  function tierOptions() {
    return ["basic", "premium"];
  }

  function gradeBandOptions() {
    return ["g1_3", "g4_6", "g7_9", "g10_11"];
  }

  function variantOptions() {
    return ["standard", "creative_thinking"];
  }

  // ---------------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------------

  function uuidShort() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return "rlc_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      }
    } catch (_e) {
      // fall through
    }
    return "rlc_" + Math.random().toString(36).slice(2, 10);
  }

  // ---------------------------------------------------------------------------
  // Grade-band scaffold builder
  //
  // Returns a starter RealLifeChallengeCase shape that validates against the
  // Chunk-A Pydantic model (see server/schemas/content.py):
  //   - exactly 5 steps in locked order [decision, info_request, final_decision,
  //     concept_select, reasoning]
  //   - each decision/info_request/final_decision step has ≥2 options + exactly
  //     1 marked correct
  //   - concept_select has ≥3 chips + exactly 1 correct
  //   - reasoning has min_chars in [20, 1000]
  //   - tier-gated fields (variant=creative_thinking, memory_palace_location)
  //     are NOT emitted on basic tier
  //
  // Complexity ramp per spec §1:
  //   g1_3   — 2 options on decision steps (minimum), 3 concepts (minimum)
  //   g4_6   — 3 options on decision steps, 4 concepts
  //   g7_9   — 4 options (red herrings) on decision/final, 4 concepts
  //   g10_11 — 4+ options + ethical-dimension hint in step3 prompt, 5 concepts
  // ---------------------------------------------------------------------------

  function _decisionOptions(count) {
    const labels = [
      "Birinchi variant",
      "Ikkinchi variant",
      "Uchinchi variant",
      "To'rtinchi variant",
      "Beshinchi variant",
    ];
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: String.fromCharCode(97 + i), // "a", "b", "c", ...
        label: labels[i] || `Variant ${i + 1}`,
        is_correct: i === 0,
        consequence: "",
      });
    }
    return out;
  }

  function _infoRequestOptions(count) {
    const labels = [
      "Qo'shimcha ma'lumot so'rash",
      "Mutaxassis bilan maslahatlashish",
      "Joyni o'zi tekshirish",
      "Hujjatlarni o'rganish",
    ];
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: String.fromCharCode(97 + i),
        label: labels[i] || `Ma'lumot variant ${i + 1}`,
        is_correct: i === 0,
        consequence: "",
        info_cost: { time: "", budget: "", access: "" },
      });
    }
    return out;
  }

  function _conceptChips(count) {
    const labels = [
      "Asosiy tushuncha",
      "Yondosh tushuncha A",
      "Yondosh tushuncha B",
      "Yondosh tushuncha C",
      "Yondosh tushuncha D",
    ];
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: "c" + (i + 1),
        label: labels[i] || `Tushuncha ${i + 1}`,
        is_correct: i === 0,
      });
    }
    return out;
  }

  function _scaffoldShape(gradeBand) {
    if (gradeBand === "g1_3") {
      return { decisionCount: 2, finalCount: 2, conceptCount: 3, infoCount: 2 };
    }
    if (gradeBand === "g4_6") {
      return { decisionCount: 3, finalCount: 3, conceptCount: 4, infoCount: 3 };
    }
    if (gradeBand === "g7_9") {
      return { decisionCount: 4, finalCount: 4, conceptCount: 4, infoCount: 4 };
    }
    // g10_11
    return { decisionCount: 4, finalCount: 4, conceptCount: 5, infoCount: 4 };
  }

  function _step3PromptForBand(gradeBand) {
    if (gradeBand === "g10_11") {
      return (
        "Yakuniy qaror: barcha ma'lumotlarni hisobga olib, eng to'g'ri yo'lni tanlang. " +
        "Etik tomonlarini va manfaatdor tomonlarni (stakeholders) ham o'ylab ko'ring."
      );
    }
    if (gradeBand === "g7_9") {
      return "Yakuniy qaror: barcha ma'lumotlardan keyin eng yaxshi yondashuvni tanlang.";
    }
    return "Yakuniy qaror: eng yaxshi yo'lni tanlang.";
  }

  function buildScaffoldCase(gradeBand, expertRole, tier) {
    const band = gradeBand || "g7_9";
    const role = expertRole || "general";
    const safeTier = tier === "premium" ? "premium" : "basic";
    const shape = _scaffoldShape(band);
    const pisa = defaultPisaForGradeBand(band);

    const out = {
      id: uuidShort(),
      expert_role: role,
      title: "",
      intro: "",
      pisa_level: pisa,
      tier: safeTier,
      grade_band: band,
      variant: "standard", // creative_thinking is premium-only — never default-set
      steps: [
        {
          id: "step1",
          kind: "decision",
          title: "1-bosqich. Vaziyatni baholash",
          prompt: "",
          options: _decisionOptions(shape.decisionCount),
        },
        {
          id: "step2",
          kind: "info_request",
          title: "2-bosqich. Qo'shimcha ma'lumot",
          prompt: "",
          options: _infoRequestOptions(shape.infoCount),
        },
        {
          id: "step3",
          kind: "final_decision",
          title: "3-bosqich. Yakuniy qaror",
          prompt: _step3PromptForBand(band),
          options: _decisionOptions(shape.finalCount),
        },
        {
          id: "step4",
          kind: "concept_select",
          title: "4-bosqich. Tushunchani aniqlash",
          prompt: "",
          concept_chips: _conceptChips(shape.conceptCount),
        },
        {
          id: "step5",
          kind: "reasoning",
          title: "5-bosqich. Sababini tushuntiring",
          prompt: "",
          placeholder: "Qaroringizni 2-3 jumla bilan asoslang...",
          min_chars: 80,
          acceptable_keywords: [],
        },
      ],
    };

    // Premium-only fields are intentionally NOT emitted on basic tier.
    // memory_palace_location is undefined on basic; variant stays "standard".
    return out;
  }

  // ---------------------------------------------------------------------------
  // Subject-derived expert-role default (advisory; user can override in UI)
  // ---------------------------------------------------------------------------

  function expertRoleFromSubject(subject) {
    if (subject == null) return "general";
    const s = String(subject).toLowerCase();
    if (!s) return "general";
    if (s.includes("bio") || s.includes("biolog")) return "agronomist";
    if (s.includes("phys") || s.includes("fizika") || s.includes("физик")) return "structural_engineer";
    if (s.includes("chem") || s.includes("kimyo") || s.includes("хими")) return "medical_diagnostician";
    if (s.includes("hist") || s.includes("tarix") || s.includes("истор")) return "historian";
    if (s.includes("lit") || s.includes("adabiyot") || s.includes("литер")) return "ethicist";
    if (s.includes("lang") || s.includes("til") || s.includes("язык") || s.includes("english")) {
      return "teacher";
    }
    if (s.includes("geo")) return "city_planner";
    return "general";
  }

  const api = {
    gradeBandFromGrade,
    defaultPisaForGradeBand,
    expertRoleOptions,
    pisaLevelOptions,
    tierOptions,
    gradeBandOptions,
    variantOptions,
    uuidShort,
    buildScaffoldCase,
    expertRoleFromSubject,
  };

  if (typeof window !== "undefined") {
    window.RLCHelpers = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
