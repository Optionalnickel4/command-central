"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { WidgetResponse } from "@/components/widgets/types";

export type Freshness = "empty" | "live" | "stale";
export interface CoordinatedSnapshot<T> {
  data: T | null;
  status?: WidgetResponse<T>["status"];
  updatedAt?: string;
  mock: boolean;
  error: string | null;
  freshness: Freshness;
  loading: boolean;
  reasonCode?: string;
}

interface Subscriber { intervalMs: number; listener: () => void }
interface Entry<T = unknown> {
  key: string;
  subscribers: Set<Subscriber>;
  snapshot: CoordinatedSnapshot<T>;
  lastGood: WidgetResponse<T> | null;
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
  inFlight: Promise<void> | null;
  failures: number;
}

const EMPTY: CoordinatedSnapshot<never> = {
  data: null, mock: false, error: null, freshness: "empty", loading: false
};
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
interface CoordinatorClock {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  random: () => number;
}
const defaultClock: CoordinatorClock = { setTimeout, clearTimeout, random: Math.random };

/** Small repository-native request coordinator shared by every hook instance. */
export class DataCoordinator {
  private entries = new Map<string, Entry>();
  private visible = true;
  private online = true;

  constructor(
    private readonly fetcher: FetchLike,
    private readonly clock: CoordinatorClock = defaultClock,
    private readonly maxBackoffMs = 5 * 60_000
  ) {}

  snapshot<T>(key: string): CoordinatedSnapshot<T> {
    return (this.entries.get(key)?.snapshot as CoordinatedSnapshot<T>) ?? (EMPTY as CoordinatedSnapshot<T>);
  }

  subscribe(key: string, intervalMs: number, listener: () => void): () => void {
    const entry = this.entry(key);
    const subscriber = { intervalMs, listener };
    entry.subscribers.add(subscriber);
    if (entry.subscribers.size === 1) void this.load(entry);
    return () => {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size === 0) {
        if (entry.timer) this.clock.clearTimeout(entry.timer);
        entry.timer = null;
        entry.controller?.abort();
        entry.controller = null;
        this.entries.delete(key);
      } else {
        this.schedule(entry, this.interval(entry));
      }
    };
  }

  setVisible(visible: boolean): void {
    const regained = visible && !this.visible;
    this.visible = visible;
    if (!visible) {
      for (const entry of this.entries.values()) {
        if (entry.timer) this.clock.clearTimeout(entry.timer);
        entry.timer = null;
      }
    } else if (regained) this.refreshAll();
  }

  setOnline(online: boolean): void {
    const regained = online && !this.online;
    this.online = online;
    if (regained) this.refreshAll();
  }

  refreshAll(): void {
    if (!this.visible || !this.online) return;
    for (const entry of this.entries.values()) void this.load(entry);
  }

  private entry(key: string): Entry {
    const current = this.entries.get(key);
    if (current) return current;
    const created: Entry = {
      key, subscribers: new Set(), snapshot: EMPTY, lastGood: null,
      timer: null, controller: null, inFlight: null, failures: 0
    };
    this.entries.set(key, created);
    return created;
  }

  private interval(entry: Entry): number {
    return Math.min(...[...entry.subscribers].map((subscriber) => subscriber.intervalMs));
  }

  private emit(entry: Entry, snapshot: CoordinatedSnapshot<unknown>): void {
    entry.snapshot = snapshot;
    for (const { listener } of entry.subscribers) listener();
  }

  private schedule(entry: Entry, delay: number): void {
    if (entry.timer) this.clock.clearTimeout(entry.timer);
    entry.timer = null;
    if (!this.visible || !this.online || entry.subscribers.size === 0) return;
    entry.timer = this.clock.setTimeout(() => {
      entry.timer = null;
      void this.load(entry);
    }, delay);
  }

  private load(entry: Entry): Promise<void> {
    if (entry.inFlight) return entry.inFlight;
    if (!this.visible || !this.online || entry.subscribers.size === 0) return Promise.resolve();
    entry.controller = new AbortController();
    this.emit(entry, { ...entry.snapshot, loading: true });
    entry.inFlight = (async () => {
      try {
        const response = await this.fetcher(entry.key, { signal: entry.controller!.signal });
        const payload = (await response.json().catch(() => null)) as WidgetResponse<unknown> | null;
        if (!payload || !["ok", "degraded", "error"].includes(payload.status)) throw new Error("invalid response");
        entry.failures = 0;
        if (payload.status !== "error") entry.lastGood = payload;
        const shown = payload.status === "error" && entry.lastGood ? entry.lastGood : payload;
        this.emit(entry, {
          data: shown.data,
          status: payload.status,
          updatedAt: shown.updatedAt,
          mock: shown.mock ?? false,
          error: null,
          freshness: payload.status === "error" && entry.lastGood ? "stale" : "live",
          loading: false,
          reasonCode: payload.reasonCode
        });
        this.schedule(entry, this.interval(entry));
      } catch (error) {
        if (entry.controller?.signal.aborted) return;
        entry.failures += 1;
        const message = error instanceof Error ? error.message : "Failed to load";
        this.emit(entry, {
          data: entry.lastGood?.data ?? null,
          status: entry.lastGood?.status,
          updatedAt: entry.lastGood?.updatedAt,
          mock: entry.lastGood?.mock ?? false,
          error: message,
          freshness: entry.lastGood ? "stale" : "empty",
          loading: false,
          reasonCode: entry.lastGood?.reasonCode
        });
        const base = this.interval(entry) * 2 ** Math.max(0, entry.failures - 1);
        const bounded = Math.min(base, this.maxBackoffMs);
        const jitter = 0.8 + this.clock.random() * 0.4;
        this.schedule(entry, Math.round(bounded * jitter));
      } finally {
        entry.controller = null;
        entry.inFlight = null;
      }
    })();
    return entry.inFlight;
  }
}

let browserCoordinator: DataCoordinator | null = null;
function coordinator(): DataCoordinator {
  if (browserCoordinator) return browserCoordinator;
  browserCoordinator = new DataCoordinator(fetch);
  if (typeof document !== "undefined") {
    browserCoordinator.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", () =>
      browserCoordinator?.setVisible(document.visibilityState === "visible")
    );
    window.addEventListener("online", () => browserCoordinator?.setOnline(true));
    window.addEventListener("offline", () => browserCoordinator?.setOnline(false));
  }
  return browserCoordinator;
}

export function useWidgetData<T>(url: string, intervalMs = 30_000): CoordinatedSnapshot<T> {
  const store = coordinator();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(url, intervalMs, listener),
    [store, url, intervalMs]
  );
  const getSnapshot = useCallback(() => store.snapshot<T>(url), [store, url]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
