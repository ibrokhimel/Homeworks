// Draft factory + (content_json ⇄ BuilderDraft) converters.
//
// `toContentJson(draft)` produces the persisted v2 content_json (answers
// INCLUDED — correct: the runtime redactor strips them on delivery).
// `fromContentJson(raw)` coerces an UNREDACTED authoring read back into the
// strict draft so an existing v2 homework can be edited. Both are total: a
// missing/partial blob yields a sane empty draft so the editors never crash.

import type {
  AuthoredAnswerSpec,
  BuilderDraft,
  CheckpointKind,
  DraftCheckpoint,
  DraftFlashcard,
  DraftMemoryCheckItem,
  DraftBossQuestion,
  MemoryCheckItemType,
  OptionIndexAnswerSpec,
} from "./types";

const CHECKPOINT_KINDS: CheckpointKind[] = ["identify", "decide", "justify"];

export function optionIndexSpec(
  expected: number,
  optionCount: number
): OptionIndexAnswerSpec {
  return { type: "option_index", expected, option_count: optionCount };
}

function emptyCheckpoint(kind: CheckpointKind): DraftCheckpoint {
  return {
    kind,
    question: "",
    options: ["", "", "", ""],
    answer_spec: optionIndexSpec(0, 4),
    learning_block: "",
  };
}

/** A fresh, valid v2 draft: 3 checkpoints, an empty deck, a starter boss. */
export function emptyDraft(): BuilderDraft {
  return {
    flow_version: "v2",
    case_based_preview: {
      title: "",
      case_setup: { story: "", role: "", task: "" },
      checkpoints: CHECKPOINT_KINDS.map(emptyCheckpoint),
      final_simulation: { correct_path: "", wrong_path: "" },
      feedback_summary: {
        student_understood: "",
        mistake_appeared: "",
        what_to_review: "",
      },
    },
    flashcards: [],
    memory_check: { pass_threshold_pct: 60, items: [] },
    practice_arc: { games: ["tile_match"] },
    boss_meta: { name: "", starting_hp_override: 100 },
    boss_questions: [],
  };
}

export function emptyFlashcard(): DraftFlashcard {
  return { term: "", def: "", hint: "", example: "" };
}

export function emptyMemoryItem(
  type: MemoryCheckItemType = "mcq"
): DraftMemoryCheckItem {
  if (type === "fill_blank") {
    return {
      type,
      prompt: "",
      options: [],
      answer_spec: { type: "text_fuzzy", expected: "", allow_ai_fallback: true },
    };
  }
  const options = type === "true_false" ? ["True", "False"] : ["", "", "", ""];
  return {
    type,
    prompt: "",
    options,
    answer_spec: optionIndexSpec(0, options.length),
  };
}

export function emptyBossQuestion(): DraftBossQuestion {
  return {
    q: "",
    ans: [""],
    dmg: 25,
    answer_spec: { type: "text_fuzzy", expected: "", allow_ai_fallback: true },
  };
}

// --------------------------------------------------------------------------- //
// draft → content_json (persist).
// --------------------------------------------------------------------------- //

/** Serialize the draft to the persisted content_json (answers included). */
export function toContentJson(draft: BuilderDraft): Record<string, unknown> {
  const cbp = draft.case_based_preview;
  // Boss is ALWAYS the last node of the arc (mastery peak); guarantee it.
  const games = draft.practice_arc.games.filter((g) => g !== "boss");
  games.push("boss");

  return {
    flow_version: "v2",
    case_based_preview: {
      title: cbp.title,
      case_setup: { ...cbp.case_setup },
      checkpoints: cbp.checkpoints.map((ck) => ({
        kind: ck.kind,
        question: ck.question,
        options: [...ck.options],
        answer_spec: { ...ck.answer_spec, option_count: ck.options.length },
        learning_block: ck.learning_block,
      })),
      final_simulation: { ...cbp.final_simulation },
      feedback_summary: { ...cbp.feedback_summary },
    },
    flashcards: draft.flashcards.map((c) => ({
      term: c.term,
      def: c.def,
      ...(c.hint ? { hint: c.hint } : {}),
      ...(c.example ? { example: c.example } : {}),
    })),
    memory_check: {
      pass_threshold_pct: draft.memory_check.pass_threshold_pct,
      items: draft.memory_check.items.map((it) =>
        it.type === "fill_blank"
          ? {
              type: it.type,
              prompt: it.prompt,
              answer_spec: { ...it.answer_spec },
            }
          : {
              type: it.type,
              prompt: it.prompt,
              options: [...it.options],
              answer_spec: {
                ...it.answer_spec,
                ...(it.answer_spec.type === "option_index"
                  ? { option_count: it.options.length }
                  : {}),
              },
            }
      ),
    },
    practice_arc: { games },
    boss_meta: {
      name: draft.boss_meta.name,
      starting_hp_override: draft.boss_meta.starting_hp_override,
    },
    boss_questions: draft.boss_questions.map((bq, i) => ({
      id: bq.id || `bq_${i}`,
      q: bq.q,
      ans: bq.ans.filter((a) => a.trim() !== ""),
      dmg: bq.dmg,
      answer_spec: { ...bq.answer_spec },
    })),
  };
}

