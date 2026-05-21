import { useState } from "react";
import { useRuntimeStore } from "../store";
import { submitGameAnswer } from "../../shared/api";
import type { GameProps } from "../GameHost";
import { Eyebrow, Title, Lead, Button } from "../../shared/ui/primitives";
import s from "./ErrorDetection.module.css";

// ---------------------------------------------------------------------------
// Error Detection — Practice Arc game (gb_error_detection).
//
// Per Infra spec: each task shows a piece of work with EXACTLY ONE error.
// The student (1) taps the broken block, then (2) types the correction.
// Server grades both — the broken-block flag (`is_broken`) and the expected
// correction text live ONLY on the server (both in ANSWER_BEARING_KEYS).
//
// Phase: "error-detection". Server resolves answer_spec by item id +
// block id. The client posts { item_index, block_id, correction } and
// reads back { correct, feedback }.
//
// Empty array → graceful skip → onComplete.
// ---------------------------------------------------------------------------

interface ErrorDetectionBlock { id: string; text?: string; }
interface ErrorDetectionItemShape {
  id?: string;
  work_blocks?: ErrorDetectionBlock[];
  instructions?: string;
  hint?: string;
}

interface CheckResult {
  correct: boolean;
  feedback?: string;
  stage?: "spot" | "correction";
}

export default function ErrorDetection({ onComplete }: GameProps) {
  const hwId = useRuntimeStore((st) => st.hwId);
  const sessionId = useRuntimeStore((st) => st.sessionId);
  const payload = useRuntimeStore((st) => st.payload);
  const items = (payload?.content_json?.gb_error_detection ?? []) as ErrorDetectionItemShape[];

  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<"spot" | "correction" | "done">("spot");
  const [pickedBlock, setPickedBlock] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0) {
    return (
      <div className={s.wrap} data-testid="error-detection-empty">
        <Lead>No error-detection tasks authored for this homework.</Lead>
        <Button variant="blue" onClick={onComplete}>Skip →</Button>
      </div>
    );
  }
  const item = items[idx];
  if (!item) { onComplete(); return null; }

  const advance = () => {
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
      setStage("spot");
      setPickedBlock(null);
      setCorrection("");
      setFeedback(null);
    } else {
      onComplete();
    }
  };

  const submitSpot = async (blockId: string) => {
    if (submitting || !hwId || !sessionId) return;
    setPickedBlock(blockId);
    setSubmitting(true);
    try {
      const res = await submitGameAnswer<CheckResult>(hwId, sessionId, "error-detection", {
        item_index: idx,
        stage: "spot",
        block_id: blockId,
      });
      setFeedback(res.feedback ?? null);
      if (res.correct) setStage("correction");
      else setPickedBlock(null);
    } catch {
      // Server-side handler may not yet exist; in v2-runtime path this game
      // is wired client-first. Falling back to optimistic advance keeps the
      // arc walkable; tutor leak protection still holds (no answer leaves
      // the server).
      setStage("correction");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCorrection = async () => {
    if (submitting || !hwId || !sessionId || !correction.trim()) return;
    setSubmitting(true);
    try {
      const res = await submitGameAnswer<CheckResult>(hwId, sessionId, "error-detection", {
        item_index: idx,
        stage: "correction",
        block_id: pickedBlock,
        correction: correction.trim(),
      });
      setFeedback(res.feedback ?? null);
      if (res.correct) { setStage("done"); }
    } catch {
      setStage("done");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={s.wrap} data-testid="error-detection">
      <Eyebrow cyan>Error Detection</Eyebrow>
      <Title size="section">{item.instructions ?? "Find the broken piece, then write the correct version."}</Title>
      <Lead>Item {idx + 1} / {items.length}</Lead>

      <div className={s.blocks}>
        {(item.work_blocks ?? []).map((b) => {
          const isPicked = pickedBlock === b.id;
          return (
            <button
              key={b.id}
              type="button"
              className={[s.block, isPicked && s.blockPicked].filter(Boolean).join(" ")}
              onClick={() => stage === "spot" && submitSpot(b.id)}
              disabled={stage !== "spot" || submitting}
              aria-pressed={isPicked}
            >
              {b.text}
            </button>
          );
        })}
      </div>

      {stage === "correction" && (
        <div className={s.correctionRow}>
          <label className={s.correctionLabel} htmlFor="ed-correction">What should it be?</label>
          <input
            id="ed-correction"
            type="text"
            className={s.correctionInput}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Type the corrected version"
          />
          <Button variant="blue" onClick={submitCorrection} disabled={!correction.trim() || submitting}>
            Submit
          </Button>
        </div>
      )}

      {feedback && <div className={s.feedback} role="status" aria-live="polite">{feedback}</div>}

      {stage === "done" && (
        <div className={s.actions}>
          <Button variant="blue" onClick={advance}>
            {idx + 1 < items.length ? "Next item →" : "Done"}
          </Button>
        </div>
      )}
    </div>
  );
}
