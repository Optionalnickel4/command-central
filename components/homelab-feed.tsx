"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWidgetData } from "@/lib/fetcher";
import type { HomelabData } from "@/app/api/widgets/homelab/route";

/**
 * One shared poll of the light homelab route for the cockpit *chrome* —
 * ticker, system pulse and command bar all read the same snapshot instead of
 * each opening their own interval.
 *
 * Registry widgets may request the same key: DataCoordinator de-duplicates it,
 * so chrome and presentation share one in-flight request and one cadence.
 */
type Feed = ReturnType<typeof useWidgetData<HomelabData>>;

const HomelabFeedContext = createContext<Feed | null>(null);

export function HomelabFeedProvider({ children }: { children: ReactNode }) {
  const feed = useWidgetData<HomelabData>("/api/widgets/homelab", 15000);
  return <HomelabFeedContext.Provider value={feed}>{children}</HomelabFeedContext.Provider>;
}

export function useHomelabFeed(): Feed {
  const ctx = useContext(HomelabFeedContext);
  if (!ctx) throw new Error("useHomelabFeed must be used inside <HomelabFeedProvider>");
  return ctx;
}
