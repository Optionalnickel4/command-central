"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { destinations, fixtureEntities, type Destination, type Scenario, type Entity } from "./fixtures";
import { Icon, Modal, Pane, PanelEmpty, PanelSkeleton, StateBadge } from "./primitives";
import { getSurface } from "@/components/widgets/registry";

export default function AxiomShell({ destination }: { destination: Destination }) {
 const params = useSearchParams();
 const rawScenario = params.get("scenario");
 const scenario: Scenario = rawScenario === "healthy" || rawScenario === "outage" || rawScenario === "stale" ? rawScenario : "attention";
 const entities = fixtureEntities(scenario);
 const selected = entities.find(e => e.id === params.get("inspect"));
 const [collapsed, setCollapsed] = useState(false);
 const [more, setMore] = useState(false);
 const [palette, setPalette] = useState(false);
 const [query, setQuery] = useState("");
 const commandTrigger = useRef<HTMLButtonElement>(null);
 const current = destinations.find(d => d.id === destination)!;
 function updateQuery(key: string, value: string | null) {
   const url = new URL(window.location.href);
   if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
   window.history.pushState(null, "", url.pathname + url.search);
 }
 function inspect(id: string) { updateQuery("inspect", id); }
 useEffect(() => {
   function shortcut(e: KeyboardEvent) {
     const el = e.target;
     if (el instanceof HTMLElement && (el.isContentEditable || el.closest("input,textarea,select"))) return;
     if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
       if (document.querySelector("dialog[open]")) return;
       e.preventDefault(); commandTrigger.current?.focus(); setPalette(true);
     }
   }
   window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
 }, []);
 const attention = scenario !== "healthy";
 const assessment = scenario === "outage" ? "Estate visibility lost." : scenario === "stale" ? "Estate data needs a refresh." : "Your estate is stable.";
 const sub = scenario === "outage" ? "Sources are unavailable. Current health cannot be confirmed." : scenario === "stale" ? "Showing last known observations from 8 minutes ago." : scenario === "healthy" ? "All primary systems operational. Nothing needs attention." : "All primary systems operational. One media task needs attention.";
 const nav = (mobile = false) => destinations.slice(0, mobile ? 4 : undefined).map(d => <Link key={d.id} href={d.href} aria-current={destination === d.id ? "page" : undefined} title={collapsed ? d.label : undefined}><Icon name={d.icon}/><span>{d.label}</span></Link>);
 return <div className={"ax-app" + (collapsed ? " ax-collapsed" : "")}>
   <a href="#ax-main" className="ax-skip">Skip to workspace</a>
   <aside className="ax-nav">
     <Link href="/" className="ax-brand" aria-label="Axiom Command Central"><span className="ax-brand-mark" aria-hidden="true">A</span><span>AXIOM<small>Command Central</small></span></Link>
     <div className="ax-nav-label">Workspace</div><nav aria-label="Primary">{nav()}</nav>
     <div className="ax-nav-bottom"><div className="ax-local"><span aria-hidden="true">◇</span><span>Personal workspace<small>Design review</small></span></div><button type="button" onClick={() => setCollapsed(!collapsed)} className="ax-collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}><Icon name="collapse"/><span>Collapse rail</span></button></div>
   </aside>
   <div className="ax-body">
     <header className="ax-intelligence"><div className="ax-header-label"><span className="ax-wordmark">JARVIS</span><span className="ax-header-divider"/><span>Ambient intelligence</span></div><div className="ax-header-actions"><span className="ax-sample">Design preview · Sample data</span><time dateTime="2026-09-06T13:42:00Z">13:42 <span>UTC</span></time><button ref={commandTrigger} type="button" className="ax-icon-button" aria-label="Open command palette" onClick={() => setPalette(true)}><Icon name="search"/></button></div></header>
     <main id="ax-main" tabIndex={-1} className="ax-main">
       <div className="ax-page-heading"><div><div className="ax-eyebrow">Workspace / {current.label}</div><h1>{destination === "command" ? assessment : current.label}</h1><p>{destination === "command" ? sub : pageDescriptions[destination]}</p></div><div className="ax-page-status"><StateBadge state={scenario === "outage" ? "down" : scenario === "stale" ? "stale" : "healthy"}/><span>{scenario === "outage" ? "No current observation" : scenario === "stale" ? "Last success · 8m ago" : "Last success · 14s ago"}</span></div></div>
       <div className="ax-workspace">
         <div className="ax-primary">
           {destination === "command" ? <>{(["workspace","support","utilities"] as const).map(surface => <div className={"ax-surface-" + surface} key={surface}>{getSurface(surface).map(w => { const Component = w.component; return <Component key={w.id} entities={entities} scenario={scenario} inspect={inspect}/>; })}</div>)}</> :
           <DestinationPreview destination={destination} entities={entities} inspect={inspect}/>}
         </div>
         <aside className="ax-context" aria-label="Attention and activity">
           <section className={"ax-attention" + (!attention ? " ax-all-clear" : "")}><div className="ax-context-heading"><h2>{attention ? "Needs attention" : "All clear"}</h2><span className="ax-count">{attention ? scenario === "attention" ? "01" : "07" : "00"}</span></div>
             {attention ? <><span className={"ax-incident-tag " + (scenario === "outage" ? "ax-critical" : "")}>{scenario === "outage" ? "× Sources down" : scenario === "stale" ? "◷ Stale observations" : "△ Media · Degraded"}</span><h3>{scenario === "outage" ? "Connections unavailable" : scenario === "stale" ? "Refresh overdue" : "Import is waiting"}</h3><p>{scenario === "attention" ? "One item has not progressed for 12 minutes. Playback is unaffected." : scenario === "outage" ? "Inspect source status before relying on previous observations." : "Last known data is still visible. Current state is not confirmed."}</p><button type="button" className="ax-attention-button" onClick={() => inspect(scenario === "attention" ? "media" : "node")}>Inspect {scenario === "attention" ? "media" : "estate"}<Icon name="arrow"/></button></> : <><div className="ax-clear-symbol" aria-hidden="true">✓</div><h3>Nothing to resolve.</h3><p>7 sources observed. All primary systems are operational.</p><Link href="/systems">Explore Systems <Icon name="arrow"/></Link></>}
           </section>
           <section className="ax-recent"><div className="ax-context-heading"><h2>Recent changes</h2><Link href="/activity" aria-label="View recent activity"><Icon name="arrow"/></Link></div><ol className="ax-timeline"><li><span className="ax-event-dot"/><time>13:38</time><h3>Project note updated</h3><p>Workshop review added</p><Link href="/projects">View project</Link></li><li><span className="ax-event-dot"/><time>13:31</time><h3>Library scan completed</h3><p>24 items checked · no errors</p></li><li><span className="ax-event-dot"/><time>13:24</time><h3>Sol session finished</h3><p>Response delivered</p></li></ol><p className="ax-sample-note">Illustrative activity, not an audit log.</p></section>
           <div className="ax-next"><span className="ax-eyebrow">Next, if useful</span><Link href={attention ? "/media" : "/systems"}>{attention ? "Review active operations" : "Explore your systems"}<Icon name="arrow"/></Link></div>
         </aside>
       </div>
       <footer className="ax-review-controls"><span>Sample state</span><div role="group" aria-label="Sample scenario">{(["attention","healthy","stale","outage"] as const).map(s => <button type="button" key={s} aria-pressed={scenario === s} onClick={() => updateQuery("scenario", s)}>{s === "attention" ? "Needs attention" : s === "healthy" ? "All clear" : s === "stale" ? "Stale" : "Source outage"}</button>)}</div><span>No live services connected to this preview.</span></footer>
     </main>
     <div className="ax-command-dock"><span className="ax-command-symbol" aria-hidden="true">⌘</span><button type="button" onClick={() => setPalette(true)}>Go somewhere, or find a command<span><kbd>/</kbd> <kbd>⌘ K</kbd></span></button><Link href="/agents">Open Agents <Icon name="arrow"/></Link></div>
   </div>
   <nav className="ax-mobile-nav" aria-label="Mobile primary">{nav(true)}<button type="button" onClick={() => setMore(true)}><Icon name="menu"/><span>More</span></button></nav>
   {selected && <Modal title={selected.name} className="ax-inspector" onClose={() => updateQuery("inspect", null)}><div className="ax-inspector-body"><span className="ax-eyebrow">{selected.kind}</span><StateBadge state={selected.state}/><p className="ax-inspector-summary">{selected.detail}</p><dl className="ax-facts"><div><dt>Observed</dt><dd>{scenario === "stale" ? "8 minutes ago · stale" : scenario === "outage" ? "Unavailable" : "14 seconds ago"}</dd></div><div><dt>CPU</dt><dd>{scenario === "outage" ? "Unknown" : selected.cpu + "%"}</dd></div><div><dt>Memory</dt><dd>{scenario === "outage" ? "Unknown" : selected.memory}</dd></div><div><dt>Known dependency</dt><dd>{selected.id === "node" ? "Physical host" : "Workshop node"}</dd></div></dl><h3>Relevant activity</h3><p>{selected.id === "media" && scenario === "attention" ? "13:30 · Import entered waiting state." : "No additional events in this sample."}</p><Link className="ax-button" href={selected.href}>Open {selected.href.slice(1)} <Icon name="arrow"/></Link><p className="ax-sample-note">Sample entity. Inspection does not execute an action.</p></div></Modal>}
   {palette && <Modal title="Command palette" onClose={() => { setPalette(false); setQuery(""); }}><div className="ax-palette"><label htmlFor="ax-command-query">Find a destination</label><input id="ax-command-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="Systems, agents, projects…"/><nav aria-label="Command results">{destinations.filter(d => d.label.toLowerCase().includes(query.toLowerCase())).map(d => <Link key={d.id} href={d.href} onClick={() => setPalette(false)}><Icon name={d.icon}/>{d.label}<Icon name="arrow"/></Link>)}</nav>{!destinations.some(d => d.label.toLowerCase().includes(query.toLowerCase())) && <PanelEmpty>No destination found. Try “Systems” or “Projects”.</PanelEmpty>}<p>Navigation stays local. Assistant requests belong in <Link href="/agents">Agents</Link>.</p></div></Modal>}
   {more && <Modal title="All destinations" onClose={() => setMore(false)}><nav className="ax-more-nav" aria-label="More destinations">{nav()}</nav></Modal>}
 </div>;
}
const pageDescriptions: Record<Exclude<Destination,"command">, string> = {
 systems: "Compute, guests, and the relationships between them.",
 agents: "Assistant availability, capabilities, and workspace.",
 media: "Active work first. Libraries and services in context.",
 projects: "A place for what shipped, what is next, and what matters.",
 activity: "Meaningful changes across your workspace.",
 settings: "Capabilities and preferences, without exposing secrets."
};
function DestinationPreview({ destination, entities, inspect }: { destination: Destination; entities: Entity[]; inspect: (id: string) => void }) {
 const [filter, setFilter] = useState("");
 if (destination === "systems") return <Pane title="System inventory"><div className="ax-inventory-filter"><label htmlFor="ax-filter">Find a system</label><input id="ax-filter" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name"/></div><div className="ax-inventory">{entities.filter(e => e.name.toLowerCase().includes(filter.toLowerCase())).map(e => <div key={e.id}><span><strong>{e.name}</strong><small>{e.kind}</small></span><StateBadge state={e.state}/><button type="button" className="ax-button" onClick={() => inspect(e.id)}>Inspect<span className="sr-only"> {e.name}</span><Icon name="arrow"/></button></div>)}</div>{!entities.some(e => e.name.toLowerCase().includes(filter.toLowerCase())) && <PanelEmpty>No matching systems.</PanelEmpty>}</Pane>;
 if (destination === "agents") return <Pane title="Assistant workspace"><div className="ax-preview-grid">{["Sol","Claude","Piper"].map(name => <div key={name}><Icon name="agents"/><h3>{name}</h3><StateBadge state={entities[0].state}/><p>{name === "Piper" ? "Speech output" : "Text assistant"}</p></div>)}</div><div className="ax-empty"><h3>Conversation entry</h3><p>Chat and voice interaction will connect after the static design review. No test message is sent from this preview.</p><Link className="ax-button" href="/sol">Existing Sol telemetry <Icon name="arrow"/></Link></div></Pane>;
 if (destination === "projects") return <Pane title="Project workspace"><div className="ax-project-row"><div><span className="ax-eyebrow">In progress</span><h3>Workshop refresh</h3><p>Interface direction selected. Design review is next.</p></div><Link className="ax-button" href="/vault">Existing project browser <Icon name="arrow"/></Link></div><PanelEmpty>Write proposals retain the existing explicit-confirm, append-only flow. No write controls are connected in this preview.</PanelEmpty></Pane>;
 if (destination === "media") return <Pane title="Media operations"><div className="ax-project-row"><div><span className="ax-eyebrow">Library import</span><h3>{entities[3].state === "down" ? "Operations unavailable" : entities[3].state === "stale" ? "Last observed operation" : "One operation in progress"}</h3><p>{entities[3].detail}</p></div><button type="button" className="ax-button" onClick={() => inspect("media")}>Inspect media <Icon name="arrow"/></button></div><Link className="ax-button ax-legacy-link" href="/legacy/media">Existing read-only media view <Icon name="arrow"/></Link></Pane>;
 if (destination === "activity") return <Pane title="Activity history"><PanelEmpty><h3>A clear record, not a wall of logs.</h3><p>This sample has no connected history. Existing source events will appear here after live migration; no synthetic audit trail will be created.</p></PanelEmpty></Pane>;
 return <Pane title="Capabilities and interface"><div className="ax-settings-list"><div><h3>Authentication</h3><p>Existing flow preserved. This preview does not modify authentication configuration.</p></div><div><h3>Reduced motion</h3><p>Follows your device preference. Healthy idle screens have no continuous animation.</p></div><div><h3>Optional sources</h3><StateBadge state="not_configured"/><p>Unconfigured sources are informational, never incidents.</p></div><div><h3>Disabled capability</h3><StateBadge state="disabled"/><p>No connection is attempted.</p></div><PanelSkeleton label="Loading-state example"/></div></Pane>;
}
