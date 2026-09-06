'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { AxiomModel, EstateEntity } from '@/lib/axiom-model';
import { observation } from '@/lib/axiom-model';
import { Icon, Pane, PanelEmpty, StateBadge } from './primitives';
import { useUtilities } from './live-data';
export interface AxiomPaneProps { model: AxiomModel; inspect: (id:string)=>void }
export function EstatePane({model,inspect}:AxiomPaneProps) {
 const [expanded,setExpanded]=useState(false);
 const [view,setView]=useState<'topology'|'list'>('topology');
 const nodes=model.entities.filter(e=>e.kind==='Proxmox node');
 const guests=model.entities.filter(e=>e.kind!=='Proxmox node');
 const source=model.signals.find(s=>s.id==='estate');
 return <Pane title="Estate" className="ax-estate" action={<div className="ax-view-switch" role="group" aria-label="Estate view">{(['topology','list'] as const).map(v=><button type="button" key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v==='topology'?'Topology':'List'}</button>)}</div>}>
 <div className="ax-estate-stats"><div><strong>{model.entities.length ? `${guests.filter(e=>e.online).length} / ${guests.length}` : '—'}</strong><span>Guests last observed running</span></div><div><strong>{nodes.length || '—'}</strong><span>Compute nodes</span></div><span className="ax-stamp">{source?.state==='stale'?'Last known · ':''}{observation(source?.observedAt)}</span></div>
 {!model.entities.length ? <PanelEmpty>{source?.detail ?? 'Reading estate inventory…'}</PanelEmpty> : view==='list' ? <EntityList entities={model.entities} inspect={inspect}/> : <div className="ax-live-topology">{nodes.map(n=><div className="ax-estate-group" key={n.id}><div className="ax-live-core"><button type="button" className="ax-core-button" onClick={()=>inspect(n.id)} aria-label={`Inspect ${n.name}`}><Icon name="systems"/><strong>{n.name}</strong><span>Proxmox node</span></button><StateBadge state={n.state}/><p>{n.cpu === null ? 'CPU unavailable' : `${n.cpu}% CPU`} · {n.memory}</p></div><div className="ax-live-guests" aria-label={`Guests on ${n.name}`}>{guests.filter(g=>g.parentId===n.id).slice(0,expanded?undefined:6).map(g=><EntityNode key={g.id} entity={g} inspect={inspect}/>)}</div></div>)}{guests.length>6&&<button className="ax-button" type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?"Show compact estate":`Show all ${guests.length} guests`}</button>}{guests.some(g=>!nodes.some(n=>n.id===g.parentId)) && <><p>Guests without a confirmed host relationship</p><EntityList entities={guests.filter(g=>!nodes.some(n=>n.id===g.parentId))} inspect={inspect}/></>}</div>}
 <div className="ax-pane-footer"><span>Known host → guest relationships only</span><Link href="/systems">Open Systems <Icon name="arrow"/></Link></div></Pane>;
}
export function EntityList({entities,inspect}:{entities:EstateEntity[];inspect:(id:string)=>void}) {
 return <div className="ax-entity-list">{entities.map(e=><div key={e.id}><button type="button" className="ax-text-button" onClick={()=>inspect(e.id)}>Inspect {e.name}</button><span>{e.kind}</span><StateBadge state={e.state}/></div>)}</div>;
}
function EntityNode({entity:e,inspect}:{entity:EstateEntity;inspect:(id:string)=>void}) {
 return <div className={'ax-node ax-node-'+e.state}><span className="ax-eyebrow">{e.kind}</span><button type="button" onClick={()=>inspect(e.id)} aria-label={`Inspect ${e.name}`}><strong>{e.name}</strong><Icon name="arrow"/></button><StateBadge state={e.state}/></div>;
}
export function OperationsPane({model}:AxiomPaneProps) {
 return <Pane title="Active operations" action={<Link href="/media" aria-label="View media operations"><Icon name="arrow"/></Link>}>
 {!model.operations.length ? <PanelEmpty>{model.signals.some(s=>s.domain==='media'&&s.state==='healthy') ? 'No active work in the returned media observations.' : 'No current operation data. Check media source status.'}</PanelEmpty> : model.operations.slice(0,3).map(o=><div className="ax-operation" key={o.id}><div><h3>{o.title}</h3><p>{o.detail}{o.stale?' · Last known':''}</p></div>{o.progress!==undefined&&<span className="ax-operation-number">{o.progress}%</span>}</div>)}<div className="ax-pane-footer"><span>Read-only · up to 3 recent operations</span><Link href="/media">View operations <Icon name="arrow"/></Link></div></Pane>;
}
export function AgentsPane({model}:AxiomPaneProps) {
 const s=model.signals.find(s=>s.id==='sol');
 return <Pane title="Intelligence"><div className="ax-agent-summary"><div className="ax-agent-mark"><Icon name="agents"/></div><div><h3>Sol / OpenClaw</h3><p>{s?.detail ?? 'Reading runtime telemetry…'}</p></div></div><div className="ax-agent-status">{s&&<StateBadge state={s.state}/>}<span>{observation(s?.observedAt)}</span></div><div className="ax-pane-footer"><span>Sol · Claude · Piper</span><Link href="/agents">Open Agents <Icon name="arrow"/></Link></div></Pane>;
}
export function ContextUtilities() {
 const utilities=useUtilities();
 return <section className="ax-utilities" aria-label="Context utilities">{utilities.map(u=><div key={u.id}><Icon name={u.id==='weather'?'sun':'activity'}/><span><strong>{u.title}</strong><small>{u.detail}</small>{u.state&&u.state!=='healthy'&&<StateBadge state={u.state}/>}</span></div>)}</section>;
}
