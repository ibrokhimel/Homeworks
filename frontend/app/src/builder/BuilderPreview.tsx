import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRuntimeStore } from "../runtime/store";
import { CaseBasedPreview } from "../runtime/CaseBasedPreview";
import { MemoryCheck } from "../runtime/MemoryCheck";
import { Flashcards } from "../runtime/Flashcards";
import BossArena from "../runtime/BossArena";
import type { BuilderDraft } from "./types";
import { toContentJson } from "./draft";
import type { HydratePayload } from "../shared/types";
import s from "./BuilderPreview.module.css";

// Which runtime surface the preview pane shows. The author flips this with the
// section tabs; it maps 1:1 to the runtime components reused here.
export type PreviewSurface = "cbp" | "flashcards" | "memory" | "boss";

// The runtime components read EVERYTHING from useRuntimeStore (payload +
// sub-machine state) — they take no content props. So the live preview works by
// feeding the AUTHOR'S draft into the SAME store as a synthetic HydratePayload,
// then driving the relevant sub-machine to the screen we want to show. The
// preview shows the FULL draft (answers present) — that's the authoring context;
// the components are redaction-agnostic (they only read display fields anyway),
// so no answer leaks into the rendered preview surface.

function draftToPayload(draft: BuilderDraft): HydratePayload {
  return {
    id: "__builder_preview__",
    title: draft.case_based_preview.title || "Untitled homework",
    subject: null,
    grade: null,
    lang: null,
    flow_version: "v2",
    // The runtime ContentJson type carries leak guards (answer_spec?: never), but
    // a preview legitimately holds the author's full blob. Cast through unknown
    // — the components never READ the answer fields, so this is display-safe.
    content_json: toContentJson(draft) as unknown as HydratePayload["content_json"],
  };
}

export function BuilderPreview({
  draft,
  surface,
}: {
  draft: BuilderDraft;
  surface: PreviewSurface;
}) {
  const setPayload = useRuntimeStore((st) => st.setPayload);
  const setGateState = useRuntimeStore((st) => st.setGateState);
  const startCbp = useRuntimeStore((st) => st.startCbp);
  const enterFlashcards = useRuntimeStore((st) => st.enterFlashcards);
  const startMemoryCheck = useRuntimeStore((st) => st.startMemoryCheck);
  const startBoss = useRuntimeStore((st) => st.startBoss);

  // Re-push the draft into the store whenever it changes so the preview is live.
  useEffect(() => {
    setPayload(draftToPayload(draft));
    // A neutral, non-blocking gate state so result screens render sensibly.
    setGateState({
      cbp: { passed: false, checkpoints_correct: 0, checkpoints_total: 3 },
      mc: { passed: false, score_pct: 0, threshold_pct: draft.memory_check.pass_threshold_pct },
      practice_arc_unlocked: false,
    });
  }, [draft, setPayload, setGateState]);

  // Reset the relevant sub-machine to its first screen whenever the author
  // switches surfaces (so the preview always opens on a meaningful screen).
  useEffect(() => {
    switch (surface) {
      case "cbp":
        startCbp();
        break;
      case "flashcards":
        enterFlashcards();
        break;
      case "memory":
        enterFlashcards();
        startMemoryCheck();
        break;
      case "boss":
        startBoss();
        break;
    }
    // We intentionally reset only on surface change (not on every keystroke);
    // the payload effect above keeps content live without losing the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  return (
    <PreviewFrame surface={surface}>
      {surface === "cbp" && <CaseBasedPreview />}
      {surface === "flashcards" && <Flashcards />}
      {surface === "memory" && <MemoryCheck />}
      {surface === "boss" && (
        // BossArena is a Practice Arc game — it just needs an onComplete no-op.
        <div className={s.bossWrap}>
          <BossArena onComplete={() => undefined} />
        </div>
      )}
    </PreviewFrame>
  );
}

function PreviewFrame({
  surface,
  children,
}: {
  surface: PreviewSurface;
  children: ReactNode;
}) {
  return (
    <div className={s.frame} data-surface={surface}>
      <div className={s.frameBar} aria-hidden="true">
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.frameLabel}>Live student preview</span>
      </div>
      <div className={s.viewport} data-testid="builder-preview-viewport">
        {children}
      </div>
    </div>
  );
}
