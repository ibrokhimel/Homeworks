// Zustand store for the v2 runtime. Server-authoritative `gateState` is
// hydrated from the API and never set optimistically — the client renders
// gate state, it does not decide it (it has no answers).

import { create } from "zustand";
import type {
  BossTurnResult,
  CheckAnswerResult,
  GateState,
  HydratePayload,
} from "../shared/types";
import {
  bossTurn,
  getGateState,
  submitCheckpoint,
  submitMemoryCheckItem,
} from "../shared/api";
import { resolveGameOrder } from "./gameOrder";

export type Screen = "hub" | "cbp" | "fc" | "gate" | "practice";

// CBP sub-machine: setup → ck0 → lb0 → ck1 → lb1 → ck2 → lb2 → sim → feedback.
export type CbpSubStage = "setup" | "checkpoint" | "learningBlock" | "sim" | "feedback";

// Flashcards/Memory-Check sub-machine (Tile B):
//   flashcards (study the deck) → memoryCheck (graded recall) → result.
// On a failed Memory Check we soft-retry: bounce back to `flashcards` with the
// missed items highlighted, then re-test. Pass/fail is read from the server
// gate (mc.passed) — never decided client-side.
export type FcSubStage = "flashcards" | "memoryCheck" | "result";

// Per-item Memory Check outcome (server-confirmed). `null` = not yet answered.
export type McResult = boolean | null;

const SESSION_KEY = "nets_v2_session_id";

function ensureSessionId(injected: string | null): string {
  if (injected) {
    sessionStorage.setItem(SESSION_KEY, injected);
    return injected;
  }
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const fresh =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}

interface CbpState {
  subStage: CbpSubStage;
  checkpointIndex: number; // 0..2 — current checkpoint
  results: boolean[]; // per-checkpoint correctness (server-confirmed)
  lastFeedback: string | null; // feedback for the just-submitted checkpoint
  lastLearningBlock: string | null; // learning block returned post-submit
  submitting: boolean;
  submitError: string | null;
}

interface FcState {
  subStage: FcSubStage;
  // Flashcards study sub-state.
  cardIndex: number; // current card being shown
  viewedCards: number[]; // indices the student has flipped/seen ≥1×
  // Memory Check sub-state.
  itemIndex: number; // current Memory Check item
  results: McResult[]; // per-item correctness (server-confirmed); null = unanswered
  weakItems: number[]; // item indices answered wrong on the last pass (soft-retry)
  scorePct: number; // running %-correct over answered items
  lastFeedback: string | null; // feedback for the just-submitted item
  lastCorrect: boolean | null; // correctness of the just-submitted item
  submitting: boolean;
  submitError: string | null;
}

// Practice Arc (F4): a linear rail of game keys → Boss last. The arc tracks
// which node is active; each game self-reports completion via `completeGame`.
// `gameOrder` is resolved once on entry (author order, else derived from gb_*
// arrays) — see gameOrder.ts.
interface PracticeState {
  gameOrder: string[]; // ordered game keys; Boss is the final element
  currentGameIndex: number; // 0-based cursor into gameOrder
  completed: boolean[]; // per-node completion (client progress only)
  finished: boolean; // whole arc cleared (Boss defeated / skipped)
}

// Boss Arena (F4): the mastery peak. HP is frontend-authoritative (the backend
// adapter mirrors the client cursor); correctness/damage are ALWAYS read from
// the server boss-turn response — the boss never self-grades. The turn loop
// walks boss_questions in order; each defeated answer drains HP by the
// server-returned `damage_dealt`. status drives win/lose rendering.
export type BossStatus = "intro" | "fighting" | "won" | "lost";

interface BossState {
  hp: number; // boss HP remaining (drains as the student lands hits)
  maxHp: number;
  questionIndex: number; // current boss question
  attemptNumber: number; // attempts on the current question (for hint gating)
  status: BossStatus;
  lastResult: BossTurnResult | null; // most recent server turn (damage/response/hint)
  submitting: boolean;
  submitError: string | null;
}

