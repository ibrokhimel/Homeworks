import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRuntimeStore } from "./store";
import {
  Pill,
  Eyebrow,
  Title,
  Lead,
  FeatureCard,
  DarkSection,
  LessonPanel,
  Button,
} from "../shared/ui/primitives";
import type { Checkpoint, CheckpointKind } from "../shared/types";
import s from "./CaseBasedPreview.module.css";

const KIND_LABEL: Record<CheckpointKind, string> = {
  identify: "Identify",
  decide: "Decide",
  justify: "Justify",
};

// The Case-Based Preview sub-machine:
//   setup → (checkpoint → learningBlock) ×3 → sim → feedback
// Correctness is NEVER assumed client-side — we read the server `{correct}`.
export function CaseBasedPreview() {
  const subStage = useRuntimeStore((st) => st.cbp.subStage);

  switch (subStage) {
    case "setup":
      return <Setup />;
    case "checkpoint":
      return <CheckpointStage />;
    case "learningBlock":
      return <LearningBlockStage />;
    case "sim":
      return <SimulationStage />;
    case "feedback":
      return <FeedbackStage />;
    default:
      return <Setup />;
  }
}

function Shell({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <main className="v2-shell" data-testid={testid}>
      <div className={s.stage} key={testid}>
        {children}
      </div>
    </main>
  );
}

// ---- setup: dramatic dark hero with case_setup ----
function Setup() {
  const payload = useRuntimeStore((st) => st.payload);
  const enterCheckpoint = useRuntimeStore((st) => st.enterCheckpoint);
  const goto = useRuntimeStore((st) => st.goto);
  const cbp = payload?.content_json.case_based_preview;
  const setup = cbp?.case_setup;

  return (
    <Shell testid="cbp-setup">
      <BackToHub onClick={() => goto("hub")} />
      <DarkSection className={s.hero}>
        <Eyebrow cyan>Case Study</Eyebrow>
        <Title size="hero" inverse>
          {cbp?.title ?? payload?.title ?? "The Case"}
        </Title>
        {setup?.story && <Lead inverse>{setup.story}</Lead>}
        <div className={s.heroFacts}>
          {setup?.role && (
            <div className={s.fact}>
              <span className={s.factLabel}>Your role</span>
              <span className={s.factValue}>{setup.role}</span>
            </div>
          )}
          {setup?.task && (
            <div className={s.fact}>
              <span className={s.factLabel}>Your task</span>
              <span className={s.factValue}>{setup.task}</span>
            </div>
          )}
        </div>
        <div className={s.heroCta}>
          <Button variant="white" onClick={() => enterCheckpoint(0)} data-testid="cbp-begin">
            Begin checkpoints →
          </Button>
        </div>
      </DarkSection>
    </Shell>
  );
}

