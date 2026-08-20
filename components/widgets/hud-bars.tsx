"use client";

// Animated vertical bar graph — live history, bars glow and rise.
export default function HudBars({ points, color = "#22d3ee" }: { points: number[]; color?: string }) {
  const max = Math.max(...points, 1);
  return (
    <div className="flex items-end gap-[3px] h-10 mt-2">
      {points.map((p, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(6, (p / max) * 100)}%`,
            background: `linear-gradient(to top, ${color}, ${color}44)`,
            boxShadow: `0 0 6px ${color}66`,
            transition: "height 0.6s ease",
            opacity: 0.4 + (i / points.length) * 0.6
          }}
        />
      ))}
    </div>
  );
}
