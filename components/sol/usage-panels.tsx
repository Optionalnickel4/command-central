"use client";

import { useEffect, useRef, useState } from "react";
import { useWidgetData } from "@/lib/fetcher";
import type { SolUsageData } from "@/app/api/sol/usage/route";
import type { SolSessionsData } from "@/app/api/sol/sessions/route";
import type { SolAuditData } from "@/app/api/sol/audit/route";
import { BarRows, LineSeries, StackedBars, StatTile, TimelineChart } from "./charts";

/**
 * Usage analytics in two clearly-separated layers:
 *   LIVE      — this dashboard's own per-turn record (data/usage.jsonl)
 *   HISTORICAL — OpenClaw's stored sessions + audit history
 */

function Panel({
  title, tag, subtitle, children, offline, loading
}: {
  title: string;
  tag: "live" | "historical";
  subtitle?: string;
  children?: React.ReactNode;
  offline?: boolean;
  loading?: boolean;
}) {
  const live = tag === "live";
  return (
    <div className="hud-panel p-4 h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text truncate">
            {title}
          </span>
          <span className={`font-mono text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border shrink-0 ${
            live
              ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
              : "text-slate-400 border-slate-600/40 bg-slate-700/20"
          }`}>
            {live ? "this dashboard" : "openclaw history"}
          </span>
        </div>
        {subtitle && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 truncate shrink-0">
            {subtitle}
          </span>
        )}
      </div>
      {offline ? (
        <div className="flex items-center gap-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 live-pulse shrink-0"
                style={{ boxShadow: "0 0 7px #f43f5e" }} />
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] hud-glow-red">Data unavailable</p>
        </div>
      ) : loading ? (
        <p className="font-mono text-[10.5px] hud-glow-text live-pulse">LOADING…</p>
      ) : (
        children
      )}
    </div>
  );
}

const n = (v: number) => Math.round(v).toLocaleString();

/* ---------------- LIVE: per-turn usage ---------------- */

