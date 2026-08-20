"use client";

import { useEffect } from "react";

/**
 * Releases the boot gate on routes that have no <BootSequence/>.
 *
 * layout.tsx ships `data-boot="active"` on <html> so the dashboard's panels
 * hold at frame 0 of their power-on animation until the boot overlay hands
 * over. Any route WITHOUT that overlay would otherwise keep the attribute
 * forever and render every `.power-on` element at opacity 0 — a direct load or
 * refresh of /sol showed a completely blank page.
 */
export default function BootRelease() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-boot");
  }, []);
  return null;
}
