import { useState, useRef, useEffect } from "react";
import { useRuntimeStore } from "./store";
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

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The Learning Hub — a Duolingo-flavored, full-screen, mobile-first winding PATH
// of big tactile 3D "pebble" nodes (NOT a card grid). Three stations descend the
// column, gently offset left/right so the eye travels:
//
//   01 · Case-Study        (orange clay 3D-press button)   <- startCbp
//   02 · Flash cards       (blue clay 3D-press button)     <- enterFlashcards
//   03 · Homework Practices (single node, CHAINED + GRAY   <- enterUnlockGate
//        while gate.practice_arc_unlocked === false)          (once unlocked)
//
// The whole node IS the button — colored candy fill + a hard colored bottom-edge
// "lip" (box-shadow, no layout shift) that depresses on :active. Status (locked /
// active / done) reads off the server gate via cbpStatus/mcStatus — the hub only
// renders state, it never decides unlock.
//
// CONTRAST CONTRACT (the prior rejection fix preserved): every title is hard ink
// #1d1d1f / white-on-saturated-fill, and the theme-flipping --v2-text* tokens are
// pinned LIGHT on the .shell so a dark-OS visitor can't wash out the headings.
//
// UNLOCK CHOREOGRAPHY (the centerpiece): the first time the hub sees the server
// flip practice_arc_unlocked → true (and a per-homework localStorage play-once
// flag is unset), a single ~3.2s timeline plays driven by ONE attribute on the
// shell (data-unlock="playing"): dim/gray → shake → chains snap → reveal. The
// localStorage flag is ONLY for animation-play-once; the unlock truth is always
// the server boolean. prefers-reduced-motion skips straight to the unlocked state.
export function LearningHub() {
  const payload = useRuntimeStore((st) => st.payload);
  const gate = useRuntimeStore((st) => st.gateState);
  const hwId = useRuntimeStore((st) => st.hwId);
  const startCbp = useRuntimeStore((st) => st.startCbp);
  const enterFlashcards = useRuntimeStore((st) => st.enterFlashcards);
  const enterUnlockGate = useRuntimeStore((st) => st.enterUnlockGate);

  const cbp = cbpStatus(gate?.cbp);
  const mc = mcStatus(gate?.mc);
  const unlocked = gate?.practice_arc_unlocked ?? false;
  const mcThreshold = gate?.mc.threshold_pct ?? 60;

  // ---- Homework-theme header (subject eyebrow · real title · topic) ----
  const meta = payload?.content_json.meta;
  const subjectEyebrow =
    metaStr(meta, "subject_display") ?? payload?.subject?.trim() ?? undefined;
  const homeworkTitle = payload?.title?.trim() || "Your homework";
  const themeSub = metaStr(meta, "topic") ?? metaStr(meta, "section") ?? undefined;

  // Overall "stations cleared" chip.
  const cleared = (cbp === "passed" ? 1 : 0) + (mc === "passed" ? 1 : 0) + (unlocked ? 1 : 0);

  // The single next actionable LEARNING node gets the idle bob (max one animated
  // node per view). Case-Study leads; once it's passed, Flash cards leads.
  const nextNode: "case" | "flash" | null =
    cbp !== "passed" ? "case" : mc !== "passed" ? "flash" : null;

  // ---- Unlock choreography: one play-once flag per homework, animation-only ----
  // The flag NEVER decides unlock — that's `unlocked` (server truth). It only
  // gates whether the celebration plays. Key matches the brief exactly.
  const seenKey = `nets_hub_unlock_played_${hwId || "_"}`;
  const [playUnlock, setPlayUnlock] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey) === "1";
    } catch {
      seen = false; // private mode / blocked storage → just play it, harmless
    }
    if (seen) return; // already celebrated on this device → render final state
    if (prefersReducedMotion()) {
      try {
        localStorage.setItem(seenKey, "1");
      } catch {
        /* ignore */
      }
      return; // reduced motion → skip the sequence, show unlocked state directly
    }
    setPlayUnlock(true); // arm the timeline
    const done = setTimeout(() => {
      setPlayUnlock(false);
      try {
        localStorage.setItem(seenKey, "1"); // mark seen at sequence end
      } catch {
        /* ignore */
      }
    }, 3200); // total sequence ms (see CSS §5.2 timeline)
    return () => clearTimeout(done);
  }, [unlocked, seenKey]);

  // The shell's single source of animation truth.
  const unlockState = playUnlock ? "playing" : unlocked ? "open" : "locked";

  // Locked Practices node: a click surfaces the requirement inline + a one-shot
  // nudge shake, rather than navigating anywhere.
  const [nudged, setNudged] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLockedClick = () => {
    setNudged(false);
    requestAnimationFrame(() => setNudged(true)); // force reflow → re-trigger
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setNudged(false), 600);
  };
  useEffect(() => () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  }, []);

  return (
    <main
      className={`v2-shell ${s.shell}`}
      data-hub-theme="light"
      data-unlock={unlockState}
      data-testid="screen-hub"
    >
      {/* Interactive candy backdrop — drifting blobs + living aurora, behind
          everything and pointer-events:none. Never intercepts node taps. */}
      <HubBackdrop />

      {/* Soft luminous backdrop — kept subtle so ink always wins on contrast. */}
      <div className={s.heroGlow} aria-hidden="true" />

      {/* ---- Homework-theme header: subject eyebrow · real title · topic ---- */}
      <header className={s.intro}>
        {subjectEyebrow && <p className={s.eyebrow}>{subjectEyebrow}</p>}
        <h1 className={s.pageTitle}>{homeworkTitle}</h1>
        {themeSub && <p className={s.pageSub}>{themeSub}</p>}
        <p className={s.progressChip} aria-label={`${cleared} of 3 stations cleared`}>
          <CrownGlyph />
          <strong>{cleared}</strong>
          <span>/ 3 cleared</span>
        </p>
      </header>

      {/* ---- The winding path: connector layer behind, nodes stacked above ---- */}
      <div className={s.path}>
        <PathConnectors cbpPassed={cbp === "passed"} mcPassed={mc === "passed"} unlocked={unlocked} />

        {/* ---- 01 · Case-Study (orange clay 3D-press node) ---- */}
        <LearningNode
          num="01"
          title="Case-Study"
          lead="Step into the role. A real scenario, three calls — apply the lesson before the test."
          variant="case"
          status={cbp}
          isNext={nextNode === "case"}
          pct={pctFromCbp(gate?.cbp)}
          meta={`${gate?.cbp.checkpoints_correct ?? 0}/${gate?.cbp.checkpoints_total ?? 3} checkpoints`}
          ctaLabel={cbp === "passed" ? "Review →" : cbp === "inProgress" ? "Continue →" : "Start →"}
          align="left"
          onClick={startCbp}
          testid="hub-start-cbp"
        />

        {/* ---- 02 · Flash cards (blue clay 3D-press node) ---- */}
        <LearningNode
          num="02"
          title="Flash cards"
          lead={`Drill the deck, then prove recall on the Memory Check. Hit ${mcThreshold}% to clear.`}
          variant="flash"
          status={mc}
          isNext={nextNode === "flash"}
          pct={gate?.mc.score_pct ?? 0}
          meta={`${gate?.mc.score_pct ?? 0}% recall`}
          ctaLabel={mc === "passed" ? "Review →" : mc === "inProgress" ? "Continue →" : "Start →"}
          align="right"
          onClick={enterFlashcards}
          testid="hub-start-fc"
        />

        {/* ---- 03 · Homework Practices — single node, CHAINED + GRAY until unlocked ---- */}
        <PracticesNode
          unlocked={unlocked}
          nudged={nudged}
          mcThreshold={mcThreshold}
          onLockedClick={handleLockedClick}
          onEnter={enterUnlockGate}
        />
      </div>
    </main>
  );
}

