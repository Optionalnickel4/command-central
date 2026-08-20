"use client";

import { useEffect } from "react";
import { useHomelabFeed } from "@/components/homelab-feed";

/**
 * Bridges live telemetry into the style system: publishes --sys-load,
 * --sys-heat and --sys-alert (0..1) on <html>. Glows, pulse rates and panel
 * bloom read those in CSS, so the whole cockpit breathes in time with the
 * real node instead of on a fixed timer.
 *
 * Also fires a short `data-surge` flag on every completed poll, which the
 * conduits use to send a bright packet down the wire — the visible sign that
 * fresh data just reached the core.
 *
 * Renders nothing — it is purely the telemetry→CSS bridge.
 */
export default function SystemPulse() {
  const { data, updatedAt } = useHomelabFeed();

  useEffect(() => {
    const root = document.documentElement;
    if (!data || data.nodes.length === 0) return;

    const nodes = data.nodes;
    const load = nodes.reduce((a, n) => a + n.cpuPct, 0) / nodes.length / 100;
    const heat =
      nodes.reduce((a, n) => a + (n.ramTotalGb ? n.ramUsedGb / n.ramTotalGb : 0), 0) / nodes.length;
    const down = data.guests.filter((g) => g.status !== "ok").length;
    const alert = data.guests.length ? down / data.guests.length : 0;

    const clamp = (v: number) => Math.max(0, Math.min(1, v)).toFixed(3);
    root.style.setProperty("--sys-load", clamp(load));
    root.style.setProperty("--sys-heat", clamp(heat));
    root.style.setProperty("--sys-alert", clamp(alert));
  }, [data]);

  // Surge on each new poll result.
  useEffect(() => {
    if (!updatedAt) return;
    const root = document.documentElement;
    root.dataset.surge = "1";
    const id = setTimeout(() => delete root.dataset.surge, 1400);
    return () => {
      clearTimeout(id);
      delete root.dataset.surge;
    };
  }, [updatedAt]);

  useEffect(
    () => () => {
      const root = document.documentElement;
      root.style.removeProperty("--sys-load");
      root.style.removeProperty("--sys-heat");
      root.style.removeProperty("--sys-alert");
    },
    []
  );

  return null;
}
