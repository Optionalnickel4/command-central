import { describe, expect, it } from "vitest";
import { getAllSections, getClusterSections, widgetRegistry } from "@/components/widgets/registry";

describe("v2 widget registry metadata", () => {
  it("defines priority, size, and display policy for every widget", () => {
    for (const widget of widgetRegistry) {
      expect(widget.priority).toBeGreaterThanOrEqual(0);
      expect(["compact", "standard", "wide"]).toContain(widget.size);
      expect(["always", "expanded"]).toContain(widget.showWhen);
    }
  });

  it("orders widgets by priority inside each section", () => {
    for (const cluster of ["left", "right"] as const) {
      for (const section of getClusterSections(cluster, true)) {
        expect(section.widgets.map((widget) => widget.priority)).toEqual(
          section.widgets.map((widget) => widget.priority).toSorted((a, b) => a - b)
        );
      }
    }
  });

  it("removes esports navigation and content when disabled", () => {
    expect(getAllSections(false).some((item) => item.section === "esports")).toBe(false);
    expect(getClusterSections("right", false).flatMap((section) => section.widgets).some((widget) => widget.section === "esports")).toBe(false);
  });
});
