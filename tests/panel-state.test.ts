import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PanelEmpty, PanelFailure, PanelSkeleton, PanelTitle, StateBadge } from "@/components/widgets/panel-state";

describe("shared panel states", () => {
  it.each(["healthy", "degraded", "down", "stale", "not_configured", "disabled"] as const)("renders text and icon for %s", (state) => {
    const html = renderToStaticMarkup(createElement(StateBadge, { state }));
    expect(html).toContain("aria-hidden");
    expect(html).toMatch(/Live|Degraded|Down|Stale|Not configured|Disabled/);
  });
  it("uses a machine-readable time", () => {
    const html = renderToStaticMarkup(createElement(PanelTitle, { updatedAt: "2026-09-05T12:00:00Z" }, "Title"));
    expect(html).toContain('dateTime="2026-09-05T12:00:00Z"');
  });
  it("keeps failure copy sanitized and source-specific", () => {
    const html = renderToStaticMarkup(createElement(PanelFailure, { source: "calendar" }));
    expect(html).toContain("calendar did not return usable data");
    expect(html).not.toMatch(/https?:|\/home\/|token=/i);
  });
  it("renders named loading and nonblank empty states", () => {
    expect(renderToStaticMarkup(createElement(PanelSkeleton, { label: "Loading media" }))).toContain("Loading media");
    expect(renderToStaticMarkup(createElement(PanelEmpty, null, "Nothing scheduled."))).toContain("Nothing scheduled.");
  });
});