// ---- Interactive decorative backdrop -------------------------------------
// A purely cosmetic layer behind the path: a living aurora wash + 5 soft,
// blurred candy blobs in the Duolingo palette that idle-drift forever (CSS),
// AND react to input via a tiny rAF parallax that writes smoothed offsets to
// two CSS custom properties (--bx / --by) the CSS reads via translate3d:
//   • desktop  → pointer move (parallax follows the cursor, eased)
//   • mobile   → scroll position (no hover on touch, so scroll drives drift)
// Everything is transform/opacity only and the layer is pointer-events:none,
// so it can NEVER block a node tap or the unlock choreography. Under
// prefers-reduced-motion we attach NO listeners and emit a static backdrop.
function HubBackdrop() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (prefersReducedMotion()) return; // static backdrop, no input reactivity

    // Target (input-driven) vs. current (smoothed) offsets, normalized -1..1.
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    let running = false;

    const tick = () => {
      // Critically-damped ease toward target (no spring overshoot, calm feel).
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      layer.style.setProperty("--bx", curX.toFixed(4));
      layer.style.setProperty("--by", curY.toFixed(4));
      // Keep animating until we've effectively settled, then idle the loop.
      if (Math.abs(targetX - curX) > 0.0005 || Math.abs(targetY - curY) > 0.0005) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };
    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    // Desktop: pointer parallax. Map cursor → -1..1 about viewport center.
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // touch handled by scroll instead
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetX = (e.clientX / w) * 2 - 1;
      targetY = (e.clientY / h) * 2 - 1;
      kick();
    };

    // Mobile: scroll parallax. Map scroll progress → a gentle -1..1 sweep.
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
      const p = Math.min(1, Math.max(0, (window.scrollY || 0) / max));
      targetY = p * 2 - 1;
      kick();
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={layerRef} className={s.backdrop} aria-hidden="true">
      <div className={s.aurora} />
      <span className={`${s.blob} ${s.blob1}`} />
      <span className={`${s.blob} ${s.blob2}`} />
      <span className={`${s.blob} ${s.blob3}`} />
      <span className={`${s.blob} ${s.blob4}`} />
      <span className={`${s.blob} ${s.blob5}`} />
    </div>
  );
}

