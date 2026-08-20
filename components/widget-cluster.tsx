import { getClusterSections } from "@/components/widgets/registry";
import type { WidgetCluster } from "@/components/widgets/types";

/**
 * One orbital cluster — every registry widget assigned to this side of the
 * core, grouped by section. Placement lives here; the widgets themselves
 * still own their own data.
 */
export default function WidgetCluster({
  cluster,
  startIndex = 0
}: {
  cluster: WidgetCluster;
  /** Offset for the power-on stagger so both clusters light up in sequence. */
  startIndex?: number;
}) {
  const sections = getClusterSections(cluster);
  if (sections.length === 0) return null;

  const align = cluster === "left" ? "text-right" : "text-left";
  let slot = startIndex;

  return (
    <div className={`orbit-cluster orbit-${cluster} flex flex-col gap-5`}>
      {sections.map((s, si) => (
        <section key={s.section} id={`section-${s.section}`} className="scroll-mt-24">
          {/* Section header — rule points back toward the core */}
          <div
            className={`flex items-center gap-2.5 mb-2.5 ${
              cluster === "left" ? "flex-row" : "flex-row-reverse"
            }`}
          >
            <span className="flex-1 hud-rule" style={{ transform: cluster === "left" ? "none" : "scaleX(-1)" }} />
            <span className={`font-display text-[11px] font-semibold uppercase tracking-[0.32em] hud-glow-text ${align}`}>
              {s.title}
            </span>
            <span className="font-mono text-[9px] text-cyan-500/35 tabular-nums">
              {String(si + 1).padStart(2, "0")}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {s.widgets.map((w) => {
              const Widget = w.component;
              const i = slot++;
              // power-on and orbit-slot must stay on separate elements: the
              // animation's fill-mode holds `transform: none` at its final
              // frame, which would cancel the slot's inward tilt.
              return (
                <div key={w.id} className="power-on" style={{ ["--i" as string]: i }}>
                  <div className="orbit-slot">
                    <Widget />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
