'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useWidgetData } from '@/lib/fetcher';
import { incidents } from '@/lib/operational-health';
import type { AxiomModel, ActivityEvent } from '@/lib/axiom-model';
import { observation } from '@/lib/axiom-model';
import type { Destination } from './fixtures';
import type { HomelabDetailData } from '@/lib/homelab';
import type { SolStatusData } from '@/lib/sol-status';
import type { SolSessionsData } from '@/app/api/sol/sessions/route';
import type { Capabilities } from './live-data';
import { Icon, Pane, PanelEmpty, StateBadge } from './primitives';
const AssistantWorkspace=dynamic(()=>import('./assistant-workspace'),{loading:()=> <Pane title="Conversation"><PanelEmpty>Opening assistant workspace…</PanelEmpty></Pane>});
const ProjectWorkspace=dynamic(()=>import('./project-workspace'),{loading:()=> <Pane title="Project notes"><PanelEmpty>Opening projects…</PanelEmpty></Pane>});
export function DeepPage({destination,model,inspect}:{destination:Destination;model:AxiomModel;inspect:(id:string)=>void}) {
 if(destination==='systems')return <Systems model={model} inspect={inspect}/>;
 if(destination==='agents')return <Agents model={model}/>;
 if(destination==='projects')return <ProjectWorkspace/>;
 if(destination==='media')return <Media model={model}/>;
 if(destination==='activity')return <><Pane title="Current source issues">{incidents(model.signals).length?incidents(model.signals).map(s=><div className="ax-project-row" key={s.id}><div><h3>{s.summary}</h3><StateBadge state={s.state}/><p>{s.detail}</p></div><Link className="ax-button" href={s.detailHref ?? '/'}>Open source <Icon name="arrow"/></Link></div>):<PanelEmpty>No current source issues.</PanelEmpty>}</Pane><Pane title="Observed changes"><RecentActivity model={model}/></Pane><SessionHistory/></>;
 return <Settings model={model}/>;
}
function Systems({model,inspect}:{model:AxiomModel;inspect:(id:string)=>void}) {
 const detail=useWidgetData<HomelabDetailData>('/api/widgets/homelab-detail',60000);
 const [query,setQuery]=useState(''),[state,setState]=useState('all'),[sort,setSort]=useState<'name'|'cpu'>('name'),[desc,setDesc]=useState(false);
 const rows=model.entities.filter(e=>e.name.toLowerCase().includes(query.toLowerCase())&&(state==='all'||state===e.state)).sort((a,b)=>(sort==='name'?a.name.localeCompare(b.name):(a.cpu??-1)-(b.cpu??-1))*(desc?-1:1));
 function order(key:'name'|'cpu'){if(key===sort)setDesc(!desc);else{setSort(key);setDesc(false);}}
 return <Pane title="System inventory"><p className="ax-empty">Detail: {observation(detail.updatedAt)}{detail.error?" · Detail source unavailable; last known values may remain.":""}</p><div className="ax-table-controls"><label>Find a system<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter by name"/></label><label>State / freshness<select value={state} onChange={e=>setState(e.target.value)}>{['all','healthy','degraded','down','stale'].map(s=><option key={s} value={s}>{s}</option>)}</select></label></div><div className="ax-table-wrap"><table className="ax-table"><caption>Observed nodes and guests. Stopped guests may be intentional.</caption><thead><tr><th scope="col" aria-sort={sort==='name'?(desc?'descending':'ascending'):'none'}><button type="button" onClick={()=>order('name')}>System ↕</button></th><th scope="col">State</th><th scope="col" aria-sort={sort==='cpu'?(desc?'descending':'ascending'):'none'}><button type="button" onClick={()=>order('cpu')}>CPU ↕</button></th><th scope="col">Memory</th><th scope="col">Storage / uptime</th></tr></thead><tbody>{rows.map(e=>{
 const node=e.kind==='Proxmox node'?detail.data?.nodes.find(n=>n.name===e.name):null;
 const guest=detail.data?.guests.find(g=>`guest-${g.vmid}`===e.id);
 const uptime=node?.uptimeSec ?? (guest?.statusKnown!==false?guest?.uptimeSec:undefined);
 const storage=node?`${Math.round(node.rootfsUsedBytes/1024**3)} / ${Math.round(node.rootfsTotalBytes/1024**3)} GB`:guest?.diskKnown?`${Math.round(guest.diskBytes/1024**3)} / ${Math.round(guest.maxDiskBytes/1024**3)} GB`:'Not observed';
 return <tr key={e.id}><th scope="row"><Link href={e.detailHref ?? '/systems'} onClick={ev=>{if(!ev.ctrlKey&&!ev.metaKey&&!ev.shiftKey&&!ev.altKey){ev.preventDefault();inspect(e.id);}}}>{e.name}</Link><small>{e.kind}</small></th><td><StateBadge state={e.state}/></td><td>{e.cpu===null?'—':`${e.cpu}%`}</td><td>{e.memory}</td><td>{storage}<small>{uptime===undefined?'Uptime not observed':`${Math.floor(uptime/3600)}h uptime`}{detail.freshness==='stale'?' · stale':''}</small></td></tr>;
 })}</tbody></table></div>{!rows.length&&<PanelEmpty>{model.loading?'Reading inventory…':'No matching systems in the available inventory.'}</PanelEmpty>}</Pane>;
}
function Agents({model}:{model:AxiomModel}) {
 const sol=useWidgetData<SolStatusData>('/api/sol/status',60000);
 const signal=model.signals.find(s=>s.id==='sol');
 return <><Pane title="Assistant capabilities"><div className="ax-preview-grid"><div><h3>Sol / OpenClaw</h3>{signal&&<StateBadge state={signal.state}/>}<p>{signal?.detail ?? 'Loading telemetry…'}</p><p>{sol.data ? `${sol.data.tasks.active} active tasks · ${sol.data.sessions.count} stored sessions` : 'No runtime observation'}</p></div><div><h3>Claude</h3><p>Text assistant · on-demand connection</p><p>Availability is confirmed by a successful turn, not by Sol telemetry.</p></div><div><h3>Piper</h3><p>Speech output · on-demand synthesis</p><p>Enable voice, send a turn, then use Stop speech or Mute.</p></div></div></Pane><AssistantWorkspace/><SessionHistory/></>;
}
function Media({model}:{model:AxiomModel}) {
 const [expanded,setExpanded]=useState(false);
 const visibleOperations=expanded ? model.operations : model.operations.slice(0,8);
 return <><Pane title="Streams and jobs">{model.operations.length?visibleOperations.map(o=><article className="ax-project-row" key={o.id}><div><h3>{o.title}</h3><p>{o.detail}{o.stale?' · Last known observation':''}</p></div>{o.progress!==undefined&&<div><span>{o.progress}%</span><progress aria-label={o.title+' progress'} value={o.progress} max={100}/></div>}</article>):<PanelEmpty>No active operations in the available observations. Failed sources may hide active work.</PanelEmpty>}{model.operations.length>8&&<div className="ax-pane-footer"><span>Showing {visibleOperations.length} of {model.operations.length} operations</span><button type="button" className="ax-text-button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Show fewer':'Show all operations'}</button></div>}</Pane><Pane title="Independent services"><div className="ax-settings-list">{model.signals.filter(s=>s.domain==='media').map(s=><div key={s.id}><h3>{s.summary}</h3><StateBadge state={s.state}/><p>{s.detail}</p><small>{observation(s.observedAt)}</small></div>)}</div></Pane><Pane title="Library and queue totals"><dl className="ax-metrics">{model.mediaStats.map(s=><div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl><p className="ax-empty">Source-limited observations; queue and stream entries may overlap. No service-changing controls.</p></Pane></>;
}
export function RecentActivity({model,compact=false}:{model:AxiomModel;compact?:boolean}) {
 const last=useRef(new Map<string,string>()); const [events,setEvents]=useState<ActivityEvent[]>([]);
 useEffect(()=>{
  const added:ActivityEvent[]=[];
  for(const s of model.signals){const previous=last.current.get(s.id);if(previous&&previous!==s.state)added.push({id:s.id+'-'+s.observedAt+'-'+s.state,title:s.summary,detail:`${previous.replaceAll('_',' ')} → ${s.state.replaceAll('_',' ')}`,at:new Date().toISOString(),href:s.detailHref??'/'});last.current.set(s.id,s.state);}
  if(added.length)setEvents(old=>[...added,...old].slice(0,30));
 },[model.signals]);
 return <><ol className="ax-timeline">{events.slice(0,compact?3:30).map(e=><li key={e.id}><time>{observation(e.at)}</time><h3>{e.title}</h3><p>{e.detail}</p><Link href={e.href}>Open source</Link></li>)}</ol>{!events.length&&<p>No state changes observed in this view yet.</p>}<p className="ax-sample-note">Up to 30 changes while this view stays open. Not a durable audit log.</p></>;
}
function SessionHistory() {
 const data=useWidgetData<SolSessionsData>('/api/sol/sessions',60000);
 return <Pane title="Recent assistant sessions"><p className="ax-empty">{observation(data.updatedAt)}{data.freshness==='stale'?' · Last known history':''}</p>{data.data?.sessions.length ? <ol className="ax-session-list">{data.data.sessions.slice(0,8).map((s,i)=><li key={s.sessionId??i}><strong>{s.agentId??'Assistant'} · {s.model??'Model not recorded'}</strong><p>{s.status??'Status not recorded'} · {s.totalTokens.toLocaleString()} tokens{s.abortedLastRun?' · Last run aborted':''}</p><small>{s.updatedAt?observation(new Date(s.updatedAt).toISOString()):'Update time not recorded'}</small></li>)}</ol>:<PanelEmpty>{data.error?'Session history is unavailable.':'No session history returned yet.'}</PanelEmpty>}</Pane>;
}
function Settings({model}:{model:AxiomModel}) {
 const c=useWidgetData<Capabilities>('/api/axiom/capabilities',300000);
 return <Pane title="Capabilities and diagnostics"><div className="ax-settings-list"><div><h3>Authentication</h3><p>{c.data?.authentication??'Configuration unavailable'}</p><p>Configuration visibility only; this page cannot change authentication.</p></div><div><h3>Motion and contrast</h3><p>Follows your device reduced-motion and forced-color preferences. No continuous idle animation.</p></div><div><h3>Voice input</h3><p>{c.data?.microphone??'Requires browser speech recognition'}. Text input remains available.</p></div>{model.signals.map(s=><div key={s.id}><h3>{s.summary}</h3><StateBadge state={s.state}/><p>{s.detail}</p><Link className="ax-button" href={s.detailHref??'/'}>Open diagnostics <Icon name="arrow"/></Link></div>)}</div></Pane>;
}
