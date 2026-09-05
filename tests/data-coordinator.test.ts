import { afterEach, describe, expect, it, vi } from "vitest";
import { DataCoordinator } from "@/lib/fetcher";

const payload = (value: number) => new Response(JSON.stringify({ status: "ok", updatedAt: new Date().toISOString(), data: { value } }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe("DataCoordinator", () => {
  afterEach(() => vi.useRealTimers());

  it("de-duplicates subscribers and prevents overlapping requests", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    const offA = store.subscribe("/same", 1000, vi.fn());
    const offB = store.subscribe("/same", 1000, vi.fn());
    store.refreshAll();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(payload(1)); await flush(); offA(); offB();
  });

  it("uses the shortest requested cadence", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => payload(1));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    store.subscribe("/same", 2000, vi.fn()); store.subscribe("/same", 1000, vi.fn());
    await flush(); await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("pauses hidden polling and refreshes on visibility regain", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => payload(1));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    store.subscribe("/same", 1000, vi.fn()); await flush(); store.setVisible(false);
    await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(1);
    store.setVisible(true); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cancels an in-flight request after the final unsubscribe", () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input, init) => { signal = init?.signal; return new Promise<Response>(() => {}); });
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    const off = store.subscribe("/same", 1000, vi.fn()); off();
    expect(signal?.aborted).toBe(true);
  });

  it("bounds backoff and resets after recovery", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(payload(3));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 }, 1500);
    store.subscribe("/same", 1000, vi.fn()); await flush();
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1499); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("keeps last-known-good data stale through an outage", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(payload(7)).mockRejectedValueOnce(new Error("offline"));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    store.subscribe("/same", 1000, vi.fn()); await flush(); await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshot<{ value: number }>("/same")).toMatchObject({ data: { value: 7 }, freshness: "stale", error: "offline" });
  });

  it("revalidates when connectivity returns", () => {
    const fetcher = vi.fn(async () => payload(1));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    store.setOnline(false); store.subscribe("/same", 1000, vi.fn()); expect(fetcher).not.toHaveBeenCalled();
    store.setOnline(true); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
