import { describe,it,expect } from 'vitest';
import { estateAdapter,sourceSignal,mediaAdapter,assessment } from '@/lib/axiom-adapters';
import type { CoordinatedSnapshot } from '@/lib/fetcher';
import type { HomelabData } from '@/lib/homelab';
import type { MediaData } from '@/app/api/media/route';
const time='2026-09-06T08:00:00Z';
const snapshot=<T,>(data:T|null,extra:Partial<CoordinatedSnapshot<T>>={}):CoordinatedSnapshot<T>=>({data,status:'ok',updatedAt:time,mock:false,error:null,freshness:'live',loading:false,...extra});
const estate:HomelabData={nodes:[{name:'node-a',online:true,cpuPct:12,ramUsedGb:8,ramTotalGb:64}],guests:[{vmid:10,node:'node-a',name:'service',type:'lxc',status:'ok',cpuPct:3,memPct:20}]};
describe('Axiom operational truth',()=>{
 it('does not fabricate health or successful timestamps before data arrives',()=>{
  expect(sourceSignal(snapshot(null,{updatedAt:undefined}),'a','systems','A','/systems')).toBeNull();
  expect(sourceSignal(snapshot(null,{updatedAt:undefined,error:'failure'}),'a','systems','A','/systems')?.observedAt).toBe('');
  expect(assessment([],true).state).toBeNull();
 });
 it('uses actual host relationships and never substitutes the sample estate',()=>{
  const {entities}=estateAdapter(snapshot(estate));expect(entities.map(e=>e.id)).toEqual(['node-node-a','guest-10']);expect(entities[1].parentId).toBe('node-node-a');
  const unknown={...estate,guests:[{...estate.guests[0],node:undefined}]};expect(estateAdapter(snapshot(unknown)).entities[1].parentId).toBeUndefined();
 });
 it('keeps last known metrics but labels every entity stale on refresh failure',()=>{
  const result=estateAdapter(snapshot(estate,{error:'failed',freshness:'stale'}));expect(result.signal?.state).toBe('stale');expect(result.entities.every(e=>e.state==='stale')).toBe(true);expect(result.entities[0].cpu).toBe(12);
 });
 it('distinguishes stopped inventory, absent configuration and empty inventory',()=>{
  expect(estateAdapter(snapshot({...estate,guests:[{...estate.guests[0],status:'error'}]})).signal?.state).toBe('degraded');
  expect(estateAdapter(snapshot<HomelabData>(null,{error:'failure'}),false).signal?.state).toBe('not_configured');
  expect(estateAdapter(snapshot({nodes:[],guests:[]})).signal?.state).toBe('degraded');
 });
 it('isolates media slices and excludes absent sources from incidents',()=>{
  const absent={ok:false,data:null,error:'API_KEY not set'};
  const data:MediaData={jellyfin:{ok:true,data:{sessions:[],counts:null,latest:[]},error:null},sonarr:{ok:false,data:null,error:'unreachable'},radarr:absent,prowlarr:absent,qbittorrent:absent,seerr:absent};
  const result=mediaAdapter(snapshot(data));expect(result.signals.map(s=>s.state)).toEqual(['healthy','down','not_configured','not_configured','not_configured','not_configured']);
  expect(assessment(result.signals,false).state).toBe('degraded');
  expect(mediaAdapter(snapshot(data,{freshness:'stale',error:'failed'})).signals[0].state).toBe('stale');
 });
 it('total loss is down, with no invented active operation count',()=>{
  const result=mediaAdapter(snapshot<MediaData>(null,{error:'failure'}));expect(result.known).toBe(false);expect(result.operations).toEqual([]);expect(assessment(result.signals,false).state).toBe('down');
 });
});
it('does not treat a stopped template as an incident',()=>{
 const data={...estate,guests:[{...estate.guests[0],status:'error' as const,template:true}]};
 const result=estateAdapter(snapshot(data));expect(result.entities[1].state).toBe('disabled');expect(result.signal?.state).toBe('healthy');
});
