import { notFound } from "next/navigation";
import BootRelease from "@/components/boot-release";
import ParallaxRoot from "@/components/parallax-root";
import TickerClock from "@/components/ticker-clock";
import PlayerDetail, { BackLink, PlayerHeader } from "@/components/esports/player-detail";
import { esportsEnabled } from "@/lib/features";
import PrimaryNav from "@/components/primary-nav";

export const metadata = {
  title: "Player · Esports"
};

/**
 * Player detail — radar of the 4-axis percentiles plus profile and stats.
 * Same HUD shell as /sol, including BootRelease: without it a direct load or
 * refresh renders blank, because layout.tsx holds every `.power-on` panel at
 * frame 0 until something clears the boot gate.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  // With esports off there are no leaderboard rows to reach this from; the 404
  // is for a direct hit on a stale link, so it never renders a dead radar.
  if (!esportsEnabled()) notFound();
  const { id } = await params;

  return (
    <>
      <div className="hud-bg" />
      <div className="hud-depth-far">
        <div className="hud-aurora" />
      </div>
      <div className="hud-grid" />
      <ParallaxRoot />
      <BootRelease />

      <main id="main-content" tabIndex={-1} className="parallax-root min-h-screen px-4 sm:px-8 py-4 flex flex-col outline-none">
        <header className="flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <BackLink />
            <PlayerHeader id={id} />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] hud-glow-text border border-cyan-500/30 rounded px-2 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
                    style={{ boxShadow: "0 0 6px #22d3ee" }} />
              VLR
            </span>
            <TickerClock />
          </div>
        </header>
        <PrimaryNav esports />

        <div className="hud-arc-wrap">
          <svg viewBox="0 0 1200 26" preserveAspectRatio="none" className="hud-arc" aria-hidden="true">
            <path d="M0 2 Q 600 30 1200 2" fill="none" stroke="url(#player-arc)" strokeWidth="1.4" />
            <defs>
              <linearGradient id="player-arc" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <PlayerDetail id={id} />
      </main>

      <div className="hud-vignette" />
      <div className="hud-noise" />
    </>
  );
}
