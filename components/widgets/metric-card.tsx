import type { ReactNode } from "react";

export default function MetricCard({
  label,
  value,
  sub,
  children
}: {
  label: string;
  value: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded bg-panel border border-hairline p-4">
      <p className="font-display text-xs uppercase tracking-wide text-slate mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold text-ivory mb-1">{value}</p>
      {sub && <p className="text-xs text-slate">{sub}</p>}
      {children}
    </div>
  );
}
