"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cinematic power-on. Plays once per page load, holds the dashboard's
 * `.power-on` panels at frame 0 (via the `data-boot` attribute that
 * layout.tsx ships in the SSR markup), then releases them as it wipes away
 * so the panels light up in sequence behind it.
 *
 * Skippable with a click or any key. Never rendered under
 * prefers-reduced-motion — the CSS hides it and the effect below hands over
 * immediately, so reduced-motion users get the dashboard with no delay.
 */

const BOOT_LINES = [
  "POST ......................... OK",
  "TELEMETRY BUS ................ ONLINE",
  "PROXMOX LINK ................. HANDSHAKE",
  "WIDGET REGISTRY .............. MOUNTED",
  "OPENCLAW UPLINK .............. SECURE",
  "RENDER PIPELINE .............. NOMINAL"
];

const LINE_MS = 190;
const HOLD_MS = 420;
const WIPE_MS = 560;

export default function BootSequence() {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"run" | "out">("run");
  const [revealed, setRevealed] = useState(0);
  const doneRef = useRef(false);

  // Hand control back to the dashboard: release the paused power-on
  // animations, then wipe the overlay away over them.
  const finish = useCallback((instant = false) => {
    if (doneRef.current) return;
    doneRef.current = true;
    document.documentElement.removeAttribute("data-boot");
    if (instant) {
      setVisible(false);
      return;
    }
    setPhase("out");
    setTimeout(() => setVisible(false), WIPE_MS);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finish(true);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setRevealed(i + 1), i * LINE_MS));
    });
    timers.push(setTimeout(() => finish(), BOOT_LINES.length * LINE_MS + HOLD_MS));

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
    };
  }, [finish]);

  // Safety net: never leave the panels paused if this unmounts unexpectedly.
  useEffect(() => () => document.documentElement.removeAttribute("data-boot"), []);

  if (!visible) return null;

  const pct = Math.round((revealed / BOOT_LINES.length) * 100);
  const complete = revealed >= BOOT_LINES.length;

  return (
    <div
      className="boot-overlay"
      data-phase={phase}
      onClick={() => finish()}
      role="presentation"
      aria-hidden="true"
    >
      {/* Reticle */}
      <svg width="150" height="150" viewBox="0 0 150 150" className="boot-reticle">
        <g fill="none" stroke="#22d3ee">
          <circle cx="75" cy="75" r="58" strokeOpacity="0.18" strokeWidth="1" />
          <g className="boot-ring-slow" style={{ transformOrigin: "75px 75px" }}>
            <circle
              cx="75" cy="75" r="50"
              strokeOpacity="0.6" strokeWidth="1.5"
              strokeDasharray="46 18 8 18"
              style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}
            />
          </g>
          <g className="boot-ring-fast" style={{ transformOrigin: "75px 75px" }}>
            <circle
              cx="75" cy="75" r="38"
              strokeOpacity="0.45" strokeWidth="1"
              strokeDasharray="4 12"
            />
          </g>
          <circle cx="75" cy="75" r="26" strokeOpacity="0.5" strokeWidth="1" />
          <path d="M75 8v22M75 120v22M8 75h22M120 75h22" strokeOpacity="0.4" strokeWidth="1" />
        </g>
        <circle
          cx="75" cy="75" r="6"
          fill="#22d3ee"
          className="live-pulse"
          style={{ filter: "drop-shadow(0 0 10px #22d3ee)" }}
        />
      </svg>

      {/* Wordmark */}
      <h1 className="boot-wordmark hud-title font-display text-2xl sm:text-3xl font-semibold uppercase text-cyan-300">
        Command Central
      </h1>

      {/* Boot log */}
      <div className="w-[min(88vw,380px)]">
        <div className="font-mono text-[10.5px] leading-[1.7] text-cyan-400/70 min-h-[124px]">
          {BOOT_LINES.slice(0, revealed).map((line) => (
            <div key={line} className="boot-line flex justify-between gap-3">
              <span>{line.split(" ")[0]}</span>
              <span className="flex-1 text-cyan-500/25 overflow-hidden">
                {"·".repeat(40)}
              </span>
              <span className="text-cyan-300">{line.split(" ").pop()}</span>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-3 h-[3px] w-full bg-cyan-500/10 rounded-full overflow-hidden">
          <div className="boot-bar-fill h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.25em]">
          <span className={complete ? "boot-flash text-cyan-300" : "text-cyan-500/50"}>
            {complete ? "Systems online" : "Initialising"}
          </span>
          <span className="text-cyan-500/40">{pct}%</span>
        </div>
      </div>

      <p className="absolute bottom-6 font-mono text-[9.5px] uppercase tracking-[0.3em] text-cyan-500/30">
        Click or press any key to skip
      </p>
    </div>
  );
}
