"use client";

import { useEffect, useState } from "react";
import type { WidgetResponse } from "@/components/widgets/types";

/**
 * Shared polling hook every widget uses to read its own /api/widgets/*
 * route. One place to change if polling ever moves to SSE/WebSockets.
 */
export function useWidgetData<T>(url: string, intervalMs = 30000) {
  const [state, setState] = useState<WidgetResponse<T> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} responded ${res.status}`);
        const json: WidgetResponse<T> = await res.json();
        if (!cancelled) {
          setState(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    }

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data: state?.data ?? null, status: state?.status, updatedAt: state?.updatedAt, error };
}
