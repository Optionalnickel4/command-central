import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("primary navigation contract", () => {
  it("is present on every top-level page and the overview shell", () => {
    for (const file of ["components/dashboard-shell.tsx", "app/sol/page.tsx", "app/media/page.tsx", "app/vault/page.tsx", "app/esports/player/[id]/page.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain("<PrimaryNav");
    }
  });
  it("keeps a unique h1 on every top-level page", () => {
    for (const file of ["components/dashboard-shell.tsx", "app/sol/page.tsx", "app/media/page.tsx", "app/vault/page.tsx"]) {
      expect(readFileSync(file, "utf8").match(/<h1\b/g)?.length, file).toBe(1);
    }
  });
  it("gives incident destinations focusable target ids", () => {
    expect(readFileSync("components/sol/sol-tabs.tsx", "utf8")).toContain('id="runtime-status"');
    expect(readFileSync("components/media/media-panels.tsx", "utf8")).toContain('id="media-status"');
  });
});
