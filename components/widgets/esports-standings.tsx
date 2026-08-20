"use client";

import EsportsRankings from "./esports-rankings";
import EsportsStats from "./esports-stats";

/**
 * Rankings and the R2.0 leaderboard, paired side by side.
 *
 * Stacked they cost ~530px of a column that only has ~1040px to spend, which
 * is what pushed the page into a scrolling slab. Side by side they cost the
 * height of the taller one. Each half still owns its own fetch — this only
 * decides where they sit.
 */
export default function EsportsStandings() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <EsportsRankings />
      <EsportsStats />
    </div>
  );
}
