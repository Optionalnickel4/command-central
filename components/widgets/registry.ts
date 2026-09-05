import type { WidgetCluster, WidgetDefinition } from "./types";
import HomelabPanel from "./homelab-panel";
import WeatherWidget from "./weather-widget";
import CalendarWidget from "./calendar-widget";
import NewsWidget from "./news-widget";
import EsportsScoreboard from "./esports-scoreboard";
import EsportsStandings from "./esports-standings";
import EsportsNews from "./esports-news";

/**
 * THE EXTENSION POINT.
 *
 * To add a new widget later (esports, Sol status, game servers, anything):
 *   1. Build the component in components/widgets/<name>.tsx — it owns its
 *      own data fetching (see weather-widget.tsx for the simplest example).
 *   2. Add a matching route at app/api/widgets/<name>/route.ts returning
 *      the shared WidgetResponse<T> shape, including
 *      `export const dynamic = "force-dynamic"` (see any existing route).
 *   3. Add one entry below, choosing which cluster it orbits in.
 *   4. For a brand-new section, add its title to SECTION_TITLES.
 *
 * The cockpit shell reads clusters, not individual widgets — so nothing
 * else needs to change. Order in this array is display order.
 */
export const widgetRegistry: WidgetDefinition[] = [
  { id: "homelab-status", section: "homelab", cluster: "left", component: HomelabPanel, priority: 10, size: "wide", showWhen: "expanded", detailHref: "/sol#systems-status" },
  { id: "calendar", section: "general", cluster: "right", component: CalendarWidget, priority: 10, size: "compact", showWhen: "always" },
  { id: "weather", section: "general", cluster: "right", component: WeatherWidget, priority: 20, size: "compact", showWhen: "expanded" },
  { id: "news", section: "general", cluster: "right", component: NewsWidget, priority: 40, size: "standard", showWhen: "expanded" },
  // Esports rides in the right column under "general" — compact, column-width.
  { id: "esports-scoreboard", section: "esports", cluster: "right", component: EsportsScoreboard, priority: 15, size: "standard", showWhen: "expanded" },
  { id: "esports-standings", section: "esports", cluster: "right", component: EsportsStandings, priority: 30, size: "standard", showWhen: "expanded" },
  { id: "esports-news", section: "esports", cluster: "right", component: EsportsNews, priority: 40, size: "standard", showWhen: "expanded" }
];

/** Display names for section headers in the cockpit. */
export const SECTION_TITLES: Record<string, string> = {
  homelab: "Homelab",
  general: "General",
  esports: "Esports"
};

/**
 * The registry filtered for this instance. Esports is gated by ENABLE_ESPORTS
 * (lib/features.ts): with the flag off its entries are never registered, so the
 * section simply doesn't exist and the clusters reflow around it.
 *
 * The flag is resolved on the SERVER and passed in, because this module is also
 * bundled into the client command bar, where process.env is not readable.
 */
function visibleWidgets(esports: boolean): WidgetDefinition[] {
  return esports ? widgetRegistry : widgetRegistry.filter((w) => w.section !== "esports");
}

export function getWidgetsBySection(section: string, esports = true): WidgetDefinition[] {
  return visibleWidgets(esports).filter((w) => w.section === section);
}

/**
 * Every section in registry order, with display titles. The command bar's
 * quick-jump buttons build themselves from this, so a new section shows up
 * there automatically.
 */
export function getAllSections(esports: boolean): { section: string; title: string }[] {
  const order: string[] = [];
  for (const w of visibleWidgets(esports)) {
    if (!order.includes(w.section)) order.push(w.section);
  }
  return order.map((section) => ({ section, title: SECTION_TITLES[section] ?? section }));
}

/**
 * Widgets in one cluster, grouped into sections and kept in registry order.
 * This is what the cockpit renders on each side of the core.
 */
export function getClusterSections(
  cluster: WidgetCluster,
  esports: boolean
): { section: string; title: string; widgets: WidgetDefinition[] }[] {
  const inCluster = visibleWidgets(esports).filter((w) => (w.cluster ?? "right") === cluster);
  const order: string[] = [];
  for (const w of inCluster) {
    if (!order.includes(w.section)) order.push(w.section);
  }
  return order.map((section) => ({
    section,
    title: SECTION_TITLES[section] ?? section,
    widgets: inCluster.filter((w) => w.section === section).sort((a, b) => a.priority - b.priority)
  }));
}
