import type { OperationalState } from "@/lib/operational-health";

export type Scenario = "attention" | "healthy" | "outage" | "stale";
export interface Entity {
  id: string; name: string; kind: string; domain: string; state: OperationalState;
  cpu: number; memory: string; detail: string; href: string;
}
export const entities: Entity[] = [
  { id: "node", name: "Workshop", kind: "Proxmox node", domain: "Infrastructure", state: "healthy", cpu: 18, memory: "38 / 96 GB", detail: "Primary compute node. All six observed guests are available.", href: "/systems" },
  { id: "storage", name: "Storage", kind: "Container · 101", domain: "Infrastructure", state: "healthy", cpu: 4, memory: "3.2 / 8 GB", detail: "Shared storage is available. No capacity threshold exceeded.", href: "/systems" },
  { id: "gateway", name: "Gateway", kind: "Container · 102", domain: "Infrastructure", state: "healthy", cpu: 2, memory: "0.6 / 2 GB", detail: "Internal routing is available.", href: "/systems" },
  { id: "media", name: "Media", kind: "Container · 103", domain: "Media", state: "degraded", cpu: 12, memory: "4.1 / 8 GB", detail: "One import has been waiting for 12 minutes. Playback and library services remain available.", href: "/media" },
  { id: "sol", name: "Sol", kind: "Container · 104", domain: "Intelligence", state: "healthy", cpu: 8, memory: "2.8 / 8 GB", detail: "Assistant is available. No active turn in this sample.", href: "/agents" },
  { id: "voice", name: "Voice", kind: "Container · 105", domain: "Intelligence", state: "healthy", cpu: 1, memory: "0.8 / 2 GB", detail: "Speech output service is available. No audio is playing.", href: "/agents" },
  { id: "projects", name: "Projects", kind: "Container · 106", domain: "Workspace", state: "healthy", cpu: 1, memory: "0.4 / 2 GB", detail: "Project index is available. No write is pending.", href: "/projects" }
];
export function fixtureEntities(scenario: Scenario): Entity[] {
  return entities.map(e => ({
    ...e,
    state: scenario === "outage" ? "down" : scenario === "stale" ? "stale" :
      scenario === "healthy" ? "healthy" : e.state,
    detail: scenario === "healthy" && e.id === "media" ? "Import is progressing normally. All media services are available." : scenario === "outage" ? "This source did not return usable data. Availability cannot be confirmed." :
      scenario === "stale" ? "Last known values are retained. The last observation is 8 minutes old." : e.detail
  }));
}
export const destinations = [
  { id: "command", label: "Command", href: "/", icon: "command" },
  { id: "systems", label: "Systems", href: "/systems", icon: "systems" },
  { id: "agents", label: "Agents", href: "/agents", icon: "agents" },
  { id: "media", label: "Media", href: "/media", icon: "media" },
  { id: "projects", label: "Projects", href: "/projects", icon: "projects" },
  { id: "activity", label: "Activity", href: "/activity", icon: "activity" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" }
] as const;
export type Destination = typeof destinations[number]["id"];
