// Runtime API types. The redacted hydration payload NEVER carries answer
// fields — `StudentSafeCheckpoint` is a type-level leak guard so a regression
// can't smuggle `answer_spec` / `correct` into the client model.

export interface HydratePayload {
  id: string;
  title: string;
  subject: string | null;
  grade: string | number | null;
  lang: string | null;
  flow_version: string;
  content_json: ContentJson;
}

export interface ContentJson {
  flow_version?: string;
  case_based_preview?: CaseBasedPreview;
  flashcards?: Flashcard[];
  memory_check?: MemoryCheck;
  // F4 — Practice Arc spine. `practice_arc.games[]` is an optional ordered
  // list of game keys ("tile_match", "boss", …); when absent the arc derives
  // its order from whichever gb_* arrays exist + boss last.
  practice_arc?: PracticeArc;
  gb_tile_match?: TileMatchTile[];
  boss_questions?: BossQuestion[];
  boss_meta?: BossMeta;
  // Other gb_* arrays land as the remaining 8 games ship — kept open.
  [key: string]: unknown;
}

export type CheckpointKind = "identify" | "decide" | "justify";

/**
 * Type-level answer-leak guard. The redacted hydration payload may only carry
 * display fields. `answer_spec`, `correct`, `expected` etc. are typed as
 * `never` so any attempt to read them is a compile error — the client model
 * literally cannot hold an answer.
 */
export interface StudentSafeCheckpoint {
  kind: CheckpointKind;
  question: string;
  options: string[];
  // Explicit leak guards — these must never be present client-side.
  answer_spec?: never;
  correct?: never;
  expected?: never;
  ans?: never;
  accepted_answers?: never;
  learning_block?: never; // arrives via the submit response, not hydration.
}

export type Checkpoint = StudentSafeCheckpoint;

export interface CaseSetup {
  story?: string;
  role?: string;
  task?: string;
}

export interface FinalSimulation {
  wrong_path?: string;
  visual_description_or_svg?: string;
  // correct_path is redacted server-side — surfaced only via submit feedback.
  correct_path?: never;
}

export interface FeedbackSummary {
  student_understood?: string;
  mistake_appeared?: string;
  what_to_review?: string;
  [key: string]: unknown;
}

export interface CaseBasedPreview {
  title?: string;
  metadata?: Record<string, unknown>;
  source_extraction?: Record<string, unknown>;
  case_setup?: CaseSetup;
  checkpoints?: Checkpoint[];
  final_simulation?: FinalSimulation;
  feedback_summary?: FeedbackSummary;
}

// ---- Flashcards (Tile B study deck — display-only, no answer fields) ----

/**
 * A single flashcard from the redacted hydration payload. `front`/`back` are
 * the two faces; the optional fields are coaching hints. There are NO answer
 * fields here — flashcards are study material, graded recall happens in the
 * Memory Check below. The leak guards mirror StudentSafeCheckpoint.
 */
export interface Flashcard {
  id?: string;
  // Canonical frozen content shape uses {term, def}; front/back are accepted
  // as aliases. The renderer reads term→front, def→back with fallback.
  term?: string;
  def?: string;
  definition?: string;
  front?: string;
  back?: string;
  hint?: string;
  example?: string;
  type?: string;
  // Explicit leak guards — flashcards are never graded, so no answer fields.
  answer_spec?: never;
  correct?: never;
  expected?: never;
}

export type MemoryCheckItemType =
  | "mcq"
  | "true_false"
  | "choose_explanation"
  | "fill_blank";

/**
 * A Memory Check item. Option-bearing types (`mcq` / `true_false` /
 * `choose_explanation`) carry `options`; `fill_blank` omits them and expects a
 * typed answer. `answer_spec` is redacted server-side — correctness is ALWAYS
 * read from the /check-answer response, never derived here.
 */
export interface MemoryCheckItem {
  type: MemoryCheckItemType;
  prompt: string;
  options?: string[];
  // Explicit leak guard — the redactor strips this subtree before delivery.
  answer_spec?: never;
}