// CBP "progress" fraction → 0..100, used to fill the conic ring on the badge.
function pctFromCbp(g: CbpGate | undefined): number {
  if (!g) return 0;
  if (g.passed) return 100;
  const total = g.checkpoints_total || 3;
  return Math.max(0, Math.min(100, Math.round((g.checkpoints_correct / total) * 100)));
}

// ---- A single learning station = the pressable 3D "pebble" button ----------
function LearningNode({
  num,
  title,
  lead,
  variant,
  status,
  isNext,
  pct,
  meta,
  ctaLabel,
  align,
  onClick,
  testid,
}: {
  num: string;
  title: string;
  lead: string;
  variant: "case" | "flash";
  status: SectionStatus;
  isNext: boolean;
  pct: number;
  meta: string;
  ctaLabel: string;
  align: "left" | "right";
  onClick: () => void;
  testid: string;
}) {
  // `passed` recolors to the green "done" face regardless of base variant.
  const faceClass =
    status === "passed"
      ? s.nodeDone
      : variant === "case"
      ? s.nodeCase
      : s.nodeFlash;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      data-status={status}
      className={[
        s.node,
        faceClass,
        align === "left" ? s.alignLeft : s.alignRight,
        isNext ? s.isNext : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={s.nodeTopline}>
        {/* Number badge with the conic progress ring (transform/opacity only). */}
        <span
          className={`${s.numRing} ${status === "passed" ? s.numRingDone : ""}`}
          style={{ ["--pct" as string]: status === "passed" ? 100 : pct }}
          aria-hidden="true"
        >
          <span className={s.numInner}>
            {status === "passed" ? <CheckGlyph /> : <span className={s.nodeNum}>{num}</span>}
          </span>
        </span>
        <span className={s.statusGlyph} aria-hidden="true">
          {status === "passed" ? (
            <span className={s.crownStamp}>
              <CrownGlyph />
            </span>
          ) : status === "inProgress" ? (
            <span className={s.dot} />
          ) : null}
        </span>
      </span>

      <span className={s.nodeTitle}>{title}</span>
      <span className={s.nodeLead}>{lead}</span>

      <span className={s.nodeFoot}>
        <span className={s.meta}>{meta}</span>
        <span className={s.ctaLabel}>{ctaLabel}</span>
      </span>
    </button>
  );
}

// ---- 03 · Homework Practices: a SINGLE node, chained + gray while locked ----
function PracticesNode({
  unlocked,
  nudged,
  mcThreshold,
  onLockedClick,
  onEnter,
}: {
  unlocked: boolean;
  nudged: boolean;
  mcThreshold: number;
  onLockedClick: () => void;
  onEnter: () => void;
}) {
  return (
    <article
      data-testid="hub-division-3"
      className={[
        s.node,
        s.nodePractices,
        s.alignCenter,
        unlocked ? s.practicesOpen : s.practicesLocked,
        nudged ? s.shake : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Chain overlay — diagonal link band + the snapping halves the unlock
          choreography animates apart. Hidden once unlocked. */}
      {!unlocked && (
        <span className={s.chains} aria-hidden="true">
          <span className={`${s.chainLink} ${s.chainA}`} />
          <span className={`${s.chainLink} ${s.chainB}`} />
          <span className={`${s.chainLink} ${s.chainC}`} />
          <span className={`${s.chainLink} ${s.chainD}`} />
          {/* the two halves that snap apart + spark + glow during the sequence */}
          <span className={s.chainBurst} />
          <span className={`${s.chainHalf} ${s.chainLinkLeft}`} />
          <span className={`${s.chainHalf} ${s.chainLinkRight}`} />
          <span className={`${s.chainSpark} ${s.chainSpark1}`} />
          <span className={`${s.chainSpark} ${s.chainSpark2}`} />
          <span className={`${s.chainSpark} ${s.chainSpark3}`} />
        </span>
      )}

      <div className={s.gateScope} data-testid="hub-unlock-gate" aria-live="polite">
        <span className={s.nodeTopline}>
          <span className={`${s.numRing} ${unlocked ? s.numRingOpen : s.numRingLocked}`} aria-hidden="true">
            <span className={s.numInner}>
              {unlocked ? (
                <span className={s.nodeNum}>03</span>
              ) : (
                <span className={s.padlock}>
                  <LockGlyph />
                </span>
              )}
            </span>
          </span>
        </span>

        <span className={s.nodeTitle}>Homework Practices</span>

        {/* "What's behind the lock" preview — dimmed sub-items. */}
        <ul className={s.subItems}>
          <li className={s.subItem}>
            <GameGlyph />
            <span>Gamified drills</span>
          </li>
          <li className={s.subItem}>
            <GamepadGlyph />
            <span>Interactive games</span>
          </li>
          <li className={`${s.subItem} ${s.subItemBoss}`}>
            <BossGlyph />
            <span>Boss fight</span>
          </li>
        </ul>

        <div className={s.nodeFoot}>
          {unlocked ? (
            <button
              type="button"
              className={`${s.enterCta} ${s.ctaBtn}`}
              onClick={onEnter}
              data-testid="hub-enter-gate"
            >
              Enter Practice Arc →
            </button>
          ) : (
            <button
              type="button"
              className={s.lockedCta}
              onClick={onLockedClick}
              aria-disabled="true"
            >
              <LockGlyph /> Locked
            </button>
          )}
        </div>

        {!unlocked && (
          <p className={`${s.lockReq} ${nudged ? s.lockReqLoud : ""}`}>
            Clear Case-Study &amp; Flash cards (≥{mcThreshold}%) to unlock.
          </p>
        )}
      </div>
    </article>
  );
}

// The winding path connector. A thick rounded stroke snakes node→node; each
// segment recolors green once its upstream node is passed. Resolution-independent
// 0..1000 viewBox stretched to the column (preserveAspectRatio="none").
function PathConnectors({
  cbpPassed,
  mcPassed,
  unlocked,
}: {
  cbpPassed: boolean;
  mcPassed: boolean;
  unlocked: boolean;
}) {
  return (
    <svg
      className={s.connectors}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* node 1 (left) → node 2 (right) */}
      <path
        className={`${s.line} ${cbpPassed ? s.lineLive : ""}`}
        d="M300 150 C 320 320, 700 360, 700 500"
        fill="none"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray="2 26"
      />
      {/* node 2 (right) → node 3 (center) — renders as the chain segment while
          locked (dense links), recoloring + flowing green once unlocked. */}
      <path
        className={`${s.line} ${unlocked ? s.lineLive : s.lineChained}`}
        d="M700 540 C 700 720, 500 700, 500 860"
        fill="none"
        strokeWidth={unlocked ? 11 : 13}
        strokeLinecap="round"
        strokeDasharray={unlocked ? "2 26" : "10 16"}
      />
      {/* faint "all done" glow once everything is cleared */}
      {cbpPassed && mcPassed && unlocked && <circle cx="500" cy="870" r="10" className={s.lineGoal} />}
    </svg>
  );
}

const LockGlyph = () => (
  <svg
    className={s.glyph}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CheckGlyph = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CrownGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-1.6 11H4.6L3 7z" />
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
