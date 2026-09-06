import type { ComponentType } from "react";
import { AgentsPane, ContextUtilities, EstatePane, OperationsPane } from "@/components/axiom/panes";
import type { AxiomPaneProps } from "@/components/axiom/panes";

/** Single composition seam. The shell knows surfaces, not source widgets.
 * Live renderers replace these fixture renderers only after design approval. */
export interface AxiomFeature {
 id: string; domain: string; priority: number;
 surface: "workspace" | "support" | "utilities";
 density: "wide" | "compact"; visibility: "always";
 detailHref: string; capability: string;
 component: ComponentType<AxiomPaneProps>;
}
export const widgetRegistry: AxiomFeature[] = [
 { id: "estate", domain: "systems", priority: 10, surface: "workspace", density: "wide", visibility: "always", detailHref: "/systems", capability: "proxmox", component: EstatePane },
 { id: "operations", domain: "media", priority: 20, surface: "support", density: "compact", visibility: "always", detailHref: "/media", capability: "media", component: OperationsPane },
 { id: "agents", domain: "assistant", priority: 30, surface: "support", density: "compact", visibility: "always", detailHref: "/agents", capability: "assistant", component: AgentsPane },
 { id: "context", domain: "context", priority: 40, surface: "utilities", density: "wide", visibility: "always", detailHref: "/activity", capability: "context", component: ContextUtilities }
];
export function getSurface(surface: AxiomFeature["surface"]) {
 return widgetRegistry.filter(w => w.surface === surface).sort((a, b) => a.priority - b.priority);
}