// --------------------------------------------------------------------------- //
// content_json → draft (load for editing). Total + defensive.
// --------------------------------------------------------------------------- //

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function coerceAnswerSpec(
  raw: unknown,
  options: string[]
): AuthoredAnswerSpec {
  const a = asObj(raw);
  const type = asStr(a.type);
  if (type === "text_fuzzy" || (!type && options.length === 0)) {
    return {
      type: "text_fuzzy",
      expected: asStr(a.expected),
      allow_ai_fallback: a.allow_ai_fallback !== false,
    };
  }
  // option_index: prefer `expected`, fall back to legacy `option_index`.
  const idx =
    typeof a.expected === "number"
      ? a.expected
      : typeof a.option_index === "number"
      ? a.option_index
      : 0;
  return optionIndexSpec(idx, options.length || asNum(a.option_count, 0));
}

/** Coerce an unredacted authoring read into a strict, editable draft. */
export function fromContentJson(raw: unknown): BuilderDraft {
  const base = emptyDraft();
  const c = asObj(raw);

  // ---- Case-Based Preview ----
  const cbp = asObj(c.case_based_preview);
  const setup = asObj(cbp.case_setup);
  base.case_based_preview.title = asStr(cbp.title);
  base.case_based_preview.case_setup = {
    story: asStr(setup.story),
    role: asStr(setup.role),
    task: asStr(setup.task),
  };
  const rawCheckpoints = asArr(cbp.checkpoints);
  if (rawCheckpoints.length > 0) {
    base.case_based_preview.checkpoints = rawCheckpoints
      .slice(0, 3)
      .map((rck, i) => {
        const ck = asObj(rck);
        const options = asArr(ck.options).map((o) => asStr(o));
        const opts = options.length ? options : ["", "", "", ""];
        const spec = coerceAnswerSpec(ck.answer_spec, opts);
        return {
          kind: (CHECKPOINT_KINDS.includes(asStr(ck.kind) as CheckpointKind)
            ? asStr(ck.kind)
            : CHECKPOINT_KINDS[i % 3]) as CheckpointKind,
          question: asStr(ck.question),
          options: opts,
          answer_spec:
            spec.type === "option_index"
              ? spec
              : optionIndexSpec(0, opts.length),
          learning_block: asStr(ck.learning_block),
        };
      });
    // Pad to exactly 3 so the editor invariant holds.
    while (base.case_based_preview.checkpoints.length < 3) {
      base.case_based_preview.checkpoints.push(
        emptyCheckpoint(CHECKPOINT_KINDS[base.case_based_preview.checkpoints.length])
      );
    }
  }
  const sim = asObj(cbp.final_simulation);
  base.case_based_preview.final_simulation = {
    correct_path: asStr(sim.correct_path),
    wrong_path: asStr(sim.wrong_path),
  };
  const fs = asObj(cbp.feedback_summary);
  base.case_based_preview.feedback_summary = {
    student_understood: asStr(fs.student_understood),
    mistake_appeared: asStr(fs.mistake_appeared),
    what_to_review: asStr(fs.what_to_review),
  };

  // ---- Flashcards ----
  base.flashcards = asArr(c.flashcards).map((rc) => {
    const card = asObj(rc);
    return {
      term: asStr(card.term, asStr(card.front)),
      def: asStr(card.def, asStr(card.definition, asStr(card.back))),
      hint: asStr(card.hint) || undefined,
      example: asStr(card.example) || undefined,
    };
  });

  // ---- Memory Check ----
  const mc = asObj(c.memory_check);
  base.memory_check.pass_threshold_pct = asNum(mc.pass_threshold_pct, 60);
  base.memory_check.items = asArr(mc.items).map((ri) => {
    const item = asObj(ri);
    const type = (
      ["mcq", "true_false", "choose_explanation", "fill_blank"].includes(
        asStr(item.type)
      )
        ? asStr(item.type)
        : "mcq"
    ) as MemoryCheckItemType;
    const options =
      type === "fill_blank" ? [] : asArr(item.options).map((o) => asStr(o));
    return {
      type,
      prompt: asStr(item.prompt),
      options,
      answer_spec: coerceAnswerSpec(item.answer_spec, options),
    };
  });

  // ---- Practice Arc ----
  const arc = asObj(c.practice_arc);
  const games = asArr(arc.games)
    .map((g) => asStr(g))
    .filter((g) => g && g !== "boss");
  base.practice_arc.games = games.length ? games : ["tile_match"];

  // ---- Boss ----
  const meta = asObj(c.boss_meta);
  base.boss_meta = {
    name: asStr(meta.name, asStr(c.boss_name)),
    starting_hp_override: asNum(meta.starting_hp_override, 100),
  };
  base.boss_questions = asArr(c.boss_questions).map((rq, i) => {
    const q = asObj(rq);
    const ansList = asArr(q.ans).map((a) => asStr(a));
    const spec = coerceAnswerSpec(q.answer_spec, []);
    return {
      id: asStr(q.id) || `bq_${i}`,
      q: asStr(q.q, asStr(q.prompt)),
      ans: ansList.length ? ansList : [""],
      dmg: asNum(q.dmg, 25),
      answer_spec:
        spec.type === "text_fuzzy"
          ? spec
          : {
              type: "text_fuzzy",
              expected: ansList[0] ?? "",
              allow_ai_fallback: true,
            },
    };
  });

  return base;
}
