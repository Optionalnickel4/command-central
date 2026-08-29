"use client";

import { useState } from "react";
import type { Proposal } from "@/lib/vault-write";
import type { VaultAppendResult } from "@/app/api/vault/[name]/route";

/**
 * A proposed vault write, awaiting the user.
 *
 * This card is the gate. Jarvis never writes to the vault on its own — it
 * produces a proposal, shows the LITERAL line and the file it would land in,
 * and stops. Only the confirm button here issues the POST, and it sends the
 * text the user just read, so what was approved and what is written cannot
 * diverge.
 *
 * The line shown before confirming is a preview formatted by the same pure
 * function the server uses; the line shown after is the one the server actually
 * wrote, echoed back.
 */

export type WriteState = "pending" | "writing" | "written" | "cancelled" | "failed";

export default function WriteProposal({
  proposal, state, onSettled
}: {
  proposal: Proposal;
  state: WriteState;
  onSettled: (state: WriteState, line?: string, error?: string) => void;
}) {
  const [line, setLine] = useState(proposal.line);
  const [error, setError] = useState<string | null>(null);
  const settled = state === "written" || state === "cancelled";

  async function confirm() {
    onSettled("writing");
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(proposal.project)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The approved text, nothing else. The route generates no content.
        body: JSON.stringify({ text: proposal.text })
      });
      const payload = (await res.json().catch(() => null)) as
        | (VaultAppendResult & { error?: string })
        | null;
      if (!res.ok || !payload?.line) {
        const why = payload?.error ?? `write refused (${res.status})`;
        setError(why);
        onSettled("failed", undefined, why);
        return;
      }
      // Echo the authoritative line — the server owns the date stamp.
      setLine(payload.line);
      onSettled("written", payload.line);
    } catch {
      const why = "vault unreachable";
      setError(why);
      onSettled("failed", undefined, why);
    }
  }

  const tone = state === "written"
    ? "border-emerald-400/40"
    : state === "cancelled"
      ? "border-slate-700/50"
      : state === "failed"
        ? "border-rose-400/40"
        : "border-amber-400/40";

  return (
    <div
      className={`self-start w-[92%] rounded border ${tone} bg-slate-900/60 px-3 py-2.5`}
      style={state === "pending" ? { boxShadow: "0 0 16px rgba(251,191,36,0.08)" } : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-amber-300/90">
          {state === "written"
            ? "Appended to vault"
            : state === "cancelled"
              ? "Discarded"
              : state === "failed"
                ? "Write failed"
                : proposal.via === "offered"
                  ? "Log this to the vault?"
                  : "Proposed vault entry"}
        </span>
        <span className="font-mono text-[9px] text-cyan-400/70 shrink-0">
          {proposal.project}.md
        </span>
      </div>

      {/* The literal line. What you see is what gets appended. */}
      <pre className="font-mono text-[11.5px] leading-relaxed text-cyan-100/95 bg-slate-950/60 border border-cyan-500/15 rounded px-2.5 py-2 whitespace-pre-wrap break-words">
        {line}
      </pre>

      {state === "pending" && (
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={confirm}
            className="px-2.5 py-1 rounded border border-emerald-400/45 bg-emerald-500/10 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-500/20"
          >
            ✓ Append
          </button>
          <button
            type="button"
            onClick={() => onSettled("cancelled")}
            className="px-2.5 py-1 rounded border border-slate-600/50 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400 hover:text-slate-200 hover:border-slate-500"
          >
            ✕ Discard
          </button>
          <span className="font-mono text-[9px] text-slate-600 ml-auto">
            append-only · nothing else changes
          </span>
        </div>
      )}

      {state === "writing" && (
        <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-cyan-400/60 mt-2 live-pulse">
          Appending…
        </p>
      )}
      {state === "cancelled" && (
        <p className="font-mono text-[9.5px] text-slate-500 mt-2">Nothing was written.</p>
      )}
      {state === "written" && (
        <p className="font-mono text-[9.5px] text-emerald-300/70 mt-2">
          Appended under ## Log. Existing content untouched.
        </p>
      )}
      {state === "failed" && (
        <p className="font-mono text-[9.5px] text-rose-300/80 mt-2">{error} — nothing was written.</p>
      )}
      {settled && state === "written" && (
        <a
          href="/vault"
          className="inline-block font-mono text-[9.5px] text-cyan-400/70 hover:text-cyan-300 mt-1.5 underline decoration-cyan-500/30"
        >
          view in vault →
        </a>
      )}
    </div>
  );
}
