import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}
describe("V2-Core runtime boundaries", () => {
  it("has no sports routes, imports, upstream configuration or lookup dispatch", () => {
    const paths = ["app", "components", "lib"].flatMap(sources);
    expect(paths.filter(p => /esports|lookup-intent|\/vlr\./i.test(p))).toEqual([]);
    for (const path of paths) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/(?:from|import)\s*["'][^"']*(?:esports|lookup-intent|\/vlr)["']/);
      expect(text, path).not.toMatch(/process\.env\.(?:VLR_API_URL|ENABLE_ESPORTS)|performLookup|fetchEsports/);
    }
  });
  it("keeps every live API route dynamic", () => {
    for (const path of sources("app/api").filter(p => p.endsWith("route.ts"))) {
      if (!/export async function GET/.test(readFileSync(path, "utf8"))) continue;
      expect(readFileSync(path, "utf8"), path).toContain('export const dynamic = "force-dynamic"');
    }
  });
});
