import type { CoordinatedSnapshot } from './fetcher';
import type { HomelabData } from './homelab';
import type { SolStatusData } from './sol-status';
import type { MediaData } from '@/app/api/media/route';
import type { JellyfinData, ArrData, QbitData, SeerrData } from './media';
import { normalizeSignal, incidents, severityFor, type OperationalSignal, type OperationalState, type OperationalDomain } from './operational-health';
import type { AxiomModel, EstateEntity, Operation } from './axiom-model';
export function sourceSignal<T>(snap: CoordinatedSnapshot<T>, id: string, domain: OperationalDomain, summary: string, href: string, configured?: boolean): OperationalSignal | null {
 if (!snap.data && !snap.error && configured !== false) return null;
 const signal = normalizeSignal({ id, domain, summary, detailHref: href, configured, updatedAt: snap.updatedAt, status: snap.error && !snap.data ? 'error' : snap.status });
 if (configured !== false && snap.data && snap.freshness === 'stale') {
  signal.state = 'stale'; signal.severity = 'warning'; signal.detail = 'Last known data. Current state is not confirmed.';
 }
 // A missing timestamp is not a successful observation.
 if (!snap.updatedAt) signal.observedAt = '';
 return signal;
}
function stateSignal(signal: OperationalSignal, state: OperationalState, detail: string): OperationalSignal {
 return { ...signal, state, severity: severityFor(state), detail };
}
export function estateAdapter(snap: CoordinatedSnapshot<HomelabData>, configured?: boolean): { signal: OperationalSignal | null; entities: EstateEntity[] } {
 let signal = sourceSignal(snap, 'estate', 'systems', 'Compute estate', '/systems', configured);
 if (!signal || !snap.data || configured === false) return { signal, entities: [] };
 const stale = signal.state === 'stale';
 const entities: EstateEntity[] = [
  ...snap.data.nodes.map(n => ({ ...signal!, id: `node-${n.name}`, name: n.name, kind: 'Proxmox node', parentId: undefined,
   state: stale ? 'stale' as const : n.online ? 'healthy' as const : 'down' as const, severity: severityFor(stale ? 'stale' : n.online ? 'healthy' : 'down'),
   summary: n.name, detail: stale ? 'Last observed node values; current availability is unknown.' : n.online ? 'Node is online.' : 'Node is offline.',
   detailHref: `/systems?inspect=${encodeURIComponent('node-' + n.name)}`, cpu: n.online ? n.cpuPct : null, memory: `${n.ramUsedGb} / ${n.ramTotalGb} GB`, online: n.online })),
  ...snap.data.guests.map(g => ({ ...signal!, id: `guest-${g.vmid}`, name: g.name, kind: `${g.type === 'lxc' ? 'Container' : 'Virtual machine'} · ${g.vmid}`,
   parentId: g.node ? `node-${g.node}` : undefined, state: g.template ? 'disabled' as const : stale ? 'stale' as const : g.status === 'ok' ? 'healthy' as const : 'down' as const,
   severity: severityFor(g.template ? 'disabled' : stale ? 'stale' : g.status === 'ok' ? 'healthy' : 'down'), summary: g.name,
   detail: g.template ? 'Template image, not a running workload.' : stale ? 'Last observed guest values; current availability is unknown.' : g.status === 'ok' ? 'Guest is running.' : 'Guest is not running. This may be intentional.',
   detailHref: `/systems?inspect=guest-${g.vmid}`, cpu: g.status === 'ok' ? g.cpuPct : null, memory: `${g.memPct}%`, online: g.status === 'ok' }))
 ];
 if (!stale) {
  const stopped = entities.filter(e => !e.online && e.state !== "disabled").length;
  if (!entities.length) signal = stateSignal(signal, 'degraded', 'The source returned no inventory. Estate health is not confirmed.');
  else if (stopped) signal = stateSignal(signal, stopped === entities.length ? 'down' : 'degraded', `${stopped} observed systems are not running; some may be intentionally stopped.`);
 }
 return { signal, entities };
}
export function assistantAdapter(snap: CoordinatedSnapshot<SolStatusData>) {
 let signal = sourceSignal(snap, 'sol', 'assistant', 'Sol / OpenClaw', '/agents');
 if (signal && snap.data && signal.state !== 'stale') {
  const d = snap.data;
  if (d.gateway?.reachable === false) signal = stateSignal(signal, 'degraded', 'Stored telemetry is available, but gateway reachability failed.');
  else if (d.taskAudit.errors || d.taskAudit.warnings) signal = stateSignal(signal, 'degraded', `${d.taskAudit.errors} audit errors and ${d.taskAudit.warnings} warnings in stored telemetry.`);
  else signal.detail = 'Stored runtime telemetry is available. Chat availability is verified when a turn is sent.';
 }
 return signal;
}
export function mediaAdapter(snap: CoordinatedSnapshot<MediaData>) {
 const base = sourceSignal(snap, 'media', 'media', 'Media services', '/media');
 const signals: OperationalSignal[] = []; const operations: Operation[] = []; const stats: AxiomModel['mediaStats'] = [];
 if (!base) return { signals, operations, stats, known: false };
 if (!snap.data) return { signals: [base], operations, stats, known: false };
 for (const [id, slice] of Object.entries(snap.data)) {
  const unconfigured = !slice.ok && /not set$/.test(slice.error ?? '');
  signals.push({ ...base, id, summary: ({ jellyfin:'Jellyfin', sonarr:'Sonarr',radarr:'Radarr',prowlarr:'Prowlarr',qbittorrent:'qBittorrent',seerr:'Seerr' } as Record<string,string>)[id] ?? id,
   ...(() => { const state = unconfigured ? 'not_configured' : base.state === 'stale' ? 'stale' : slice.ok ? 'healthy' : 'down'; return {state: state as OperationalState, severity: severityFor(state)}; })(),
   detail: unconfigured ? 'This optional service is not configured.' : base.state === 'stale' ? 'Last known media observation. Current status is not confirmed.' : slice.ok ? 'Service returned usable data.' : 'Service unavailable; other services remain independent.' });
 }
 const stale = base.state === 'stale';
 const j = snap.data.jellyfin.ok ? snap.data.jellyfin.data as JellyfinData : null;
 for (const [i,s] of (j?.sessions ?? []).entries()) operations.push({id:`stream-${i}`, title:s.title,detail:`Jellyfin · ${s.paused ? 'Paused' : 'Playing'} · ${s.playMethod}`,href:'/media',progress:s.progressPct,stale});
 if (j?.counts) for (const [label,value] of Object.entries(j.counts)) stats.push({label, value: value === null ? 'Unknown' : String(value)});
 for (const id of ['sonarr','radarr'] as const) {
  const d = snap.data[id].ok ? snap.data[id].data as ArrData : null;
  for (const [i,q] of (d?.queue ?? []).entries()) operations.push({id:`${id}-${i}`,title:q.title,detail:`${id} · ${q.status ?? 'Queued'}`,href:'/media',progress:q.progressPct,stale});
  if (d) stats.push({label:`${id} queued`,value:String(d.queueTotal)});
 }
 const q = snap.data.qbittorrent.ok ? snap.data.qbittorrent.data as QbitData : null;
 for (const [i,t] of (q?.torrents ?? []).entries()) if (!/upload|seeding|paused|stopped/i.test(t.state)) operations.push({id:`torrent-${i}`,title:t.name,detail:`qBittorrent · ${t.state}`,href:'/media',progress:t.progressPct,stale});
 const seerr = snap.data.seerr.ok ? snap.data.seerr.data as SeerrData : null;
 if (seerr) stats.push({label:'Pending requests',value:String(seerr.pending)});
 return {signals,operations,stats,known: signals.some(s=>s.state==='healthy') && !stale};
}
export function assessment(signals: OperationalSignal[], pending: boolean) {
 const primary = signals.filter(s => s.domain !== 'context');
 const active = primary.filter(s=>!['not_configured','disabled'].includes(s.state));
 const problems = incidents(active);
 const allDown = active.length > 0 && active.every(s=>s.state==='down');
 const state = allDown ? 'down' : problems.some(s=>s.state==='down'||s.state==='degraded') ? 'degraded' : problems.length ? 'stale' : active.length ? 'healthy' : null;
 return { state: state as OperationalState | null,
 assessment: pending ? 'Assessing your workspace.' : allDown ? 'Workspace visibility lost.' : problems.length ? 'Your workspace needs attention.' : active.length ? 'Observed systems are operational.' : 'No operational sources connected.',
 summary: pending ? 'Waiting for independent sources. Availability is not yet confirmed.' : `${problems.length} source${problems.length === 1 ? ' needs' : 's need'} attention. ${primary.filter(s=>s.state==='healthy').length} current; ${primary.filter(s=>s.state==='not_configured').length} not configured.` };
}
