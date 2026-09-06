"use client";

import { useEffect, useRef, useState } from "react";
import type { WidgetResponse } from "@/components/widgets/types";

let widgetRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function pulseWidgetRefresh() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.widgetRefresh = "1";
  if (widgetRefreshTimer) clearTimeout(widgetRefreshTimer);
  widgetRefreshTimer = setTimeout(() => {
    document.documentElement.removeAttribute("data-widget-refresh");
    widgetRefreshTimer = null;
  }, 700);
}

/**
 * Shared polling hook every widget uses to read its own /api/widgets/*
 * route. One place to change if polling ever moves to SSE/WebSockets.
 */
export function useWidgetData<T>(url: string, intervalMs = 30000) {
  const [state, setState] = useState<WidgetResponse<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastUpdatedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const hadSnapshot = lastUpdatedRef.current !== null;
      if (hadSnapshot && !cancelled) setRefreshing(true);

      try {
        const res = await fetch(url);
        // Routes now answer 5xx when the WHOLE response is a failure, but they
        // still send a WidgetResponse body saying so. Read it: a panel showing
        // its own "unavailable" state is better than the generic transport
        // error, and this keeps the rendering identical to before the status
        // codes became honest. Only a response with no usable body is a
        // transport failure.
        const json = (await res.json().catch(() => null)) as WidgetResponse<T> | null;
        if (!json || typeof json.status !== "string") {
          throw new Error(`${url} responded ${res.status}`);
        }
        if (!cancelled) {
          const changed = Boolean(json.updatedAt && json.updatedAt !== lastUpdatedRef.current);
          lastUpdatedRef.current = json.updatedAt ?? lastUpdatedRef.current;
          setState(json);
          setError(null);
          if (changed && hadSnapshot) pulseWidgetRefresh();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return {
    data: state?.data ?? null,
    status: state?.status,
    updatedAt: state?.updatedAt,
    mock: state?.mock ?? false,
    error,
    refreshing,
    hasSnapshot: state !== null
  };
}
