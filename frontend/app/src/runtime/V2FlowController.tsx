import { useRuntimeStore } from "./store";
import { LearningHub } from "./LearningHub";
import { CaseBasedPreview } from "./CaseBasedPreview";
import { Eyebrow, Title, Lead, Button } from "../shared/ui/primitives";

// Screen switch driven by the store (state, not URL routes — prevents
// gate-skipping). Flashcards (fc) is a docked placeholder until F3.
export function V2FlowController() {
  const screen = useRuntimeStore((st) => st.screen);

  if (screen === "cbp") return <CaseBasedPreview />;
  if (screen === "fc") return <FlashcardsPlaceholder />;
  return <LearningHub />;
}

function FlashcardsPlaceholder() {
  const goto = useRuntimeStore((st) => st.goto);
  return (
    <main className="v2-shell" data-testid="screen-fc-placeholder">
      <Eyebrow cyan>Flashcards + Memory Check</Eyebrow>
      <Title size="hero">Coming in F3.</Title>
      <Lead>
        The flashcard study engine and the Memory Check gate land in the next
        phase. For now, complete the Case Study to make progress.
      </Lead>
      <div style={{ marginTop: 24 }}>
        <Button variant="outline" onClick={() => goto("hub")}>
          ← Back to Hub
        </Button>
      </div>
    </main>
  );
}
