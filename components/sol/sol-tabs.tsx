"use client";

import { useState } from "react";
import {
  ActivityPanel,
  CapabilityPanel,
  OverviewPanel,
  SessionsPanel,
  TasksPanel
} from "./panels";
import {
  ContextCachePanel,
  HistoricalRunsPanel,
  HistoricalUsagePanel,
  LatencyPanel,
  LiveUsagePanel
} from "./usage-panels";

/**
 * Two views rather than one very long page. With the usage charts added, a
 * single column ran past 3500px; tabs keep each view readable on one screen.
 */
type Tab = "status" | "usage";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "status", label: "Status", hint: "runtime · tasks · sessions · activity" },
  { id: "usage", label: "Usage", hint: "live turns · historical tokens" }
];

export default function SolTabs() {
  const [tab, setTab] = useState<Tab>("status");

  return (
    <>
      <div className="flex items-center gap-2 pt-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`sol-tab ${tab === t.id ? "is-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600 ml-1 truncate">
          {TABS.find((t) => t.id === tab)?.hint}
        </span>
      </div>

      {tab === "status" ? (
        <div className="sol-grid flex-1 pb-4">
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 0 }}><OverviewPanel /></div>
          <div className="power-on" style={{ ["--i" as string]: 1 }}><TasksPanel /></div>
          <div className="power-on" style={{ ["--i" as string]: 2 }}><CapabilityPanel /></div>
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 3 }}><SessionsPanel /></div>
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 4 }}><ActivityPanel /></div>
        </div>
      ) : (
        <div className="sol-grid flex-1 pb-4">
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 0 }}><LiveUsagePanel /></div>
          <div className="power-on" style={{ ["--i" as string]: 1 }}><LatencyPanel /></div>
          <div className="power-on" style={{ ["--i" as string]: 2 }}><ContextCachePanel /></div>
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 3 }}><HistoricalUsagePanel /></div>
          <div className="power-on sol-span-2" style={{ ["--i" as string]: 4 }}><HistoricalRunsPanel /></div>
        </div>
      )}
    </>
  );
}