export function LiveUsagePanel() {
  const { data, status, error } = useWidgetData<SolUsageData>("/api/sol/usage", 10000);
  const off = Boolean(error) || status === "error";

  // Flash a "live" pip when a new turn lands.
  const [fresh, setFresh] = useState(false);
  const lastTs = useRef<number | null>(null);
  useEffect(() => {
    const ts = data?.latest?.ts ?? null;
    if (ts && lastTs.current !== null && ts !== lastTs.current) {
      setFresh(true);
      const id = setTimeout(() => setFresh(false), 6000);
      lastTs.current = ts;
      return () => clearTimeout(id);
    }
    lastTs.current = ts;
  }, [data?.latest?.ts]);

  const solTurns = (data?.turns ?? []).filter((t) => t.backend === "sol" && t.totalTokens != null);
  const recent = solTurns.slice(-40);

  return (
    <Panel
      title="Tokens per turn"
      tag="live"
      subtitle={data ? `${data.totals.solTurns} sol turns logged` : undefined}
      offline={off}
      loading={!data && !off}
    >
      {data && (
        <div className="flex flex-col gap-4">
          {fresh && (
            <div className="flex items-center gap-2 -mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse"
                    style={{ boxShadow: "0 0 7px #34d399" }} />
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-300">
                new turn just landed
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Turns" value={n(data.totals.turns)} sub={`cap ${data.cap}`} />
            <StatTile label="Total tokens" value={n(data.totals.total)} tone="cyan" />
            <StatTile label="Avg / turn"
                      value={data.averages.totalTokens != null ? n(data.averages.totalTokens) : "—"}
                      tone="amber" />
            <StatTile label="Avg latency"
                      value={data.averages.durationMs != null ? `${(data.averages.durationMs / 1000).toFixed(1)}s` : "—"}
                      tone={data.totals.failures > 0 ? "red" : "green"}
                      sub={data.totals.failures > 0 ? `${data.totals.failures} failed` : "all ok"} />
          </div>

          <StackedBars
            rows={recent.map((t) => ({
              a: t.inputTokens ?? 0,
              b: t.outputTokens ?? 0,
              title: `${new Date(t.ts).toLocaleTimeString()} — in ${t.inputTokens ?? 0}, out ${t.outputTokens ?? 0}`
            }))}
            labels={["input", "output"]}
            colors={["#22d3ee", "#fbbf24"]}
          />
        </div>
      )}
    </Panel>
  );
}

export function LatencyPanel() {
  const { data, status, error } = useWidgetData<SolUsageData>("/api/sol/usage", 10000);
  const off = Boolean(error) || status === "error";
  const turns = (data?.turns ?? []).filter((t) => t.durationMs != null);
  const sol = turns.filter((t) => t.backend === "sol");

  return (
    <Panel title="Latency" tag="live" subtitle="per turn" offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <LineSeries
            points={turns.slice(-40).map((t) => (t.durationMs ?? 0) / 1000)}
            color="#34d399"
            unit="s"
            label="Round trip"
          />
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Sol median"
              value={median(sol.map((t) => t.durationMs ?? 0)) ?? "—"}
              sub="seconds"
              tone="green"
            />
            <StatTile
              label="Slowest"
              value={turns.length ? `${(Math.max(...turns.map((t) => t.durationMs ?? 0)) / 1000).toFixed(1)}s` : "—"}
              tone="amber"
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

function median(values: number[]): string | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v[Math.floor(v.length / 2)];
  return `${(mid / 1000).toFixed(1)}`;
}

export function ContextCachePanel() {
  const { data, status, error } = useWidgetData<SolUsageData>("/api/sol/usage", 10000);
  const off = Boolean(error) || status === "error";
  const sol = (data?.turns ?? []).filter((t) => t.backend === "sol");
  const ctx = sol.filter((t) => t.promptTokens != null).slice(-40).map((t) => t.promptTokens as number);
  const cacheRatio = sol
    .filter((t) => t.totalTokens != null && t.totalTokens > 0)
    .slice(-40)
    .map((t) => ((t.cacheRead ?? 0) / (t.totalTokens as number)) * 100);

  return (
    <Panel title="Context & cache" tag="live" subtitle="window fill · cache reuse"
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <LineSeries points={ctx} color="#a78bfa" unit=" tok" label="Prompt tokens (context growth)" />
          <LineSeries points={cacheRatio} color="#38bdf8" unit="%" label="Cache read share of turn" />
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Cache read" value={n(data.totals.cacheRead)} tone="cyan" sub="tokens served from cache" />
            <StatTile
              label="Cache share"
              value={data.averages.cacheHitPct != null ? `${data.averages.cacheHitPct.toFixed(0)}%` : "—"}
              tone="green"
              sub="of all tokens"
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- HISTORICAL: OpenClaw backbone ---------------- */

export function HistoricalUsagePanel() {
  const { data, status, error } = useWidgetData<SolSessionsData>("/api/sol/sessions", 60000);
  const off = Boolean(error) || status === "error";

  // Oldest → newest, so the series reads left to right in time.
  const ordered = [...(data?.sessions ?? [])]
    .filter((s) => s.totalTokens > 0)
    .sort((a, b) => (a.sessionStartedAt ?? a.updatedAt ?? 0) - (b.sessionStartedAt ?? b.updatedAt ?? 0));

  const avgPerSession = ordered.length
    ? ordered.reduce((a, s) => a + s.totalTokens, 0) / ordered.length
    : null;

  return (
    <Panel title="Tokens by session" tag="historical"
           subtitle={data ? `${data.count} sessions` : undefined}
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="All sessions" value={n(data.totals.total)} />
            <StatTile label="Avg / session" value={avgPerSession != null ? n(avgPerSession) : "—"} tone="amber" />
            <StatTile label="Sessions" value={n(data.count)} tone="dim" />
          </div>
          <StackedBars
            rows={ordered.map((s) => ({
              a: s.inputTokens,
              b: s.outputTokens,
              title: `${s.sessionId ?? s.key} — ${n(s.totalTokens)} tokens`
            }))}
            labels={["input", "output"]}
            colors={["#22d3ee", "#fbbf24"]}
          />
          <BarRows
            rows={Object.entries(data.byModel).map(([label, value]) => ({ label, value }))}
            color="#a78bfa"
            labelWidth="w-28"
          />
        </div>
      )}
    </Panel>
  );
}

export function HistoricalRunsPanel() {
  const { data, status, error } = useWidgetData<SolAuditData>("/api/sol/audit", 60000);
  const off = Boolean(error) || status === "error";
  const ok = data?.byStatus?.succeeded ?? 0;
  const failed = data?.byStatus?.failed ?? 0;
  const rate = ok + failed > 0 ? Math.round((ok / (ok + failed)) * 100) : null;

  return (
    <Panel title="Runs over time" tag="historical" subtitle="audit stream"
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <TimelineChart buckets={data.timeline} />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Succeeded" value={n(ok)} tone="green" />
            <StatTile label="Failed" value={n(failed)} tone={failed > 0 ? "red" : "dim"} />
            <StatTile label="Success rate" value={rate == null ? "—" : `${rate}%`} tone="cyan" />
          </div>
        </div>
      )}
    </Panel>
  );
}