// ---- checkpoint: question + options as LessonPanel rows ----
function CheckpointStage() {
  const payload = useRuntimeStore((st) => st.payload);
  const index = useRuntimeStore((st) => st.cbp.checkpointIndex);
  const submitting = useRuntimeStore((st) => st.cbp.submitting);
  const submitError = useRuntimeStore((st) => st.cbp.submitError);
  const submit = useRuntimeStore((st) => st.submitCheckpointAnswer);

  const checkpoints = payload?.content_json.case_based_preview?.checkpoints ?? [];
  const total = checkpoints.length || 3;
  const checkpoint = checkpoints[index] as Checkpoint | undefined;
  const [selected, setSelected] = useState<number | null>(null);

  // Reset selection whenever we move to a different checkpoint.
  useEffect(() => setSelected(null), [index]);

  if (!checkpoint) {
    return (
      <Shell testid="cbp-checkpoint">
        <Lead>This checkpoint is unavailable.</Lead>
      </Shell>
    );
  }

  const onSubmit = () => {
    if (selected === null || submitting) return;
    // Tap-MCQ checkpoints grade by option index (answer_spec.type=option_index).
    // We submit the tapped index as a string; the server holds the expected
    // index and decides correctness — the client never self-grades.
    void submit(index, String(selected));
  };

  return (
    <Shell testid="cbp-checkpoint">
      <CheckpointProgress current={index} total={total} />
      <Eyebrow>
        Checkpoint {index + 1}: {KIND_LABEL[checkpoint.kind] ?? checkpoint.kind}
      </Eyebrow>
      <Title size="section">{checkpoint.question}</Title>

      <div className={s.options} role="radiogroup" aria-label="Answer options">
        {checkpoint.options.map((opt, i) => (
          <LessonPanel
            key={i}
            eyebrow={`Option ${String.fromCharCode(65 + i)}`}
            title={opt}
            state={selected === i ? "active" : "idle"}
            disabled={submitting}
            onClick={() => setSelected(i)}
          />
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
          onClick={onSubmit}
          disabled={selected === null || submitting}
          data-testid="cbp-submit"
        >
          {submitting ? "Checking…" : "Submit answer"}
        </Button>
      </div>
    </Shell>
  );
}

// ---- learningBlock: server feedback + learning_block after submit ----
function LearningBlockStage() {
  const index = useRuntimeStore((st) => st.cbp.checkpointIndex);
  const results = useRuntimeStore((st) => st.cbp.results);
  const feedback = useRuntimeStore((st) => st.cbp.lastFeedback);
  const learningBlock = useRuntimeStore((st) => st.cbp.lastLearningBlock);
  const advance = useRuntimeStore((st) => st.advanceFromLearningBlock);
  const retry = useRuntimeStore((st) => st.retryCheckpoint);
  const payload = useRuntimeStore((st) => st.payload);

  const correct = results[index];
  const total = payload?.content_json.case_based_preview?.checkpoints?.length ?? 3;
  const isLast = index + 1 >= total;

  return (
    <Shell testid="cbp-learning-block">
      <div className={s.lbHead}>
        {correct ? <Pill tone="good">✓ Correct</Pill> : <Pill tone="warn">Not quite</Pill>}
        <span className={s.lbCounter}>
          Checkpoint {index + 1} of {total}
        </span>
      </div>

      <FeatureCard className={correct ? s.lbCardGood : s.lbCardWarn}>
        <Eyebrow>{correct ? "Why that works" : "What to rethink"}</Eyebrow>
        {feedback && <Lead className={s.lbText}>{feedback}</Lead>}
        {learningBlock && (
          <div className={s.lbBlock}>
            <p className={s.lbBlockLabel}>Lesson</p>
            <p className={s.lbBlockBody}>{learningBlock}</p>
          </div>
        )}
      </FeatureCard>

      <div className={s.actions}>
        {!correct && (
          <Button variant="outline" onClick={() => retry(index)} data-testid="cbp-retry">
            Retry checkpoint
          </Button>
        )}
        <Button variant="blue" onClick={advance} data-testid="cbp-continue">
          {isLast ? "See the outcome →" : "Next checkpoint →"}
        </Button>
      </div>
    </Shell>
  );
}

// ---- sim: final_simulation.wrong_path + server feedback ----
function SimulationStage() {
  const payload = useRuntimeStore((st) => st.payload);
  const feedback = useRuntimeStore((st) => st.cbp.lastFeedback);
  const finish = useRuntimeStore((st) => st.finishCbp);
  const [busy, setBusy] = useState(false);

  const sim = payload?.content_json.case_based_preview?.final_simulation;

  const onFinish = async () => {
    setBusy(true);
    await finish();
  };

  return (
    <Shell testid="cbp-simulation">
      <Eyebrow cyan>Final simulation</Eyebrow>
      <Title size="section">How the case plays out.</Title>
      <Lead>The path you avoided — and why the lesson mattered.</Lead>

      <div className={s.simGrid}>
        {sim?.wrong_path && (
          <FeatureCard className={s.simWrong}>
            <Pill tone="warn">If you’d slipped</Pill>
            <p className={s.simBody}>{sim.wrong_path}</p>
          </FeatureCard>
        )}
        {feedback && (
          <FeatureCard className={s.simRight}>
            <Pill tone="good">The takeaway</Pill>
            <p className={s.simBody}>{feedback}</p>
          </FeatureCard>
        )}
      </div>

      <div className={s.actions}>
        <Button variant="blue" onClick={onFinish} disabled={busy} data-testid="cbp-finish">
          {busy ? "Scoring…" : "Finish case →"}
        </Button>
      </div>
    </Shell>
  );
}

// ---- feedback: gate result + summary; route back to hub ----
function FeedbackStage() {
  const payload = useRuntimeStore((st) => st.payload);
  const gate = useRuntimeStore((st) => st.gateState);
  const goto = useRuntimeStore((st) => st.goto);
  const startCbp = useRuntimeStore((st) => st.startCbp);

  const summary = payload?.content_json.case_based_preview?.feedback_summary;
  const cbpGate = gate?.cbp;
  const passed = cbpGate?.passed ?? false;

  return (
    <Shell testid="cbp-feedback">
      <div className={s.lbHead}>
        {passed ? <Pill tone="good">✓ Passed</Pill> : <Pill tone="warn">Needs retry</Pill>}
        <span className={s.lbCounter}>
          {cbpGate?.checkpoints_correct ?? 0}/{cbpGate?.checkpoints_total ?? 3} checkpoints correct
        </span>
      </div>

      <Title size="hero">
        {passed ? "Case cleared." : "Almost — one more pass."}
      </Title>
      <Lead>
        {passed
          ? "You used the lesson and made the right calls. This section is done."
          : "You need at least 2 of 3 checkpoints. Retake the ones you missed — same concept, fresh question."}
      </Lead>

      {summary && (
        <FeatureCard className={s.summaryCard}>
          {summary.student_understood && (
            <SummaryRow label="What you understood" value={summary.student_understood} />
          )}
          {summary.mistake_appeared && (
            <SummaryRow label="Where mistakes appeared" value={summary.mistake_appeared} />
          )}
          {summary.what_to_review && (
            <SummaryRow label="What to review" value={summary.what_to_review} />
          )}
        </FeatureCard>
      )}

      <div className={s.actions}>
        {passed ? (
          <Button variant="blue" onClick={() => goto("hub")} data-testid="cbp-back-hub">
            Back to Hub →
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => goto("hub")}>
              Back to Hub
            </Button>
            <Button variant="blue" onClick={startCbp} data-testid="cbp-retake">
              Retake case
            </Button>
          </>
        )}
      </div>
    </Shell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.summaryRow}>
      <p className={s.summaryLabel}>{label}</p>
      <p className={s.summaryValue}>{value}</p>
    </div>
  );
}

// ---- shared bits ----
function BackToHub({ onClick }: { onClick: () => void }) {
  return (
    <button className={s.back} onClick={onClick} type="button">
      ← Back to Hub
    </button>
  );
}

function CheckpointProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className={s.progress} aria-label={`Checkpoint ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`${s.dot} ${i < current ? s.dotDone : i === current ? s.dotActive : ""}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
