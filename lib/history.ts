"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps a rolling, client-side history of a polled metric so widgets can
 * draw a trend without any server-side storage.
 *
 * Samples are keyed off `stamp` (pass the response's updatedAt), not off the
 * value itself — a metric sitting flat at 2% still needs to record a point on
 * every poll, and deduping on value would freeze the graph.
 *
 * History lives only as long as the page: a reload starts a fresh window.
 */
export function useRollingHistory(
  value: number | null | undefined,
  stamp: string | undefined,
  cap = 48
): number[] {
  const [points, setPoints] = useState<number[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!stamp) return;
    const v = valueRef.current;
    if (v == null || !Number.isFinite(v)) return;
    setPoints((prev) => [...prev, v].slice(-cap));
  }, [stamp, cap]);

  return points;
}
