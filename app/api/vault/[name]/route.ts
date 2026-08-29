import { NextResponse } from "next/server";
import { readProject } from "@/lib/vault";
import { INTERNAL_ERROR, NOT_PRESENT } from "@/lib/response-status";

export const dynamic = "force-dynamic";

export interface VaultNote {
  name: string;
  content: string;
}

/**
 * One project note, raw markdown for the client to render.
 *
 * `name` arrives from the URL and is passed STRAIGHT to lib/vault.ts. This
 * route builds no path of its own — the guard (a `[A-Za-z0-9_-]+` basename
 * check plus a resolved-path containment check) lives in the module and is the
 * single place it is enforced. Next has already percent-decoded the segment by
 * the time it reaches `params`, so what the guard sees is the decoded value:
 * `..%2f..%2fetc%2fpasswd` is tested as `../../etc/passwd` and rejected.
 *
 * Guard-reject and file-missing both answer 404, deliberately indistinguishable
 * — a caller probing for what exists outside the vault learns nothing from the
 * status code, and neither case is a server failure.
 */
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  try {
    const content = await readProject(params.name);
    if (content === null) {
      return NextResponse.json({ error: "no such project note" }, { status: NOT_PRESENT });
    }
    return NextResponse.json<VaultNote>({ name: params.name, content });
  } catch (err) {
    console.error("vault note read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "vault read failed" }, { status: INTERNAL_ERROR });
  }
}
