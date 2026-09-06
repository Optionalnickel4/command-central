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
    expect(store.snapshot<{ value: number }>("/same")).toMatchObject({ data: { value: 7 }, freshness: "stale", error: "Unable to refresh source." });
  });

  it("revalidates when connectivity returns", () => {
    const fetcher = vi.fn(async () => payload(1));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 0.5 });
    store.setOnline(false); store.subscribe("/same", 1000, vi.fn()); expect(fetcher).not.toHaveBeenCalled();
    store.setOnline(true); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("coordinator failure and freshness regression cases", () => {
  afterEach(() => vi.useRealTimers());

  it("expires data while hidden without making another request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      status: "ok", data: { value: 7 }, updatedAt: new Date().toISOString(), maxAgeMs: 1500
    })));
    const store = new DataCoordinator(fetcher);
    const off = store.subscribe("/age", 1000, vi.fn());
    await flush(); store.setVisible(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.snapshot("/age").freshness).toBe("stale");
    expect(fetcher).toHaveBeenCalledTimes(1); off();
  });

  it("backs off on a valid error envelope and keeps the last good value", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(payload(9)).mockImplementation(async () =>
      new Response(JSON.stringify({ status: "error", data: null }), { status: 503 }));
    const store = new DataCoordinator(fetcher, { setTimeout, clearTimeout, random: () => 1 }, 1500);
    const off = store.subscribe("/error", 1000, vi.fn());
    await flush(); await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshot("/error")).toMatchObject({ data: { value: 9 }, freshness: "stale" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetcher).toHaveBeenCalledTimes(4); off();
  });

  it("never replaces a new subscription with the result of an aborted old request", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockImplementation(async () => payload(2));
    const store = new DataCoordinator(fetcher);
    const oldOff = store.subscribe("/race", 1000, vi.fn()); oldOff();
    const off = store.subscribe("/race", 1000, vi.fn()); await flush();
    finish(payload(1)); await flush();
    await vi.waitFor(() => expect(store.snapshot("/race").data).toEqual({ value: 2 })); off();
  });

  it("never exposes raw transport errors", async () => {
    const store = new DataCoordinator(async () => { throw new Error("https://private.example/token=secret"); });
    const off = store.subscribe("/safe", 1000, vi.fn()); await flush();
    expect(store.snapshot("/safe").error).toBe("Unable to refresh source."); off();
  });
});

describe('Axiom optional sources',()=>{
 afterEach(()=>vi.useRealTimers());
 it('preserves an explicit unconfigured 404 without converting it to an outage',async()=>{
  const store=new DataCoordinator(async()=>new Response(JSON.stringify({status:'error',updatedAt:new Date().toISOString(),data:{configured:false}}),{status:404}));
  const off=store.subscribe('/optional',1000,vi.fn());await vi.waitFor(()=>expect(store.snapshot('/optional').loading).toBe(false));
  expect(store.snapshot('/optional')).toMatchObject({configured:false,error:null,data:{configured:false}});off();
 });
 it('expires legacy responses without metadata at twice their source cadence',async()=>{
  vi.useFakeTimers();const store=new DataCoordinator(async()=>payload(9));const off=store.subscribe('/legacy',1000,vi.fn());await flush();store.setVisible(false);await vi.advanceTimersByTimeAsync(2000);expect(store.snapshot('/legacy').freshness).toBe('stale');off();
 });
});
