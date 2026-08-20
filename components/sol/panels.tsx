"use client";

import { useWidgetData } from "@/lib/fetcher";
import { formatBytes, formatUptime } from "@/lib/format";
import type { SolStatusData } from "@/app/api/sol/status/route";
import type { SolSessionsData } from "@/app/api/sol/sessions/route";
import type { SolAuditData } from "@/app/api/sol/audit/route";
import type { SolCapabilityData } from "@/app/api/sol/capability/route";
import { BarRows, Donut, StatTile, TimelineChart, HUD_COLORS } from "./charts";

/** Each panel degrades on its own so one dead route doesn't blank the page. */
function Panel({
  title, subtitle, children, offline, loading
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  offline?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="hud-panel p-4 h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
          {title}
        </span>
        {subtitle && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 truncate">
            {subtitle}
          </span>
        )}
      </div>
      {offline ? (
        <div className="flex items-center gap-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 live-pulse shrink-0"
                style={{ boxShadow: "0 0 7px #f43f5e" }} />
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] hud-glow-red">Link offline</p>
            <p className="font-mono text-[9.5px] text-slate-500 mt-0.5">cc-stats unreachable on 10.0.0.152</p>
          </div>
        </div>
      ) : loading ? (
        <p className="font-mono text-[10.5px] hud-glow-text live-pulse">QUERYING OPENCLAW…</p>
      ) : (
        children
      )}
    </div>
  );
}

const num = (n: number) => n.toLocaleString();
const entries = (rec: Record<string, number>) =>
  Object.entries(rec).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

/* ---------------- Overview ---------------- */

