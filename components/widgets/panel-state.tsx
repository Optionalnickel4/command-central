import type { ReactNode } from "react";
import type { OperationalState } from "@/lib/operational-health";

const stateCopy: Record<OperationalState, { icon: string; label: string; tone: string }> = {
  healthy: { icon: "●", label: "Live", tone: "text-emerald-300 border-emerald-400/30" },
  degraded: { icon: "▲", label: "Degraded", tone: "text-amber-300 border-amber-400/30" },
  down: { icon: "×", label: "Down", tone: "text-rose-300 border-rose-400/30" },
  stale: { icon: "◷", label: "Stale", tone: "text-amber-300 border-amber-400/30" },
  not_configured: { icon: "○", label: "Not configured", tone: "text-slate-400 border-slate-500/30" },
  disabled: { icon: "–", label: "Disabled", tone: "text-slate-500 border-slate-600/30" }
};

export function PanelFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hud-panel depth-mid p-4 h-full ${className}`}>{children}</div>;
}

export function StateBadge({ state }: { state: OperationalState }) {
  const copy = stateCopy[state];
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] ${copy.tone}`}><span aria-hidden="true">{copy.icon}</span>{copy.label}</span>;
}

export function PanelTitle({ children, state, updatedAt }: { children?: ReactNode; state?: OperationalState; updatedAt?: string }) {
  return <div className="mb-2.5 flex items-center justify-between gap-2"><p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-400/75">{children}</p><span className="flex items-center gap-2">{updatedAt && <time dateTime={updatedAt} title={updatedAt} className="font-mono text-[8px] text-slate-500">updated</time>}{state && <StateBadge state={state} />}</span></div>;
}

export function PanelSkeleton({ label = "Loading data" }: { label?: string }) {
  return <div role="status" className="space-y-2" aria-label={label}><span className="block h-3 w-2/3 animate-pulse rounded bg-cyan-500/10"/><span className="block h-3 w-full animate-pulse rounded bg-cyan-500/5"/><span className="sr-only">{label}</span></div>;
}

export function PanelEmpty({ children }: { children?: ReactNode }) {
  return <p className="font-mono text-[11px] leading-relaxed text-slate-500">{children}</p>;
}

export function PanelFailure({ source, stale = false }: { source: string; stale?: boolean }) {
  return <div><StateBadge state={stale ? "stale" : "down"}/><p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-400">{stale ? `Live ${source} data is unavailable. Showing the last known good result.` : `${source} did not return usable data. Try again shortly or open its detail page.`}</p></div>;
}
