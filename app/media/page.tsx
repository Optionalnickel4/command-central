import BootRelease from "@/components/boot-release";
import ParallaxRoot from "@/components/parallax-root";
import TickerClock from "@/components/ticker-clock";
import MediaPanels from "@/components/media/media-panels";
import PrimaryNav from "@/components/primary-nav";
import { esportsEnabled } from "@/lib/features";

export const metadata = { title: "Media · Command Central" };

/**
 * Media stack overview — READ-ONLY.
 * Same HUD shell as /sol and the player page, BootRelease included: without it
 * a direct load or refresh renders blank, because layout.tsx holds every
 * `.power-on` panel at frame 0 until the boot gate is cleared.
 */
export default function MediaPage() {
  return (
    <>
      <div className="hud-bg" />
      <div className="hud-depth-far"><div className="hud-aurora" /></div>
      <div className="hud-grid" />
      <ParallaxRoot />
      <BootRelease />

      <main className="parallax-root min-h-screen px-5 sm:px-8 py-4 flex flex-col">
        <header className="flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h1 className="hud-title font-display text-base sm:text-lg font-semibold uppercase text-cyan-200 leading-none">
                Media&nbsp;Stack
              </h1>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.32em] text-cyan-500/40 mt-1.5">
                media.lan · read-only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] hud-glow-text border border-cyan-500/30 rounded px-2 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
                    style={{ boxShadow: "0 0 6px #22d3ee" }} />
              LXC 103
            </span>
            <TickerClock />
          </div>
        </header>
        <PrimaryNav esports={esportsEnabled()} />

        <div className="hud-arc-wrap">
          <svg viewBox="0 0 1200 26" preserveAspectRatio="none" className="hud-arc" aria-hidden="true">
            <path d="M0 2 Q 600 30 1200 2" fill="none" stroke="url(#media-arc)" strokeWidth="1.4" />
            <defs>
              <linearGradient id="media-arc" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <MediaPanels />
      </main>

      <div className="hud-vignette" />
      <div className="hud-noise" />
    </>
  );
}
