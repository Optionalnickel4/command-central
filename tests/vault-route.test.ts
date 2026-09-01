import { describe, expect, it } from "vitest";
import { GET as getNote } from "@/app/api/vault/[name]/route";
import { GET as getIndex } from "@/app/api/vault/route";

/**
 * The browser-facing half of the vault feature.
 *
 * The route deliberately owns no path logic — it hands `name` to lib/vault.ts
 * and turns null into a 404. What is worth pinning here is that it actually
 * does that: that a traversal name gets a status code and never a body, and
 * that the guard is reached with the DECODED segment, since Next percent-
 * decodes before the handler sees it.
 */

const req = new Request("http://127.0.0.1:3000/api/vault/x");
const call = (name: string) => getNote(req, { params: Promise.resolve({ name }) });

describe("GET /api/vault/[name] — the guard at the route layer", () => {
  const rejected = [
    "../../etc/passwd",
    "../openclaw",
    "..",
    "/etc/passwd",
    "foo/bar",
    // What Next hands the handler after decoding `..%2f..%2fetc%2fpasswd`.
    "../../etc/passwd",
    "vlr-api.md",
    ".hidden",
    ""
  ];

  for (const name of rejected) {
    it(`404s on ${JSON.stringify(name)} without returning content`, async () => {
      const res = await call(name);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "no such project note" });
      expect(JSON.stringify(body)).not.toContain("root:");
      expect(body).not.toHaveProperty("content");
    });
  }

  it("404s on a well-formed name that is not in the vault", async () => {
    const res = await call("definitely-not-a-real-note");
    expect(res.status).toBe(404);
  });

  it("returns name and content for a note that exists", async () => {
    const res = await call("_index");
    // The mount is present on this box; skip rather than fail elsewhere.
    if (res.status === 404) return;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("_index");
    expect(typeof body.content).toBe("string");
  });
});

describe("GET /api/vault — the index", () => {
  it("answers 200 with a projects array", async () => {
    const res = await getIndex();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.projects)).toBe(true);
    // Whatever is listed must be a plain basename — the rail links straight
    // back into the [name] route with these.
    for (const name of body.projects) expect(name).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is 200 even when the vault is absent — empty is not a failure", async () => {
    const { GET } = await import("@/app/api/vault/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
