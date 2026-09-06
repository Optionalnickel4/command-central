import type { OperationalSignal, OperationalState } from './operational-health';
export interface EstateEntity extends OperationalSignal {
 name: string; kind: string; parentId?: string; cpu: number | null; memory: string;
 storage?: string; uptime?: string; online?: boolean;
}
export interface Operation { id: string; title: string; detail: string; href: string; progress?: number; stale: boolean }
export interface ActivityEvent { id: string; title: string; detail: string; at: string; href: string }
export interface Utility { id: string; title: string; detail: string; state: OperationalState | null; href?: string }
export interface AxiomModel {
 signals: OperationalSignal[]; entities: EstateEntity[]; operations: Operation[]; utilities: Utility[];
 loading: boolean; assessment: string; summary: string; state: OperationalState | null;
 observedAt?: string; activeCount: number | null; mediaStats: { label: string; value: string }[];
}
export function observation(at?: string): string {
 if (!at || !Number.isFinite(Date.parse(at))) return 'No successful observation';
 return `Observed ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC`;
}
