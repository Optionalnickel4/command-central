import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("responsive and accessibility contract", () => {
  it("provides a skip target on every rendered surface", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toContain('href="#main-content"');
    for (const file of ["components/dashboard-shell.tsx", "app/sol/page.tsx", "app/media/page.tsx", "app/vault/page.tsx", "app/esports/player/[id]/page.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain('id="main-content"');
    }
  });
  it("defines visible focus and reduced-motion behavior", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    for (const motion of [".ticker-track", ".orb-spin", ".conduit", ".hud-grid", ".boot-overlay"]) expect(css).toContain(motion);
  });
  it("uses a 44px disclosure target and a mobile orb cap", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min(62vw, 250px)");
  });
});
