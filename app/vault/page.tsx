import Link from "next/link";
import BootRelease from "@/components/boot-release";
import ParallaxRoot from "@/components/parallax-root";
import TickerClock from "@/components/ticker-clock";
import VaultBrowser from "@/components/vault/vault-browser";

export const metadata = { title: "Vault · Command Central" };

/**
 * The Obsidian project notes — READ-ONLY.
 *
 * Same HUD shell as /sol and /media, BootRelease included: without it a direct
 * load or refresh renders blank, because layout.tsx holds every `.power-on`
 * panel at frame 0 until the boot gate is cleared, and there is no
 * BootSequence on a standalone route to clear it.
 */
export default function VaultPage() {
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
            <Link href="/" className="cmd-chip shrink-0" aria-label="Back to dashboard">← Dashboard</Link>
            <div className="min-w-0">
              <h1 className="hud-title font-display text-base sm:text-lg font-semibold uppercase text-cyan-200 leading-none">
                Project&nbsp;Vault
              </h1>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.32em] text-cyan-500/40 mt-1.5">
                Obsidian notes · read-only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] hud-glow-text border border-cyan-500/30 rounded px-2 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
                    style={{ boxShadow: "0 0 6px #22d3ee" }} />
              /mnt/vault
            </span>
            <TickerClock />
          </div>
        </header>

        <div className="hud-arc-wrap">
          <svg viewBox="0 0 1200 26" preserveAspectRatio="none" className="hud-arc" aria-hidden="true">
            <path d="M0 2 Q 600 30 1200 2" fill="none" stroke="url(#vault-arc)" strokeWidth="1.4" />
            <defs>
              <linearGradient id="vault-arc" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <VaultBrowser />
      </main>

      <div className="hud-vignette" />
      <div className="hud-noise" />
    </>
  );
}
