/**
 * Shared degraded state for esports widgets. vlr-api runs on another box, so
 * every widget needs a calm HUD-styled failure rather than a crash or a blank.
 * Mirrors the homelab panel's "SIGNAL LOST" treatment.
 */
export default function FeedOffline({ label = "Feed" }: { label?: string }) {
  return (
    <div className="hud-panel p-4 flex items-center gap-3">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 live-pulse shrink-0"
        style={{ boxShadow: "0 0 7px #f43f5e" }}
      />
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] hud-glow-red">
          Feed offline
        </p>
        <p className="font-mono text-[10px] text-slate-500 mt-0.5 truncate">
          {label} unreachable — vlr-api not responding
        </p>
      </div>
    </div>
  );
}
