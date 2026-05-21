import type { ReactNode } from "react";
import { useRuntimeStore } from "./store";
import {
  Pill,
  Eyebrow,
  Title,
  Lead,
  FeatureCard,
  LaunchShell,
  Button,
} from "../shared/ui/primitives";
import s from "./Reflection.module.css";

// ---------------------------------------------------------------------------
// Reflection / Debrief — the F5 close. The aftermath after the Boss and the
// final beat of the v2 journey (Hub → CBP → Flashcards+Memory → Gate →
// Practice Arc → Boss → HERE).
//
// Two sub-stages:
//   prompt   — 1–2 free-text reflection prompts ("What was hardest? Why?").
//   debrief  — on submit, POST /api/ai/reflection and render the AI coaching:
//              feedback + strong/next steps + a Passed | Needs Retry status.
//
// Pass | Needs Retry is DERIVED (Boss outcome + server gate) in the store, not
// from the reflection endpoint. Flow-v2 forbid #20: never show "Not Completed"
// alone — it is always Passed or Needs Retry. On Needs Retry we surface the
// retake rule (same concepts, fresh questions).
// ---------------------------------------------------------------------------
export function Reflection() {
  const stage = useRuntimeStore((st) => st.reflection.stage);
  return stage === "prompt" ? <PromptStage /> : <DebriefStage />;
}

// ---- prompt: short free-text reflection before the debrief ----
function PromptStage() {
  const prompts = useRuntimeStore((st) => st.reflection.prompts);
  const answers = useRuntimeStore((st) => st.reflection.answers);
  const submitting = useRuntimeStore((st) => st.reflection.submitting);
  const submitError = useRuntimeStore((st) => st.reflection.submitError);
  const passed = useRuntimeStore((st) => st.reflection.passed);
  const setAnswer = useRuntimeStore((st) => st.setReflectionAnswer);
  const submit = useRuntimeStore((st) => st.submitReflection);

  // At least one prompt must have a non-empty answer to submit a reflection.
  const hasAnswer = answers.some((a) => a.trim() !== "");

  return (
    <main className="v2-shell" data-testid="reflection-prompt">
      <Eyebrow cyan>Reflection</Eyebrow>
      <Title size="hero">{passed ? "You made it. Look back." : "One honest look back."}</Title>
      <Lead>
        Before your debrief — a moment to think. There are no wrong answers
        here; this is just you and the work.
      </Lead>

      <div className={s.prompts}>
        {prompts.map((p, i) => (
          <FeatureCard key={i} className={s.promptCard}>
            <label className={s.promptLabel} htmlFor={`reflection-${i}`}>
              {p}
            </label>
            <textarea
              id={`reflection-${i}`}
              className={s.promptInput}
              value={answers[i] ?? ""}
              placeholder="Write a sentence or two…"
              rows={3}
              disabled={submitting}
              onChange={(e) => setAnswer(i, e.target.value)}
              data-testid={`reflection-input-${i}`}
            />
          </FeatureCard>
        ))}
      </div>

      {submitError && (
        <p className={s.error} role="alert">
          {submitError}
        </p>
      )}

      <div className={s.actions}>
        <Button
          variant="blue"
          onClick={() => void submit()}
          disabled={!hasAnswer || submitting}
          data-testid="reflection-submit"
        >
          {submitting ? "Reading your reflection…" : "Get my debrief →"}
        </Button>
      </div>
    </main>
  );
}

// ---- debrief: AI coaching + Passed | Needs Retry status ----
function DebriefStage() {
  const debrief = useRuntimeStore((st) => st.reflection.debrief);
  const performance = useRuntimeStore((st) => st.reflection.performance);
  const passed = useRuntimeStore((st) => st.reflection.passed);
  const goto = useRuntimeStore((st) => st.goto);
  const retake = useRuntimeStore((st) => st.retakeFromReflection);

  const scorePct =
    typeof performance?.score_pct === "number" ? Math.round(performance.score_pct) : null;
  const correct = performance?.correct;
  const total = performance?.total;

  const headline = passed ? "Passed." : "Needs retry.";
  const subline = passed
    ? "You faced the Boss and held your reasoning together. That's the bar — and you cleared it."
    : "You're close. Run it once more — same concepts, fresh questions — and it'll click.";

  // The status uses a celebratory launch-shell on a pass, a calmer card on a
  // needs-retry. Flow-v2 forbid #20: status is ALWAYS Passed or Needs Retry.
  const StatusFrame = passed ? LaunchShell : CalmFrame;

  return (
    <main className="v2-shell" data-testid="reflection-debrief">
      <StatusFrame className={s.statusFrame}>
        <div className={s.statusPill}>
          {passed ? <Pill tone="good">✓ Passed</Pill> : <Pill tone="warn">Needs Retry</Pill>}
        </div>
        <Title size="hero" inverse={passed}>
          {headline}
        </Title>
        <Lead inverse={passed}>{subline}</Lead>

        {(scorePct !== null || (typeof correct === "number" && typeof total === "number")) && (
          <div className={s.scoreRow} data-testid="reflection-score">
            {scorePct !== null && (
              <div className={s.scoreStat}>
                <span className={`${s.scoreValue} ${passed ? s.scoreValueInverse : ""}`}>
                  {scorePct}%
                </span>
                <span className={`${s.scoreLabel} ${passed ? s.scoreLabelInverse : ""}`}>
                  Mastery score
                </span>
              </div>
            )}
            {typeof correct === "number" && typeof total === "number" && (
              <div className={s.scoreStat}>
                <span className={`${s.scoreValue} ${passed ? s.scoreValueInverse : ""}`}>
                  {correct}/{total}
                </span>
                <span className={`${s.scoreLabel} ${passed ? s.scoreLabelInverse : ""}`}>
                  Memory check
                </span>
              </div>
            )}
          </div>
        )}
      </StatusFrame>

      {/* AI coaching paragraph — the warm, honest debrief. */}
      {debrief?.feedback && (
        <FeatureCard className={s.feedbackCard}>
          <Eyebrow>Your coach's read</Eyebrow>
          <Lead className={s.feedbackText}>{debrief.feedback}</Lead>
          {debrief.encouragement && (
            <p className={s.encouragement}>{debrief.encouragement}</p>
          )}
        </FeatureCard>
      )}

      {/* Strong points / next steps — the forward-looking close. */}
      {debrief?.next_steps && debrief.next_steps.length > 0 && (
        <FeatureCard className={s.nextCard}>
          <Eyebrow cyan>{passed ? "Keep the edge" : "Your next step"}</Eyebrow>
          <ul className={s.nextList}>
            {debrief.next_steps.map((step, i) => (
              <li key={i} className={s.nextItem}>
                <span className={s.nextDot} aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </FeatureCard>
      )}

      {/* Retake route on Needs Retry — same concepts, fresh questions. */}
      {!passed && (
        <p className={s.retakeNote}>
          A retake gives you the same concepts with brand-new questions — nothing
          is memorized, everything is earned.
        </p>
      )}

      <div className={s.actions}>
        {passed ? (
          <Button variant="blue" onClick={() => goto("hub")} data-testid="reflection-done">
            Back to Hub →
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => goto("hub")}>
              Back to Hub
            </Button>
            <Button variant="blue" onClick={retake} data-testid="reflection-retake">
              Retake — same concepts, fresh questions →
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

// A calmer, encouraging frame for the Needs-Retry state (vs. the dark
// celebratory LaunchShell used on a pass). Matches the LaunchShell signature.
function CalmFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.calmFrame, className].filter(Boolean).join(" ")}>{children}</div>;
}
