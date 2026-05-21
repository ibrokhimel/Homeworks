import { useState } from "react";
import { useRuntimeStore } from "../store";
import { submitGameAnswer } from "../../shared/api";
import type { GameProps } from "../GameHost";
import { Eyebrow, Title, Lead, Button } from "../../shared/ui/primitives";
import s from "./JigsawMatching.module.css";

// ---------------------------------------------------------------------------
// Jigsaw Matching — Practice Arc game (gb_jigsaw_matching).
//
// Per Infra spec (JigsawMatching.md): the student decides which two
// source-supported nodes fit together (Identify), names the relationship
// type they form (Decide), and justifies why a close-but-wrong combination
// cannot fit (Justify) — 3 MCQ checkpoints + DPE + consequence, same shape
// as Memory Matching but tests RELATIONSHIP reasoning instead of recall.
//
// Phase: "jigsaw-matching". Same server-resolved answer_spec pattern.
// ---------------------------------------------------------------------------

interface CheckpointShape { question?: string; options?: string[]; }
interface JigsawMatchingItemShape {
  id?: string;
  case_setup?: string;
  pieces?: { id: string; label?: string; role?: string }[];
  checkpoints?: CheckpointShape[];     // exactly 3 per spec
  dpe?: { prompt?: string };
  consequence?: { correct_path?: string; wrong_path?: string };
}

interface CheckResult { correct: boolean; feedback?: string; }

export default function JigsawMatching({ onComplete }: GameProps) {
  const hwId = useRuntimeStore((st) => st.hwId);
  const sessionId = useRuntimeStore((st) => st.sessionId);
  const payload = useRuntimeStore((st) => st.payload);
  const items = (payload?.content_json?.gb_jigsaw_matching ?? []) as JigsawMatchingItemShape[];

  const [itemIdx, setItemIdx] = useState(0);
  const [step, setStep] = useState<number>(-1); // -1 = case setup
  const [dpeText, setDpeText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <div className={s.wrap} data-testid="jigsaw-matching-empty">
        <Lead>No jigsaw-matching cases authored for this homework.</Lead>
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
      setItemIdx(itemIdx + 1); setStep(-1);
    } else { onComplete(); }
  };

  const submitCheckpoint = async (optionIndex: number) => {
    if (busy || !hwId || !sessionId) return;
    setBusy(true);
    try {
      const res = await submitGameAnswer<CheckResult>(hwId, sessionId, "jigsaw-matching", {
        item_index: itemIdx, checkpoint_index: step, option_index: optionIndex,
      });
      setFeedback(res.feedback ?? null);
    } catch { /* keep arc walkable */ }
    finally { setBusy(false); setStep(step + 1); }
  };

  const submitDpe = async () => {
    if (busy || !hwId || !sessionId || !dpeText.trim()) return;
    setBusy(true);
    try {
      await submitGameAnswer<CheckResult>(hwId, sessionId, "jigsaw-matching", {
        item_index: itemIdx, stage: "dpe", text: dpeText.trim(),
      });
    } catch { /* */ } finally { setBusy(false); setStep(4); }
  };

  return (
    <div className={s.wrap} data-testid="jigsaw-matching">
      <Eyebrow cyan>Jigsaw Matching</Eyebrow>
      <Title size="section">Case {itemIdx + 1} / {items.length}</Title>

      {step === -1 && (
        <>
          <Lead>{item.case_setup ?? "Read the case, then start the checkpoints."}</Lead>
          {item.pieces && item.pieces.length > 0 && (
            <ul className={s.pieces} aria-label="Available pieces">
              {item.pieces.map((p) => (
                <li key={p.id} className={s.piece}>
                  <span className={s.pieceLabel}>{p.label ?? p.id}</span>
                  {p.role && <span className={s.pieceRole}>{p.role}</span>}
                </li>
              ))}
            </ul>
          )}
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
              >{opt}</button>
            ))}
          </div>
          {feedback && <div className={s.feedback}>{feedback}</div>}
        </>
      )}

      {step === 3 && (
        <>
          <div className={s.eyebrowStep}>Explain your decision</div>
          <Lead>{item.dpe?.prompt ?? "Explain: which two pieces fit, what relationship they form, and why the close-but-wrong combination cannot."}</Lead>
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
          <Lead>{item.consequence?.correct_path ?? "Case complete. Your reasoning is being scored."}</Lead>
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
