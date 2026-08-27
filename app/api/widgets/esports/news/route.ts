import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, unwrap, vlr } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";

export const dynamic = "force-dynamic";

export interface EsportsHeadline {
  title: string;
  url: string;
  description: string | null;
  /** Raw meta string, e.g. "•August 19, 2026•by 4kanders0ny". */
  meta: string | null;
  /** Author parsed out of meta, when present. */
  author: string | null;
}

export interface EsportsNewsData {
  headlines: EsportsHeadline[];
  /** vlr-api's own health, for the section's feed-status dot. */
  feedOk: boolean;
}

const EMPTY: EsportsNewsData = { headlines: [], feedOk: false };

interface RawNews {
  title?: string;
  url?: string;
  description?: string | null;
  meta?: string | null;
}

/** meta looks like "•August 19, 2026•by 4kanders0ny" — bullet separated. */
function parseAuthor(meta?: string | null): string | null {
  if (!meta) return null;
  const match = /by\s+(.+)$/i.exec(meta.replace(/•/g, " ").trim());
  return match ? match[1].trim() : null;
}

// vlr-api is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "feed offline" state. The ENABLE_ESPORTS 404 above is separate — that is
// "not part of this instance", not a failure.
//
// feedOk:false with headlines present is NOT this case: that is the status
// probe alone having failed, which is partial success and stays 200.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<EsportsNewsData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  // Not part of this instance when ENABLE_ESPORTS is off: 404 rather than a
  // degraded widget payload, so nothing here ever reaches vlr-api.
  if (!esportsEnabled()) return NextResponse.json({ error: "esports disabled" }, { status: 404 });

  if (!hasVlrConfig()) return unavailable();
  try {
    // Status is best-effort: a healthy news feed shouldn't be hidden because
    // the status probe failed.
    const [newsRaw, statusRaw] = await Promise.all([
      vlr<unknown>("/news"),
      vlr<unknown>("/status").catch(() => null)
    ]);

    const headlines = unwrap<RawNews>(newsRaw)
      .map((n) => ({
        title: n.title ?? "",
        url: n.url ?? "",
        description: n.description ?? null,
        meta: n.meta ?? null,
        author: parseAuthor(n.meta)
      }))
      .filter((n) => n.title)
      .slice(0, 20);

    const checks = (statusRaw as { checks?: Record<string, boolean> } | null)?.checks;
    const feedOk = checks ? Object.values(checks).every(Boolean) : Boolean(statusRaw);

    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { headlines, feedOk }
    } satisfies WidgetResponse<EsportsNewsData>);
  } catch (err) {
    console.error("esports news fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
