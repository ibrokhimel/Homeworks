// Builder (authoring) draft types. These are the v2 net-new authoring shapes —
// the MIRROR of the runtime's StudentSafe* types but WITH the answer fields the
// author needs to set. Redaction lives strictly at the API boundary
// (runtime_redactor server-side); the BUILDER draft intentionally CARRIES the
// answers (option_index expected, text_fuzzy expected) because those are what
// get persisted to the DB. Do NOT add leak guards here — the builder needs
// them.

// ---- answer_spec (authored) ------------------------------------------------
//
// Two shapes the builder authors, per server/schemas/content.py AnswerSpec
// (which is permissive — extra keys propagate):
//   - option_index : {type:"option_index", expected:<idx>, option_count:<n>}
//   - text_fuzzy   : {type:"text_fuzzy",   expected:"<text>", allow_ai_fallback?}

export interface OptionIndexAnswerSpec {
  type: "option_index";
  expected: number; // 0-based index of the correct option
  option_count: number; // how many options exist (validity hint)
}

export interface TextFuzzyAnswerSpec {
  type: "text_fuzzy";
  expected: string;
  allow_ai_fallback?: boolean;
}

export type AuthoredAnswerSpec = OptionIndexAnswerSpec | TextFuzzyAnswerSpec;

// ---- Case-Based Preview (authored) -----------------------------------------

export type CheckpointKind = "identify" | "decide" | "justify";

export interface DraftCaseSetup {
  story: string;
  role: string;
  task: string;
}

export interface DraftCheckpoint {
  kind: CheckpointKind;
  question: string;
  options: string[];
  // option_index answer_spec — author taps the correct option.
  answer_spec: OptionIndexAnswerSpec;
  learning_block: string;
}

export interface DraftFinalSimulation {
  correct_path: string; // redacted server-side; authored here
  wrong_path: string;
}

export interface DraftFeedbackSummary {
  student_understood: string;
  mistake_appeared: string;
  what_to_review: string;
}

export interface DraftCaseBasedPreview {
  title: string;
  case_setup: DraftCaseSetup;
  checkpoints: DraftCheckpoint[]; // exactly 3
  final_simulation: DraftFinalSimulation;
  feedback_summary: DraftFeedbackSummary;
}

// ---- Flashcards + Memory Check (authored) ----------------------------------

export interface DraftFlashcard {
  term: string;
  def: string;
  hint?: string;
  example?: string;
}

export type MemoryCheckItemType =
  | "mcq"
  | "true_false"
  | "choose_explanation"
  | "fill_blank";

export interface DraftMemoryCheckItem {
  type: MemoryCheckItemType;
  prompt: string;
  // Present for option types (mcq / true_false / choose_explanation); empty
  // for fill_blank.
  options: string[];
  answer_spec: AuthoredAnswerSpec;
}

export interface DraftMemoryCheck {
  pass_threshold_pct: number;
  items: DraftMemoryCheckItem[];
}

// ---- Boss + Practice Arc (authored) ----------------------------------------

export interface DraftBossMeta {
  name: string;
  starting_hp_override: number; // the runtime + backend max-HP source
}

export interface DraftBossQuestion {
  id?: string;
  q: string;
  ans: string[]; // accepted answers (author-visible)
  dmg: number;
  answer_spec: TextFuzzyAnswerSpec;
}

export interface DraftPracticeArc {
  games: string[]; // ordered game keys; Boss is always appended last at save
}

// ---- Full draft ------------------------------------------------------------

export interface BuilderDraft {
  flow_version: "v2";
  case_based_preview: DraftCaseBasedPreview;
  flashcards: DraftFlashcard[];
  memory_check: DraftMemoryCheck;
  practice_arc: DraftPracticeArc;
  boss_meta: DraftBossMeta;
  boss_questions: DraftBossQuestion[];
}

// ---- Homework summary (list/create response slice) -------------------------

export interface HomeworkRow {
  id: string;
  title: string;
  subject: string | null;
  grade: number | string | null;
  mode?: string | null;
  content_json?: Record<string, unknown> | null;
}