interface RuntimeState {
  hwId: string;
  sessionId: string;
  payload: HydratePayload | null;
  gateState: GateState | null;
  screen: Screen;
  cbp: CbpState;
  fc: FcState;
  practice: PracticeState;
  boss: BossState;

  // ---- session/boot ----
  initSession: (hwId: string, injectedSessionId: string | null) => void;
  setPayload: (p: HydratePayload) => void;
  setGateState: (g: GateState) => void;
  refreshGateState: () => Promise<void>;

  // ---- navigation ----
  goto: (screen: Screen) => void;
  startCbp: () => void;

  // ---- CBP sub-machine ----
  enterCheckpoint: (index: number) => void;
  submitCheckpointAnswer: (index: number, answer: string) => Promise<CheckAnswerResult | null>;
  advanceFromLearningBlock: () => void;
  enterSimulation: () => void;
  finishCbp: () => Promise<void>;
  retryCheckpoint: (index: number) => void;

  // ---- Flashcards / Memory Check sub-machine (Tile B) ----
  enterFlashcards: () => void;
  setCardIndex: (index: number) => void;
  markViewed: (index: number) => void;
  startMemoryCheck: () => void;
  submitMemoryItem: (index: number, answer: string) => Promise<CheckAnswerResult | null>;
  advanceMemoryItem: () => void;
  finishMemoryCheck: () => Promise<void>;
  retryMemoryCheck: () => void;

  // ---- Unlock Gate ----
  enterUnlockGate: () => void;

  // ---- Practice Arc (F4) ----
  enterPracticeArc: () => void;
  advanceGame: () => void; // mark current node done, move to next (or finish)
  setGameIndex: (index: number) => void;

  // ---- Boss Arena (F4) ----
  startBoss: () => void; // intro → fighting; sizes HP from boss_meta/default
  bossAnswer: (answer: string) => Promise<BossTurnResult | null>;
  advanceBossQuestion: () => void; // next boss question after a landed hit
  retryBoss: () => void; // restart the fight from full HP
}

const initialCbp: CbpState = {
  subStage: "setup",
  checkpointIndex: 0,
  results: [false, false, false],
  lastFeedback: null,
  lastLearningBlock: null,
  submitting: false,
  submitError: null,
};

const initialFc: FcState = {
  subStage: "flashcards",
  cardIndex: 0,
  viewedCards: [],
  itemIndex: 0,
  results: [],
  weakItems: [],
  scorePct: 0,
  lastFeedback: null,
  lastCorrect: null,
  submitting: false,
  submitError: null,
};

const initialPractice: PracticeState = {
  gameOrder: [],
  currentGameIndex: 0,
  completed: [],
  finished: false,
};

// Grade-band-style HP defaults mirror the backend's _fb_default_hp; the actual
// HP arrives from boss_meta.starting_hp_override when authored, else this.
const DEFAULT_BOSS_HP = 100;

