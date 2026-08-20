/** Shared readout formatting for the HUD. */

/** 1818918912 → "1.7 GB". Returns "—" for missing values. */
export function formatBytes(bytes?: number | null, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : digits)} ${units[i]}`;
}

/** 3240134 → "37d 12h". Returns "—" for missing/zero. */
export function formatUptime(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Percentage of a total, guarding divide-by-zero. */
export function pctOf(used?: number | null, total?: number | null): number {
  if (!used || !total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}
