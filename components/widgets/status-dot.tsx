const COLORS: Record<string, string> = {
  ok: "bg-live",
  degraded: "bg-warn",
  error: "bg-alert"
};

export default function StatusDot({ status, pulse = false }: { status: "ok" | "degraded" | "error"; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${COLORS[status]} ${pulse && status === "ok" ? "live-pulse" : ""}`}
      aria-hidden="true"
    />
  );
}