const initialBoss: BossState = {
  hp: DEFAULT_BOSS_HP,
  maxHp: DEFAULT_BOSS_HP,
  questionIndex: 0,
  attemptNumber: 1,
  status: "intro",
  lastResult: null,
  submitting: false,
  submitError: null,
};

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  hwId: "",
  sessionId: "",
  payload: null,
  gateState: null,
  screen: "hub",
  cbp: { ...initialCbp },
  fc: { ...initialFc },
  practice: { ...initialPractice },
  boss: { ...initialBoss },

  initSession: (hwId, injectedSessionId) =>
    set({ hwId, sessionId: ensureSessionId(injectedSessionId) }),

  setPayload: (p) => set({ payload: p }),
  setGateState: (g) => set({ gateState: g }),

  refreshGateState: async () => {
    const { hwId, sessionId } = get();
    if (!hwId || !sessionId) return;
    const g = await getGateState(hwId, sessionId);
    set({ gateState: g });
  },

  goto: (screen) => set({ screen }),

  startCbp: () => set({ screen: "cbp", cbp: { ...initialCbp } }),

  enterCheckpoint: (index) =>
    set((st) => ({
      cbp: {
        ...st.cbp,
        subStage: "checkpoint",
        checkpointIndex: index,
        lastFeedback: null,
        lastLearningBlock: null,
        submitError: null,
      },
    })),

  submitCheckpointAnswer: async (index, answer) => {
    const { hwId, sessionId } = get();
    set((st) => ({ cbp: { ...st.cbp, submitting: true, submitError: null } }));
    try {
      const res = await submitCheckpoint(hwId, sessionId, index, answer);
      set((st) => {
        const results = [...st.cbp.results];
        results[index] = res.correct;
        return {
          cbp: {
            ...st.cbp,
            submitting: false,
            results,
            lastFeedback: res.feedback,
            lastLearningBlock: res.learning_block,
            // Always advance to the learning block so the student reads the
            // teaching beat; the gate decides pass/fail at the end.
            subStage: "learningBlock",
          },
        };
      });
      return res;
    } catch (err) {
      set((st) => ({
        cbp: {
          ...st.cbp,
          submitting: false,
          submitError: (err as Error).message || "Submission failed.",
        },
      }));
      return null;
    }
  },

  advanceFromLearningBlock: () => {
    const { cbp, payload } = get();
    const total = payload?.content_json.case_based_preview?.checkpoints?.length ?? 3;
    const next = cbp.checkpointIndex + 1;
    if (next < total) {
      get().enterCheckpoint(next);
    } else {
      get().enterSimulation();
    }
  },

  enterSimulation: () =>
    set((st) => ({ cbp: { ...st.cbp, subStage: "sim" } })),

  finishCbp: async () => {
    // Refetch the server-authoritative gate, then show the feedback summary.
    await get().refreshGateState();
    set((st) => ({ cbp: { ...st.cbp, subStage: "feedback" } }));
  },

  retryCheckpoint: (index) =>
    set((st) => ({
      cbp: {
        ...st.cbp,
        subStage: "checkpoint",
        checkpointIndex: index,
        lastFeedback: null,
        lastLearningBlock: null,
        submitError: null,
      },
    })),

  // ---- Flashcards / Memory Check sub-machine (Tile B) ----

  // Enter the deck from the hub. Fresh start: clear all study + check state.
  enterFlashcards: () => set({ screen: "fc", fc: { ...initialFc } }),

  setCardIndex: (index) => set((st) => ({ fc: { ...st.fc, cardIndex: index } })),

  // Record that a card has been seen ≥1× (the "viewed all" gate that enables
  // "Start Memory Check"). Dedup so the count stays accurate.
  markViewed: (index) =>
    set((st) => {
      if (st.fc.viewedCards.includes(index)) return {};
      return { fc: { ...st.fc, viewedCards: [...st.fc.viewedCards, index] } };
    }),

  // Move from studying into the graded Memory Check. We size `results` to the
  // item count and seed every entry to `null` (unanswered).
  startMemoryCheck: () => {
    const { payload } = get();
    const total = payload?.content_json.memory_check?.items?.length ?? 0;
    set((st) => ({
      fc: {
        ...st.fc,
        subStage: "memoryCheck",
        itemIndex: 0,
        results: Array.from({ length: total }, () => null as McResult),
        scorePct: 0,
        lastFeedback: null,
        lastCorrect: null,
        submitError: null,
      },
    }));
  },

  // Submit one Memory Check item. `answer` is pre-shaped by the component
  // (option index as string, or typed text for fill_blank). Correctness comes
  // straight from the server response — we never self-grade.
  submitMemoryItem: async (index, answer) => {
    const { hwId, sessionId } = get();
    set((st) => ({ fc: { ...st.fc, submitting: true, submitError: null } }));
    try {
      const res = await submitMemoryCheckItem(hwId, sessionId, index, answer);
      set((st) => {
        const results = [...st.fc.results];
        results[index] = res.correct;
        const answered = results.filter((r) => r !== null);
        const correctCount = answered.filter((r) => r === true).length;
        const scorePct = answered.length
          ? Math.round((100 * correctCount) / answered.length)
          : 0;
        return {
          fc: {
            ...st.fc,
            submitting: false,
            results,
            scorePct,
            lastCorrect: res.correct,
            lastFeedback: res.feedback,
          },
        };
      });
      return res;
    } catch (err) {
      set((st) => ({
        fc: {
          ...st.fc,
          submitting: false,
          submitError: (err as Error).message || "Submission failed.",
        },
      }));
      return null;
    }
  },

  // Advance to the next unanswered item, or finish the check if none remain.
  // On a soft-retry pass we only walk the previously-weak items.
  advanceMemoryItem: () => {
    const { fc } = get();
    const inRetry = fc.weakItems.length > 0;
    const order = inRetry
      ? fc.weakItems
      : fc.results.map((_, i) => i);
    const pos = order.indexOf(fc.itemIndex);
    const next = order.slice(pos + 1).find((i) => fc.results[i] === null);
    if (next !== undefined) {
      set((st) => ({
        fc: { ...st.fc, itemIndex: next, lastFeedback: null, lastCorrect: null },
      }));
    } else {
      void get().finishMemoryCheck();
    }
  },

  // End of a Memory Check pass: refetch the server gate, then show the result.
  // The component reads gateState.mc.passed to branch pass vs. soft-retry.
  finishMemoryCheck: async () => {
    await get().refreshGateState();
    set((st) => ({ fc: { ...st.fc, subStage: "result" } }));
  },

  // Soft-retry: bounce back to the deck with the missed items recorded as
  // `weakItems`, reset those entries to unanswered, and re-test just those.
  retryMemoryCheck: () =>
    set((st) => {
      const weakItems = st.fc.results
        .map((r, i) => (r === false ? i : -1))
        .filter((i) => i >= 0);
      const results = st.fc.results.map((r, i) =>
        weakItems.includes(i) ? (null as McResult) : r
      );
      return {
        fc: {
          ...st.fc,
          subStage: "flashcards",
          weakItems,
          results,
          itemIndex: weakItems[0] ?? 0,
          lastFeedback: null,
          lastCorrect: null,
          submitError: null,
        },
      };
    }),

  // ---- Unlock Gate ----
  enterUnlockGate: () => set({ screen: "gate" }),

  // ---- Practice Arc (F4) ----

  // Enter the arc: resolve the game order ONCE (author order, else derived from
  // gb_* arrays + Boss last), size the completion vector, reset to node 0. We
  // do NOT gate on practice_arc_unlocked here — the UnlockGate CTA is the only
  // entry point and it only renders when unlocked, so the gate already passed.
  enterPracticeArc: () => {
    const { payload } = get();
    const gameOrder = resolveGameOrder(payload?.content_json);
    set({
      screen: "practice",
      practice: {
        gameOrder,
        currentGameIndex: 0,
        completed: gameOrder.map(() => false),
        finished: gameOrder.length === 0,
      },
      boss: { ...initialBoss },
    });
  },

  // Mark the current node complete and advance. When the last node clears, the
  // whole arc is finished. Each game calls this when it self-reports done.
  advanceGame: () =>
    set((st) => {
      const completed = [...st.practice.completed];
      completed[st.practice.currentGameIndex] = true;
      const next = st.practice.currentGameIndex + 1;
      const finished = next >= st.practice.gameOrder.length;
      return {
        practice: {
          ...st.practice,
          completed,
          currentGameIndex: finished ? st.practice.currentGameIndex : next,
          finished,
        },
      };
    }),

  setGameIndex: (index) =>
    set((st) => ({ practice: { ...st.practice, currentGameIndex: index } })),

  // ---- Boss Arena (F4) ----

  // Begin the fight. HP comes from boss_meta.starting_hp_override when authored
  // (the backend uses the same field as its max-HP source), else the default.
  startBoss: () => {
    const { payload } = get();
    const meta = payload?.content_json.boss_meta;
    const hp =
      typeof meta?.starting_hp_override === "number" && meta.starting_hp_override >= 10
        ? meta.starting_hp_override
        : DEFAULT_BOSS_HP;
    set({
      boss: {
        ...initialBoss,
        hp,
        maxHp: hp,
        status: "fighting",
      },
    });
  },

  // Submit one boss answer. Correctness + damage come straight from the server
  // (phase=final-boss resolves the expected answer by question_id; the client
  // holds no answer). On a correct hit we drain HP by the server's
  // `damage_dealt`; HP hitting 0 is the WIN. On a miss we bump the attempt
  // counter (server gates hints on attempt ≥ 2). The boss never self-grades.
  bossAnswer: async (answer) => {
    const { hwId, sessionId, payload, boss } = get();
    const questions = payload?.content_json.boss_questions ?? [];
    const question = questions[boss.questionIndex];
    // Backend _fb_find_boss_question resolves by q.id, else the canonical
    // synthetic "bq_{i}" / "{i}". Use bq_{i} when the question has no authored id.
    const questionId = question?.id ?? `bq_${boss.questionIndex}`;
    const bossType = payload?.content_json.boss_meta?.boss_type;

    set((st) => ({ boss: { ...st.boss, submitting: true, submitError: null } }));
    try {
      const res = await bossTurn(hwId, sessionId, questionId, answer, {
        hpRemaining: boss.hp,
        attemptNumber: boss.attemptNumber,
        bossType,
      });
      // attempts_max gates losses: null/absent = unlimited (the student can
      // keep swinging). When authored, a wrong answer that exhausts the cap
      // ends the fight as a loss. The server's per-turn `correct` is canonical.
      const attemptsMax = payload?.content_json.boss_meta?.attempts_max ?? null;
      set((st) => {
        const dmg = Number(res.damage_dealt) || 0;
        const hp = Math.max(0, st.boss.hp - dmg);
        const won = hp <= 0;
        const nextAttempt = res.correct ? st.boss.attemptNumber : st.boss.attemptNumber + 1;
        const lost =
          !won &&
          !res.correct &&
          typeof attemptsMax === "number" &&
          nextAttempt > attemptsMax;
        return {
          boss: {
            ...st.boss,
            submitting: false,
            hp,
            lastResult: res,
            // Wrong answer → same question, next attempt (unlocks server hint).
            // Correct answer keeps the attempt counter; advanceBossQuestion
            // resets it when moving on.
            attemptNumber: nextAttempt,
            status: won ? "won" : lost ? "lost" : st.boss.status,
          },
        };
      });
      return res;
    } catch (err) {
      set((st) => ({
        boss: {
          ...st.boss,
          submitting: false,
          submitError: (err as Error).message || "Boss turn failed.",
        },
      }));
      return null;
    }
  },

  // Move to the next boss question after a landed hit. If the boss still has HP
  // but we've run out of authored questions, loop back to the first question
  // (the boss isn't down yet — the student keeps attacking). Resets attempts.
  advanceBossQuestion: () =>
    set((st) => {
      const total = get().payload?.content_json.boss_questions?.length ?? 0;
      const next = total > 0 ? (st.boss.questionIndex + 1) % total : 0;
      return {
        boss: {
          ...st.boss,
          questionIndex: next,
          attemptNumber: 1,
          lastResult: null,
        },
      };
    }),

  // Restart the fight from full HP (after a loss or for a replay).
  retryBoss: () => {
    const { boss } = get();
    set({
      boss: {
        ...initialBoss,
        hp: boss.maxHp,
        maxHp: boss.maxHp,
        status: "fighting",
      },
    });
  },
}));
