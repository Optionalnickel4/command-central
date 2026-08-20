"use client";

import { useEffect, useState } from "react";

export default function TickerClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <span className="font-mono text-sm text-cyan-500/50">--:--:--</span>;

  return (
    <span className="font-mono text-sm hud-glow-text tracking-wider">
      {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
      <span className="text-cyan-500/40 mx-2">|</span>
      {now.toLocaleTimeString(undefined, { hour12: false })}
    </span>
  );
}
