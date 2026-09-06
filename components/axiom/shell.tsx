"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { destinations, type Destination } from "./fixtures";
import { Icon, Modal, PanelEmpty, StateBadge } from "./primitives";
import { useAxiomData } from "./live-data";
import { observation } from "@/lib/axiom-model";
import { incidents } from "@/lib/operational-health";
import { DeepPage, RecentActivity } from "./deep-pages";
import { getSurface } from "@/components/widgets/registry";

export default function AxiomShell({ destination }: { destination: Destination }) {
 const params = useSearchParams();
 const model = useAxiomData();
 const entities = model.entities;
 const selected = entities.find(e => e.id === params.get("inspect"));
 const problems = incidents(model.signals);
 const [now, setNow] = useState<Date | null>(null);
 useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
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
 const nav = (mobile = false) => destinations.slice(0, mobile ? 4 : undefined).map(d => <Link key={d.id} href={d.href} aria-current={destination === d.id ? "page" : undefined} title={collapsed ? d.label : undefined}><Icon name={d.icon}/><span>{d.label}</span></Link>);
 return <div className={"ax-app ax-destination-" + destination + (collapsed ? " ax-collapsed" : "")}>
   <a href="#ax-main" className="ax-skip">Skip to workspace</a>
   <aside className="ax-nav">
     <Link href="/" className="ax-brand" aria-label="Axiom Command Central"><span className="ax-brand-mark" aria-hidden="true">A</span><span>AXIOM<small>Command Central</small></span></Link>
     <div className="ax-nav-label">Workspace</div><nav aria-label="Primary">{nav()}</nav>
     <div className="ax-nav-bottom"><div className="ax-local"><span aria-hidden="true">◇</span><span>Personal workspace<small>Live observations</small></span></div><button type="button" onClick={() => setCollapsed(!collapsed)} className="ax-collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}><Icon name="collapse"/><span>Collapse rail</span></button></div>
   </aside>
   <div className="ax-body">
     <header className="ax-intelligence"><div className="ax-header-label"><span className="ax-wordmark">JARVIS</span><span className="ax-header-divider"/><span>Ambient intelligence</span></div><div className="ax-header-actions"><span className="ax-sample">{model.loading ? "Connecting sources" : "Live workspace"}</span><time dateTime={now?.toISOString()}>{now?.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",timeZone:"UTC"}) ?? "—"} <span>UTC</span></time><button ref={commandTrigger} type="button" className="ax-icon-button" aria-label="Open command palette" onClick={() => setPalette(true)}><Icon name="search"/></button></div></header>
     <main id="ax-main" tabIndex={-1} className="ax-main">
       <div className="ax-page-heading"><div><div className="ax-eyebrow">Workspace / {current.label}</div><h1>{destination === "command" ? model.assessment : current.label}</h1><p>{destination === "command" ? model.summary + (model.activeCount===null ? " Activity is not fully observed." : ` ${model.activeCount} active observations.`) : pageDescriptions[destination]}</p></div><div className="ax-page-status">{model.state && <StateBadge state={model.state}/>}<span>{observation(model.observedAt)}<br/>{model.activeCount===null ? 'Activity not fully observed' : `${model.activeCount} active observations`}</span></div></div>
       <div className="ax-workspace">
         <div className="ax-primary">
           {destination === "command" ? <>{(["workspace","support","utilities"] as const).map(surface => <div className={"ax-surface-" + surface} key={surface}>{getSurface(surface).map(w => { const Component = w.component; return <Component key={w.id} model={model} inspect={inspect}/>; })}</div>)}</> :
           <DeepPage destination={destination} model={model} inspect={inspect}/>}
         </div>
         <aside className="ax-context" aria-label="Attention and activity">
           <section className={"ax-attention" + (!problems.length ? " ax-all-clear" : "")}>
             <div className="ax-context-heading"><h2>{model.loading ? "Assessing sources" : problems.length ? "Needs attention" : "No active incidents"}</h2><span className="ax-count">{problems.length}</span></div>
             {problems.length ? problems.slice(0,4).map(p=><article className="ax-incident" key={p.id}><StateBadge state={p.state}/><h3>{p.summary}</h3><p>{p.detail}</p><small>{observation(p.observedAt)}</small><Link className="ax-attention-button" href={p.detailHref ?? '/systems'}>Open {p.domain === 'assistant' ? 'Agents' : p.domain}<Icon name="arrow"/></Link></article>) : <p>{model.loading ? 'Waiting for source observations.' : model.summary}</p>}
             {problems.length>4 && <Link className="ax-button" href="/activity">View all {problems.length} source issues</Link>}
           </section>
           <section className="ax-recent"><div className="ax-context-heading"><h2>Recent changes</h2><Link href="/activity" aria-label="View recent activity"><Icon name="arrow"/></Link></div><RecentActivity model={model} compact/></section>
           <div className="ax-next"><span className="ax-eyebrow">Next, if useful</span><Link href={problems[0]?.detailHref ?? '/systems'}>{problems.length ? 'Inspect the highest-priority source' : 'Explore your systems'}<Icon name="arrow"/></Link></div>
         </aside>
       </div>
     </main>
     <div className="ax-command-dock"><span className="ax-command-symbol" aria-hidden="true">⌘</span><button type="button" onClick={() => setPalette(true)}>Go somewhere, or find a command<span><kbd>/</kbd> <kbd>⌘ K</kbd></span></button><Link href="/agents">Open Agents <Icon name="arrow"/></Link></div>
   </div>
   <nav className="ax-mobile-nav" aria-label="Mobile primary">{nav(true)}<button type="button" onClick={() => setMore(true)}><Icon name="menu"/><span>More</span></button></nav>
   {selected && <Modal title={selected.name} className="ax-inspector" onClose={() => updateQuery("inspect", null)}><div className="ax-inspector-body"><span className="ax-eyebrow">{selected.kind}</span><StateBadge state={selected.state}/><p className="ax-inspector-summary">{selected.detail}</p><dl className="ax-facts"><div><dt>Observation</dt><dd>{observation(selected.observedAt)}</dd></div><div><dt>CPU</dt><dd>{selected.cpu===null?'Unknown':selected.cpu+'%'}</dd></div><div><dt>Memory</dt><dd>{selected.memory}</dd></div><div><dt>Known dependency</dt><dd>{entities.find(e=>e.id===selected.parentId)?.name ?? (selected.kind==='Proxmox node'?'Physical host':'Not observed')}</dd></div></dl><h3>Relevant activity</h3><p>No per-system event history is available from this source.</p><Link className="ax-button" href={selected.detailHref ?? '/systems'}>Open Systems <Icon name="arrow"/></Link><p>Inspection is read-only.</p></div></Modal>}
   {params.get('inspect') && !selected && !model.loading && <Modal title="System not found" onClose={()=>updateQuery('inspect',null)}><PanelEmpty>This system is not in the available inventory. The source may be unavailable.</PanelEmpty></Modal>}
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
