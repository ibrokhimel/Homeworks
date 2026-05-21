// Zustand store for the v2 runtime. Server-authoritative `gateState` is
// hydrated from the API and never set optimistically — the client renders
// gate state, it does not decide it (it has no answers).

import { create } from "zustand";
import type { CheckAnswerResult, GateState, HydratePayload } from "../shared/types";
import { getGateState, submitCheckpoint } from "../shared/api";

export type Screen = "hub" | "cbp" | "fc";

// CBP sub-machine: setup → ck0 → lb0 → ck1 → lb1 → ck2 → lb2 → sim → feedback.
export type CbpSubStage = "setup" | "checkpoint" | "learningBlock" | "sim" | "feedback";

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

interface RuntimeState {
  hwId: string;
  sessionId: string;
  payload: HydratePayload | null;
  gateState: GateState | null;
  screen: Screen;
  cbp: CbpState;

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

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  hwId: "",
  sessionId: "",
  payload: null,
  gateState: null,
  screen: "hub",
  cbp: { ...initialCbp },

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
}));
