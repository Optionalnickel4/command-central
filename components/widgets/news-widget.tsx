"use client";

import { useWidgetData } from "@/lib/fetcher";
import { SampleTag } from "@/components/widgets/sample-tag";
import type { NewsData } from "@/app/api/widgets/news/route";

export default function NewsWidget() {
  const { data, mock } = useWidgetData<NewsData>("/api/widgets/news", 15 * 60000);
  return (
    <div className="hud-panel depth-mid p-4 h-full">
      <div className="flex items-center justify-between mb-2.5">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-500/60">Tech / Gaming</p>
        {mock && <SampleTag />}
      </div>
      {!data && <p className="font-mono text-xs text-slate-500">…</p>}
      {data?.headlines.map((h) => (
        <p key={h} className="font-mono text-xs text-slate-300 mb-2 leading-relaxed flex gap-2">
          <span className="text-cyan-500/40">▸</span>{h}
        </p>
      ))}
    </div>
  );
}
