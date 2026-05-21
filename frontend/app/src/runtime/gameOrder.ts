// F4 — Practice Arc game-order resolution.
//
// The arc renders an ordered list of game KEYS. Order is determined here, in
// one place, so PracticeArc + the store agree:
//
//   1. If content_json.practice_arc.games[] is authored, that wins verbatim
//      (it's the explicit author intent — keys are passed straight to GameHost,
//      which renders a "coming soon" skip card for any key it can't map yet).
//   2. Otherwise we DERIVE the order: every gb_* array that exists on
//      content_json contributes its game key, in a stable canonical order, and
//      the Boss is always appended last (when boss_questions exist).
//
// The Boss is ALWAYS the final node of the arc — it's the mastery peak.

import type { ContentJson } from "../shared/types";

export const BOSS_KEY = "boss";

// Maps a content_json gb_* array name → its Practice Arc game key. Only
// tile_match is wired in v1; the other 8 keys are registered here so deriving
// the order picks them up the moment their gb_* array + GameHost entry land.
const GB_ARRAY_TO_KEY: Record<string, string> = {
  gb_tile_match: "tile_match",
  gb_sentence_fill: "sentence_fill",
  gb_real_life_challenge: "real_life_challenge",
  gb_ttt: "ttt",
  gb_memory_palace: "memory_palace",
  gb_mystery_box: "mystery_box",
  gb_puzzle_lock: "puzzle_lock",
  gb_adaptive_quiz: "adaptive_quiz",
  gb_story_mode: "story_mode",
};

// Canonical fallback order for derived arcs — keeps a sensible difficulty
// ramp regardless of object-key iteration order on content_json.
const DERIVED_ORDER: string[] = [
  "gb_tile_match",
  "gb_sentence_fill",
  "gb_mystery_box",
  "gb_puzzle_lock",
  "gb_adaptive_quiz",
  "gb_memory_palace",
  "gb_story_mode",
  "gb_ttt",
  "gb_real_life_challenge",
];

function hasArray(content: ContentJson, key: string): boolean {
  const v = content[key];
  return Array.isArray(v) && v.length > 0;
}

/**
 * Resolve the ordered list of game keys for the Practice Arc. Boss is always
 * the last node when boss_questions are present. Returns an empty array only
 * when there's no playable content at all.
 */
export function resolveGameOrder(content: ContentJson | undefined): string[] {
  if (!content) return [];

  const hasBoss =
    Array.isArray(content.boss_questions) && content.boss_questions.length > 0;

  // 1) Author-specified order wins.
  const authored = content.practice_arc?.games;
  if (Array.isArray(authored) && authored.length > 0) {
    const order = authored.filter((k): k is string => typeof k === "string");
    // Guarantee Boss is last when present and not already authored in.
    if (hasBoss && !order.includes(BOSS_KEY)) order.push(BOSS_KEY);
    return order;
  }

  // 2) Derive from the gb_* arrays that exist, in canonical order.
  const order: string[] = [];
  for (const arrayName of DERIVED_ORDER) {
    if (hasArray(content, arrayName)) order.push(GB_ARRAY_TO_KEY[arrayName]);
  }
  if (hasBoss) order.push(BOSS_KEY);
  return order;
}
