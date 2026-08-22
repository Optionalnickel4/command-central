"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { MediaData } from "@/app/api/media/route";
import { bytes } from "@/lib/media";

/**
 * Media panels. Every panel reads the same combined payload but renders its own
 * service's slice, so one unavailable service shows a single "unavailable"
 * card while the rest carry on.
 */

function Panel({
  title, tag, children, state
}: {
  title: string;
  tag?: string;
  children?: React.ReactNode;
  state?: { ok: boolean; error: string | null } | null;
}) {
  const unavailable = state && !state.ok;
  return (
    <div className="hud-panel p-4 h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text truncate">
          {title}
        </span>
        {tag && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 truncate shrink-0">
            {tag}
          </span>
        )}
      </div>
      {unavailable ? (
        <div className="flex items-start gap-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-1"
                style={{ boxShadow: "0 0 7px #fbbf24" }} />
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-amber-300/90">Unavailable</p>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5">{state?.error}</p>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const Bar = ({ pct, color = "#22d3ee" }: { pct: number; color?: string }) => (
  <span className="block h-[4px] w-full rounded-full bg-slate-800/70 overflow-hidden">
    <span className="block h-full rounded-full bar-fill"
          style={{ width: `${Math.max(1, Math.min(100, pct))}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
  </span>
);

const eta = (s: number | null) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function MediaPanels() {
  const { data, error, status } = useWidgetData<MediaData>("/api/media", 15000);

  if (error || status === "error") {
    return (
      <div className="hud-panel p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] hud-glow-red">Media feed offline</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="hud-panel p-5">
        <p className="font-mono text-[11px] hud-glow-text live-pulse">CONTACTING MEDIA STACK…</p>
      </div>
    );
  }

  const jf = data.jellyfin;
  const sessions = jf.data?.sessions ?? [];
  const qb = data.qbittorrent;
  const sonarr = data.sonarr;
  const radarr = data.radarr;

  return (
    <div className="sol-grid flex-1 pb-4">
      {/* ---------- CENTREPIECE: now playing ---------- */}
      <div className="power-on sol-span-2" style={{ ["--i" as string]: 0 }}>
        <Panel
          title="Now Playing"
          tag={jf.ok ? `${jf.data?.serverName ?? "Jellyfin"}${jf.data?.version ? ` · ${jf.data.version}` : ""}` : undefined}
          state={jf}
        >
          {sessions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-display text-[15px] uppercase tracking-[0.34em] text-slate-500">Nothing playing</p>
              <p className="font-mono text-[10px] text-slate-600 mt-2">
                No active streams — the library is idle.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {sessions.map((s: any, i: number) => (
                <div key={i} className="rounded border border-cyan-500/15 bg-slate-950/35 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.paused ? "bg-amber-400" : "bg-emerald-400 live-pulse"}`}
                            style={{ boxShadow: s.paused ? "0 0 6px #fbbf24" : "0 0 6px #34d399" }} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300 truncate">
                        {s.user}
                      </span>
                    </span>
                    <span className={`font-mono text-[8.5px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded border shrink-0 ${
                      s.isTranscoding
                        ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
                        : "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
                    }`}>
                      {s.isTranscoding ? "transcode" : "direct"}
                    </span>
                  </div>
                  <p className="font-display text-[15px] uppercase tracking-[0.05em] text-cyan-100 truncate">{s.title}</p>
                  {s.subtitle && <p className="font-mono text-[11px] text-slate-400 truncate mt-0.5">{s.subtitle}</p>}
                  <div className="mt-2.5">
                    <Bar pct={s.progressPct} color={s.paused ? "#fbbf24" : "#22d3ee"} />
                    <div className="flex justify-between font-mono text-[9px] text-slate-500 mt-1">
                      <span>{s.progressPct}%{s.paused ? " · paused" : ""}</span>
                      <span className="truncate max-w-[55%]">{s.client} · {s.device}</span>
                    </div>
                  </div>
                  {s.isTranscoding && s.transcodeReason && (
                    <p className="font-mono text-[9px] text-amber-300/70 mt-1.5 truncate">
                      reason: {s.transcodeReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {jf.ok && jf.data?.counts && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 pt-3 border-t border-cyan-500/10">
              {[
                ["Movies", jf.data.counts.movies],
                ["Series", jf.data.counts.series],
                ["Episodes", jf.data.counts.episodes]
              ].map(([label, v]) => (
                <span key={String(label)} className="font-mono text-[10px] text-slate-500">
                  {label}: <span className="hud-glow-text">{v ?? "—"}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------- Downloads ---------- */}
      <div className="power-on" style={{ ["--i" as string]: 1 }}>
        <Panel
          title="Downloads"
          tag={qb.ok && qb.data?.global
            ? `↓ ${bytes(qb.data.global.dlSpeed, true)} · ↑ ${bytes(qb.data.global.upSpeed, true)}`
            : undefined}
          state={qb}
        >
          {(qb.data?.torrents ?? []).length === 0 ? (
            <p className="font-mono text-[10.5px] text-slate-500 py-3">No torrents in the client.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {qb.data.torrents.map((t: any, i: number) => (
                <div key={i} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-200 truncate">{t.name}</span>
                    <span className="font-mono text-[10px] tabular-nums hud-glow-text shrink-0">{t.progressPct}%</span>
                  </div>
                  <div className="mt-1"><Bar pct={t.progressPct} /></div>
                  <div className="flex justify-between font-mono text-[9px] text-slate-500 mt-0.5">
                    <span>{t.state} · ↓{bytes(t.dlSpeed, true)}</span>
                    <span>{t.etaSeconds ? `eta ${eta(t.etaSeconds)}` : bytes(t.size)}</span>
                  </div>
                </div>
              ))}
              <p className="font-mono text-[9px] text-slate-600 mt-1">
                {qb.data.active} active of {qb.data.total}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* ---------- Requests ---------- */}
      <div className="power-on" style={{ ["--i" as string]: 2 }}>
        <Panel
          title="Requests"
          tag={data.seerr.ok ? `${data.seerr.data?.pending ?? 0} pending` : undefined}
          state={data.seerr}
        >
          {(data.seerr.data?.requests ?? []).length === 0 ? (
            <p className="font-mono text-[10.5px] text-slate-500 py-3">No recent requests.</p>
          ) : (
            <div className="flex flex-col">
              {data.seerr.data.requests.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-cyan-500/5 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    r.status === "pending" ? "bg-amber-400" :
                    r.status === "approved" ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className="font-mono text-[11.5px] text-slate-200 truncate flex-1">{r.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 shrink-0">{r.type ?? ""}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-400/70 shrink-0">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------- Sonarr / Radarr queue + upcoming ---------- */}
      <div className="power-on" style={{ ["--i" as string]: 3 }}>
        <Panel title="TV — Sonarr" tag={sonarr.ok ? `${sonarr.data?.queueTotal ?? 0} queued` : undefined} state={sonarr}>
          <ArrBody d={sonarr.data} />
        </Panel>
      </div>
      <div className="power-on" style={{ ["--i" as string]: 4 }}>
        <Panel title="Movies — Radarr" tag={radarr.ok ? `${radarr.data?.queueTotal ?? 0} queued` : undefined} state={radarr}>
          <ArrBody d={radarr.data} />
        </Panel>
      </div>

      {/* ---------- Recently added ---------- */}
      <div className="power-on" style={{ ["--i" as string]: 5 }}>
        <Panel title="Recently Added" tag="jellyfin" state={jf}>
          {(jf.data?.latest ?? []).length === 0 ? (
            <p className="font-mono text-[10.5px] text-slate-500 py-3">Nothing new in the library.</p>
          ) : (
            <div className="flex flex-col">
              {jf.data.latest.map((i: any) => (
                <div key={i.id} className="flex items-center gap-2 py-1.5 border-b border-cyan-500/5 min-w-0">
                  <span className="font-mono text-[11.5px] text-slate-200 truncate flex-1">
                    {i.series ? `${i.series} — ${i.name}` : i.name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 shrink-0">
                    {i.type ?? ""}{i.year ? ` ${i.year}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------- Indexers ---------- */}
      <div className="power-on" style={{ ["--i" as string]: 6 }}>
        <Panel
          title="Indexers"
          tag={data.prowlarr.ok ? `${data.prowlarr.data?.enabled ?? 0}/${data.prowlarr.data?.total ?? 0} enabled` : undefined}
          state={data.prowlarr}
        >
          {(data.prowlarr.data?.indexers ?? []).length === 0 ? (
            <p className="font-mono text-[10.5px] text-slate-500 py-3">No indexers configured.</p>
          ) : (
            <div className="flex flex-col">
              {data.prowlarr.data.indexers.map((ix: any) => (
                <div key={ix.name} className="flex items-center gap-2 py-1.5 border-b border-cyan-500/5 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ix.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className="font-mono text-[11.5px] text-slate-200 truncate flex-1">{ix.name}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 shrink-0">{ix.protocol ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ArrBody({ d }: { d: any }) {
  if (!d) return null;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-1.5">Queue</p>
        {(d.queue ?? []).length === 0 ? (
          <p className="font-mono text-[10.5px] text-slate-500">Queue is empty.</p>
        ) : (
          d.queue.map((q: any, i: number) => (
            <div key={i} className="mb-2 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-200 truncate">{q.title}</span>
                <span className="font-mono text-[10px] tabular-nums hud-glow-text shrink-0">{q.progressPct}%</span>
              </div>
              <div className="mt-1"><Bar pct={q.progressPct} color="#fbbf24" /></div>
              <p className="font-mono text-[9px] text-slate-500 mt-0.5">{q.status ?? ""}{q.quality ? ` · ${q.quality}` : ""}</p>
            </div>
          ))
        )}
      </div>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500 mb-1.5">Upcoming (7d)</p>
        {(d.upcoming ?? []).length === 0 ? (
          <p className="font-mono text-[10.5px] text-slate-500">Nothing scheduled.</p>
        ) : (
          d.upcoming.map((u: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-cyan-500/5 min-w-0">
              <span className="font-mono text-[11px] text-slate-200 truncate flex-1">{u.title}</span>
              {u.subtitle && <span className="font-mono text-[9.5px] text-slate-500 truncate max-w-[45%]">{u.subtitle}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
