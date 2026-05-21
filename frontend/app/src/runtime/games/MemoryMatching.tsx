import { useState } from "react";
import { useRuntimeStore } from "../store";
import { submitGameAnswer } from "../../shared/api";
import type { GameProps } from "../GameHost";
import { Eyebrow, Title, Lead, Button } from "../../shared/ui/primitives";
import s from "./MemoryMatching.module.css";

// ---------------------------------------------------------------------------
// Memory Matching — Practice Arc game (gb_memory_matching).
//
// Per Infra spec (MemoryMatching.md): exactly 3 MCQ checkpoints
// (Identify → Decide → Justify) + a Decision-Process Explanation (DPE)
// + recall consequence. The student's goal is to reconstruct meaning from
// memory, NOT to memorize card positions.
//
// Server-side: each checkpoint is graded via
//   /api/ai/check-answer?phase=memory-matching
// posting { item_index, checkpoint_index, option_index }. The answer_spec
// lives ONLY on the server (answer_spec key is in ANSWER_BEARING_KEYS).
// Until that handler lands, the client falls back to advance-on-submit so
// the arc remains walkable.
// ---------------------------------------------------------------------------

interface CheckpointShape {
  question?: string;
  options?: string[];
  learning_block?: string;
}
interface MemoryMatchingItemShape {
  id?: string;
  case_setup?: string;
  checkpoints?: CheckpointShape[];     // exactly 3 per spec
  dpe?: { prompt?: string };
  consequence?: { correct_path?: string; wrong_path?: string };
}

interface CheckResult { correct: boolean; feedback?: string; }

export default function MemoryMatching({ onComplete }: GameProps) {
  const hwId = useRuntimeStore((st) => st.hwId);
  const sessionId = useRuntimeStore((st) => st.sessionId);
  const payload = useRuntimeStore((st) => st.payload);
  const items = (payload?.content_json?.gb_memory_matching ?? []) as MemoryMatchingItemShape[];

  const [itemIdx, setItemIdx] = useState(0);
  // -1 = case setup; 0..2 = checkpoint; 3 = DPE; 4 = consequence
  const [step, setStep] = useState<number>(-1);
  const [dpeText, setDpeText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <div className={s.wrap} data-testid="memory-matching-empty">
        <Lead>No memory-matching cases authored for this homework.</Lead>
        <Button variant="blue" onClick={onComplete}>Skip →</Button>
      </div>
    );
  }
  const item = items[itemIdx];
  if (!item) { onComplete(); return null; }

  const advanceCase = () => {
    setFeedback(null);
    setDpeText("");
    if (itemIdx + 1 < items.length) {
      setItemIdx(itemIdx + 1);
      setStep(-1);
    } else {
      onComplete();
    }
  };

  const submitCheckpoint = async (optionIndex: number) => {
    if (busy || !hwId || !sessionId) return;
    setBusy(true);
    try {
      const res = await submitGameAnswer<CheckResult>(hwId, sessionId, "memory-matching", {
        item_index: itemIdx,
        checkpoint_index: step,
        option_index: optionIndex,
      });
      setFeedback(res.feedback ?? null);
    } catch {
      // Server handler not yet present in this branch — keep arc walkable.
    } finally {
      setBusy(false);
      setStep(step + 1);
    }
  };

  const submitDpe = async () => {
    if (busy || !hwId || !sessionId || !dpeText.trim()) return;
    setBusy(true);
    try {
      await submitGameAnswer<CheckResult>(hwId, sessionId, "memory-matching", {
        item_index: itemIdx,
        stage: "dpe",
        text: dpeText.trim(),
      });
    } catch { /* fall through */ }
    finally {
      setBusy(false);
      setStep(4);
    }
  };

  return (
    <div className={s.wrap} data-testid="memory-matching">
      <Eyebrow cyan>Memory Matching</Eyebrow>
      <Title size="section">Case {itemIdx + 1} / {items.length}</Title>

      {step === -1 && (
        <>
          <Lead>{item.case_setup ?? "Read the case, then start the checkpoints."}</Lead>
          <div className={s.actions}>
            <Button variant="blue" onClick={() => setStep(0)}>Start →</Button>
          </div>
        </>
      )}

      {step >= 0 && step <= 2 && (
        <>
          <div className={s.eyebrowStep}>Checkpoint {step + 1} of 3</div>
          <Lead>{item.checkpoints?.[step]?.question ?? "(missing question)"}</Lead>
          <div className={s.options}>
            {(item.checkpoints?.[step]?.options ?? []).map((opt, i) => (
              <button
                key={i}
                type="button"
                className={s.option}
                disabled={busy}
                onClick={() => submitCheckpoint(i)}
              >
                {opt}
              </button>
            ))}
          </div>
          {feedback && <div className={s.feedback}>{feedback}</div>}
        </>
      )}

      {step === 3 && (
        <>
          <div className={s.eyebrowStep}>Explain your decision</div>
          <Lead>{item.dpe?.prompt ?? "Walk through your reasoning: which concept did you reconstruct, why, and what mistake would happen if you relied on card position?"}</Lead>
          <textarea
            className={s.dpe}
            value={dpeText}
            onChange={(e) => setDpeText(e.target.value)}
            placeholder="2-4 sentences"
            rows={4}
          />
          <div className={s.actions}>
            <Button variant="blue" onClick={submitDpe} disabled={!dpeText.trim() || busy}>Submit</Button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className={s.eyebrowStep}>Consequence</div>
          <Lead>{item.consequence?.correct_path ?? "Case complete. Your reconstruction is being scored."}</Lead>
          <div className={s.actions}>
            <Button variant="blue" onClick={advanceCase}>
              {itemIdx + 1 < items.length ? "Next case →" : "Done"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
