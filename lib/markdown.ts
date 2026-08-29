/**
 * A small markdown parser for the Obsidian vault notes.
 *
 * Hand-rolled rather than pulled from npm, for the same reason this repo draws
 * its own SVG gauges instead of importing recharts: the input is six files the
 * human writes, and a survey of them found headings, flat `-` bullets,
 * `**bold**`, 83 inline-code spans and 30 `[[wikilinks]]` — no tables, no code
 * fences, no ordered lists, no blockquotes, no task lists, no nesting. A
 * general-purpose renderer would be a dependency plus a full set of style
 * overrides to stop default-webpage markdown crashing into the HUD.
 *
 * It parses a bit MORE than the files currently use (fences, ordered lists,
 * nesting, italics, links, rules, YAML frontmatter) because a human edits these
 * in Obsidian and will eventually paste a command or add a property block —
 * that should degrade to something sensible, not to visible `#` and backticks.
 * Tables are the deliberate omission: none exist, and a correct table parser is
 * more code than the rest of this file.
 *
 * Output is a plain data AST, never an HTML string. The renderer turns spans
 * into React elements, so file content can never become markup — no
 * dangerouslySetInnerHTML anywhere in this feature.
 *
 * Pure: no React, no DOM. Unit-tested directly.
 */

export type Span =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  /** `[[target]]` or `[[target|label]]` — a pointer to another vault note. */
  | { kind: "wikilink"; target: string; label: string };

export interface ListItem {
  /** Indent level, 0 for a top-level bullet. */
  depth: number;
  spans: Span[];
}

export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/**
 * One pass, alternatives in precedence order. `code` leads so that backticked
 * text is taken literally — `**` inside a code span must not turn bold, which
 * matters here because the notes quote things like `self.__next_f`.
 *
 * `**strong**` precedes `*em*` deliberately: the engine tries branches
 * left-to-right at each position, so a doubled asterisk is claimed by strong
 * before em can see a single one. That avoids a lookbehind.
 */
const INLINE =
  /`([^`]+)`|\*\*([^*]+?)\*\*|\[\[([^\]]+?)\]\]|\[([^\]]+?)\]\(([^)\s]+)\)|\*([^*]+?)\*/g;

/** Only schemes that are safe as an href. A note is data, not a script source. */
const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;

  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    if (m.index > last) spans.push({ kind: "text", text: text.slice(last, m.index) });
    const [, code, strong, wiki, linkText, href, em] = m;

    if (code !== undefined) {
      spans.push({ kind: "code", text: code });
    } else if (strong !== undefined) {
      spans.push({ kind: "strong", text: strong });
    } else if (wiki !== undefined) {
      // Obsidian's alias form: [[real-name|what to show]].
      const bar = wiki.indexOf("|");
      const target = (bar >= 0 ? wiki.slice(0, bar) : wiki).trim();
      const label = (bar >= 0 ? wiki.slice(bar + 1) : wiki).trim();
      spans.push({ kind: "wikilink", target, label: label || target });
    } else if (linkText !== undefined && href !== undefined) {
      // An unsafe scheme keeps its text but loses its link-ness.
      if (SAFE_HREF.test(href)) spans.push({ kind: "link", text: linkText, href });
      else spans.push({ kind: "text", text: linkText });
    } else if (em !== undefined) {
      spans.push({ kind: "em", text: em });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) spans.push({ kind: "text", text: text.slice(last) });
  return spans;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;

/** Two spaces per level, which is what Obsidian emits. */
const depthOf = (indent: string) => Math.min(3, Math.floor(indent.replace(/\t/g, "  ").length / 2));

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split("\n");

  let paragraph: string[] = [];
  let list: ListItem[] | null = null;
  let listOrdered = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list?.length) {
      list = null;
      return;
    }
    blocks.push({ kind: "list", ordered: listOrdered, items: list });
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  let i = 0;

  // Obsidian writes a YAML property block at the very top when a note gets
  // tags or properties. It is metadata, not prose — skip it rather than render
  // a wall of `key: value` lines.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, n) => n > 0 && l.trim() === "---");
    if (end > 0) i = end + 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) body.push(lines[i]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    // Checked before BULLET: `---` is a rule, not a bullet with no content.
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      flush();
      blocks.push({ kind: "heading", level: h[1].length, spans: parseInline(h[2]) });
      continue;
    }

    const bullet = line.match(BULLET);
    const ordered = bullet ? null : line.match(ORDERED);
    const item = bullet ?? ordered;
    if (item) {
      flushParagraph();
      // A switch between bullet and numbered starts a new list.
      if (list && listOrdered !== Boolean(ordered)) flushList();
      if (!list) {
        list = [];
        listOrdered = Boolean(ordered);
      }
      list.push({ depth: depthOf(item[1]), spans: parseInline(item[2]) });
      continue;
    }

    // A plain line directly under a bullet is that bullet's continuation.
    if (list?.length) {
      const tail = list[list.length - 1];
      tail.spans = parseInline(`${spansToText(tail.spans)} ${line.trim()}`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

/** The visible text of a span run — used for lookahead joins and for tests. */
export function spansToText(spans: Span[]): string {
  return spans
    .map((s) => {
      switch (s.kind) {
        case "wikilink":
          return `[[${s.target === s.label ? s.target : `${s.target}|${s.label}`}]]`;
        case "code":
          return `\`${s.text}\``;
        case "strong":
          return `**${s.text}**`;
        case "em":
          return `*${s.text}*`;
        case "link":
          return `[${s.text}](${s.href})`;
        default:
          return s.text;
      }
    })
    .join("");
}
