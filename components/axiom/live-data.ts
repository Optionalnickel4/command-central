'use client';
import { useWidgetData } from '@/lib/fetcher';
import type { HomelabData } from '@/lib/homelab';
import type { SolStatusData } from '@/lib/sol-status';
import type { MediaData } from '@/app/api/media/route';
import type { WeatherData } from '@/app/api/widgets/weather/route';
import type { CalendarData } from '@/app/api/widgets/calendar/route';
import type { NewsData } from '@/app/api/widgets/news/route';
import { estateAdapter, assistantAdapter, mediaAdapter, sourceSignal, assessment } from '@/lib/axiom-adapters';
import type { AxiomModel, Utility } from '@/lib/axiom-model';
import type { OperationalSignal } from '@/lib/operational-health';
export interface Capabilities { proxmox:boolean; authentication:string; claude:string; piper:string; microphone:string }
export function useAxiomData(): AxiomModel {
 const caps = useWidgetData<Capabilities>('/api/axiom/capabilities',300000);
 const estate = useWidgetData<HomelabData>('/api/widgets/homelab',30000);
 const sol = useWidgetData<SolStatusData>('/api/sol/status',60000);
 const media = useWidgetData<MediaData>('/api/media',30000);
 const e = estateAdapter(estate,caps.data?.proxmox);
 const a = assistantAdapter(sol);
 const m = mediaAdapter(media);
 const signals = [e.signal,a,...m.signals].filter((s):s is OperationalSignal=>s!==null);
 const loading = (!e.signal || !a || !m.signals.length);
 const times = [estate.updatedAt,sol.updatedAt,media.updatedAt].filter((t):t is string=>!!t).sort();
 return {signals,entities:e.entities,operations:m.operations,utilities:[],loading,...assessment(signals,loading),observedAt:times[0],activeCount:m.known && sol.data && sol.freshness==='live' ? m.operations.length+sol.data.tasks.active : null,mediaStats:m.stats};
}
export function useUtilities(): Utility[] {
 const w = useWidgetData<WeatherData>('/api/widgets/weather',600000);
 const c = useWidgetData<CalendarData>('/api/widgets/calendar',600000);
 const n = useWidgetData<NewsData>('/api/widgets/news',900000);
 const ws=sourceSignal(w,'weather','context','Weather','/activity',w.configured ?? w.data?.configured);
 const cs=sourceSignal(c,'calendar','context','Calendar','/activity',c.configured ?? c.data?.configured);
 const ns=sourceSignal(n,'news','context','News','/activity');
 return [
 {id:'weather',title:w.data?.configured && w.data.tempF !== null ? `${w.data.tempF}°F · ${w.data.condition}` : 'Weather',detail:ws?.state==='healthy' ? w.data?.location ?? '' : ws?.detail ?? 'Loading weather…',state:ws?.state ?? null},
 {id:'calendar',title:c.data?.configured ? `${c.data.events.length} upcoming events` : 'Calendar',detail:cs?.state==='healthy' ? c.data?.events[0]?.title ?? 'No upcoming events' : cs?.detail ?? 'Loading calendar…',state:cs?.state ?? null},
 {id:'news',title:'Daily briefing',detail:ns?.state==='healthy' ? n.data?.headlines[0]?.title ?? 'No headlines available' : ns?.detail ?? 'Loading headlines…',state:ns?.state ?? null}
 ];
}
