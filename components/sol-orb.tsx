"use client";

import { useEffect, useRef } from "react";
import { BACKEND_LABEL, SOL_LABEL, useSolState } from "@/components/sol-state";
import { voiceAudio, VOICE_SPECTRUM_BINS } from "@/lib/voice-audio";

/**
 * The arc reactor — Sol rendered as a layered holographic core.
 * Pure SVG + CSS: concentric tick rings, counter-rotating arc shells, an
 * energy shell and a pulsing core, plus orbiting motes.
 *
 * Everything that moves reads a CSS custom property (--orb-spin, --orb-pulse,
 * --orb-hue …) that `.sol-orb[data-state]` in globals.css redefines, so the
 * whole assembly changes character with Sol's state rather than being
 * rebuilt in JS. Reduced motion freezes it into a calm, fully-formed state.
 */

const C = 200; // centre of the 400x400 viewBox

/** Spectrum ring geometry: bars sit outside the tick ring and grow outward. */
const BAR_BASE = 186;
const BAR_MAX = 30;

/** Arc path between two angles (degrees, 0 = 12 o'clock, clockwise). */
function arc(r: number, startDeg: number, endDeg: number): string {
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(rad), C + r * Math.sin(rad)] as const;
  };
  const [x1, y1] = pt(startDeg);
  const [x2, y2] = pt(endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Evenly spaced tick marks around a ring. */
function ticks(count: number, r1: number, r2: number, everyMajor: number) {
  return Array.from({ length: count }, (_, i) => {
    const deg = (i / count) * 360;
    const major = i % everyMajor === 0;
    return { key: i, deg, major, r1: major ? r1 - 5 : r1, r2 };
  });
}

export default function SolOrb() {
  const { state, backend } = useSolState();

  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(SVGLineElement | null)[]>([]);
  const coreRef = useRef<SVGGElement>(null);
  const shellRef = useRef<SVGCircleElement>(null);
  const smoothRef = useRef<Float32Array>(new Float32Array(VOICE_SPECTRUM_BINS));
  const levelRef = useRef({ level: 0, low: 0 });

  /**
   * Drives the orb from the live analyser while speaking, then decays back to
   * the idle CSS animation. Everything here writes DOM directly — running this
   * through React state at 60fps would re-render the whole orb every frame.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speaking = state === "speaking";
    const visualising = speaking && voiceAudio.canVisualize && !reduced;

    // While visualising, CSS must not also animate core/shell transforms.
    root.classList.toggle("is-visualising", visualising);

    if (reduced) {
      // Calm fallback: a small static bloom, no per-frame reaction.
      const smooth = smoothRef.current;
      smooth.fill(speaking ? 0.18 : 0);
      barsRef.current.forEach((bar, i) => {
        if (bar) bar.setAttribute("y2", String(C - BAR_BASE - (speaking ? 5 : 0)));
        if (bar) bar.style.opacity = speaking ? "0.5" : "0";
        void i;
      });
      root.style.removeProperty("--orb-glow");
      return;
    }

    let raf = 0;
    const smooth = smoothRef.current;

    const tick = () => {
      const frame = visualising ? voiceAudio.getFrame() : null;

      // Track the PEAK bin, not the sum: a sum across 48 bins only falls below a
      // small threshold long after the orb has visually settled.
      let peak = 0;
      for (let i = 0; i < VOICE_SPECTRUM_BINS; i++) {
        const target = frame ? frame.spectrum[i] : 0;
        // Attack fast, release slower — reads as syllables rather than flicker.
        const k = frame ? 0.5 : 0.14;
        smooth[i] += (target - smooth[i]) * k;
        if (smooth[i] > peak) peak = smooth[i];

        const bar = barsRef.current[i];
        if (bar) {
          const len = smooth[i] * BAR_MAX;
          bar.setAttribute("y2", String(C - BAR_BASE - len));
          bar.style.opacity = String(0.25 + smooth[i] * 0.75);
        }
      }

      // Low band drives the core's scale/glow; overall level drives the shell.
      const targetLevel = frame ? frame.level : 0;
      const targetLow = frame ? frame.low : 0;
      levelRef.current.level += (targetLevel - levelRef.current.level) * (frame ? 0.4 : 0.1);
      levelRef.current.low += (targetLow - levelRef.current.low) * (frame ? 0.4 : 0.1);
      const { level, low } = levelRef.current;

      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + low * 0.16})`;
      if (shellRef.current) {
        shellRef.current.style.transform = `scale(${1 + level * 0.2})`;
        shellRef.current.style.opacity = String(0.28 + level * 0.5);
      }
      // Reuse the existing glow channel so the whole assembly brightens. Kept
      // updated during the decay too, otherwise it freezes at its last
      // speaking value until settle and the orb stays lit after the voice stops.
      root.style.setProperty("--orb-glow", (0.45 + level * 0.55).toFixed(3));

      const settled = !frame && peak < 0.004 && level < 0.004;
      if (settled) {
        // Hand back to CSS: clear the inline overrides we were driving.
        barsRef.current.forEach((bar) => {
          if (!bar) return;
          bar.setAttribute("y2", String(C - BAR_BASE));
          bar.style.opacity = "0";
        });
        if (coreRef.current) coreRef.current.style.transform = "";
        if (shellRef.current) {
          shellRef.current.style.transform = "";
          shellRef.current.style.opacity = "";
        }
        root.style.removeProperty("--orb-glow");
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div ref={rootRef} className="sol-orb flex flex-col items-center" data-state={state}>
      <svg
        viewBox="0 0 400 400"
        className="w-full h-auto overflow-visible"
        style={{ maxWidth: "var(--orb-size)" }}
        aria-hidden="true"
      >
        {/* Stop colours come from CSS classes, not stop-color attributes:
            var() is not supported inside SVG presentation attributes. */}
        <defs>
          <radialGradient id="orb-core-grad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="34%" className="orb-stop-hue" stopOpacity="0.92" />
            <stop offset="72%" className="orb-stop-hue" stopOpacity="0.34" />
            <stop offset="100%" className="orb-stop-hue" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-shell-grad">
            <stop offset="55%" className="orb-stop-hue" stopOpacity="0" />
            <stop offset="88%" className="orb-stop-hue" stopOpacity="0.22" />
            <stop offset="100%" className="orb-stop-hue" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer tick ring — slow, always present */}
        <g className="orb-spin-slow orb-line" strokeWidth="1" strokeOpacity="0.5">
          {ticks(72, 186, 178, 6).map((t) => (
            <line
              key={t.key}
              x1={C} y1={C - t.r1} x2={C} y2={C - t.r2}
              transform={`rotate(${t.deg} ${C} ${C})`}
              strokeWidth={t.major ? 1.6 : 0.9}
            />
          ))}
        </g>

        {/* Static targeting reticle */}
        <g className="orb-line" strokeOpacity="0.3" strokeWidth="1.2" fill="none">
          {[0, 90, 180, 270].map((deg) => (
            <path
              key={deg}
              d={`M${C - 16} ${C - 196} L${C} ${C - 206} L${C + 16} ${C - 196}`}
              transform={`rotate(${deg} ${C} ${C})`}
            />
          ))}
        </g>

        {/* Primary rotating arc shell */}
        <g className="orb-spin">
          <g className="orb-line" fill="none" strokeLinecap="round">
            <path d={arc(164, 8, 96)} strokeWidth="3" className="orb-lit" />
            <path d={arc(164, 118, 172)} strokeWidth="1.5" strokeOpacity="0.55" />
            <path d={arc(164, 192, 284)} strokeWidth="3" className="orb-lit" />
            <path d={arc(164, 300, 350)} strokeWidth="1.5" strokeOpacity="0.55" />
          </g>
        </g>

        {/* Counter-rotating gold ring */}
        <g className="orb-spin-rev">
          <circle
            cx={C} cy={C} r="142"
            fill="none" className="orb-accent-line" strokeOpacity="0.45"
            strokeWidth="1" strokeDasharray="2 10"
          />
          <g fill="none" className="orb-accent-line" strokeLinecap="round" strokeOpacity="0.8">
            <path d={arc(142, 20, 62)} strokeWidth="2.5" />
            <path d={arc(142, 200, 242)} strokeWidth="2.5" />
          </g>
        </g>

        {/* Inner segmented ring */}
        <g className="orb-spin" style={{ animationDirection: "reverse" }}>
          <g className="orb-line" fill="none" strokeWidth="6" strokeOpacity="0.16">
            <path d={arc(118, 0, 70)} />
            <path d={arc(118, 96, 166)} />
            <path d={arc(118, 192, 262)} />
          </g>
        </g>

        {/* Voice spectrum — one bar per FFT band, driven by the analyser while
            speaking. Sits outside the tick ring so it reads as the core
            radiating sound rather than another decorative ring. */}
        <g className="orb-spectrum">
          {Array.from({ length: VOICE_SPECTRUM_BINS }, (_, i) => (
            <line
              key={i}
              ref={(el) => { barsRef.current[i] = el; }}
              x1={C} y1={C - BAR_BASE}
              x2={C} y2={C - BAR_BASE}
              transform={`rotate(${(i / VOICE_SPECTRUM_BINS) * 360} ${C} ${C})`}
            />
          ))}
        </g>

        {/* Energy shell */}
        <circle ref={shellRef} cx={C} cy={C} r="112" fill="url(#orb-shell-grad)" className="orb-shell" />

        {/* Core */}
        <g className="orb-core" ref={coreRef}>
          <circle cx={C} cy={C} r="86" fill="url(#orb-core-grad)" />
          <circle
            cx={C} cy={C} r="46"
            fill="none" className="orb-line" strokeOpacity="0.65" strokeWidth="1"
          />
          <circle cx={C} cy={C} r="21" fill="#ffffff" fillOpacity="0.92" />
        </g>

        {/* Core filaments */}
        <g className="orb-spin-rev orb-line" fill="none" strokeWidth="1.4" strokeOpacity="0.55">
          <path d={arc(62, 30, 110)} />
          <path d={arc(62, 210, 290)} />
        </g>

        {/* Orbiting motes */}
        <g className="orb-spin-slow">
          {[
            { r: 176, deg: 34 },
            { r: 152, deg: 158 },
            { r: 196, deg: 248 },
            { r: 132, deg: 310 }
          ].map((m) => (
            <circle
              key={m.deg}
              cx={C} cy={C - m.r} r="2.6"
              className="orb-mote"
              transform={`rotate(${m.deg} ${C} ${C})`}
            />
          ))}
        </g>
      </svg>

      {/* Caption — names whoever is actually answering right now. */}
      <div className="flex flex-col items-center -mt-2">
        <span className="font-display text-[13px] font-semibold uppercase tracking-[0.55em] text-cyan-200 orb-caption">
          {BACKEND_LABEL[backend]}
        </span>
        <span className="mt-1 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] orb-status">
          <span className="inline-block h-1 w-1 rounded-full orb-status-dot live-pulse" />
          {SOL_LABEL[state]}
        </span>
        <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-slate-600">
          {backend === "claude" ? "Local CLI backend" : "OpenClaw · 10.0.0.152"}
        </span>
      </div>
    </div>
  );
}
