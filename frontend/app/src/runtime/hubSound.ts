// Original, synthesized Web Audio cues for the Learning Hub unlock reveal.
//
// Fully self-contained: no asset files, no network, no app imports — just the
// Web Audio API (oscillators + gain envelopes). The tones are an ORIGINAL,
// cheerful "Duolingo-style" celebration in vibe only; none of Duolingo's actual
// audio is used or reproduced.
//
// Contract every function honors:
//   • Never throws to the caller. If Web Audio is missing, blocked, or anything
//     errors, the function silently no-ops — the visual reveal works regardless.
//   • One shared AudioContext + one master GainNode at modest volume.
//   • Oscillators are stopped after their envelope so nothing leaks.
//   • Plays once per unlock; no global mute toggle (by design).

// --- Shared graph (created lazily on first use) -----------------------------

type AnyAudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// Master peak. Per-note gains are kept well below this so overlapping notes
// (the fanfare arpeggio + sparkle) sum without clipping.
const MASTER_PEAK = 0.18;

/**
 * Resolve the AudioContext constructor with a typed webkit fallback, or null
 * if the environment has no Web Audio support.
 */
function getAudioContextCtor(): AnyAudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window &
    typeof globalThis & { webkitAudioContext?: AnyAudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Lazily build (and resume) the shared graph. Returns the AudioContext, or null
 * if Web Audio is unavailable or construction failed. Never throws.
 */
function ensureContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER_PEAK;
      master.connect(ctx.destination);
    }
    // Autoplay policies start the context "suspended"; resume() is a no-op once
    // already running. Fire-and-forget; ignore the promise rejection.
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

// --- Note scheduler ---------------------------------------------------------

type ToneType = OscillatorType;

/**
 * Schedule a single enveloped tone on the shared graph.
 *
 * @param freq   frequency in Hz
 * @param start  absolute AudioContext time to begin (seconds)
 * @param dur    duration of the decay tail (seconds)
 * @param peak   peak gain for this note (relative to the master node)
 * @param type   oscillator waveform
 */
function tone(
  freq: number,
  start: number,
  dur: number,
  peak: number,
  type: ToneType,
): void {
  if (!ctx || !master) return;
  try {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    // Quick attack, exponential decay to (near) silence. exponentialRampToValue
    // cannot target 0, so we ramp to a tiny floor then hard-stop.
    const attack = 0.012;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(env);
    env.connect(master);

    osc.start(start);
    osc.stop(start + dur + 0.02);
    // Defensive cleanup; modern browsers GC stopped nodes, but disconnect early.
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* already torn down */
      }
    };
  } catch {
    /* a single bad note must never break the run */
  }
}

// --- Musical material -------------------------------------------------------

// C-major pentatonic across two octaves (C5, D5, E5, G5, A5, C6, D6, E6).
// Pleasant, "no wrong notes" scale — used for the rising dot-pop run.
const PENTATONIC: readonly number[] = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.0, // A5
  1046.5, // C6
  1174.66, // D6
  1318.51, // E6
];

// --- Public API -------------------------------------------------------------

/**
 * Create/resume the shared AudioContext on a user gesture. Call this on the
 * first hub pointer/touch so the later auto-fired fanfare isn't autoplay-blocked.
 * Idempotent and safe to call repeatedly.
 */
export function primeAudio(): void {
  ensureContext();
}

/**
 * A soft ascending pluck/pop as each path "trial" dot appears during the
 * draw-in. Sequential calls climb the pentatonic scale (wrapping after the
 * 8-step run) so the dots read as a gentle rising melody. `index` is the
 * 0-based dot order.
 */
export function playDotPop(index: number): void {
  try {
    const ac = ensureContext();
    if (!ac) return;

    const step = ((index % PENTATONIC.length) + PENTATONIC.length) %
      PENTATONIC.length;
    const freq = PENTATONIC[step];

    // Triangle = soft, slightly hollow pluck. Short tail (~140ms), gentle gain.
    tone(freq, ac.currentTime, 0.14, 0.16, 'triangle');
  } catch {
    /* no-op on any failure */
  }
}

/**
 * The celebratory moment — a bright rising pentatonic arpeggio capped with a
 * fast high sparkle, fired when the Homework Practices node pops in and the
 * fireworks burst. ~1.0s total. Plays once.
 */
export function playUnlockFanfare(): void {
  try {
    const ac = ensureContext();
    if (!ac) return;

    const t0 = ac.currentTime;

    // 1) Rising arpeggio: C5 - E5 - G5 - C6 (a bright major triad + octave),
    //    staggered ~95ms apart, triangle for warmth. Slightly longer tails so
    //    the run rings together.
    const arp: readonly number[] = [523.25, 659.25, 783.99, 1046.5];
    const stepDur = 0.095;
    arp.forEach((freq, i) => {
      const start = t0 + i * stepDur;
      tone(freq, start, 0.34, 0.17, 'triangle');
    });

    // 2) Sparkle/shimmer: a few high, fast, decaying sine notes laid over the
    //    tail of the arpeggio. Sine keeps the highs sweet rather than harsh.
    const sparkleStart = t0 + arp.length * stepDur + 0.02;
    const sparkle: readonly number[] = [
      1318.51, // E6
      1567.98, // G6
      2093.0, // C7
      1567.98, // G6
    ];
    sparkle.forEach((freq, i) => {
      const start = sparkleStart + i * 0.07;
      tone(freq, start, 0.18, 0.1, 'sine');
    });
  } catch {
    /* no-op on any failure */
  }
}
