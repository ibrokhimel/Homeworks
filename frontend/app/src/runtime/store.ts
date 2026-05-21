// Zustand store for the v2 runtime. Server-authoritative `gateState` is
// hydrated from the API and never set optimistically — the client renders
// gate state, it does not decide it (it has no answers).

import { create } from "zustand";
import type { CheckAnswerResult, GateState, HydratePayload } from "../shared/types";
import { getGateState, submitCheckpoint, submitMemoryCheckItem } from "../shared/api";

export type Screen = "hub" | "cbp" | "fc" | "gate";

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

interface RuntimeState {
  hwId: string;
  sessionId: string;
  payload: HydratePayload | null;
  gateState: GateState | null;
  screen: Screen;
  cbp: CbpState;
  fc: FcState;

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

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  hwId: "",
  sessionId: "",
  payload: null,
  gateState: null,
  screen: "hub",
  cbp: { ...initialCbp },
  fc: { ...initialFc },

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
}));
