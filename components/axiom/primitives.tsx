"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { OperationalState } from "@/lib/operational-health";
import { STATE_PRESENTATION } from "@/lib/presentation-state";

const paths: Record<string, ReactNode> = {
 command: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></>,
 systems: <><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/></>,
 agents: <><path d="M12 3v3M8 3h8M3 12H1m22 0h-2M8 20v2m8-2v2"/><rect x="3" y="6" width="18" height="14" rx="4"/><path d="M8 11v2m8-2v2m-7 4h6"/></>,
 media: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/></>,
 projects: <><path d="M3 7V4h7l2 3h9v13H3zM3 10h18"/></>,
 activity: <path d="M2 12h5l3-8 4 16 3-8h5"/>,
 settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
 search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
 arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
 close: <path d="m6 6 12 12M6 18 18 6"/>,
 menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
 collapse: <path d="m14 5-7 7 7 7"/>,
 sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>
};
export function Icon({ name }: { name: string }) {
 return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.systems}</svg>;
}
export function StateBadge({ state }: { state: OperationalState }) {
 const p = STATE_PRESENTATION[state];
 return <span className={"ax-state ax-state-" + state}><span aria-hidden="true">{p.symbol}</span>{p.label}</span>;
}
export function Pane({ title, children, className = "", action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
 return <section className={"ax-pane " + className}><div className="ax-pane-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function PanelSkeleton({ label }: { label: string }) {
 return <div role="status" className="ax-empty"><span>{label}</span><div className="ax-skeleton" aria-hidden="true"/></div>;
}
export function PanelEmpty({ children }: { children: ReactNode }) { return <div className="ax-empty">{children}</div>; }
export function PanelFailure({ source }: { source: string }) {
 return <p role="status" className="ax-empty">{source} did not return usable data. Last known observations may be out of date.</p>;
}
export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
 const ref = useRef<HTMLDialogElement>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 const close = useRef(onClose); close.current = onClose;
 useEffect(() => {
   const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
   const dialog = ref.current!;
   dialog.showModal(); heading.current?.focus();
   return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
 }, []);
 return <dialog className={"ax-dialog " + className} ref={ref} aria-labelledby="ax-dialog-title" onCancel={e => { e.preventDefault(); close.current(); }}>
   <div className="ax-dialog-heading"><h2 id="ax-dialog-title" tabIndex={-1} ref={heading}>{title}</h2><button type="button" className="ax-icon-button" aria-label={"Close " + title} onClick={onClose}><Icon name="close"/></button></div>
   {children}
 </dialog>;
}
