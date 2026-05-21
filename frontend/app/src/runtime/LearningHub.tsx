import { useState, useRef } from "react";
import { useRuntimeStore } from "./store";
import {
  Pill,
  Eyebrow,
  Title,
  Lead,
  FeatureCard,
  DarkSection,
  Button,
} from "../shared/ui/primitives";
import type { CbpGate, McGate } from "../shared/types";
import s from "./LearningHub.module.css";

type SectionStatus = "notStarted" | "inProgress" | "passed";

function cbpStatus(g: CbpGate | undefined): SectionStatus {
  if (!g) return "notStarted";
  if (g.passed) return "passed";
  return g.checkpoints_correct > 0 ? "inProgress" : "notStarted";
}

function mcStatus(g: McGate | undefined): SectionStatus {
  if (!g) return "notStarted";
  if (g.passed) return "passed";
  return g.score_pct > 0 ? "inProgress" : "notStarted";
}

function StatusPill({ status, inverse }: { status: SectionStatus; inverse?: boolean }) {
  if (status === "passed") return <Pill tone="good">✓ Passed</Pill>;
  if (status === "inProgress") return <Pill tone={inverse ? "accent" : "default"}>In progress</Pill>;
  return <Pill tone={inverse ? "dark" : "default"}>Not started</Pill>;
}

// The Learning Hub: three co-equal divisions presented as a layout grid. The
// student picks which to do in any order; Division 3 (Practice Arc + Boss) is
// gated until the first two clear, but stays visible as a real third block.
export function LearningHub() {
  const payload = useRuntimeStore((st) => st.payload);
  const gate = useRuntimeStore((st) => st.gateState);
  const startCbp = useRuntimeStore((st) => st.startCbp);
  const enterFlashcards = useRuntimeStore((st) => st.enterFlashcards);
  const enterUnlockGate = useRuntimeStore((st) => st.enterUnlockGate);

  const cbp = cbpStatus(gate?.cbp);
  const mc = mcStatus(gate?.mc);
  const unlocked = gate?.practice_arc_unlocked ?? false;

  // Locked Division 3: clicking surfaces the requirement inline + a one-shot
  // shake, rather than navigating anywhere.
  const [nudged, setNudged] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLockedClick = () => {
    setNudged(false);
    // Force reflow so the animation can re-trigger on rapid repeat clicks.
    requestAnimationFrame(() => setNudged(true));
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setNudged(false), 600);
  };

  const mcThreshold = gate?.mc.threshold_pct ?? 60;

  return (
    <main className="v2-shell" data-testid="screen-hub">
      <Eyebrow>Learning Hub</Eyebrow>
      <Title size="hero">{payload?.title ?? "Your homework"}</Title>
      <Lead>
        Three divisions, one goal. Clear Divisions 1 &amp; 2 in any order to
        unlock the Practice Arc.
      </Lead>

      <div className={s.grid}>
        {/* Division 1 — Case-Based Preview (dark, dramatic) */}
        <DarkSection className={`${s.card} ${s.cardDark}`}>
          <div className={s.cardHead}>
            <span className={s.divisionLabel} data-inverse="true">
              <span className={s.divisionNum}>01</span>Division
            </span>
            <StatusPill status={cbp} inverse />
          </div>
          <Title size="section" inverse>
            Case-Based Preview
          </Title>
          <Lead inverse>
            Step into the role. A real scenario, three decisions — use the
            lesson before you’re tested on it.
          </Lead>
          <div className={s.cardFoot}>
            <span className={s.metaInverse}>
              {(gate?.cbp.checkpoints_correct ?? 0)}/
              {gate?.cbp.checkpoints_total ?? 3} checkpoints
            </span>
            <Button variant="white" onClick={startCbp} data-testid="hub-start-cbp">
              {cbp === "passed" ? "Review case →" : cbp === "inProgress" ? "Continue →" : "Start case →"}
            </Button>
          </div>
        </DarkSection>

        {/* Division 2 — Flashcards + Memory Check (light glass) */}
        <FeatureCard className={s.card}>
          <div className={s.cardHead}>
            <span className={s.divisionLabel}>
              <span className={s.divisionNum}>02</span>Division
            </span>
            <StatusPill status={mc} />
          </div>
          <Title size="section">Flashcards + Memory Check</Title>
          <Lead>
            Study the deck, then prove recall on the Memory Check. Score{" "}
            {mcThreshold}% to clear.
          </Lead>
          <div className={s.cardFoot}>
            <span className={s.meta}>{gate?.mc.score_pct ?? 0}% recall</span>
            <Button variant="blue" onClick={enterFlashcards} data-testid="hub-start-fc">
              {mc === "passed"
                ? "Review deck →"
                : mc === "inProgress"
                ? "Continue →"
                : "Start flashcards →"}
            </Button>
          </div>
        </FeatureCard>

        {/* Division 3 — Practice Arc + Boss (light glass, gated co-equal block) */}
        <FeatureCard
          className={`${s.card} ${unlocked ? s.cardOpen : s.cardLocked} ${
            nudged ? s.shake : ""
          }`}
          data-testid="hub-division-3"
        >
          {/* The unlock-gate semantics (testid kept for existing Playwright) */}
          <div
            className={s.gateScope}
            data-testid="hub-unlock-gate"
            aria-live="polite"
          >
            <div className={s.cardHead}>
              <span className={s.divisionLabel}>
                <span className={s.divisionNum}>03</span>Division
              </span>
              {unlocked ? (
                <Pill tone="good">Unlocked</Pill>
              ) : (
                <Pill tone="dark">
                  <LockGlyph /> Locked
                </Pill>
              )}
            </div>
            <Title size="section">Practice Arc + Boss</Title>
            <Lead>
              {unlocked
                ? "Both divisions cleared. The games and the Boss are open."
                : "Eight games and a Boss fight — the proving ground for everything you’ve learned."}
            </Lead>
            <div className={s.cardFoot}>
              <span className={s.meta}>
                {unlocked ? "Ready to enter" : "Locked"}
              </span>
              {unlocked ? (
                <Button variant="blue" onClick={enterUnlockGate} data-testid="hub-enter-gate">
                  Enter Practice Arc →
                </Button>
              ) : (
                <button
                  type="button"
                  className={s.lockedCta}
                  onClick={handleLockedClick}
                  aria-disabled="true"
                >
                  <LockGlyph /> Locked
                </button>
              )}
            </div>

            {!unlocked && (
              <p className={`${s.lockReq} ${nudged ? s.lockReqLoud : ""}`}>
                Clear Divisions 1 &amp; 2 (≥{mcThreshold}%) to unlock.
              </p>
            )}
          </div>
        </FeatureCard>
      </div>
    </main>
  );
}

const LockGlyph = () => (
  <svg
    className={s.lockGlyph}
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
