import { useRuntimeStore } from "./store";
import { LaunchShell, Button } from "../shared/ui/primitives";
import s from "./UnlockGate.module.css";

// The Unlock Gate "moment": shown when the server gate flips
// practice_arc_unlocked → true (both sections cleared). A chain snaps apart with
// a glow burst on the LaunchShell. The CTA into the Practice Arc is a stub for
// now — F4 wires the real route. If we ever land here un-unlocked (e.g. a stale
// gate), we fall back to the Hub rather than show a false celebration.
export function UnlockGate() {
  const gate = useRuntimeStore((st) => st.gateState);
  const goto = useRuntimeStore((st) => st.goto);

  const unlocked = gate?.practice_arc_unlocked ?? false;

  if (!unlocked) {
    return (
      <main className="v2-shell" data-testid="screen-gate">
        <LaunchShell className={s.shell}>
          <p className={s.eyebrow}>Practice Arc</p>
          <h1 className={s.title}>Still locked.</h1>
          <p className={s.sub}>
            Clear both the Case Study and the Memory Check to break the chain.
          </p>
          <div className={s.locked}>
            <Button variant="white" onClick={() => goto("hub")} data-testid="gate-back-hub">
              ← Back to Hub
            </Button>
          </div>
        </LaunchShell>
      </main>
    );
  }

  const enterPracticeArc = () => {
    // F4 wires the real Practice Arc route; for now we log the intent.
    // eslint-disable-next-line no-console
    console.log("[UnlockGate] Enter Practice Arc — placeholder until F4.");
  };

  return (
    <main className="v2-shell" data-testid="screen-gate">
      <div className={s.stage}>
        <LaunchShell className={s.shell}>
          <p className={s.eyebrow}>Practice Arc unlocked</p>

          <div className={s.chain} aria-hidden="true">
            <div className={s.burst} />
            <div className={s.links}>
              <span className={`${s.linkHalf} ${s.linkLeft}`} />
              <span className={`${s.linkHalf} ${s.linkRight}`} />
              <span className={`${s.spark} ${s.spark1}`} />
              <span className={`${s.spark} ${s.spark2}`} />
              <span className={`${s.spark} ${s.spark3}`} />
            </div>
          </div>

          <h1 className={s.title}>The chain breaks.</h1>
          <p className={s.sub}>
            Both learning sections cleared. The Practice Arc is open — time to
            put it into play.
          </p>

          <div className={s.cta}>
            <Button variant="white" onClick={enterPracticeArc} data-testid="gate-enter-arc">
              Enter Practice Arc →
            </Button>
          </div>
        </LaunchShell>
      </div>
    </main>
  );
}
