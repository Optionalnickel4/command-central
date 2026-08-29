"use client";

import { Fragment } from "react";
import { parseMarkdown, type Block, type Span } from "@/lib/markdown";

/**
 * Renders the vault's markdown AST as HUD-styled React elements.
 *
 * Every span becomes an element — there is no HTML string anywhere in this
 * path, so note content cannot become markup no matter what the file holds.
 *
 * The styling is the point: a default markdown stylesheet dropped into this
 * cockpit would read as a web page pasted over the HUD. Headings pick up the
 * display face and the cyan glow the rest of the app uses, `code` spans take
 * the amber accent, and wikilinks look like the chips they behave as.
 */

/** A `[[wikilink]]` that names a note we actually have becomes a jump. */
function WikiLink({
  target, label, onNavigate, known
}: {
  target: string;
  label: string;
  onNavigate?: (name: string) => void;
  known: boolean;
}) {
  const base =
    "font-mono text-[11px] px-1.5 py-[1px] rounded border align-baseline transition-colors";
  if (!known || !onNavigate) {
    // Points at a note this vault does not have — still styled as a reference,
    // but honestly inert rather than a link that goes nowhere.
    return (
      <span
        className={`${base} border-slate-600/40 text-slate-400/80`}
        title={`${target} — not in this vault`}
      >
        {label}
      </span>
    );
  }
  // Cyan, not amber: this app already reads cyan as "interactive" (chips, the
  // command bar) and amber as "a value" (inline code, ticker readouts). A
  // wikilink styled like a code span would look like data you cannot click.
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      className={`${base} border-cyan-400/45 text-cyan-200/95 hover:border-cyan-300/90 hover:text-cyan-100 hover:bg-cyan-500/10`}
      style={{ boxShadow: "0 0 8px rgba(34,211,238,0.12)" }}
    >
      <span className="text-cyan-500/70">↗&nbsp;</span>{label}
    </button>
  );
}

function Spans({
  spans, onNavigate, known
}: {
  spans: Span[];
  onNavigate?: (name: string) => void;
  known: Set<string>;
}) {
  return (
    <>
      {spans.map((s, i) => {
        switch (s.kind) {
          case "strong":
            return (
              <strong key={i} className="font-semibold text-cyan-100">
                {s.text}
              </strong>
            );
          case "em":
            return (
              <em key={i} className="italic text-cyan-200/85">
                {s.text}
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="font-mono text-[11px] text-amber-200/95 bg-amber-400/[0.07] border border-amber-400/20 rounded px-1 py-[1px]"
              >
                {s.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
              >
                {s.text}
              </a>
            );
          case "wikilink":
            return (
              <WikiLink
                key={i}
                target={s.target}
                label={s.label}
                onNavigate={onNavigate}
                known={known.has(s.target)}
              />
            );
          default:
            return <Fragment key={i}>{s.text}</Fragment>;
        }
      })}
    </>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "font-display text-[15px] sm:text-base font-semibold uppercase tracking-[0.18em] text-cyan-200 hud-glow-text",
  2: "font-display text-[12.5px] font-semibold uppercase tracking-[0.26em] text-amber-200/90",
  3: "font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80"
};

function BlockView({
  block, onNavigate, known
}: {
  block: Block;
  onNavigate?: (name: string) => void;
  known: Set<string>;
}) {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(block.level, 3);
      const Tag = (`h${Math.min(block.level, 6)}` as unknown) as "h1";
      return (
        <Tag className={`${HEADING_CLASS[level]} mt-6 first:mt-0 mb-2`}>
          <Spans spans={block.spans} onNavigate={onNavigate} known={known} />
          {level === 2 && (
            <span className="block h-px mt-2 bg-gradient-to-r from-amber-400/30 via-cyan-500/15 to-transparent" />
          )}
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p className="text-[12.5px] leading-relaxed text-slate-300/90 mb-3">
          <Spans spans={block.spans} onNavigate={onNavigate} known={known} />
        </p>
      );

    case "list":
      return (
        <ul className="mb-3 space-y-1.5">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-[12.5px] leading-relaxed text-slate-300/90"
              style={{ paddingLeft: `${item.depth * 14}px` }}
            >
              <span
                className="shrink-0 mt-[7px] h-[3px] w-[3px] rotate-45 bg-cyan-400/80"
                style={{ boxShadow: "0 0 5px #22d3ee" }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <Spans spans={item.spans} onNavigate={onNavigate} known={known} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "code":
      return (
        <pre className="mb-3 overflow-x-auto rounded border border-cyan-500/20 bg-slate-950/60 p-3">
          <code className="font-mono text-[11px] leading-relaxed text-cyan-100/85">{block.text}</code>
        </pre>
      );

    case "rule":
      return <div className="hud-rule my-5" />;
  }
}

export default function MarkdownView({
  source, onNavigate, known = []
}: {
  source: string;
  /** Called when a wikilink to a known note is clicked. */
  onNavigate?: (name: string) => void;
  /** Note names that exist, so dead wikilinks can be shown as dead. */
  known?: string[];
}) {
  const blocks = parseMarkdown(source);
  const set = new Set(known);
  return (
    <div>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} onNavigate={onNavigate} known={set} />
      ))}
    </div>
  );
}
