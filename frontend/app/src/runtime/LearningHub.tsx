import { useState, useRef } from "react";
import { useRuntimeStore } from "./store";
import { Pill, Button } from "../shared/ui/primitives";
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

function StatusPill({ status }: { status: SectionStatus }) {
  if (status === "passed") return <Pill tone="good">✓ Passed</Pill>;
  if (status === "inProgress") return <Pill tone="accent">In progress</Pill>;
  return <Pill tone="default">Not started</Pill>;
}

// Pull a string field off content_json.meta (typed `unknown` — extra="allow" on
// the backend Meta model lets `topic` ride alongside the declared
// subject_display/section). Returns a trimmed non-empty string or undefined.
function metaStr(meta: unknown, key: string): string | undefined {
  if (meta && typeof meta === "object" && key in (meta as Record<string, unknown>)) {
    const v = (meta as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

// The Learning Hub — TOP-DOWN FLOWCHART in the high-contrast Apple language of
// apple.com/iphone + the owner's issues-inventory:
//
//   [Real-Life Challenge]      [Flashcards + Memory Check]   <- two learning
//            \                        /                          divisions
//             \                      /                           (any order)
//              v  Homework Practices  v                       <- gated block
//                 · Gamified Practices
//                 · Interactive Games
//                 · Boss Fight
//                        |
//                        v
//                    Reflection                              <- terminal node
//
// CONTRAST CONTRACT (the rejection fix): every title/heading is INK #1d1d1f,
// never a theme-flipping token. The shell pins its own light text tokens so a
// dark-OS visitor can't inherit the near-white --v2-text that made the previous
// titles wash out into invisibility. Color is reserved for CTAs + the subtle
// per-category gradient accents on each card — never poured over text.
//
// The header is the HOMEWORK THEME (subject eyebrow + the homework's real title
// + topic/section subtitle), NOT the old generic "Learning Hub" boilerplate.
export function LearningHub() {
  const payload = useRuntimeStore((st) => st.payload);
  const gate = useRuntimeStore((st) => st.gateState);
  const startCbp = useRuntimeStore((st) => st.startCbp);
  const enterFlashcards = useRuntimeStore((st) => st.enterFlashcards);
  const enterUnlockGate = useRuntimeStore((st) => st.enterUnlockGate);

  const cbp = cbpStatus(gate?.cbp);
  const mc = mcStatus(gate?.mc);
  const unlocked = gate?.practice_arc_unlocked ?? false;

  // ---- Homework-theme header (replaces the generic eyebrow + boilerplate) ----
  const meta = payload?.content_json.meta;
  // Eyebrow = the subject. meta.subject_display first, then the payload subject.
  const subjectEyebrow =
    metaStr(meta, "subject_display") ?? payload?.subject?.trim() ?? undefined;
  // Big title = the homework's actual title.
  const homeworkTitle = payload?.title?.trim() || "Your homework";
  // Subtitle = the topic / section, if present (NOT the old boilerplate).
  const themeSub = metaStr(meta, "topic") ?? metaStr(meta, "section") ?? undefined;

  // Locked Practices block: clicking surfaces the requirement inline + a one-shot
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
    <main className={`v2-shell ${s.shell}`} data-hub-theme="light" data-testid="screen-hub">
      {/* Soft luminous backdrop — a single warm hero glow, kept very subtle so
          the ink text always wins on contrast. No heavy color washes. */}
      <div className={s.heroGlow} aria-hidden="true" />

      {/* ---- Homework-theme header: subject eyebrow · real title · topic ---- */}
      <header className={s.intro}>
        {subjectEyebrow && <p className={s.eyebrow}>{subjectEyebrow}</p>}
        <h1 className={s.pageTitle}>{homeworkTitle}</h1>
        {themeSub && <p className={s.pageSub}>{themeSub}</p>}
      </header>

      <div className={s.flow}>
        {/* ---- Connector layer: SVG paths that converge the two entries into
             the Practices block, then drop an arrow to Reflection. Sits behind
             the cards (z-index 0); draws itself in on mount. ---- */}
        <FlowConnectors unlocked={unlocked} />

        {/* ---- TOP ROW: the two learning divisions, side by side ---- */}
        <div className={s.entries}>
          {/* Division 1 — Case-Based Preview / "Real-Life Challenge"
              (interaction-blue accent). */}
          <article className={`${s.node} ${s.entryNode} ${s.accentInteraction}`}>
            <span className={s.cardAccent} aria-hidden="true" />
            <span className={s.cardGlow} aria-hidden="true" />
            <div className={s.nodeBody}>
              <div className={s.nodeHead}>
                <span className={s.divisionLabel}>
                  <span className={s.divisionNum}>01</span>Division
                </span>
                <StatusPill status={cbp} />
              </div>
              <h2 className={s.cardTitle}>Real-Life Challenge</h2>
              <p className={s.cardLead}>
                Step into the role. A real scenario, three decisions — apply the
                lesson before you’re tested on it.
              </p>
              <div className={s.nodeFoot}>
                <span className={s.meta}>
                  {(gate?.cbp.checkpoints_correct ?? 0)}/
                  {gate?.cbp.checkpoints_total ?? 3} checkpoints
                </span>
                <Button variant="blue" onClick={startCbp} data-testid="hub-start-cbp">
                  {cbp === "passed" ? "Review case →" : cbp === "inProgress" ? "Continue →" : "Start case →"}
                </Button>
              </div>
            </div>
          </article>

          {/* Division 2 — Flashcards + Memory Check (content-yellow accent). */}
          <article className={`${s.node} ${s.entryNode} ${s.accentContent}`}>
            <span className={s.cardAccent} aria-hidden="true" />
            <span className={s.cardGlow} aria-hidden="true" />
            <div className={s.nodeBody}>
              <div className={s.nodeHead}>
                <span className={s.divisionLabel}>
                  <span className={s.divisionNum}>02</span>Division
                </span>
                <StatusPill status={mc} />
              </div>
              <h2 className={s.cardTitle}>Flashcards + Memory Check</h2>
              <p className={s.cardLead}>
                Study the deck, then prove recall on the Memory Check. Score{" "}
                {mcThreshold}% to clear.
              </p>
              <div className={s.nodeFoot}>
                <span className={s.meta}>{gate?.mc.score_pct ?? 0}% recall</span>
                <Button variant="blue" onClick={enterFlashcards} data-testid="hub-start-fc">
                  {mc === "passed"
                    ? "Review deck →"
                    : mc === "inProgress"
                    ? "Continue →"
                    : "Start flashcards →"}
                </Button>
              </div>
            </div>
          </article>
        </div>

        {/* ---- MIDDLE: gated Homework Practices block (game-purple accent) ---- */}
        <div className={s.practicesRow}>
          <article
            className={`${s.node} ${s.practices} ${s.accentGame} ${
              unlocked ? s.practicesOpen : s.practicesLocked
            } ${nudged ? s.shake : ""}`}
            data-testid="hub-division-3"
          >
            <span className={s.cardAccent} aria-hidden="true" />
            <span className={s.cardGlow} aria-hidden="true" />
            {/* unlock-gate scope (testid kept for existing Playwright) */}
            <div className={s.gateScope} data-testid="hub-unlock-gate" aria-live="polite">
              <div className={s.nodeHead}>
                <span className={s.divisionLabel}>
                  <span className={s.divisionNum}>03</span>Homework Practices
                </span>
                {unlocked ? (
                  <Pill tone="good">Unlocked</Pill>
                ) : (
                  <Pill tone="dark">
                    <LockGlyph /> Locked
                  </Pill>
                )}
              </div>

              {/* The three stacked sub-items from the sketch */}
              <ul className={s.subItems}>
                <li className={s.subItem}>
                  <GameGlyph />
                  <span>Gamified Practices</span>
                </li>
                <li className={s.subItem}>
                  <GamepadGlyph />
                  <span>Interactive Games</span>
                </li>
                <li className={`${s.subItem} ${s.subItemBoss}`}>
                  <BossGlyph />
                  <span>Boss Fight</span>
                </li>
              </ul>

              <div className={s.nodeFoot}>
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
          </article>
        </div>

        {/* ---- BOTTOM: terminal Reflection node (security-red accent dot) ---- */}
        <div className={s.reflectionRow}>
          <div className={`${s.reflection} ${s.accentSecurity}`} aria-disabled="true">
            <span className={s.reflectionDot} aria-hidden="true" />
            <span className={s.reflectionLabel}>Reflection</span>
            <span className={s.reflectionSub}>Debrief · feedback &amp; marking</span>
          </div>
        </div>
      </div>
    </main>
  );
}

// The connector layer. Two curved paths sweep down from the two top cards and
// converge on the Practices block; a straight arrow then drops to Reflection.
// Inked to a soft neutral so the lines read as quiet structure on the light bg
// (Apple reserves saturated color for CTAs, not scaffolding).
// Uses a fixed 0..1000 viewBox stretched to fill the flow column, so the curve
// geometry is resolution-independent. preserveAspectRatio="none" lets it scale
// to whatever height the column ends up being.
function FlowConnectors({ unlocked }: { unlocked: boolean }) {
  return (
    <svg
      className={s.connectors}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="hubArrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--hub-line)" />
        </marker>
      </defs>

      {/* Left card -> Practices (curves right and down to the converge point) */}
      <path
        className={s.line}
        d="M250 150 C 250 300, 500 280, 500 430"
        fill="none"
        stroke="var(--hub-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right card -> Practices (curves left and down to the converge point) */}
      <path
        className={`${s.line} ${s.lineDelay}`}
        d="M750 150 C 750 300, 500 280, 500 430"
        fill="none"
        stroke="var(--hub-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Practices -> Reflection (straight drop with an arrowhead). Brightens
          when the arc unlocks; stays dim otherwise. */}
      <path
        className={`${s.line} ${s.lineArrow} ${unlocked ? s.lineArrowLive : ""}`}
        d="M500 720 L 500 880"
        fill="none"
        stroke="var(--hub-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        markerEnd="url(#hubArrow)"
      />
    </svg>
  );
}

const LockGlyph = () => (
  <svg
    className={s.glyph}
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

const GameGlyph = () => (
  <svg
    className={s.subGlyph}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.5 5.5 21 7.5 13.5 2 9 9 9z" />
  </svg>
);

const GamepadGlyph = () => (
  <svg
    className={s.subGlyph}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="6" y1="11" x2="10" y2="11" />
    <line x1="8" y1="9" x2="8" y2="13" />
    <line x1="15" y1="12" x2="15.01" y2="12" />
    <line x1="18" y1="10" x2="18.01" y2="10" />
    <rect x="2" y="6" width="20" height="12" rx="5" />
  </svg>
);

const BossGlyph = () => (
  <svg
    className={s.subGlyph}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6l2 13h14l2-13-5 4-4-6-4 6-5-4z" />
  </svg>
);
