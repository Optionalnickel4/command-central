"use client";

import { useHomelabFeed } from "@/components/homelab-feed";

// Scrolling data strip — live system vitals as a marquee.
export default function Ticker() {
  const { data } = useHomelabFeed();
  const guests = data?.guests ?? [];
  const online = guests.filter((g) => g.status === "ok").length;
  const down = guests.length - online;

  const items = [
    `NODES: ${data?.nodes.map((n) => n.name.toUpperCase()).join(" · ") ?? "—"}`,
    `CONTAINERS ONLINE: ${online}/${guests.length}`,
    ...(data?.nodes.map((n) => `${n.name.toUpperCase()} CPU ${n.cpuPct}%`) ?? []),
    ...(data?.nodes.map((n) => `${n.name.toUpperCase()} MEM ${Math.round((n.ramUsedGb / n.ramTotalGb) * 100)}%`) ?? []),
    down > 0 ? `${down} GUEST${down > 1 ? "S" : ""} OFFLINE` : "SYS NOMINAL",
    "ALL SUBSYSTEMS OPERATIONAL"
  ];
  const line = items.join("      ◆      ");

  return (
    <div className="hud-panel depth-far flex items-stretch overflow-hidden">
      {/* Fixed leading badge — the marquee scrolls past it */}
      <div className="flex items-center gap-2 px-3 border-r border-cyan-500/20 bg-cyan-500/5 shrink-0">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 live-pulse"
          style={{ boxShadow: "0 0 6px #22d3ee" }}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.3em] hud-glow-text">Vitals</span>
      </div>

      <div className="ticker-mask flex-1 overflow-hidden py-1.5 min-w-0">
        <div className="ticker-track font-mono text-[11px] tracking-wider text-cyan-400/70">
          <span className="px-4">{line}</span>
          <span className="px-4">{line}</span>
        </div>
      </div>
    </div>
  );
}
