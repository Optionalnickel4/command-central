// Quiet honesty marker: a panel whose data is hardcoded placeholder (its route
// returns `mock: true`) shows this so sample numbers aren't mistaken for live
// ones. Deliberately muted — amber, small, unobtrusive; not an alarm.
export function SampleTag() {
  return (
    <span
      title="Placeholder data — not a live source yet"
      className="font-mono text-[8px] uppercase tracking-[0.2em] text-amber-400/50 border border-amber-400/25 rounded-sm px-1 py-px leading-none shrink-0"
    >
      Sample
    </span>
  );
}
