"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MarkdownView from "@/components/vault/markdown-view";
import type { VaultIndex } from "@/app/api/vault/route";
import type { VaultNote } from "@/app/api/vault/[name]/route";

/**
 * The vault reader: a rail of note names on the left, the selected note
 * rendered on the right.
 *
 * READ-ONLY by design for this stage — there is no edit field and nothing here
 * issues anything but GETs, even though the mount is writable. Appending to a
 * note is stage (c) and needs its own two-writer discipline (Obsidian on Mew
 * and OpenClaw on 152 both edit these files); a textarea bolted on here would
 * skip exactly that.
 *
 * Selection is client-side: notes are fetched once and kept, so flipping
 * between them after the first read is instant and costs no request.
 */

/** The master index is the natural landing view — it is the cross-project map. */
const DEFAULT_NOTE = "_index";

/** Display name for a note: `_index` reads better as "index". */
const label = (name: string) => (name === DEFAULT_NOTE ? "index" : name);

type Load = "loading" | "ready" | "error";

export default function VaultBrowser() {
  const [projects, setProjects] = useState<string[]>([]);
  const [indexState, setIndexState] = useState<Load>("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [noteState, setNoteState] = useState<Load>("loading");

  // Notes change at human speed and are small; re-fetching one the user already
  // opened would be a request per click for identical bytes.
  const cache = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vault", { cache: "no-store" });
        const json = (await res.json()) as VaultIndex;
        if (cancelled) return;
        const list = Array.isArray(json.projects) ? json.projects : [];
        setProjects(list);
        setIndexState("ready");
        // Land on the index when it exists, otherwise whatever is first.
        if (list.length) setSelected(list.includes(DEFAULT_NOTE) ? DEFAULT_NOTE : list[0]);
      } catch {
        if (!cancelled) setIndexState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const hit = cache.current.get(selected);
    if (hit !== undefined) {
      setContent(hit);
      setNoteState("ready");
      return;
    }

    let cancelled = false;
    setNoteState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/vault/${encodeURIComponent(selected)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as VaultNote;
        if (cancelled) return;
        cache.current.set(selected, json.content);
        setContent(json.content);
        setNoteState("ready");
      } catch {
        if (!cancelled) setNoteState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Wikilinks jump between notes; the rail follows so the two never disagree.
  const navigate = useCallback(
    (name: string) => {
      if (projects.includes(name)) setSelected(name);
    },
    [projects]
  );

  // --- Empty and error states -------------------------------------------
  if (indexState === "error") {
    return (
      <div className="hud-panel power-on p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] hud-glow-red">Vault feed offline</p>
        <p className="font-mono text-[10.5px] text-slate-500 mt-2">
          /api/vault did not answer. The rest of the dashboard is unaffected.
        </p>
      </div>
    );
  }

  if (indexState === "ready" && !projects.length) {
    return (
      <div className="hud-panel power-on p-6">
        <div className="flex items-start gap-2.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5"
            style={{ boxShadow: "0 0 7px #fbbf24" }}
          />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber-300/90">
              No vault notes
            </p>
            <p className="font-mono text-[10.5px] text-slate-500 mt-1.5 leading-relaxed">
              The Obsidian vault mount is empty or absent. Check that
              <span className="text-cyan-400"> /mnt/vault/Projects </span>
              is mounted in this container, or that VAULT_DIR points at it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      {/* --- Rail: the notes in the vault --- */}
      <nav className="hud-panel power-on p-3 lg:overflow-y-auto lg:max-h-[calc(100vh-150px)]">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-500/45 px-1 pb-2.5 mb-2 border-b border-cyan-500/15">
          Notes
          <span className="text-slate-600"> · {projects.length}</span>
        </p>
        <ul className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {indexState === "loading"
            ? Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="h-6 rounded bg-cyan-500/[0.06] animate-pulse" />
              ))
            : projects.map((name) => {
                const active = name === selected;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setSelected(name)}
                      aria-current={active ? "page" : undefined}
                      className={`w-full text-left font-mono text-[11px] rounded px-2 py-1.5 border transition-colors whitespace-nowrap ${
                        active
                          ? "border-cyan-400/50 text-cyan-100 bg-cyan-500/[0.09]"
                          : "border-transparent text-slate-400 hover:text-cyan-200 hover:border-cyan-500/25"
                      }`}
                      style={active ? { boxShadow: "0 0 12px rgba(34,211,238,0.12) inset" } : undefined}
                    >
                      <span className={active ? "text-cyan-400" : "text-slate-600"}>›&nbsp;</span>
                      {label(name)}
                    </button>
                  </li>
                );
              })}
        </ul>
      </nav>

      {/* --- Reader: the selected note --- */}
      <article className="hud-panel hud-scan power-on p-5 sm:p-6 min-h-0 lg:overflow-y-auto lg:max-h-[calc(100vh-150px)]">
        <div className="flex items-baseline justify-between gap-3 mb-4 pb-2.5 border-b border-cyan-500/15">
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text truncate">
            {selected ? label(selected) : "—"}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600 shrink-0">
            read-only
          </span>
        </div>

        {noteState === "loading" && (
          <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-cyan-500/50">
            Reading…
          </p>
        )}
        {noteState === "error" && (
          <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-amber-300/90">
            Note unavailable
          </p>
        )}
        {noteState === "ready" && content !== null && (
          <MarkdownView source={content} onNavigate={navigate} known={projects} />
        )}
      </article>
    </div>
  );
}
