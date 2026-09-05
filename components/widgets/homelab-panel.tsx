"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/fetcher";
import { useRollingHistory } from "@/lib/history";
import { formatBytes, formatUptime, pctOf } from "@/lib/format";
import type { HomelabData } from "@/app/api/widgets/homelab/route";
import type { HomelabDetailData, GuestDetail, NodeDetail } from "@/app/api/widgets/homelab-detail/route";
import RadialGauge from "./radial-gauge";
import HistoryGraph from "./history-graph";
import { PanelFailure, PanelFrame, PanelSkeleton } from "./panel-state";

type Node = HomelabData["nodes"][number];
type Guest = HomelabData["guests"][number];

/** Thin meter used on container rows and node readouts. */
function Meter({ value, color, width = "w-10" }: { value: number; color: string; width?: string }) {
  return (
    <span className={`inline-block h-[3px] ${width} rounded-full bg-slate-700/50 overflow-hidden align-middle`}>
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(2, Math.min(100, value))}%`,
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)"
        }}
      />
    </span>
  );
}

/** Label/value pair for the expanded detail grid. */
function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-slate-600">{label}</p>
      <p className={`font-mono text-[11px] truncate ${tone ?? "text-slate-300"}`}>{value}</p>
    </div>
  );
}

/**
 * One node's command block: live gauges, rolling CPU/RAM trend, and the
 * deeper readout (load average, uptime, swap, root filesystem).
 */
function NodeBlock({ node, detail, stamp }: { node: Node; detail?: NodeDetail; stamp?: string }) {
  const ramPct = node.ramTotalGb ? Math.round((node.ramUsedGb / node.ramTotalGb) * 100) : 0;
  const cpuHistory = useRollingHistory(node.cpuPct, stamp);
  const ramHistory = useRollingHistory(ramPct, stamp);

  // Load average is per-core; >1.0 per core is the saturation point.
  const cores = detail?.cpus || 0;
  const load1 = detail?.loadavg?.[0] ?? 0;
  const loadPct = cores ? Math.min(100, (load1 / cores) * 100) : 0;

  return (
    <div className="hud-panel depth-near p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-cyan-500/15">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${node.online ? "bg-emerald-400 live-pulse" : "bg-rose-500"}`}
            style={{ boxShadow: node.online ? "0 0 8px #34d399" : "0 0 8px #f43f5e" }}
          />
          <span className="font-display text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200">
            {node.name}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-500/50 border border-cyan-500/25 rounded px-1.5 py-0.5 shrink-0">
            Node
          </span>
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.25em] text-slate-500 shrink-0">
          {detail ? `Up ${formatUptime(detail.uptimeSec)}` : node.online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex justify-center gap-3">
          <RadialGauge value={node.cpuPct} label="CPU" color="#22d3ee" size={106} />
          <RadialGauge
            value={ramPct}
            label="RAM"
            sublabel={`${node.ramUsedGb}/${node.ramTotalGb} GB`}
            color="#fbbf24"
            size={106}
          />
        </div>

        {/* Deeper node readout */}
        {detail && (
          <div className="rounded border border-cyan-500/10 bg-slate-950/30 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-cyan-500/50">
                Load average
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-slate-300">
                <span className="hud-glow-text">{detail.loadavg[0].toFixed(2)}</span>
                <span className="text-slate-600 mx-1">/</span>
                {detail.loadavg[1].toFixed(2)}
                <span className="text-slate-600 mx-1">/</span>
                {detail.loadavg[2].toFixed(2)}
              </span>
            </div>
            <Meter value={loadPct} color="#22d3ee" width="w-full" />

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3">
              <Field
                label="CPU"
                value={`${detail.cores} core / ${detail.cpus} thread`}
              />
              <Field
                label="Swap"
                value={
                  detail.swapTotalBytes
                    ? `${formatBytes(detail.swapUsedBytes)} / ${formatBytes(detail.swapTotalBytes)}`
                    : "—"
                }
                tone={pctOf(detail.swapUsedBytes, detail.swapTotalBytes) > 60 ? "text-amber-300" : undefined}
              />
              <Field
                label="Root FS"
                value={`${formatBytes(detail.rootfsUsedBytes)} / ${formatBytes(detail.rootfsTotalBytes)}`}
              />
              <Field
                label="Temp"
                value={detail.tempC != null ? `${detail.tempC.toFixed(0)}°C` : "not exposed"}
                tone={detail.tempC == null ? "text-slate-600" : undefined}
              />
            </div>
            <p className="font-mono text-[8.5px] text-slate-600 mt-2 truncate">
              {detail.cpuModel}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 min-w-0">
          <HistoryGraph points={cpuHistory} label="CPU trend" color="#22d3ee" />
          <HistoryGraph points={ramHistory} label="Memory trend" color="#fbbf24" />
        </div>
      </div>
    </div>
  );
}

/** One container row, expandable to its full detail. */
function GuestRow({ guest, detail }: { guest: Guest; detail?: GuestDetail }) {
  const [open, setOpen] = useState(false);
  const up = guest.status === "ok";

  return (
    <div className="border-b border-cyan-500/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-cyan-500/5 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-mono text-slate-300 min-w-0">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${up ? "bg-emerald-400 live-pulse" : "bg-rose-500"}`}
            style={{ boxShadow: up ? "0 0 6px #34d399" : "0 0 6px #f43f5e" }}
          />
          <span className={`row-caret shrink-0 text-cyan-500/40 ${open ? "is-open" : ""}`}>▸</span>
          <span className="text-slate-500 text-xs w-8 shrink-0">{guest.vmid}</span>
          <span className="text-slate-200 truncate">{guest.name}</span>
          <span className="text-[9px] uppercase text-cyan-500/50 border border-cyan-500/20 rounded px-1 shrink-0">
            {guest.type}
          </span>
          {detail?.ip && (
            <span className="hidden md:inline text-[10px] text-cyan-500/45 truncate">{detail.ip}</span>
          )}
        </span>

        <span className="font-mono text-xs text-slate-400 flex items-center gap-2 shrink-0">
          {up ? (
            <>
              <span className="hidden sm:flex items-center gap-1.5">
                <Meter value={guest.cpuPct} color="#22d3ee" />
                <Meter value={guest.memPct} color="#fbbf24" />
              </span>
              <span className="tabular-nums">
                <span className="text-cyan-400">{guest.cpuPct}%</span>
                <span className="text-slate-600 mx-1">·</span>
                <span className="text-amber-400">{guest.memPct}%</span>
              </span>
            </>
          ) : (
            <span className="text-rose-500">OFFLINE</span>
          )}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 bg-slate-950/40 row-detail">
          {!detail ? (
            <p className="font-mono text-[10px] text-slate-500 live-pulse">Loading detail…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5">
              <Field label="IP address" value={detail.ip ?? "—"} tone="text-cyan-300" />
              <Field label="Uptime" value={formatUptime(detail.uptimeSec)} />
              <Field label="vCPU" value={detail.cpus ? String(detail.cpus) : "—"} />
              <Field
                label="Memory"
                value={`${formatBytes(detail.memBytes)} / ${formatBytes(detail.maxMemBytes)}`}
                tone="text-amber-300"
              />
              <Field
                label="Disk"
                value={
                  detail.diskKnown
                    ? `${formatBytes(detail.diskBytes)} / ${formatBytes(detail.maxDiskBytes)}`
                    : `${formatBytes(detail.maxDiskBytes)} allocated`
                }
              />
              <Field
                label="Swap"
                value={
                  detail.maxSwapBytes
                    ? `${formatBytes(detail.swapBytes)} / ${formatBytes(detail.maxSwapBytes)}`
                    : "—"
                }
              />
              <Field label="Net in" value={formatBytes(detail.netInBytes)} tone="text-cyan-300" />
              <Field label="Net out" value={formatBytes(detail.netOutBytes)} tone="text-cyan-300" />
              <Field
                label="Disk r/w"
                value={`${formatBytes(detail.diskReadBytes)} / ${formatBytes(detail.diskWriteBytes)}`}
              />
            </div>
          )}
          {detail && !detail.diskKnown && (
            <p className="font-mono text-[8.5px] text-slate-600 mt-2">
              Disk usage needs the guest agent on VMs — only the allocation is known.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function HomelabPanel() {
  // Light poll drives the gauges; the heavy fan-out runs half as often.
  const { data, error, status, updatedAt } = useWidgetData<HomelabData>("/api/widgets/homelab", 15000);
  const { data: detail } = useWidgetData<HomelabDetailData>("/api/widgets/homelab-detail", 30000);

  if (error && !data) return <PanelFrame><PanelFailure source="Proxmox telemetry" /></PanelFrame>;
  if (!data)
    return <PanelFrame><PanelSkeleton label="Loading Proxmox telemetry" /></PanelFrame>;
  if (status === "error")
    return <PanelFrame><PanelFailure source="Proxmox telemetry" stale={Boolean(data)} /></PanelFrame>;

  const online = data.guests.filter((g) => g.status === "ok").length;
  const detailByVmid = new Map((detail?.guests ?? []).map((g) => [g.vmid, g]));
  const nodeDetailByName = new Map((detail?.nodes ?? []).map((n) => [n.name, n]));

  return (
    <div className="flex flex-col gap-3">
      {data.nodes.map((node) => (
        <NodeBlock
          key={node.name}
          node={node}
          detail={nodeDetailByName.get(node.name)}
          stamp={updatedAt}
        />
      ))}

      <div className="hud-panel depth-mid">
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/20">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.25em] hud-glow-text">
            Containers
          </span>
          <span className="flex items-center gap-3 font-mono text-[10.5px] text-slate-400">
            <span className="text-slate-600 hidden sm:inline">click a row for detail</span>
            <span>
              <span className="hud-glow-text">{online}</span> / {data.guests.length} online
            </span>
          </span>
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {data.guests.map((g) => (
            <GuestRow key={g.vmid} guest={g} detail={detailByVmid.get(g.vmid)} />
          ))}
        </div>
      </div>
    </div>
  );
}
