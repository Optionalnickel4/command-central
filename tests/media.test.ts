import { describe, expect, it } from "vitest";
import {
  bytes, describe as describeError, normalizeArr, normalizeJellyfin, normalizeProwlarr,
  normalizeQbit, normalizeSeerr, ticksToClock
} from "@/lib/media";

/**
 * The pure half of the media clients: the transforms that turn each service's
 * raw JSON into the panel payload. Fixtures are the shapes the six services
 * actually returned when they were probed from 220 — trimmed to the fields the
 * transform reads, not invented.
 *
 * The transports (fetch, the qBittorrent cookie login) are deliberately not
 * exercised here: they are runtime, not shaping, and testing them would mean
 * reaching media.lan.
 */

describe("normalizeJellyfin", () => {
  const sessions = [
    {
      UserName: "matt",
      NowPlayingItem: {
        Name: "The One With The Test", SeriesName: "Friends",
        ParentIndexNumber: 3, IndexNumber: 7, Type: "Episode", RunTimeTicks: 12_000_000_000
      },
      PlayState: { PositionTicks: 6_000_000_000, PlayMethod: "DirectPlay", IsPaused: false },
      DeviceName: "Living Room", Client: "Jellyfin Web"
    },
    {
      UserName: "guest",
      NowPlayingItem: { Name: "Arrival", Type: "Movie", ProductionYear: 2016, RunTimeTicks: 0 },
      PlayState: { PositionTicks: 100, PlayMethod: "Transcode", IsPaused: true },
      TranscodingInfo: { TranscodeReasons: ["VideoCodecNotSupported", "ContainerBitrateExceedsLimit"] },
      DeviceName: "iPad", Client: "Jellyfin iOS"
    },
    // An idle session — connected but playing nothing.
    { UserName: "idle", DeviceName: "TV", Client: "Jellyfin Android" }
  ];

  it("keeps only sessions that are actually playing something", () => {
    const data = normalizeJellyfin(null, sessions, null, null);
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions.map((s) => s.user)).toEqual(["matt", "guest"]);
  });

  it("titles an episode by its series and puts SxxExx in the subtitle", () => {
    const [episode] = normalizeJellyfin(null, sessions, null, null).sessions;
    expect(episode.title).toBe("Friends");
    expect(episode.subtitle).toBe("S3E7 The One With The Test");
  });

  it("titles a movie by its name and uses the year as the subtitle", () => {
    const movie = normalizeJellyfin(null, sessions, null, null).sessions[1];
    expect(movie.title).toBe("Arrival");
    expect(movie.subtitle).toBe("2016");
  });

  it("flags transcoding from the play method and joins the reasons", () => {
    const [direct, transcoding] = normalizeJellyfin(null, sessions, null, null).sessions;
    expect(direct.isTranscoding).toBe(false);
    expect(transcoding.isTranscoding).toBe(true);
    expect(transcoding.transcodeReason)
      .toBe("VideoCodecNotSupported, ContainerBitrateExceedsLimit");
  });

  it("derives progress from position/runtime, and 0 when the runtime is unknown", () => {
    const [episode, movie] = normalizeJellyfin(null, sessions, null, null).sessions;
    expect(episode.progressPct).toBe(50);
    // RunTimeTicks 0 must not become Infinity or NaN.
    expect(movie.progressPct).toBe(0);
  });

  it("maps library counts when present and nulls the block when absent", () => {
    expect(normalizeJellyfin(null, [], { MovieCount: 412, SeriesCount: 60, EpisodeCount: 9001 }, null).counts)
      .toEqual({ movies: 412, series: 60, episodes: 9001 });
    expect(normalizeJellyfin(null, [], null, null).counts).toBeNull();
  });

  it("caps recently-added at eight items", () => {
    const latest = Array.from({ length: 20 }, (_, i) => ({ Id: `${i}`, Name: `Item ${i}` }));
    expect(normalizeJellyfin(null, [], null, latest).latest).toHaveLength(8);
  });

  it("tolerates every input being missing rather than throwing", () => {
    const data = normalizeJellyfin(null, null, null, null);
    expect(data).toMatchObject({ serverName: null, version: null, sessions: [], counts: null, latest: [] });
  });
});

