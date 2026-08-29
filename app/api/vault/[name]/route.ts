import { NextResponse } from "next/server";
import { appendBullet, readProject } from "@/lib/vault";
import { INTERNAL_ERROR, NOT_PRESENT, OK } from "@/lib/response-status";

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

export interface VaultAppendBody {
  text: string;
}

export interface VaultAppendResult {
  name: string;
  /** The exact line that was written. */
  line: string;
}

/**
 * Append one dated bullet to a project note. THE ONLY WRITE ENDPOINT.
 *
 * It appends exactly the text it is given (sanitized to one bounded line) and
 * generates no content of its own. That is the whole point: the confirmation
 * step in the UI owns WHAT gets written, so the thing the user approved and the
 * thing that lands on disk cannot diverge. Nothing auto-fires this — it is
 * reachable only from an explicit click on a proposal the user has read.
 *
 * `name` goes straight to lib/vault.ts, same as the GET, so the path guard is
 * enforced in one place for reads and writes alike.
 *
 * Statuses: 400 for a body with no usable text, 404 for a rejected name or a
 * note that does not exist, 5xx when the vault itself refused the write.
 */
export async function POST(req: Request, { params }: { params: { name: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const text = (body as VaultAppendBody | null)?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const result = await appendBullet(params.name, text);

  if (!result.ok) {
    // A bad name and a missing note are both 404 — same reasoning as the GET,
    // a caller learns nothing about what exists outside the vault.
    if (result.error === "invalid project name" || result.error === "no such project note") {
      return NextResponse.json({ error: "no such project note" }, { status: NOT_PRESENT });
    }
    if (result.error === "empty bullet text") {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // The vault refused: unwritable mount, missing directory, a failed write.
    return NextResponse.json({ error: result.error }, { status: INTERNAL_ERROR });
  }

  return NextResponse.json<VaultAppendResult>(
    { name: params.name, line: result.line! },
    { status: OK }
  );
}
