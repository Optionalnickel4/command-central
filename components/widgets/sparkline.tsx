export default function Sparkline({ points, color = "#3E8EF7" }: { points: number[]; color?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);
  const path = points
    .map((p, i) => `${i * step},${24 - ((p - min) / range) * 24}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 24" className="w-full h-6 mt-2" aria-hidden="true">
      <polyline points={path} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
