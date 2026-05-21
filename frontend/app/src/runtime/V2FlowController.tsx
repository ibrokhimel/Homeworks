import { useRuntimeStore } from "./store";
import { LearningHub } from "./LearningHub";
import { CaseBasedPreview } from "./CaseBasedPreview";
import { Flashcards } from "./Flashcards";
import { MemoryCheck } from "./MemoryCheck";
import { UnlockGate } from "./UnlockGate";
import { PracticeArc } from "./PracticeArc";
import { Reflection } from "./Reflection";
import { TutorWidget } from "./TutorWidget";

// Screen switch driven by the store (state, not URL routes — prevents
// gate-skipping). The Flashcards/Memory-Check tile (fc) and the Unlock Gate
// (gate) are the F3 additions; the Practice Arc (practice) is F4; the
// Reflection / Debrief close (reflection) is F5 — the aftermath after the Boss.
//
// The docked <TutorWidget/> is mounted ONCE here, outside the screen switch, so
// it persists across every screen change (it reads the current screen from the
// store to derive its tutor `phase`).
export function V2FlowController() {
  const screen = useRuntimeStore((st) => st.screen);
  const fcSubStage = useRuntimeStore((st) => st.fc.subStage);

  return (
    <>
      <CurrentScreen screen={screen} fcSubStage={fcSubStage} />
      <TutorWidget />
    </>
  );
}

function CurrentScreen({
  screen,
  fcSubStage,
}: {
  screen: ReturnType<typeof useRuntimeStore.getState>["screen"];
  fcSubStage: ReturnType<typeof useRuntimeStore.getState>["fc"]["subStage"];
}) {
  if (screen === "cbp") return <CaseBasedPreview />;
  if (screen === "fc") {
    // The fc screen hosts a sub-machine: study the deck, then the graded check.
    return fcSubStage === "flashcards" ? <Flashcards /> : <MemoryCheck />;
  }
  if (screen === "gate") return <UnlockGate />;
  if (screen === "practice") return <PracticeArc />;
  if (screen === "reflection") return <Reflection />;
  return <LearningHub />;
}
