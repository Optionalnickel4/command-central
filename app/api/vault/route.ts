import { NextResponse } from "next/server";
import { listProjects } from "@/lib/vault";
import { INTERNAL_ERROR } from "@/lib/response-status";

// The browser has no /mnt/vault — only the container does. This route is the
// server-side half that reads it. Without force-dynamic Next would prerender
// the listing at build time and the page would show whatever files existed
// when the image was built.
export const dynamic = "force-dynamic";

export interface VaultIndex {
  projects: string[];
}

/**
 * The project notes available in the vault.
 *
 * An absent or unreadable mount is an EMPTY LIST at 200, not an error: that is
 * lib/vault.ts's contract (a vault problem degrades, it does not throw), and
 * the page renders an honest "no vault" state from it. 200-and-empty is the
 * repo's "reachable but nothing there" case; a 5xx here would claim a failure
 * that did not happen. Only a genuine throw — which the module is written not
 * to produce — reaches the catch.
 */
export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json<VaultIndex>({ projects });
  } catch (err) {
    console.error("vault index failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "vault read failed" }, { status: INTERNAL_ERROR });
  }
}
