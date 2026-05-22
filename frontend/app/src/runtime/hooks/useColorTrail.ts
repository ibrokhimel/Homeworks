// useColorTrail — final design: persistent-canvas glow comet + smooth
// midpoint-quadratic ribbon painter + waterdrop ripple click system.
//
// Movement trail (luminous old-comet feel, no internal circles):
//   • PERSISTENT canvas — pixels survive between frames, faded by
//     destination-out at ~5 % α/frame.
//   • composite=lighter for the trail body → additive glow.
//   • Each frame draws ONE smooth segment built from a small recent-points
//     buffer (heads[]) using midpoint-control quadratic smoothing:
//         start = midpoint(a, b),  control = b,  end = midpoint(b, c)
//     where a/b/c are the last three head positions. Consecutive frames
//     share BOTH the endpoint AND the tangent at the join → no round-cap
//     stacking → NO internal circles, NO dots, NO bubbles.
//   • lineCap "butt" inside the curve; lineJoin "round" for safe joins.
//   • Width is velocity-eased — slow ≈ thin (W_MIN), fast ≈ wider streak
//     clamped at W_MAX, idle → 0 so the comet visibly shrinks as it fades.
//   • Default alphas tuned for visible glow under additive blend
//     (halo 0.20 / core 0.50) — fade rate prevents white overburn.
//
// Click effect — waterdrop ripples (replaces the previous anchor/link):
//   • pointerdown spawns ONE big Ripple at the tap: large expanding soft
//     ring drawn as two feathered radial-gradient passes (outer halo +
//     main shockwave). Eased radius growth + life decay → reads as a
//     drop falling into glowing liquid. NOT a harsh hollow ring.
//   • If the previous click was within ~280 px, three small bridge
//     ripples are spawned along an arched perpendicular path between
//     the two taps. Each bridge ripple is dimmer and peaks in the
//     middle (sin curve) → liquid surface tension between drops, NOT
//     a hard connector line.
//   • Far-apart clicks get no bridge — each ripple lives independently.
//   • All ripples use sampleColor(hue) — same palette family.
//
// Under prefers-reduced-motion: the effect bails out entirely (no listeners,
// no rAF). Full cleanup on unmount: removeEventListener, cancelAnimationFrame,
// ResizeObserver.disconnect.

import { useEffect } from "react";
import type { RefObject } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ColorTrailAlphas {
  /** Soft glow halo stroke alpha (wide, low). Hub default 0.20. */
  halo: number;
  /** Bright core stroke alpha. Hub default 0.50. */
  core: number;
  /** Click/tap burst ring peak alpha. Hub default 0.70. */
  burst: number;
}

export interface ColorTrailOptions {
  /** Hue ring the trail glides through as the pointer travels (hex strings). */
  palette: string[];
  /** Head-toward-target easing. Hub default 0.2 (smooth comet, no twitch). */
  ease?: number;
  /** Stroke alphas (halo / core / burst). Hub defaults 0.20 / 0.50 / 0.70. */
  alphas?: ColorTrailAlphas;
  /** Quiet frames before clearRect + idle. Hub default 120 (~2s @60fps). */
  idleFrames?: number;
  /** Per-frame destination-out erase color. Hub default "rgba(0, 0, 0, 0.05)". */
  fade?: string;
}

// Tuned for visible glow under composite=lighter without white overburn:
//   halo 0.40    (trail outer bloom — strong soft glow; round caps fill
//                  perpendicular seams on curves)
//   core 0.80    (trail bright streak; combined with the whitened-center
//                  lerp below this reads as a luminous bright core line)
//   burst 0.55   (ripple peak α — untouched, movement-only tuning)
const DEFAULT_ALPHAS: ColorTrailAlphas = { halo: 0.4, core: 0.8, burst: 0.55 };

/**
 * Mount the persisted-canvas color-trail onto `canvasRef`, sized against
 * `layerRef` (the backdrop box). Pass the surface's hue palette + optional
 * numeric overrides (all default to the exact Hub values).
 */
