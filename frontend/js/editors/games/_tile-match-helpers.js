// frontend/js/editors/games/_tile-match-helpers.js
// Pure helper functions for the Tile Match builder editor.
//
// Kept in their own file so tests can load them directly via Node.js
// (test_builder_tile_match.py) without booting the whole browser surface.
// Exported on `window.TileMatchHelpers` for browser use AND on `module.exports`
// (when running under Node) for the regression test.
//
// See TILE_MATCH_BACKEND_PLAN.md §4b for the grade-band rationale and the
// official spec at standards/system/games/Game_Mechanics_Docs/03_Tile_Match
// §1 for board sizes:
//   G1-2  → 4 pairs (default)
//   G3-4  → 5 pairs (default)
//   G5-7  → 6 pairs (default)
//   G8-11 → 8 pairs (default)
//   Hard cap: 8 pairs (spec § max board size).

(function () {
  "use strict";

  function defaultPairCountForGrade(grade) {
    const g = Number(grade);
    if (!Number.isFinite(g)) return 8;
    if (g <= 2) return 4;
    if (g <= 4) return 5;
    if (g <= 7) return 6;
    return 8;
  }

  function maxPairsForGrade(_grade) {
    // Spec §1: hard cap at 8 pairs regardless of grade. Extra arg accepted
    // for symmetry with `defaultPairCountForGrade` and future expansion.
    return 8;
  }

  function subjectFamilyFromContext(subject) {
    // Map a free-form subject string (uz/ru/en) to the SubjectFamily enum
    // so concept-tile colors can use Buzan-aligned defaults.
    if (subject == null) return "general";
    const s = String(subject).toLowerCase();
    if (!s) return "general";
    if (s.includes("math") || s.includes("matem")) return "math";
    if (s.includes("bio") || s.includes("biolog")) return "biology";
    if (s.includes("hist") || s.includes("tarix") || s.includes("истор")) return "history";
    if (s.includes("liter") || s.includes("adabiyot") || s.includes("литер")) return "literature";
    if (s.includes("phys") || s.includes("fizika") || s.includes("физик")) return "physics";
    if (s.includes("chem") || s.includes("kimyo") || s.includes("хими")) return "chemistry";
    if (s.includes("lang") || s.includes("til") || s.includes("язык")) return "language";
    if (s.includes("geo")) return "geography";
    return "general";
  }

  function uuidShort() {
    // 8-char URL-safe id; use crypto.randomUUID where available
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return "tm_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      }
    } catch (_e) {
      // fall through
    }
    return "tm_" + Math.random().toString(36).slice(2, 10);
  }

  function migrateLegacyToNew(legacyPairs) {
    // [[left, right], ...] → [{id, left, right, tier:"basic", ...}, ...]
    if (!Array.isArray(legacyPairs)) return [];
    return legacyPairs.map((p, i) => ({
      id: `tm_legacy_${String(i).padStart(3, "0")}`,
      left: Array.isArray(p) ? String(p[0] == null ? "" : p[0]) : "",
      right: Array.isArray(p) ? String(p[1] == null ? "" : p[1]) : "",
      tier: "basic",
    }));
  }

  const api = {
    defaultPairCountForGrade,
    maxPairsForGrade,
    subjectFamilyFromContext,
    uuidShort,
    migrateLegacyToNew,
  };

  if (typeof window !== "undefined") {
    window.TileMatchHelpers = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
