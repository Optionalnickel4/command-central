"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHomelabFeed } from "@/components/homelab-feed";
import { useSolState } from "@/components/sol-state";
import { getAllSections } from "@/components/widgets/registry";
import { formatUptime } from "@/lib/format";

/**
 * The base of the console — a persistent status/command strip across the
 * bottom of the cockpit.
 *
 * Read-only by design: no service-control actions exist yet. The command
 * input routes to Sol through the console's existing send path (see
 * sol-state.tsx), so there is still exactly one place that talks to the
 * chat route.
 */
export default function CommandBar() {
  const { data } = useHomelabFeed();
  const { submit } = useSolState();
  const [command, setCommand] = useState("");
  const [sessionSec, setSessionSec] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sections = getAllSections();

  // How long this cockpit has been open.
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSessionSec(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // "/" focuses the command input, as in a command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nodes = data?.nodes ?? [];
  const guests = data?.guests ?? [];
  const online = guests.filter((g) => g.status === "ok").length;
  const alerts = guests.length - online;
  const nodesOnline = nodes.filter((n) => n.online).length;
  const cpu = nodes.length ? Math.round(nodes.reduce((a, n) => a + n.cpuPct, 0) / nodes.length) : 0;
  const ramUsed = nodes.reduce((a, n) => a + n.ramUsedGb, 0);
  const ramTotal = nodes.reduce((a, n) => a + n.ramTotalGb, 0);

  function jump(section: string) {
    const el = document.getElementById(`section-${section}`);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function runCommand() {
    const text = command.trim().replace(/^\//, "").trim();
    if (!text) return;
    // Jump shortcuts stay local; everything else goes to Sol.
    const target = sections.find((s) => s.section === text.toLowerCase());
    if (target) {
      jump(target.section);
    } else {
      submit(text);
      document.getElementById("sol-core")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setCommand("");
  }

  return (
    <div className="command-bar hud-panel depth-far px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Cluster summary */}
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${nodesOnline ? "bg-emerald-400 live-pulse" : "bg-rose-500"}`}
            style={{ boxShadow: nodesOnline ? "0 0 6px #34d399" : "0 0 6px #f43f5e" }}
          />
          <span className="text-slate-500">Nodes</span>
          <span className="hud-glow-text">{nodesOnline}/{nodes.length || 0}</span>
        </span>
        <span className="text-cyan-500/20">|</span>
        <span>
          <span className="text-slate-500">CPU </span>
          <span className="text-cyan-300 tabular-nums">{cpu}%</span>
        </span>
        <span>
          <span className="text-slate-500">MEM </span>
          <span className="text-amber-300 tabular-nums">
            {ramTotal ? `${ramUsed.toFixed(1)}/${ramTotal.toFixed(1)}G` : "—"}
          </span>
        </span>
        <span>
          <span className="text-slate-500">CT </span>
          <span className="text-cyan-300 tabular-nums">{online}/{guests.length}</span>
        </span>
        <span
          className={
            alerts > 0
              ? "hud-glow-red flex items-center gap-1"
              : "text-slate-600 flex items-center gap-1"
          }
        >
          <span>ALERTS</span>
          <span className="tabular-nums">{alerts}</span>
        </span>
      </div>

      {/* Quick jumps + the Sol telemetry page */}
      <div className="flex items-center gap-1.5">
        {sections.map((s) => (
          <button
            key={s.section}
            onClick={() => jump(s.section)}
            className="cmd-chip"
            type="button"
          >
            {s.title}
          </button>
        ))}
        <Link href="/sol" className="cmd-chip is-accent" aria-label="Open Sol stats page">
          Sol Stats →
        </Link>
      </div>

      {/* Command input — routes to Sol */}
      <div className="flex-1 min-w-[190px] flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCommand()}
            placeholder="/ command or ask Sol"
            aria-label="Command input"
            className="w-full bg-slate-900/60 border border-cyan-500/25 rounded pl-3 pr-12 py-1.5 font-mono text-[11px] text-cyan-100 placeholder:text-cyan-500/30 focus:outline-none focus:border-cyan-400/60"
            style={{ boxShadow: "inset 0 0 10px rgba(34,211,238,0.05)" }}
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-cyan-500/35 border border-cyan-500/20 rounded px-1">
            /
          </kbd>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 hidden sm:inline">
          Session <span className="text-cyan-400 tabular-nums">{formatUptime(sessionSec) === "—" ? "0m" : formatUptime(sessionSec)}</span>
        </span>
      </div>
    </div>
  );
}
