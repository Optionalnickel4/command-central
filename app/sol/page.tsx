import Link from "next/link";
import BootRelease from "@/components/boot-release";
import ParallaxRoot from "@/components/parallax-root";
import TickerClock from "@/components/ticker-clock";
import SolTabs from "@/components/sol/sol-tabs";

export const metadata = {
  title: "Sol · OpenClaw stats"
};

/**
 * Dedicated OpenClaw/Sol telemetry page.
 *
 * Reads stored OpenClaw state through the read-only cc-stats wrapper, so it
 * works whether or not Sol can currently answer — sessions, tasks and audit are
 * all persisted history.
 */
export default function SolStatsPage() {
  return (
    <>
      <div className="hud-bg" />
      <div className="hud-depth-far">
        <div className="hud-aurora" />
      </div>
      <div className="hud-grid" />
      <ParallaxRoot />
      {/* No boot overlay on this route — release the gate so panels can appear. */}
      <BootRelease />

      <main className="parallax-root min-h-screen px-5 sm:px-8 py-4 flex flex-col">
        <header className="flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="cmd-chip shrink-0" aria-label="Back to dashboard">
              ← Dashboard
            </Link>
            <div className="min-w-0">
              <h1 className="hud-title font-display text-base sm:text-lg font-semibold uppercase text-cyan-200 leading-none">
                Sol&nbsp;·&nbsp;OpenClaw
              </h1>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.32em] text-cyan-500/40 mt-1.5">
                Agent telemetry · read-only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] hud-glow-text border border-cyan-500/30 rounded px-2 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
                    style={{ boxShadow: "0 0 6px #22d3ee" }} />
              10.0.0.152
            </span>
            <TickerClock />
          </div>
        </header>

        <div className="hud-arc-wrap">
          <svg viewBox="0 0 1200 26" preserveAspectRatio="none" className="hud-arc" aria-hidden="true">
            <path d="M0 2 Q 600 30 1200 2" fill="none" stroke="url(#sol-arc)" strokeWidth="1.4" />
            <defs>
              <linearGradient id="sol-arc" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Each panel fetches and degrades independently. */}
        <SolTabs />

      </main>

      <div className="hud-vignette" />
      <div className="hud-noise" />
    </>
  );
}