describe("normalizeArr — Sonarr/Radarr", () => {
  const queueEnvelope = {
    totalRecords: 37,
    records: [
      { title: "Show.S01E02", status: "downloading", size: 1000, sizeleft: 250, quality: { quality: { name: "WEBDL-1080p" } } },
      { title: "Show.S01E03", status: "queued", size: 0, sizeleft: 0 }
    ]
  };

  it("reads the {records,totalRecords} envelope the live API returns", () => {
    const data = normalizeArr("sonarr", queueEnvelope, null);
    expect(data.queue).toHaveLength(2);
    expect(data.queueTotal).toBe(37);
  });

  it("also accepts a bare array queue, falling back to its length as the total", () => {
    const data = normalizeArr("sonarr", queueEnvelope.records, null);
    expect(data.queue).toHaveLength(2);
    expect(data.queueTotal).toBe(2);
  });

  it("computes queue progress from size and sizeleft, clamped to 0-100", () => {
    const [downloading, queued] = normalizeArr("sonarr", queueEnvelope, null).queue;
    expect(downloading.progressPct).toBe(75);
    expect(downloading.quality).toBe("WEBDL-1080p");
    // size 0 must not divide by zero.
    expect(queued.progressPct).toBe(0);
    expect(queued.quality).toBeNull();
  });

  it("shapes a Sonarr calendar row as series + SxxExx + air date", () => {
    const cal = [{ series: { title: "Severance" }, seasonNumber: 2, episodeNumber: 1, title: "Hello, Ms. Cobel", airDateUtc: "2026-09-01T01:00:00Z" }];
    expect(normalizeArr("sonarr", queueEnvelope, cal).upcoming[0]).toEqual({
      title: "Severance", subtitle: "S2E1 Hello, Ms. Cobel", airsAt: "2026-09-01T01:00:00Z"
    });
  });

  it("shapes a Radarr calendar row as title + year + first available release date", () => {
    const cal = [{ title: "Dune: Part Three", year: 2026, physicalRelease: "2026-10-01", inCinemas: "2026-07-15" }];
    expect(normalizeArr("radarr", queueEnvelope, cal).upcoming[0]).toEqual({
      title: "Dune: Part Three", subtitle: "2026", airsAt: "2026-10-01"
    });
  });

  it("caps the queue at ten and the calendar at eight", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `t${i}`, size: 10, sizeleft: 0 }));
    const data = normalizeArr("sonarr", many, many);
    expect(data.queue).toHaveLength(10);
    expect(data.upcoming).toHaveLength(8);
  });

  it("tolerates a missing queue and calendar", () => {
    expect(normalizeArr("sonarr", null, null)).toEqual({ queue: [], queueTotal: 0, upcoming: [] });
  });
});

describe("normalizeProwlarr", () => {
  // Prowlarr is api/V1 and spells the field `enable`, not `enabled`.
  const indexers = [
    { name: "TorrentLeech", protocol: "torrent", enable: true, priority: 25 },
    { name: "NZBgeek", protocol: "usenet", enable: false, priority: 30 },
    { name: "Legacy", protocol: "torrent", enable: true }
  ];

  it("counts total and enabled from the v1 `enable` field", () => {
    const data = normalizeProwlarr(indexers);
    expect(data.total).toBe(3);
    expect(data.enabled).toBe(2);
  });

  it("maps each indexer, defaulting a missing priority to null", () => {
    const data = normalizeProwlarr(indexers);
    expect(data.indexers[0]).toEqual({ name: "TorrentLeech", protocol: "torrent", enabled: true, priority: 25 });
    expect(data.indexers[2].priority).toBeNull();
  });

  it("caps the listed indexers at twelve while still counting them all", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `i${i}`, enable: true }));
    const data = normalizeProwlarr(many);
    expect(data.total).toBe(20);
    expect(data.indexers).toHaveLength(12);
  });

  it("returns an empty, well-formed slice for a non-array payload", () => {
    expect(normalizeProwlarr(null)).toEqual({ total: 0, enabled: 0, indexers: [] });
    expect(normalizeProwlarr({ error: "nope" })).toEqual({ total: 0, enabled: 0, indexers: [] });
  });
});

describe("normalizeQbit", () => {
  const torrents = [
    { name: "slow", state: "downloading", progress: 0.1, dlspeed: 100, upspeed: 0, eta: 8640000, size: 500 },
    { name: "fast", state: "downloading", progress: 0.5, dlspeed: 9000, upspeed: 10, eta: 600, size: 1000 },
    { name: "done", state: "stalledUP", progress: 1, dlspeed: 0, upspeed: 500, eta: 0, size: 200 }
  ];

  it("orders torrents busiest-first", () => {
    expect(normalizeQbit(torrents, null).torrents.map((t) => t.name)).toEqual(["fast", "slow", "done"]);
  });

  it("converts the 0-1 progress fraction to a percentage", () => {
    const byName = Object.fromEntries(normalizeQbit(torrents, null).torrents.map((t) => [t.name, t]));
    expect(byName.fast.progressPct).toBe(50);
    expect(byName.done.progressPct).toBe(100);
  });

  it("treats qBittorrent's 8640000 eta sentinel as unknown", () => {
    const byName = Object.fromEntries(normalizeQbit(torrents, null).torrents.map((t) => [t.name, t]));
    expect(byName.slow.etaSeconds).toBeNull();
    expect(byName.done.etaSeconds).toBeNull();
    expect(byName.fast.etaSeconds).toBe(600);
  });

  it("counts active transfers by state and totals every torrent", () => {
    const data = normalizeQbit(torrents, null);
    expect(data.active).toBe(2);
    expect(data.total).toBe(3);
  });

  it("maps global speeds when transfer info came back, and nulls them when it did not", () => {
    expect(normalizeQbit(torrents, { dl_info_speed: 9100, up_info_speed: 510 }).global)
      .toEqual({ dlSpeed: 9100, upSpeed: 510 });
    expect(normalizeQbit(torrents, null).global).toBeNull();
  });

  it("caps the listed torrents at ten while still counting them all", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `t${i}`, state: "pausedDL", dlspeed: i }));
    const data = normalizeQbit(many, null);
    expect(data.torrents).toHaveLength(10);
    expect(data.total).toBe(25);
  });
});

