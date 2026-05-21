import { useRuntimeStore } from "./store";
import { LearningHub } from "./LearningHub";
import { CaseBasedPreview } from "./CaseBasedPreview";
import { Flashcards } from "./Flashcards";
import { MemoryCheck } from "./MemoryCheck";
import { UnlockGate } from "./UnlockGate";
import { PracticeArc } from "./PracticeArc";

// Screen switch driven by the store (state, not URL routes — prevents
// gate-skipping). The Flashcards/Memory-Check tile (fc) and the Unlock Gate
// (gate) are the F3 additions; the Practice Arc (practice) is F4 — the
// homework body that opens after the Unlock Gate.
export function V2FlowController() {
  const screen = useRuntimeStore((st) => st.screen);
  const fcSubStage = useRuntimeStore((st) => st.fc.subStage);

  if (screen === "cbp") return <CaseBasedPreview />;
  if (screen === "fc") {
    // The fc screen hosts a sub-machine: study the deck, then the graded check.
    return fcSubStage === "flashcards" ? <Flashcards /> : <MemoryCheck />;
  }
  if (screen === "gate") return <UnlockGate />;
  if (screen === "practice") return <PracticeArc />;
  return <LearningHub />;
}
