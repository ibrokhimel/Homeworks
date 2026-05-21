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

// The Learning Hub: two big choice tiles (dark = Case Study, light =
// Flashcards) + a locked Unlock-Gate strip. Free-order: the student picks
// which learning section to do first.
export function LearningHub() {
  const payload = useRuntimeStore((st) => st.payload);
  const gate = useRuntimeStore((st) => st.gateState);
  const startCbp = useRuntimeStore((st) => st.startCbp);
  const enterFlashcards = useRuntimeStore((st) => st.enterFlashcards);
  const enterUnlockGate = useRuntimeStore((st) => st.enterUnlockGate);

  const cbp = cbpStatus(gate?.cbp);
  const mc = mcStatus(gate?.mc);
  const unlocked = gate?.practice_arc_unlocked ?? false;

  return (
    <main className="v2-shell" data-testid="screen-hub">
      <Eyebrow>Learning Hub</Eyebrow>
      <Title size="hero">{payload?.title ?? "Your homework"}</Title>
      <Lead>
        Clear both learning sections to unlock the Practice Arc. Do them in any
        order.
      </Lead>

      <div className={s.tiles}>
        {/* Case Study — dark, dramatic */}
        <DarkSection className={s.tile}>
          <div className={s.tileHead}>
            <Eyebrow cyan>Case Study</Eyebrow>
            <StatusPill status={cbp} inverse />
          </div>
          <Title size="section" inverse>
            Step into the role.
          </Title>
          <Lead inverse>
            A real scenario, three decisions. Use the lesson before you’re
            tested on it.
          </Lead>
          <div className={s.tileMeta}>
            <span className={s.metaInverse}>
              {(gate?.cbp.checkpoints_correct ?? 0)}/
              {gate?.cbp.checkpoints_total ?? 3} checkpoints
            </span>
          </div>
          <div className={s.tileCta}>
            <Button variant="white" onClick={startCbp} data-testid="hub-start-cbp">
              {cbp === "passed" ? "Review case →" : cbp === "inProgress" ? "Continue →" : "Start case →"}
            </Button>
          </div>
        </DarkSection>

        {/* Flashcards — light, mechanical (F3) */}
        <FeatureCard className={s.tile}>
          <div className={s.tileHead}>
            <Eyebrow>Flashcards + Memory Check</Eyebrow>
            <StatusPill status={mc} />
          </div>
          <Title size="section">Lock in the facts.</Title>
          <Lead>
            Study the deck, then prove recall on the Memory Check. Score{" "}
            {gate?.mc.threshold_pct ?? 60}% to clear.
          </Lead>
          <div className={s.tileMeta}>
            <span className={s.meta}>{gate?.mc.score_pct ?? 0}% recall</span>
          </div>
          <div className={s.tileCta}>
            <Button variant="blue" onClick={enterFlashcards} data-testid="hub-start-fc">
              {mc === "passed"
                ? "Review deck →"
                : mc === "inProgress"
                ? "Continue →"
                : "Start flashcards →"}
            </Button>
          </div>
        </FeatureCard>
      </div>

      {/* Unlock-Gate strip */}
      <section
        className={`${s.gate} ${unlocked ? s.gateOpen : s.gateLocked}`}
        data-testid="hub-unlock-gate"
        aria-live="polite"
      >
        <div className={s.gateIcon} aria-hidden="true">
          {unlocked ? <UnlockIcon /> : <LockIcon />}
        </div>
        <div className={s.gateText}>
          <p className={s.gateTitle}>
            {unlocked ? "Practice Arc unlocked" : "Practice Arc locked"}
          </p>
          <p className={s.gateSub}>
            {unlocked
              ? "Both sections cleared. The games are open."
              : "Clear the Case Study and the Memory Check to break the chain."}
          </p>
        </div>
        <div className={s.gateAction}>
          {unlocked ? (
            <Button variant="blue" onClick={enterUnlockGate} data-testid="hub-enter-gate">
              Enter Practice Arc →
            </Button>
          ) : (
            <Pill tone="dark">Locked</Pill>
          )}
        </div>
      </section>
    </main>
  );
}

const LockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UnlockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);
