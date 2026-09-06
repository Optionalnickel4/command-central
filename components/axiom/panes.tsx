"use client";
import Link from "next/link";
import { useState } from "react";
import type { Entity, Scenario } from "./fixtures";
import { Icon, Pane, StateBadge } from "./primitives";
export interface AxiomPaneProps { entities: Entity[]; scenario: Scenario; inspect: (id: string) => void }
export function EstatePane({ entities, scenario, inspect }: AxiomPaneProps) {
 const [view, setView] = useState<"topology" | "list">("topology");
 const unavailable = scenario === "outage";
 const stale = scenario === "stale";
 const guests = entities.slice(1);
 return <Pane title="Estate" className="ax-estate" action={<div className="ax-view-switch" role="group" aria-label="Estate view"><button type="button" aria-pressed={view === "topology"} onClick={() => setView("topology")}>Topology</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div>}>
   <div className="ax-estate-stats"><div><strong>{unavailable ? "—" : "6 / 6"}</strong><span>{stale ? "Last observed guests" : "Guests available"}</span></div><div><strong>{unavailable ? "—" : "18"}<small>{!unavailable && "%"}</small></strong><span>Node CPU{stale && " · stale"}</span></div><div><strong>{unavailable ? "—" : "38"}<small>{!unavailable && " / 96 GB"}</small></strong><span>Memory{stale && " · stale"}</span></div><span className="ax-stamp">{stale ? "◷ Observed 8m ago" : unavailable ? "× Observation failed" : "✓ Observed 14s ago"}</span></div>
   {view === "topology" ? <div className="ax-topology">
     <div className="ax-topology-grid" aria-hidden="true"/>
     <svg className="ax-connections" aria-hidden="true" viewBox="0 0 800 330" preserveAspectRatio="none"><path d="M400 165H270V55H175M270 165H175M270 165V275H175M400 165H530V55H625M530 165H625M530 165V275H625"/></svg>
     <div className="ax-node-core"><span className="ax-eyebrow">Compute · 01</span><button className="ax-core-button" type="button" onClick={() => inspect("node")} aria-label="Inspect Workshop"><Icon name="systems"/><strong>Workshop</strong><span>Proxmox node</span></button><StateBadge state={entities[0].state}/></div>
     <div className="ax-node-group ax-node-group-left">{guests.slice(0, 3).map(e => <Node key={e.id} entity={e} inspect={inspect}/>)}</div>
     <div className="ax-node-group ax-node-group-right">{guests.slice(3).map(e => <Node key={e.id} entity={e} inspect={inspect}/>)}</div>
     <div className="ax-map-caption">Known node → guest relationships</div>
   </div> : <div className="ax-entity-list">{entities.map(e => <div key={e.id}><button type="button" className="ax-text-button" onClick={() => inspect(e.id)}>Inspect {e.name}</button><span>{e.kind}</span><StateBadge state={e.state}/></div>)}</div>}
   <div className="ax-mobile-estate"><p>1 compute node · 6 guests</p><StateBadge state={entities[0].state}/><button type="button" className="ax-button" onClick={() => inspect("node")}>Inspect estate <Icon name="arrow"/></button></div>
   <div className="ax-pane-footer"><span>{stale ? "Last known values · refresh overdue" : unavailable ? "Availability not confirmed" : "Infrastructure · intelligence · media"}</span><Link href="/systems">Open Systems <Icon name="arrow"/></Link></div>
 </Pane>;
}
function Node({ entity: e, inspect }: { entity: Entity; inspect: (id: string) => void }) {
 return <div className={"ax-node ax-node-" + e.state}><span className="ax-eyebrow">{e.domain}</span><button type="button" onClick={() => inspect(e.id)} aria-label={"Inspect " + e.name}><strong>{e.name}</strong><Icon name="arrow"/></button><StateBadge state={e.state}/></div>;
}
export function OperationsPane({ scenario }: AxiomPaneProps) {
 const down = scenario === "outage", stale = scenario === "stale";
 return <Pane title="Active operations" action={<Link href="/media" aria-label="View media operations"><Icon name="arrow"/></Link>}>
   <div className="ax-operation"><div><span className="ax-eyebrow">Media · Library import</span><h3>{down ? "Operations unavailable" : "Library update"}</h3><p>{down ? "The source could not be reached." : stale ? "Last observed progress · 8m ago" : scenario === "healthy" ? "Processing normally · 3m remaining" : "Waiting for import · 12m elapsed"}</p></div><span className="ax-operation-number">{down ? "—" : "84%"}<span>{down ? "Unknown" : stale ? "Stale" : "Complete"}</span></span></div>
   <div className="ax-progress" role="progressbar" aria-label="Sample library import" aria-valuenow={down ? undefined : 84} aria-valuemin={0} aria-valuemax={100}><span style={{ width: down ? "0%" : "84%" }}/></div>
   <div className="ax-pane-footer"><span>{down ? "No current observation" : stale ? "Values may have changed" : "Read-only observation"}</span><Link href="/media">View queue <Icon name="arrow"/></Link></div>
 </Pane>;
}
export function AgentsPane({ entities, inspect }: AxiomPaneProps) {
 return <Pane title="Intelligence" action={<Link href="/agents" aria-label="View agents"><Icon name="arrow"/></Link>}><div className="ax-agent-summary"><div className="ax-agent-mark"><Icon name="agents"/></div><div><h3>{entities.find(e => e.id === "sol")!.state === "down" ? "Sol is unavailable" : entities.find(e => e.id === "sol")!.state === "stale" ? "Sol status is stale" : "Sol is standing by"}</h3><p>Text and voice workspace</p></div></div><div className="ax-agent-status"><StateBadge state={entities.find(e => e.id === "sol")!.state}/><span>No active turn</span></div><div className="ax-pane-footer"><span>Sol · Claude · Piper</span><button className="ax-text-button" type="button" onClick={() => inspect("sol")}>Inspect agent <Icon name="arrow"/></button></div></Pane>;
}
export function ContextUtilities() {
 return <section className="ax-utilities" aria-label="Context utilities"><div><Icon name="sun"/><span><strong>22° · Clear</strong><small>Sample weather</small></span></div><div><span className="ax-utility-number">02</span><span><strong>Two upcoming events</strong><small>Next · Workshop review, 14:00</small></span></div><Link href="/activity"><span><strong>Daily briefing</strong><small>Context, kept in perspective</small></span><Icon name="arrow"/></Link></section>;
}
