"use client";

import { AnimatePresence, LazyMotion, MotionConfig, domMax, m, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { WidgetFeedbackContext } from "@/lib/widget-feedback";

export function CockpitMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user"><LazyMotion features={domMax}>{children}</LazyMotion></MotionConfig>;
}

export function MotionSlot({ children, index }: { children: ReactNode; index: number }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const feedback = useRef<Animation | null>(null);
  const refresh = useCallback(() => {
    if (reduced || document.hidden || !root.current) return;
    feedback.current?.cancel();
    feedback.current = root.current.querySelector(".widget-update-line")?.animate(
      [{ opacity: 0, transform: "scaleX(0)" }, { opacity: 0.8, offset: 0.3 }, { opacity: 0, transform: "scaleX(1)" }],
      { duration: 650, easing: "ease-out" }
    ) ?? null;
  }, [reduced]);
  useEffect(() => () => feedback.current?.cancel(), []);
  useEffect(() => { if (reduced) feedback.current?.cancel(); }, [reduced]);
  return (
    <WidgetFeedbackContext.Provider value={refresh}>
      <m.div ref={root} className="motion-slot" initial={reduced ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.05 }}
        animate={reduced ? { opacity: 1, y: 0 } : undefined}
        transition={{ type: "spring", stiffness: 180, damping: 25, delay: Math.min(index * 0.045, 0.24) }}>
        <div className="orbit-slot">{children}</div>
        <span className="widget-update-line" aria-hidden="true" />
      </m.div>
    </WidgetFeedbackContext.Provider>
  );
}

export function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <AnimatePresence initial={false}>{open && (
    <m.div key="detail" className="motion-disclosure" initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </m.div>
  )}</AnimatePresence>;
}

export function MotionLabel({ children, value }: { children: ReactNode; value: string }) {
  const reduced = useReducedMotion();
  return <span className="motion-label"><AnimatePresence initial={false} mode="sync">
    <m.span key={value} initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : 0.18 }}>{children}</m.span>
  </AnimatePresence></span>;
}

export function SelectionLight() {
  return <m.span className="backend-selection" layoutId="assistant-backend" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" />;
}

export function MessageEntry({ children, className }: { children: ReactNode; className: string }) {
  const reduced = useReducedMotion();
  return <m.div className={className} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced ? 0 : 0.22 }}>{children}</m.div>;
}
