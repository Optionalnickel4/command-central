import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { ccStats, parseJsonLines } from "@/lib/sol";

export const dynamic = "force-dynamic";

export interface SolCapability {
  id: string;
  transports: string[];
  description: string | null;
  /** Leading segment of the id, e.g. "model" from "model.run" — used to group. */
  group: string;
}

export interface SolCapabilityData {
  capabilities: SolCapability[];
  byGroup: Record<string, number>;
  byTransport: Record<string, number>;
}

const EMPTY: SolCapabilityData = { capabilities: [], byGroup: {}, byTransport: {} };

interface RawCapability {
  id?: string;
  transports?: string[];
  description?: string;
}

export async function GET() {
  try {
    // NOTE: `capability list` emits JSONL (one object per line), not a JSON
    // array — JSON.parse on the whole body would throw.
    const raw = await ccStats("capability", 10 * 60000);
    const rows = parseJsonLines<RawCapability>(raw);

    const capabilities: SolCapability[] = rows
      .filter((r) => r.id)
      .map((r) => ({
        id: r.id as string,
        transports: Array.isArray(r.transports) ? r.transports : [],
        description: r.description ?? null,
        group: (r.id as string).split(".")[0] || "other"
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const byGroup: Record<string, number> = {};
    const byTransport: Record<string, number> = {};
    for (const c of capabilities) {
      byGroup[c.group] = (byGroup[c.group] ?? 0) + 1;
      for (const t of c.transports) byTransport[t] = (byTransport[t] ?? 0) + 1;
    }

    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { capabilities, byGroup, byTransport }
    } satisfies WidgetResponse<SolCapabilityData>);
  } catch (err) {
    console.error("sol capability failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      status: "error", updatedAt: new Date().toISOString(), data: EMPTY
    } satisfies WidgetResponse<SolCapabilityData>);
  }
}
