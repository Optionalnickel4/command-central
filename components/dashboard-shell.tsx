import WidgetCluster from "@/components/widget-cluster";
import AssistantPanel from "@/components/assistant-panel";
import TickerClock from "@/components/ticker-clock";
import Ticker from "@/components/ticker";
import BootSequence from "@/components/boot-sequence";
import ParallaxRoot from "@/components/parallax-root";
import SystemPulse from "@/components/system-pulse";
import SolOrb from "@/components/sol-orb";
import CommandBar from "@/components/command-bar";
import { SolStateProvider } from "@/components/sol-state";
import { HomelabFeedProvider } from "@/components/homelab-feed";
import { esportsEnabled } from "@/lib/features";
import OperationsOverview from "@/components/operations-overview";
import PrimaryNav from "@/components/primary-nav";

/** Small reticle mark that reads as the system's sigil. */
function Sigil() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <g fill="none" stroke="#22d3ee" strokeWidth="1.2">
        <circle cx="15" cy="15" r="12" strokeOpacity="0.3" />
        <circle
          cx="15" cy="15" r="9"
          strokeOpacity="0.7" strokeDasharray="14 6 3 6"
          className="gauge-ring-spin" style={{ transformOrigin: "15px 15px" }}
        />
        <path d="M15 1v5M15 24v5M1 15h5M24 15h5" strokeOpacity="0.45" />
      </g>
      <circle cx="15" cy="15" r="3" fill="#22d3ee" style={{ filter: "drop-shadow(0 0 5px #22d3ee)" }} />
    </svg>
  );
}

/** Header load bar — driven purely by the --sys-load CSS channel. */
function LoadReadout() {
  return (
    <div className="hidden md:flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-cyan-500/45">Load</span>
      <span className="block h-[3px] w-16 rounded-full bg-cyan-500/10 overflow-hidden">
        <span
          className="block h-full rounded-full"
          style={{
            width: "calc(var(--sys-load) * 100%)",
            minWidth: "3px",
            background: "linear-gradient(90deg, #0e7490, #22d3ee)",
            boxShadow: "0 0 8px rgba(34,211,238,0.8)",
            transition: "width 1s cubic-bezier(0.22,1,0.36,1)"
          }}
        />
      </span>
    </div>
  );
}

/**
 * Energy conduits running from the core out to each cluster, carrying
 * visible traffic: cyan packets outbound from the core, slower amber packets
 * inbound. Packet speed scales with --sys-load, and every completed poll
 * flips `data-surge` on <html> for a brief bright burst.
 *
 * pathLength="100" normalises every curve so one dash pattern spaces the
 * packets evenly regardless of the path's real length.
 */
// Origin (500,280) is the orb's centre: the SVG is positioned in CSS so that
// point lands on the core at any viewport, using the shared --orb-size.
const CONDUITS = [
  "M500 280 C 380 210, 250 178, 0 148",
  "M500 280 C 380 280, 250 302, 0 322",
  "M500 280 C 380 350, 250 402, 0 452",
  "M500 280 C 620 210, 750 178, 1000 148",
  "M500 280 C 620 280, 750 302, 1000 322",
  "M500 280 C 620 350, 750 402, 1000 452"
];

function OrbitLinks() {
  return (
    <svg
      className="orbit-links hidden xl:block"
      viewBox="0 0 1000 560"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="none">
        {CONDUITS.map((d, i) => (
          <g key={d}>
            <path className="conduit" d={d} pathLength="100" />
            <path
              className="conduit-packet"
              d={d}
              pathLength="100"
              style={{ animationDelay: `${i * 0.42}s` }}
            />
            <path
              className="conduit-packet-in"
              d={d}
              pathLength="100"
              style={{ animationDelay: `${i * 0.63 + 1.1}s` }}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function DashboardShell() {
  return (
    <SolStateProvider>
      <HomelabFeedProvider>
      {/* Background depth stack */}
      <div className="hud-bg" />
      <div className="hud-depth-far">
        <div className="hud-aurora" />
      </div>
      <div className="hud-horizon" />
      <div className="hud-grid" />

      {/* Behaviour-only components (render nothing) */}
      <ParallaxRoot />
      <SystemPulse />
      <BootSequence />

      <main className="parallax-root min-h-screen flex flex-col px-5 sm:px-8 py-4">
        <header className="power-on flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sigil />
            <div className="min-w-0">
              <h1 className="hud-title font-display text-base sm:text-lg font-semibold uppercase text-cyan-200 leading-none">
                Command&nbsp;Central
              </h1>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.32em] text-cyan-500/40 mt-1.5">
                Personal Operations Deck
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <LoadReadout />
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] hud-glow-text border border-cyan-500/30 rounded px-2 py-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
                style={{ boxShadow: "0 0 6px #22d3ee" }}
              />
              LAN Live
            </div>
            <TickerClock />
          </div>
        </header>
        <PrimaryNav esports={esportsEnabled()} />

        {/* Curved divider under the header */}
        <div className="hud-arc-wrap power-on" style={{ ["--i" as string]: 1 }}>
          <svg viewBox="0 0 1200 26" preserveAspectRatio="none" className="hud-arc" aria-hidden="true">
            <path d="M0 2 Q 600 30 1200 2" fill="none" stroke="url(#arc-grad)" strokeWidth="1.4" />
            <defs>
              <linearGradient id="arc-grad" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <OperationsOverview esports={esportsEnabled()} />

        {/* The cockpit: clusters framing the core */}
        <div className="cockpit flex-1 relative">
          <OrbitLinks />

          <div className="cockpit-side">
            <WidgetCluster cluster="left" startIndex={2} />
          </div>

          <div id="sol-core" className="cockpit-core power-on" style={{ ["--i" as string]: 0 }}>
            <SolOrb />
            <AssistantPanel />
          </div>

          <div className="cockpit-side">
            <WidgetCluster cluster="right" startIndex={4} />
          </div>
        </div>

        {/* Console base: vitals marquee above the persistent command bar */}
        <div className="power-on mt-4 flex flex-col gap-2" style={{ ["--i" as string]: 8 }}>
          <Ticker />
          <CommandBar esports={esportsEnabled()} />
        </div>
      </main>

      {/* Front-most film grade */}
      <div className="hud-vignette" />
      <div className="hud-noise" />
      </HomelabFeedProvider>
    </SolStateProvider>
  );
}
