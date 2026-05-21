import { useEffect, useMemo, useState } from "react";
import { useRuntimeStore } from "../store";
import { submitTileMatch } from "../../shared/api";
import type { GameProps } from "../GameHost";
import type { TileMatchTile } from "../../shared/types";
import { Eyebrow, Title, Lead, Pill, Button } from "../../shared/ui/primitives";
import s from "./TileMatch.module.css";

// ---------------------------------------------------------------------------
// Tile Match — the F4 reference game (proves the GameHost registry).
//
// `gb_tile_match` arrives as pairs with a shared `id`, a `left` (concept) and a
// `right` (definition). We render two shuffled columns of tiles. The student
// taps a left tile, then a right tile; we submit BOTH tile ids to the server,
// which holds the answer key — a match is correct iff left_id === right_id
// (each pair shares one id). Correctness is ALWAYS the server's call; the
// client never compares strings. Complete when the server reports all pairs
// matched. On a wrong match the server returns a `hint` (the left text of the
// picked right tile's TRUE partner — already on screen, so not a new leak).
// ---------------------------------------------------------------------------

interface SideTile {
  pairId: string;
  text: string;
}

// Stable shuffle seeded off the pair ids so a re-render doesn't re-order tiles
// mid-game (which would feel broken). Fisher–Yates over a copy.
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function TileMatch({ onComplete }: GameProps) {
  const hwId = useRuntimeStore((st) => st.hwId);
  const sessionId = useRuntimeStore((st) => st.sessionId);
  const payload = useRuntimeStore((st) => st.payload);

  const tiles = (payload?.content_json.gb_tile_match ?? []) as TileMatchTile[];
  const totalPairs = tiles.length;

  // Side columns, shuffled once (seeded off pair count so it's stable).
  const { lefts, rights } = useMemo(() => {
    const seed = tiles.reduce((acc, t) => acc + (t.id?.length ?? 0) + 7, totalPairs);
    const l: SideTile[] = tiles.map((t) => ({ pairId: t.id, text: t.left }));
    const r: SideTile[] = tiles.map((t) => ({ pairId: t.id, text: t.right }));
    return { lefts: shuffle(l, seed), rights: shuffle(r, seed + 31) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPairs]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<string | null>(null); // right pairId
  const [hint, setHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  // Clear the wrong-flash highlight after a beat.
  useEffect(() => {
    if (!wrongFlash) return;
    const t = setTimeout(() => setWrongFlash(null), 520);
    return () => clearTimeout(t);
  }, [wrongFlash]);

  if (totalPairs === 0) {
    return (
      <div className={s.wrap} data-testid="tile-match-empty">
        <Lead>No tile-match pairs on this homework.</Lead>
        <div className={s.actions}>
          <Button variant="blue" onClick={onComplete}>
            Skip →
          </Button>
        </div>
      </div>
    );
  }

  const onPickLeft = (pairId: string) => {
    if (submitting || complete || matched.has(pairId)) return;
    setHint(null);
    setSelectedLeft((cur) => (cur === pairId ? null : pairId));
  };

  const onPickRight = async (rightPairId: string) => {
    if (submitting || complete || selectedLeft === null) return;
    if (matched.has(rightPairId)) return;

    setSubmitting(true);
    setError(null);
    try {
      // The server grades by ids only — a match is correct iff the two ids are
      // equal. We send what the student tapped; the verdict comes back.
      const res = await submitTileMatch(hwId, sessionId, selectedLeft, rightPairId);
      if (res.correct) {
        const next = new Set(matched);
        next.add(selectedLeft);
        setMatched(next);
        setSelectedLeft(null);
        setHint(null);
        // Server is authoritative on completion (matched_count vs total_pairs).
        if (res.complete || next.size >= totalPairs) {
          setComplete(true);
        }
      } else {
        setWrongFlash(rightPairId);
        setHint(res.hint ?? null);
        setSelectedLeft(null);
      }
    } catch (err) {
      setError((err as Error).message || "Couldn’t check that match.");
    } finally {
      setSubmitting(false);
    }
  };

  const matchedCount = matched.size;

  return (
    <div className={s.wrap} data-testid="tile-match">
      <div className={s.head}>
        <Eyebrow>Tile Match</Eyebrow>
        <span className={s.counter} data-testid="tile-match-progress">
          {matchedCount}/{totalPairs} matched
        </span>
      </div>

      {!complete ? (
        <>
          <Title size="section">Match each concept to its meaning.</Title>
          <Lead className={s.sub}>Tap a card on the left, then its match on the right.</Lead>

          <div className={s.board}>
            <div className={s.column} role="group" aria-label="Concepts">
              {lefts.map((t) => {
                const isMatched = matched.has(t.pairId);
                const isSel = selectedLeft === t.pairId;
                return (
                  <button
                    key={`l-${t.pairId}`}
                    type="button"
                    className={[
                      s.tile,
                      s.tileLeft,
                      isMatched && s.tileMatched,
                      isSel && s.tileSelected,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={isMatched || submitting || complete}
                    onClick={() => onPickLeft(t.pairId)}
                    aria-pressed={isSel}
                    data-testid={`tm-left-${t.pairId}`}
                  >
                    {t.text}
                  </button>
                );
              })}
            </div>

            <div className={s.column} role="group" aria-label="Meanings">
              {rights.map((t) => {
                const isMatched = matched.has(t.pairId);
                const isWrong = wrongFlash === t.pairId;
                return (
                  <button
                    key={`r-${t.pairId}`}
                    type="button"
                    className={[
                      s.tile,
                      s.tileRight,
                      isMatched && s.tileMatched,
                      isWrong && s.tileWrong,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={isMatched || submitting || complete || selectedLeft === null}
                    onClick={() => onPickRight(t.pairId)}
                    data-testid={`tm-right-${t.pairId}`}
                  >
                    {t.text}
                  </button>
                );
              })}
            </div>
          </div>

          {hint && (
            <div className={s.hint} role="status">
              <Pill tone="warn">Not a match</Pill>
              <span className={s.hintText}>That one pairs with “{hint}”. Try again.</span>
            </div>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className={s.done} data-testid="tile-match-complete">
          <Pill tone="good">✓ All matched</Pill>
          <Title size="section">Every pair locked in.</Title>
          <Lead>You matched all {totalPairs} pairs. On to the next.</Lead>
          <div className={s.actions}>
            <Button variant="blue" onClick={onComplete} data-testid="tm-continue">
              Continue →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