export function useColorTrail(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  options: ColorTrailOptions
): void {
  const {
    palette,
    // Slightly smoother than the prior 0.2 — still well under "laggy" (0.18 ≈
    // 99 % toward a stationary target in ~25 frames / ~415 ms).
    ease = 0.18,
    alphas = DEFAULT_ALPHAS,
    idleFrames = 120,
    // Destination-out alpha for the persistent comet body — dropped to
    // 3 % per frame so the glow lingers longer (spec: 0.025-0.035).
    // The midpoint-quadratic + butt-cap path geometry still prevents the
    // per-frame stamps from overlapping at a single pixel → no white
    // over-burn even with the brighter halo/core.
    fade = "rgba(0, 0, 0, 0.03)",
  } = options;

  // Stringify the palette so the effect re-runs only when the colors actually
  // change, not on every render (a fresh array literal would otherwise churn).
  const paletteKey = palette.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    if (prefersReducedMotion()) return; // no trail under reduced motion

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Caller-supplied hue ring — the hue glides through this family as the
    // pointer travels so the trail shifts color with travel distance.
    const PALETTE = palette;
    const hexToRgb = (hex: string): [number, number, number] => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const RGB = PALETTE.map(hexToRgb);
    // Continuous palette sample: `pos` is a float position around the ring,
    // lerped between adjacent swatches so the color slides smoothly.
    const sampleColor = (pos: number): [number, number, number] => {
      const len = RGB.length;
      const t = ((pos % len) + len) % len;
      const i = Math.floor(t);
      const f = t - i;
      const a = RGB[i];
      const b = RGB[(i + 1) % len];
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    };

    // DPR-aware sizing against the backdrop layer (== the shell box). The
    // backing store scales with devicePixelRatio; we draw in CSS pixels.
    let dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 for phones
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const r = layer.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(layer);

    // Waterdrop ripple system. Each tap pushes one big Ripple; if the
    // previous click was within BRIDGE_DISTANCE_MAX a small chain of
    // bridge ripples is also pushed along an arched perpendicular path
    // between the two clicks — the "liquid surface tension" connection
    // (NOT a hard connector line). Far clicks get no bridge.
    type Ripple = {
      x: number;
      y: number;
      hue: number;
      life: number;       // 1 → 0 fade
      radius: number;     // eases toward maxRadius
      maxRadius: number;
      strength: number;   // overall amplitude (1.0 = main, ~0.55 = bridge)
    };
    let ripples: Ripple[]       = [];
    let bridgeRipples: Ripple[] = [];
    let lastClick: { x: number; y: number; hue: number } | null = null;

    // Small recent-points buffer used ONLY to build the smooth newest-segment
    // curve each frame (NOT a redraw-the-whole-trail buffer — the canvas is
    // persisted via destination-out fade above, exactly like the old comet).
    // Three recent points are enough to form a midpoint-control quadratic
    // whose tangent is continuous across frames, so segment joins are smooth
    // and contain NO round-cap stacking artefacts.
    type HeadPoint = { x: number; y: number };
    const heads: HeadPoint[] = [];
    const HEAD_BUFFER_SIZE = 12;       // ample headroom for the 3-point smoother

    // Velocity-eased ribbon width. Slow movement → thin; fast flick → wider
    // streak (clamped); idle → gradually shrinks toward 0 so the comet
    // visibly thins as it fades, not just dims to zero opacity.
    let ribbonWidth = 0;
    const W_BASE         = 12;         // baseline width at near-zero speed
    const W_SPEED_FACTOR = 0.35;       // speed → width gain
    const W_MIN          = 12;         // floor while actively moving (spec: 10..14)
    const W_MAX          = 28;         // hard cap — fast flicks can't blow out (spec: 24..30)
    const W_EASE         = 0.18;       // critical-damp ease toward target
    const HALO_EXTRA     = 24;         // halo is this many px wider than core (spec: 22..28)

    // Ripple physics + capacity. The ripple grows toward maxRadius with
    // 0.12 ease (~exponential fast then slow) and fades at 0.025/frame
    // (~40 frames ≈ 666 ms total lifetime).
    const RIPPLE_RADIUS_EASE       = 0.12;
    const RIPPLE_LIFE_DECAY        = 0.025;
    const MAIN_RIPPLE_MAX_RADIUS   = 100;    // default; jittered ± at creation
    const BRIDGE_RIPPLE_MAX_RADIUS = 42;
    const BRIDGE_DISTANCE_MAX      = 280;    // px — beyond this, no bridge spawned
    const BRIDGE_RIPPLE_COUNT      = 3;
    const RIPPLES_CAP              = 12;
    const BRIDGE_RIPPLES_CAP       = 18;

    // Local helper to render one ripple — used for both main and bridge.
    // Two feathered radial-gradient fills (outer halo + main shockwave),
    // both under composite=lighter. Skipped when alpha would be < 0.01.
    const drawRipple = (rp: Ripple) => {
      rp.radius += (rp.maxRadius - rp.radius) * RIPPLE_RADIUS_EASE;
      rp.life   -= RIPPLE_LIFE_DECAY;
      const peak = Math.max(0, rp.life) * rp.strength * alphas.burst;
      if (peak < 0.01) return;
      const [r, g, b] = sampleColor(rp.hue);
      const rgb = `${r}, ${g}, ${b}`;
      // Outer halo — wide low-α feathered ring (soft glow surrounding wave)
      {
        const inner = Math.max(0, rp.radius - 14);
        const outer = rp.radius + 12;
        const grad = ctx.createRadialGradient(rp.x, rp.y, inner, rp.x, rp.y, outer);
        grad.addColorStop(0,   `rgba(${rgb}, 0)`);
        grad.addColorStop(0.5, `rgba(${rgb}, ${peak * 0.32})`);
        grad.addColorStop(1,   `rgba(${rgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, outer, 0, Math.PI * 2);
        ctx.fill();
      }
      // Main shockwave — narrower brighter ring (the actual wavefront)
      {
        const inner = Math.max(0, rp.radius - 5);
        const outer = rp.radius + 5;
        const grad = ctx.createRadialGradient(rp.x, rp.y, inner, rp.x, rp.y, outer);
        grad.addColorStop(0,   `rgba(${rgb}, 0)`);
        grad.addColorStop(0.5, `rgba(${rgb}, ${peak * 0.65})`);
        grad.addColorStop(1,   `rgba(${rgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, outer, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let huePos = 0; // float position around the palette ring

    // Target = latest input position (set by handlers, never drawn directly).
    // Head = smoothed position eased toward the target each frame (what we draw
    // the comet at). prevHead = the head from the previous frame; each frame we
    // stroke the NEW segment prevHead → head only.
    let tx = 0;
    let ty = 0;
    let haveTarget = false; // a target has been set at least once
    let hx = 0;
    let hy = 0;
    let phx = 0;
    let phy = 0;
    let haveHead = false; // head has been seeded (skip the first phantom segment)
    const EASE = ease; // head-toward-target easing (smooth comet, no twitch)

    // Frames since the last input event — drives the eased fade-out + idle. The
    // loop keeps running after input stops until the streak has fully faded.
    let framesSinceInput = 0;
    const IDLE_FRAMES = idleFrames; // ~2s at 60fps: well past a full fade → safe to clear

    let raf2 = 0;
    let running2 = false;

    // Map a client (viewport) coord to canvas-local CSS pixels.
    const toLocal = (clientX: number, clientY: number) => {
      const r = layer.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    // Handlers ONLY set the target + reset the idle counter — no drawing here.
    const setTarget = (clientX: number, clientY: number) => {
      const { x, y } = toLocal(clientX, clientY);
      tx = x;
      ty = y;
      if (!haveTarget) {
        // First input: seed the head AT the target so the comet starts there
        // rather than easing in from (0,0).
        hx = x;
        hy = y;
        phx = x;
        phy = y;
        haveHead = true;
      }
      haveTarget = true;
      framesSinceInput = 0;
      kick2();
    };

    const onMove = (e: PointerEvent) => {
      setTarget(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) setTarget(t.clientX, t.clientY);
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = toLocal(e.clientX, e.clientY);
      huePos += 1; // jump the hue a full swatch on click/tap
      const hue = huePos;

      // 1) Spawn one BIG waterdrop ripple at the tap. maxRadius jittered ±15
      //    so back-to-back taps don't read as identical stamps.
      ripples.push({
        x, y, hue,
        life: 1,
        radius: 4,
        maxRadius: MAIN_RIPPLE_MAX_RADIUS + (Math.random() - 0.5) * 30,
        strength: 1.0,
      });
      if (ripples.length > RIPPLES_CAP) ripples.shift();

      // 2) If the previous click was close enough, spawn a small chain of
      //    bridge ripples along an arched perpendicular path between the
      //    two clicks. Peaks in the middle (sin curve) so the connection
      //    reads as liquid surface tension, NOT a hard line. Far clicks
      //    ripple independently.
      if (lastClick) {
        const dx = x - lastClick.x;
        const dy = y - lastClick.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < BRIDGE_DISTANCE_MAX) {
          const nx = -dy / dist;             // perpendicular unit vector
          const ny =  dx / dist;
          const sag = Math.min(24, dist * 0.10);
          for (let k = 1; k <= BRIDGE_RIPPLE_COUNT; k++) {
            const t = k / (BRIDGE_RIPPLE_COUNT + 1);   // 0.25 / 0.5 / 0.75
            const bend = Math.sin(t * Math.PI);        // 0 → 1 → 0 across the bridge
            const bx = lastClick.x + dx * t + nx * bend * sag;
            const by = lastClick.y + dy * t + ny * bend * sag;
            const bhue = lastClick.hue + (hue - lastClick.hue) * t;
            bridgeRipples.push({
              x: bx, y: by, hue: bhue,
              life: 1,
              radius: 2,
              maxRadius: BRIDGE_RIPPLE_MAX_RADIUS + (Math.random() - 0.5) * 10,
              strength: 0.55 * bend,                   // brightest in the middle
            });
            if (bridgeRipples.length > BRIDGE_RIPPLES_CAP) bridgeRipples.shift();
          }
        }
      }

      // 3) Remember this tap for the next bridge calculation.
      lastClick = { x, y, hue };

      // 4) Snap target + head to the tap so the movement trail continues
      //    from the click point. Drop the head smoothing buffer + reset
      //    ribbon width so the next mouse move starts a fresh quadratic
      //    chain at the click point, not a long curve jumping back from
      //    the old position.
      heads.length = 0;
      ribbonWidth = 0;
      tx = x;
      ty = y;
      hx = x;
      hy = y;
      phx = x;
      phy = y;
      haveTarget = true;
      haveHead = true;
      framesSinceInput = 0;
      kick2();
    };

    const draw = () => {
      framesSinceInput++;

      // Phase A — destination-out fade across the persistent canvas.
      // RESTORED from the old comet model (flat clear-and-redraw killed the
      // luminous feel). The "internal circles" problem is now fixed
      // surgically by switching per-frame segment caps from `round` →
      // `butt` AND by drawing each frame's segment as a midpoint-control
      // quadratic curve (Phase C below) so consecutive strokes share the
      // same tangent at their endpoints — no stacked caps, no circles.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, cssW, cssH);

      // Phase B — additive blend for the glowing comet body + click effects.
      ctx.globalCompositeOperation = "lighter";

      // Phase C — ease head, push into the small smoothing buffer, ease the
      // velocity-driven ribbon width, then stamp ONE smooth quadratic curve
      // segment per frame onto the persistent canvas. No whole-trail redraw;
      // the destination-out fade in Phase A carries the rest of the comet.
      if (haveHead) {
        hx += (tx - hx) * EASE;
        hy += (ty - hy) * EASE;

        const dx = hx - phx;
        const dy = hy - phy;
        const segLen = Math.hypot(dx, dy);

        // Hue advances proportional to travel — colors glide with movement.
        huePos += segLen * 0.006;

        // Velocity-eased ribbon width. While input is fresh, target is the
        // speed-clamped width; while idle (no recent pointermove), target
        // pulls to 0 so the comet visibly shrinks as it fades.
        const inputFresh = framesSinceInput < 4;
        const targetWidth = inputFresh
          ? Math.max(W_MIN, Math.min(W_MAX, W_BASE + segLen * W_SPEED_FACTOR))
          : 0;
        ribbonWidth += (targetWidth - ribbonWidth) * W_EASE;

        // Track recent head positions for the midpoint smoother.
        if (segLen > 0.01) {
          heads.push({ x: hx, y: hy });
          if (heads.length > HEAD_BUFFER_SIZE) heads.shift();
        }

        // Draw the newest curve segment using the midpoint-control trick:
        //   • start = midpoint(a, b)            (a = head 2 frames ago)
        //   • control = b                       (b = head 1 frame ago)
        //   • end   = midpoint(b, c)            (c = head now)
        // The endpoint of frame N's curve equals the startpoint of frame
        // N+1's curve, AND their tangents at that shared point both point
        // toward c — so the join is smooth (curvature-continuous in tangent)
        // and lineCap "butt" means the per-frame caps sit at an INTERIOR
        // point of the persisted comet body, invisible.
        // ── Continuous underlay glow ───────────────────────────────────
        // One smooth quadratic spline through the WHOLE buffer, painted
        // each frame at a very low alpha with `round` caps and joins.
        // This is the "soft continuous glow underneath" — it makes the
        // eye read the segmented per-frame stamps as ONE shape, and
        // fills the perpendicular gaps that the per-segment butt-cap
        // approach used to leave on curves. Single Path2D, single
        // stroke, single pixel per frame on overlapping segments → safe
        // additive accumulation.
        if (heads.length >= 2 && ribbonWidth > 0.5) {
          const [ur, ug, ub] = sampleColor(huePos);
          ctx.lineCap  = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = `rgba(${ur}, ${ug}, ${ub}, 0.022)`;
          ctx.lineWidth = ribbonWidth + HALO_EXTRA + 6;
          ctx.beginPath();
          ctx.moveTo(heads[0].x, heads[0].y);
          if (heads.length === 2) {
            ctx.lineTo(heads[1].x, heads[1].y);
          } else {
            // Smooth Catmull-Rom-style spline via midpoint-quadratic
            // control points — same trick the per-frame stamp uses, just
            // stretched across the whole buffer for one continuous path.
            for (let i = 1; i < heads.length - 1; i++) {
              const cur = heads[i];
              const nxt = heads[i + 1];
              const mx = (cur.x + nxt.x) * 0.5;
              const my = (cur.y + nxt.y) * 0.5;
              ctx.quadraticCurveTo(cur.x, cur.y, mx, my);
            }
            const last = heads[heads.length - 1];
            ctx.lineTo(last.x, last.y);
          }
          ctx.stroke();
        }

        if (heads.length >= 3 && ribbonWidth > 0.5 && segLen > 0.01) {
          const n = heads.length;
          const a = heads[n - 3];
          const b = heads[n - 2];
          const c = heads[n - 1];
          const m1x = (a.x + b.x) * 0.5;
          const m1y = (a.y + b.y) * 0.5;
          const m2x = (b.x + c.x) * 0.5;
          const m2y = (b.y + c.y) * 0.5;

          const [r, g, bb] = sampleColor(huePos);

          // Halo (wider, low alpha) — soft outer bloom.
          // ROUND cap so consecutive frames' halo strokes fill the
          // perpendicular seam at the join with a half-disc cap; under
          // alphas.halo (~0.40) two overlapping caps stack to ~0.80 per
          // pixel — bright but well below saturation, NOT a visible disc.
          ctx.lineCap  = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bb}, ${alphas.halo})`;
          ctx.lineWidth = ribbonWidth + HALO_EXTRA;
          ctx.beginPath();
          ctx.moveTo(m1x, m1y);
          ctx.quadraticCurveTo(b.x, b.y, m2x, m2y);
          ctx.stroke();

          // Core (narrower, brighter) — BUTT cap so its high alpha (~0.80)
          // doesn't stack at the join as a bright disc. Lerp the palette
          // color 30 % toward white so the center reads as a "light /
          // white-ish glowing core" while still being palette-tinted.
          const cr = r + Math.round((255 - r)  * 0.30);
          const cg = g + Math.round((255 - g)  * 0.30);
          const cb = bb + Math.round((255 - bb) * 0.30);
          ctx.lineCap = "butt";
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alphas.core})`;
          ctx.lineWidth = ribbonWidth;
          ctx.beginPath();
          ctx.moveTo(m1x, m1y);
          ctx.quadraticCurveTo(b.x, b.y, m2x, m2y);
          ctx.stroke();
        }

        // ── Single cursor-head glow ────────────────────────────────────
        // ONE radial-gradient orb at the current smoothed head position.
        // Drawn under `source-over` (NOT lighter) so stationary frames
        // overwrite the same pixels rather than stacking into a white
        // blob. Radius + alpha scale with velocity (via ribbonWidth), so
        // a still pointer leaves no orb and a fast pointer leaves a
        // bright orb — exactly one glow exists at any time.
        if (ribbonWidth > 0.5) {
          const orbStrength = Math.max(0, Math.min(1, ribbonWidth / W_MAX));
          if (orbStrength > 0.05) {
            const orbRadius = 22 + orbStrength * 10;         // 22 → 32 px (more glow)
            const orbAlpha  = 0.50 + orbStrength * 0.20;     // 0.50 → 0.70
            const [hr, hg, hb] = sampleColor(huePos);
            // Whitened center stop — brighter white-ish heart
            const hcr = hr + Math.round((255 - hr) * 0.45);
            const hcg = hg + Math.round((255 - hg) * 0.45);
            const hcb = hb + Math.round((255 - hb) * 0.45);
            const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, orbRadius);
            grad.addColorStop(0,   `rgba(${hcr}, ${hcg}, ${hcb}, ${orbAlpha})`);
            grad.addColorStop(0.5, `rgba(${hr}, ${hg}, ${hb}, ${orbAlpha * 0.45})`);
            grad.addColorStop(1,   `rgba(${hr}, ${hg}, ${hb}, 0)`);
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(hx, hy, orbRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "lighter"; // restore for ripples
          }
        }

        phx = hx;
        phy = hy;
      }

      // Composite is already "lighter" (set in Phase B prep) — click effects
      // below paint additively over the trail, same family of glow.

      // ── Waterdrop ripples ──────────────────────────────────────────────
      // Each tap pushes one big Ripple at the pointer location. drawRipple
      // grows the radius toward maxRadius (eased) and decays the life
      // per-frame, drawing two feathered radial-gradient passes (outer
      // halo + main shockwave). Persistent canvas + destination-out fade
      // softens what's painted; ripples retire when life ≤ 0 or radius
      // exceeded its target.
      for (let i = 0; i < ripples.length; i++) drawRipple(ripples[i]);
      ripples = ripples.filter(
        (rp) => rp.life > 0 && rp.radius < rp.maxRadius * 1.05,
      );

      // ── Bridge ripples (liquid surface tension between close clicks) ──
      // Spawned in onDown only when consecutive clicks are within
      // BRIDGE_DISTANCE_MAX. Drawn identically to main ripples, just
      // smaller (BRIDGE_RIPPLE_MAX_RADIUS) and dimmer (strength baked
      // in at spawn — peaks in the middle of the bridge via sin curve).
      for (let i = 0; i < bridgeRipples.length; i++) drawRipple(bridgeRipples[i]);
      bridgeRipples = bridgeRipples.filter(
        (rp) => rp.life > 0 && rp.radius < rp.maxRadius * 1.05,
      );

      // Keep ticking while input is recent, OR any ripple is still alive,
      // OR the movement comet hasn't thinned to zero yet. Once everything
      // is quiet, do one clearRect, reset the click-chain anchor, and
      // idle the loop (re-kicked by the next input).
      if (
        framesSinceInput < IDLE_FRAMES ||
        ripples.length > 0 ||
        bridgeRipples.length > 0 ||
        ribbonWidth > 0.5
      ) {
        raf2 = requestAnimationFrame(draw);
      } else {
        lastClick = null;          // fresh chain on next click
        heads.length = 0;
        ribbonWidth = 0;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, cssW, cssH);
        running2 = false;
      }
    };
    function kick2() {
      if (running2) return;
      running2 = true;
      raf2 = requestAnimationFrame(draw);
    }

    // Passive listeners on window — the canvas itself is pointer-events:none, so
    // taps still reach the nodes; these only OBSERVE motion, never block it.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("touchmove", onTouchMove);
      ro.disconnect();
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, layerRef, paletteKey, ease, idleFrames, fade, alphas.halo, alphas.core, alphas.burst]);
}