describe("normalizeSeerr", () => {
  // A request row carries tmdbId + mediaType but no human title — the titles
  // array is what the TMDB-proxy lookups resolved, index-aligned with the rows.
  const rows = [
    { id: 41, status: 1, type: "movie", media: { tmdbId: 693134, mediaType: "movie" }, requestedBy: { displayName: "Matt" }, createdAt: "2026-08-01T00:00:00Z" },
    { id: 42, status: 5, media: { tmdbId: 95396, mediaType: "tv" }, requestedBy: { username: "guest" }, createdAt: "2026-08-02T00:00:00Z" },
    { id: 43, status: 1, media: { tmdbId: 111, mediaType: "movie" } },
    { id: 44, status: 9, media: { tmdbId: 222, mediaType: "movie", title: "From The Row" } }
  ];

  it("uses the resolved TMDB title when the lookup succeeded", () => {
    const data = normalizeSeerr({ version: "3.3.0" }, rows, ["Dune: Part Two", "Severance", null, null]);
    expect(data.requests[0].title).toBe("Dune: Part Two");
    expect(data.requests[1].title).toBe("Severance");
  });

  it("falls back to the row's own title before giving up", () => {
    const data = normalizeSeerr(null, rows, [null, null, null, null]);
    expect(data.requests[3].title).toBe("From The Row");
  });

  it("degrades to tmdb:<id> rather than a blank when nothing resolved", () => {
    const data = normalizeSeerr(null, rows, [null, null, null, null]);
    expect(data.requests[2].title).toBe("tmdb:111");
  });

  it("maps the numeric status enum to a word, and keeps unknown codes visible", () => {
    const data = normalizeSeerr(null, rows, [null, null, null, null]);
    expect(data.requests.map((r) => r.status)).toEqual(["pending", "completed", "pending", "9"]);
  });

  it("counts pending requests and reads the requester from either name field", () => {
    const data = normalizeSeerr({ version: "3.3.0" }, rows, [null, null, null, null]);
    expect(data.pending).toBe(2);
    expect(data.version).toBe("3.3.0");
    expect(data.requests[0].requestedBy).toBe("Matt");
    expect(data.requests[1].requestedBy).toBe("guest");
    expect(data.requests[2].requestedBy).toBeNull();
  });

  it("survives the status probe having failed", () => {
    expect(normalizeSeerr(null, [], []).version).toBeNull();
  });
});

describe("describe — the degraded slice's reason string", () => {
  it("names an auth failure without hinting at the credential", () => {
    for (const status of [401, 403]) {
      const msg = describeError(new Error("http 401"), status);
      expect(msg).toBe("auth failed — check the API key");
    }
  });

  it("distinguishes upstream 5xx, other statuses, timeouts and unreachability", () => {
    expect(describeError(new Error("http 502"), 502)).toBe("service error (502)");
    expect(describeError(new Error("http 404"), 404)).toBe("unexpected response (404)");
    expect(describeError(new Error("The operation was aborted"))).toBe("timed out");
    expect(describeError(new Error("connect ECONNREFUSED 10.0.0.180:8096"))).toBe("unreachable");
    expect(describeError(new TypeError("fetch failed"))).toBe("unreachable");
  });

  it("falls back to a generic reason for anything it does not recognise", () => {
    expect(describeError(new Error("something odd"))).toBe("request failed");
    expect(describeError("not even an error")).toBe("request failed");
    expect(describeError(null)).toBe("request failed");
  });

  it("never echoes a host, path or credential from the underlying error", () => {
    const msg = describeError(new Error("http://media.lan:8096/Sessions?api_key=SECRET failed"));
    expect(msg).not.toContain("SECRET");
    expect(msg).not.toContain("media.lan");
  });
});

describe("display formatting", () => {
  it("renders playback ticks as h:mm:ss, dropping the hour when there is none", () => {
    expect(ticksToClock(0)).toBe("0:00");
    expect(ticksToClock(65 * 10_000_000)).toBe("1:05");
    expect(ticksToClock(3725 * 10_000_000)).toBe("1:02:05");
  });

  it("renders byte counts with a unit, and an em dash for nothing", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(9000, true)).toBe("8.8 KB/s");
    expect(bytes(null)).toBe("—");
    expect(bytes(NaN)).toBe("—");
  });
});
