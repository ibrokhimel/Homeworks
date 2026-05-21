import { useMemo, useState } from "react";
import { useRuntimeStore } from "../store";
import type { GameProps } from "../GameHost";
import { Eyebrow, Title, Lead, Button } from "../../shared/ui/primitives";
import s from "./Assembly.module.css";

// ---------------------------------------------------------------------------
// Assembly — Practice Arc game (gb_assembly).
//
// Spec note: the Infra zip's "Gamified Practices/Assembly/" folder is empty,
// so this is a minimal-but-real implementation built from first principles:
// the student arranges a shuffled set of pieces into the correct sequence.
// The expected order lives only on the server (expected_order is in
// ANSWER_BEARING_KEYS); grading happens via /api/ai/check-answer phase
// "assembly" with the student's ordered piece-id list.
//
// Until that server-side handler lands (a follow-up PR), the component
// renders the pieces, lets the student arrange them, and accepts client-side
// confirmation purely to fire onComplete — the grading hook is wired but
// returns optimistically when the endpoint 404s. This keeps the arc walkable
// today and gives the server side a clean integration target tomorrow.
// ---------------------------------------------------------------------------

interface AssemblyPiece { id: string; label?: string; }
interface AssemblyItemShape {
  id?: string;
  pieces?: AssemblyPiece[];
  instructions?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Assembly({ onComplete }: GameProps) {
  const payload = useRuntimeStore((st) => st.payload);
  const items = (payload?.content_json?.gb_assembly ?? []) as AssemblyItemShape[];
  const [idx, setIdx] = useState(0);
  const item = items[idx];
  const initial = useMemo(
    () => shuffle((item?.pieces ?? []).map((p) => p.id)),
    [item?.id, idx],
  );
  const [order, setOrder] = useState<string[]>(initial);

  // Re-seed shuffled order whenever the item changes.
  if (order.join("|") !== initial.join("|") && order.length !== initial.length) {
    setOrder(initial);
  }

  if (items.length === 0) {
    return (
      <div className={s.wrap} data-testid="assembly-empty">
        <Lead>No assembly puzzles authored for this homework.</Lead>
        <Button variant="blue" onClick={onComplete}>Skip →</Button>
      </div>
    );
  }
  if (!item) {
    onComplete();
    return null;
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
  };

  const confirm = () => {
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
      setOrder(shuffle((items[idx + 1].pieces ?? []).map((p) => p.id)));
    } else {
      onComplete();
    }
  };

  return (
    <div className={s.wrap} data-testid="assembly">
      <Eyebrow cyan>Assembly</Eyebrow>
      <Title size="section">{item.instructions ?? "Arrange the pieces in order."}</Title>
      <Lead>Item {idx + 1} / {items.length}</Lead>

      <ol className={s.list} aria-label="Assembly pieces">
        {order.map((pid, i) => {
          const piece = (item.pieces ?? []).find((p) => p.id === pid);
          return (
            <li key={pid} className={s.row}>
              <span className={s.label}>{piece?.label ?? pid}</span>
              <span className={s.controls}>
                <Button variant="outline" onClick={() => move(i, i - 1)} disabled={i === 0}>↑</Button>
                <Button variant="outline" onClick={() => move(i, i + 1)} disabled={i === order.length - 1}>↓</Button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className={s.actions}>
        <Button variant="blue" onClick={confirm}>
          {idx + 1 < items.length ? "Next item →" : "Done"}
        </Button>
      </div>
    </div>
  );
}
