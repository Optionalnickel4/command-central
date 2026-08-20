"use client";

import { useEffect, useRef, useState } from "react";

// Animated radial gauge — CPU/RAM as a glowing dial. Pure SVG, no deps.
// Sweeps in from zero on mount, counts the readout up to value, lights a
// tick ring around the arc, and flips to a red alarm state past CRITICAL.

const CRITICAL = 90;
const TICKS = 44;
const ARC_DEG = 270;

/** Eased count-up so the readout animates with the arc instead of snapping. */
function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + delta * eased;
      setDisplay(value);
      fromRef.current = value;
      if (t < 1) frame = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return display;
}

export default function RadialGauge({
  value,
  label,
  sublabel,
  color = "#22d3ee",
  size = 128
}: {
  value: number; // 0-100
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const critical = clamped >= CRITICAL;
  const tone = critical ? "#f43f5e" : color;

  // Start at zero so the first paint sweeps up to the real reading.
  const [swept, setSwept] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = swept ? clamped : 0;
  const readout = useAnimatedNumber(shown);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (ARC_DEG / 360);
  const offset = dash * (1 - shown / 100);

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="-rotate-[135deg]" style={{ width: size, height: size }}>
          {/* Tick ring — lights up to the current value */}
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const frac = i / TICKS;
            const lit = frac * 100 <= shown;
            const major = i % 11 === 0;
            return (
              <line
                key={i}
                x1="60" y1={major ? 4 : 6}
                x2="60" y2={11}
                stroke={lit ? tone : "rgba(148,163,184,0.18)"}
                strokeWidth={major ? 1.6 : 1}
                strokeLinecap="round"
                transform={`rotate(${frac * ARC_DEG + 90} 60 60)`}
                style={{
                  filter: lit ? `drop-shadow(0 0 3px ${tone})` : undefined,
                  transition: "stroke 0.5s ease"
                }}
              />
            );
          })}

          {/* Decorative slow-spinning inner ring */}
          <circle
            cx="60" cy="60" r="33"
            fill="none" stroke={tone} strokeOpacity="0.18"
            strokeWidth="1" strokeDasharray="3 9"
            className="gauge-ring-spin"
            style={{ transformOrigin: "60px 60px" }}
          />

          {/* Track */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none" stroke="rgba(34,211,238,0.1)" strokeWidth="6"
            strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
          />

          {/* Glow trail behind the value arc */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none" stroke={tone} strokeWidth="10" strokeOpacity="0.22"
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset} strokeLinecap="round"
            className="gauge-trail"
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)", filter: `blur(3px)` }}
          />

          {/* Value arc */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none" stroke={tone} strokeWidth="6"
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset} strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease",
              filter: `drop-shadow(0 0 5px ${tone})`
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-mono font-bold tabular-nums ${critical ? "live-pulse" : ""}`}
            style={{
              fontSize: size * 0.19,
              color: tone,
              textShadow: `0 0 12px ${tone}99`
            }}
          >
            {Math.round(readout)}
            <span style={{ fontSize: size * 0.1, opacity: 0.6 }}>%</span>
          </span>
        </div>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1">{label}</p>
      {sublabel && <p className="font-mono text-[9.5px] text-slate-500">{sublabel}</p>}
    </div>
  );
}