export function OverviewPanel() {
  const { data, status, error } = useWidgetData<SolStatusData>("/api/sol/status", 30000);
  const off = Boolean(error) || status === "error";
  const hb = data?.heartbeat?.[0];

  return (
    <Panel title="Runtime" subtitle={data?.updateChannel ? `${data.updateChannel} channel` : undefined}
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="OpenClaw" value={data.runtimeVersion || "—"} />
            <StatTile label="Agent" value={data.defaultAgentId ?? "—"} sub="default agent" tone="amber" />
            <StatTile label="Heartbeat" value={hb?.every || "—"}
                      sub={hb ? (hb.enabled ? "enabled" : "disabled") : undefined}
                      tone={hb?.enabled ? "green" : "dim"} />
            <StatTile label="Sessions" value={num(data.sessions.count)} sub="stored" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Gateway"
              value={data.gateway?.reachable ? "reachable" : "unreachable"}
              sub={data.gateway?.connectLatencyMs != null ? `${data.gateway.connectLatencyMs}ms · ${data.gateway.mode}` : data.gateway?.mode ?? undefined}
              tone={data.gateway?.reachable ? "green" : "red"}
            />
            <StatTile label="Memory plugin" value={data.memoryPlugin?.enabled ? "on" : "off"}
                      sub={data.memoryPlugin?.slot ?? undefined}
                      tone={data.memoryPlugin?.enabled ? "green" : "dim"} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1">
            <Field label="Host" value={data.os?.label ?? "—"} />
            <Field label="Default model" value={data.sessions.defaultModel ?? "—"} />
            <Field label="Context window"
                   value={data.sessions.defaultContextTokens ? `${num(data.sessions.defaultContextTokens)} tokens` : "—"} />
            <Field label="Channels / queued"
                   value={`${data.channelCount} / ${data.queuedSystemEvents}`} />
          </div>

          {data.gateway?.error && (
            <p className="font-mono text-[9.5px] text-amber-300/80 border-t border-cyan-500/10 pt-2">
              gateway note: {data.gateway.error}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-slate-600">{label}</p>
      <p className="font-mono text-[11px] text-slate-300 truncate">{value}</p>
    </div>
  );
}

/* ---------------- Tasks ---------------- */

export function TasksPanel() {
  const { data, status, error } = useWidgetData<SolStatusData>("/api/sol/status", 30000);
  const off = Boolean(error) || status === "error";
  const t = data?.tasks;
  const ok = t?.byStatus?.succeeded ?? 0;
  const failed = t?.byStatus?.failed ?? 0;
  const rate = ok + failed > 0 ? Math.round((ok / (ok + failed)) * 100) : null;

  return (
    <Panel title="Tasks" subtitle={t ? `${num(t.total)} lifetime` : undefined}
           offline={off} loading={!data && !off}>
      {t && (
        <div className="flex flex-col gap-4">
          <Donut
            segments={[
              { label: "succeeded", value: ok, color: "#34d399" },
              { label: "failed", value: failed, color: "#f43f5e" }
            ]}
            centerValue={rate == null ? "—" : `${rate}%`}
            centerLabel="success"
          />

          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Total" value={num(t.total)} />
            <StatTile label="Active" value={num(t.active)} tone={t.active > 0 ? "amber" : "dim"} />
            <StatTile label="Failures" value={num(t.failures)} tone={t.failures > 0 ? "red" : "green"} />
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By runtime</p>
            <BarRows rows={entries(t.byRuntime)} color="#22d3ee" />
          </div>

          {entries(t.byStatus).length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By status</p>
              <BarRows rows={entries(t.byStatus)} color="#fbbf24" />
            </div>
          )}

          {data?.taskAudit && (data.taskAudit.warnings > 0 || data.taskAudit.errors > 0) && (
            <p className="font-mono text-[9.5px] text-amber-300/80">
              task audit — {data.taskAudit.warnings} warnings, {data.taskAudit.errors} errors
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Sessions ---------------- */

export function SessionsPanel() {
  const { data, status, error } = useWidgetData<SolSessionsData>("/api/sol/sessions", 60000);
  const off = Boolean(error) || status === "error";

  return (
    <Panel title="Sessions" subtitle={data ? `${data.count} stored` : undefined}
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Total tokens" value={num(data.totals.total)} />
            <StatTile label="Input" value={num(data.totals.input)} tone="dim" />
            <StatTile label="Output" value={num(data.totals.output)} tone="amber" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By model</p>
              <BarRows rows={entries(data.byModel)} color="#a78bfa" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By kind</p>
              <BarRows rows={entries(data.byKind)} color="#38bdf8" />
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">
              Busiest sessions by tokens
            </p>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 pb-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-600">
                <span className="flex-1">Session</span>
                <span className="w-14 text-right">In</span>
                <span className="w-14 text-right">Out</span>
                <span className="w-16 text-right">Total</span>
              </div>
              {[...data.sessions]
                .sort((a, b) => b.totalTokens - a.totalTokens)
                .slice(0, 10)
                .map((s) => (
                  <div key={s.key} className="flex items-center gap-2 py-1 border-b border-cyan-500/5">
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <span className="font-mono text-[11px] text-slate-200 truncate">
                        {s.sessionId || s.key}
                      </span>
                      {s.status && (
                        <span className={`font-mono text-[8.5px] uppercase tracking-[0.14em] shrink-0 ${
                          s.status === "failed" ? "text-rose-400" : s.status === "done" ? "text-emerald-400" : "text-slate-500"
                        }`}>
                          {s.status}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10.5px] tabular-nums text-slate-400 w-14 text-right">{num(s.inputTokens)}</span>
                    <span className="font-mono text-[10.5px] tabular-nums text-amber-300/80 w-14 text-right">{num(s.outputTokens)}</span>
                    <span className="font-mono text-[10.5px] tabular-nums hud-glow-text w-16 text-right">{num(s.totalTokens)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Activity ---------------- */

export function ActivityPanel() {
  const { data, status, error } = useWidgetData<SolAuditData>("/api/sol/audit", 60000);
  const off = Boolean(error) || status === "error";

  return (
    <Panel
      title="Activity"
      subtitle={data?.windowEnd ? `last ${formatUptime(Math.round(((data.windowEnd - (data.windowStart ?? data.windowEnd)) / 1000)))}` : undefined}
      offline={off}
      loading={!data && !off}
    >
      {data && (
        <div className="flex flex-col gap-4">
          <TimelineChart buckets={data.timeline} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["started", "succeeded", "failed", "blocked"].map((k) => (
              <StatTile
                key={k}
                label={k}
                value={data.byStatus[k] ?? 0}
                tone={k === "failed" ? "red" : k === "succeeded" ? "green" : k === "blocked" ? "amber" : "cyan"}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By action</p>
              <BarRows rows={entries(data.byAction).slice(0, 6)} color="#22d3ee" labelWidth="w-36" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">Error codes</p>
              <BarRows rows={entries(data.byErrorCode).slice(0, 6)} color="#f43f5e" emptyLabel="No errors recorded." />
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">Recent events</p>
            <div className="max-h-[220px] overflow-y-auto flex flex-col">
              {data.events.slice(0, 25).map((e) => (
                <div key={e.eventId} className="flex items-center gap-2 py-1 border-b border-cyan-500/5 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    e.status === "failed" ? "bg-rose-500" : e.status === "succeeded" ? "bg-emerald-400"
                    : e.status === "blocked" ? "bg-amber-400" : "bg-cyan-400"
                  }`} />
                  <span className="font-mono text-[9.5px] text-slate-500 w-12 shrink-0 tabular-nums">
                    {e.occurredAt ? new Date(e.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
                  </span>
                  <span className="font-mono text-[10.5px] text-slate-300 truncate flex-1">{e.action ?? e.kind ?? "event"}</span>
                  {e.errorCode && (
                    <span className="font-mono text-[9px] text-rose-400 truncate shrink-0 max-w-[110px]">{e.errorCode}</span>
                  )}
                  <span className="font-mono text-[9px] text-slate-600 truncate shrink-0 max-w-[120px] hidden sm:block">
                    {e.sessionId ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Capabilities ---------------- */

export function CapabilityPanel() {
  const { data, status, error } = useWidgetData<SolCapabilityData>("/api/sol/capability", 10 * 60000);
  const off = Boolean(error) || status === "error";

  return (
    <Panel title="Capabilities" subtitle={data ? `${data.capabilities.length} registered` : undefined}
           offline={off} loading={!data && !off}>
      {data && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-2">By group</p>
            <BarRows rows={entries(data.byGroup)} color="#34d399" />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {entries(data.byTransport).map((t) => (
              <span key={t.label} className="font-mono text-[9.5px] text-slate-500">
                {t.label}: <span className="text-cyan-300">{t.value}</span>
              </span>
            ))}
          </div>

          <div className="max-h-[300px] overflow-y-auto flex flex-col gap-1.5">
            {data.capabilities.map((c, i) => (
              <div key={c.id} className="rounded border border-cyan-500/10 bg-slate-950/25 px-2.5 py-1.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-1.5 w-1.5 rounded-sm shrink-0"
                    style={{ background: HUD_COLORS[i % HUD_COLORS.length] }}
                  />
                  <span className="font-mono text-[11px] text-cyan-200 truncate flex-1">{c.id}</span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-600 shrink-0">
                    {c.transports.join(" · ")}
                  </span>
                </div>
                {c.description && (
                  <p className="font-mono text-[9.5px] text-slate-500 mt-0.5 leading-snug">{c.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
