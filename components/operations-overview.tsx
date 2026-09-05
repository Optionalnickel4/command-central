"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useHomelabFeed } from "@/components/homelab-feed";
import { useWidgetData } from "@/lib/fetcher";
import { incidents, normalizeAggregateSignal, normalizeSignal, type OperationalSignal } from "@/lib/operational-health";
import type { MediaData } from "@/app/api/media/route";
import type { SolStatusData } from "@/lib/sol-status";
import type { WeatherData } from "@/app/api/widgets/weather/route";
import type { CalendarData } from "@/app/api/widgets/calendar/route";
import type { NewsData } from "@/app/api/widgets/news/route";
import type { EsportsMatchesData } from "@/lib/esports";

function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

function stateFromFeed(feed: { status?: "ok" | "degraded" | "error"; error: string | null; freshness: string }) {
  if (feed.freshness === "stale") return "degraded" as const;
  return feed.error ? "error" as const : feed.status ?? "ok";
}

function Incident({ signal, now }: { signal: OperationalSignal; now: number }) {
  const tone = signal.state === "down" ? "border-rose-500/60 bg-rose-950/20" : "border-amber-400/45 bg-amber-950/10";
  return (
    <article className={`rounded border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.12em] text-slate-100">{signal.summary}</p>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-400">{signal.detail}</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">{signal.state}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] text-slate-500">
        <time dateTime={signal.observedAt}>{age(signal.observedAt, now)}</time>
        {signal.detailHref && <Link className="text-cyan-300 hover:text-cyan-100" href={signal.detailHref}>Open detail →</Link>}
      </div>
    </article>
  );
}

export default function OperationsOverview({ esports }: { esports: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const homelab = useHomelabFeed();
  const media = useWidgetData<MediaData>("/api/media", 30_000);
  const sol = useWidgetData<SolStatusData>("/api/sol/status", 30_000);
  const weather = useWidgetData<WeatherData>("/api/widgets/weather", 10 * 60_000);
  const calendar = useWidgetData<CalendarData>("/api/widgets/calendar", 5 * 60_000);
  const news = useWidgetData<NewsData>("/api/widgets/news", 15 * 60_000);
  const matches = useWidgetData<EsportsMatchesData>("/api/widgets/esports/matches", 30_000);

  const signals = useMemo(() => {
    const list: OperationalSignal[] = [];
    const nodeDown = homelab.data?.nodes.some((node) => !node.online) ?? false;
    const guestDown = homelab.data?.guests.some((guest) => guest.status !== "ok") ?? false;
    list.push(normalizeSignal({
      id: "homelab", domain: "systems", summary: "Systems",
      detail: nodeDown ? "A Proxmox node is offline." : guestDown ? "One or more guests are stopped." : "Nodes and guests are reporting normally.",
      status: nodeDown || guestDown ? "degraded" : stateFromFeed(homelab), updatedAt: homelab.updatedAt,
      maxAgeMs: 45_000, now, detailHref: "/sol#systems-status", reasonCode: homelab.reasonCode
    }));
    const mediaSlices = media.data ? Object.values(media.data) : [];
    list.push(normalizeAggregateSignal({
      id: "media", domain: "media", summary: "Media stack", slices: mediaSlices,
      detail: mediaSlices.length ? `${mediaSlices.filter((slice) => slice.ok).length}/${mediaSlices.length} services available.` : "Media status is unavailable.",
      updatedAt: media.updatedAt, maxAgeMs: 90_000, now, detailHref: "/media#media-status",
      ...(media.error && !media.data ? { status: "error" as const } : {})
    }));
    const solDegraded = Boolean(sol.data && (sol.data.taskAudit.errors > 0 || sol.data.gateway?.reachable === false));
    list.push(normalizeSignal({
      id: "assistant", domain: "assistant", summary: "Sol / OpenClaw",
      detail: solDegraded ? "The runtime reports actionable audit or gateway issues." : "Assistant runtime is available.",
      status: solDegraded ? "degraded" : stateFromFeed(sol), updatedAt: sol.updatedAt,
      maxAgeMs: 90_000, now, detailHref: "/sol#runtime-status"
    }));
    list.push(normalizeSignal({ id: "weather", domain: "context", summary: "Weather", status: stateFromFeed(weather), configured: weather.data?.configured, updatedAt: weather.updatedAt, maxAgeMs: 30 * 60_000, now }));
    list.push(normalizeSignal({ id: "calendar", domain: "context", summary: "Calendar", status: stateFromFeed(calendar), configured: calendar.data?.configured, updatedAt: calendar.updatedAt, maxAgeMs: 20 * 60_000, now }));
    list.push(normalizeSignal({ id: "news", domain: "context", summary: "News feeds", status: stateFromFeed(news), updatedAt: news.updatedAt, maxAgeMs: 30 * 60_000, now }));
    list.push(normalizeSignal({ id: "esports", domain: "esports", summary: "Esports feed", enabled: esports, status: stateFromFeed(matches), updatedAt: matches.updatedAt, maxAgeMs: 90_000, now }));
    return list;
  }, [homelab, media, sol, weather, calendar, news, matches, esports, now]);

  const activeIncidents = incidents(signals);
  const onlineNodes = homelab.data?.nodes.filter((node) => node.online).length ?? 0;
  const onlineGuests = homelab.data?.guests.filter((guest) => guest.status === "ok").length ?? 0;
  const maxCpu = Math.max(0, ...(homelab.data?.nodes.map((node) => node.cpuPct) ?? []));
  const maxRam = Math.max(0, ...(homelab.data?.nodes.map((node) => node.ramTotalGb ? Math.round(node.ramUsedGb / node.ramTotalGb * 100) : 0) ?? []));
  const mediaOk = media.data ? Object.values(media.data).filter((slice) => slice.ok).length : 0;
  const latest = signals.map((signal) => Date.parse(signal.observedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const summaries = [
    ["Nodes", `${onlineNodes}/${homelab.data?.nodes.length ?? 0}`],
    ["Guests", `${onlineGuests}/${homelab.data?.guests.length ?? 0}`],
    ["Peak load", `${maxCpu}% CPU · ${maxRam}% RAM`],
    ["Media", `${mediaOk}/${media.data ? Object.keys(media.data).length : 0} online`],
    ["Assistant", sol.data?.gateway?.reachable === false ? "degraded" : sol.data ? "online" : "checking"]
  ];

  return (
    <div className="power-on mb-4 grid gap-3" style={{ ["--i" as string]: 1 }}>
      <section aria-live="polite" aria-atomic="true" className={`attention-band rounded border p-4 ${activeIncidents.length ? "border-amber-400/45 bg-amber-950/10" : "border-emerald-400/25 bg-emerald-950/10"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-500/70">Operational status</p>
            <h2 className={`font-display text-xl uppercase tracking-[0.12em] ${activeIncidents.length ? "text-amber-200" : "text-emerald-200"}`}>
              {activeIncidents.length ? `${activeIncidents.length} need attention` : "All clear"}
            </h2>
          </div>
          <p className="font-mono text-[9px] text-slate-500">
            {signals.filter((signal) => signal.state === "healthy").length} healthy across {new Set(signals.map((signal) => signal.domain)).size} domains
            {latest ? <> · refreshed <time dateTime={new Date(latest).toISOString()}>{age(new Date(latest).toISOString(), now)}</time></> : null}
          </p>
        </div>
        {activeIncidents.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{activeIncidents.map((signal) => <Incident key={signal.id} signal={signal} now={now} />)}</div>}
      </section>
      <section aria-labelledby="estate-summary-title" className="hud-panel p-3">
        <h2 id="estate-summary-title" className="sr-only">Estate summary</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {summaries.map(([label, value]) => <div key={label} className="rounded border border-cyan-500/10 bg-slate-950/25 px-3 py-2"><p className="font-mono text-[8px] uppercase tracking-[0.2em] text-cyan-500/55">{label}</p><p className="mt-1 font-display text-sm uppercase text-slate-200">{value}</p></div>)}
        </div>
      </section>
    </div>
  );
}
