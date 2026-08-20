"use client";

import { useEffect } from "react";

/**
 * Writes normalised pointer position (-1..1) to --mx / --my on <html>.
 * Every parallax layer and panel reads those two vars in CSS, so this is
 * the only JS involved in the depth effect — one rAF-throttled listener.
 *
 * Disabled entirely for reduced-motion and for coarse pointers (touch),
 * where there is no hover position to track.
 */
export default function ParallaxRoot() {
  useEffect(() => {
    const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (noMotion || coarse) return;

    const root = document.documentElement;
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      root.style.setProperty("--mx", x.toFixed(3));
      root.style.setProperty("--my", y.toFixed(3));
    };

    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
    };
  }, []);

  return null;
}