export interface MemoryCheck {
  pass_threshold_pct?: number;
  items: MemoryCheckItem[];
}

// ---- Gate state (server-authoritative; the client renders, never decides) ----

export interface CbpGate {
  passed: boolean;
  checkpoints_correct: number;
  checkpoints_total: number;
  threshold?: number;
}

export interface McGate {
  passed: boolean;
  score_pct: number;
  correct?: number;
  total?: number;
  threshold_pct: number;
}

export interface GateState {
  cbp: CbpGate;
  mc: McGate;
  practice_arc_unlocked: boolean;
}

// ---- Per-interaction submit ----

export interface CheckAnswerResult {
  correct: boolean;
  feedback: string;
  learning_block: string | null;
}

// ---- F4: Practice Arc spine ----

/**
 * Ordered Practice Arc descriptor. `games` is a list of game KEYS — the same
 * keys the GameHost registry maps to components ("tile_match", "boss", …).
 * Optional: when absent, PracticeArc derives the order from the gb_* arrays
 * present on content_json, with the Boss always last.
 */
export interface PracticeArc {
  games?: string[];
  title?: string;
  intro?: string;
  [key: string]: unknown;
}

/**
 * One Tile Match tile as it arrives in the redacted hydration payload. The
 * server-only `explanation` is stripped; `id` is the per-pair key. The client
 * matches a left tile to a right tile by submitting their two ids — a match is
 * correct only when both ids are equal (each pair shares one id). The client
 * never decides correctness; the server does.
 */
export interface TileMatchTile {
  id: string;
  left: string;
  right: string;
  tier?: "basic" | "premium";
  concept_family?: string;
  // Leak guard — the redactor strips the premium "why this is wrong" note.
  explanation?: never;
}

/** Per-pair Tile Match grade result (server-authoritative). */
export interface TileMatchResult {
  correct: boolean;
  hint: string | null;
  explanation: string | null;
  matched_count: number;
  total_pairs: number;
  complete: boolean;
  outcome: string | null;
  timer?: { remaining_seconds: number; delta_seconds: number };
  xp?: Record<string, number>;
  completion_bonus_xp?: number;
}

/**
 * A Boss question from the redacted hydration payload. `q`/`prompt` is the
 * display text; `id` is the key the server resolves the expected answer by.
 * Answer fields (`ans`, `accepted_answers`, `answer_spec`) are stripped server
 * side — the React boss NEVER self-grades, it submits the student's answer
 * with the question_id and reads correctness/damage from the response.
 */
export interface BossQuestion {
  id?: string;
  q?: string;
  prompt?: string;
  hint?: string;
  dmg?: number;
  tags?: string;
  // Leak guards — these never reach the client.
  ans?: never;
  accepted_answers?: never;
  answer_spec?: never;
}

export interface BossMeta {
  boss_type?: "sub" | "big" | "mythical";
  grade_band?: string;
  attempts_max?: number | null;
  starting_hp_override?: number;
  name?: string;
  intro?: string;
  [key: string]: unknown;
}

/**
 * Boss turn grade result. Mirrors the `tutor.boss_turn` shape plus the
 * Final-Boss adapter metadata. Correctness + damage are server-computed; the
 * client renders HP drama from these fields and never derives the verdict.
 */
export interface BossTurnResult {
  correct: boolean;
  damage_dealt: number;
  boss_response: string;
  hint: string | null;
  score?: number;
  axis_1?: number;
  axis_2?: number;
  axis_1_label?: string;
  axis_2_label?: string;
  done?: boolean;
  // Final-Boss adapter metadata (additive).
  phase?: string;
  boss_type_used?: string;
  grade_band?: string;
  max_hp?: number;
  hint_cost_per_use?: number;
  attempts_used?: number;
  hints_used?: number;
  // Surfaced only on defeat.
  outcome?: string;
  stars?: number;
  outcome_xp?: number;
}
