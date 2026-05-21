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
  // practice_arc, etc. land in later phases — kept open.
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
