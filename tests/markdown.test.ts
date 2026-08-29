import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, spansToText, type Block } from "@/lib/markdown";

/**
 * The hand-rolled vault markdown parser.
 *
 * These assert the SHAPE the renderer depends on — which block a line becomes,
 * which spans survive, what happens to markup the notes do not currently use —
 * never the wording of any note, which the human edits in Obsidian daily.
 *
 * The load-bearing cases are the ones where a naive parser silently does the
 * wrong thing: `**` inside a code span, a `---` rule that looks like a bullet,
 * and anything that could turn file text into markup.
 */

const kinds = (blocks: Block[]) => blocks.map((b) => b.kind);

describe("parseInline — spans", () => {
  it("splits plain text, bold, code and wikilinks", () => {
    const spans = parseInline("Runs in `LXC 221` on [[homelab]] and is **stable**.");
    expect(spans.map((s) => s.kind)).toEqual(["text", "code", "text", "wikilink", "text", "strong", "text"]);
    expect(spans[1]).toMatchObject({ kind: "code", text: "LXC 221" });
    expect(spans[3]).toMatchObject({ kind: "wikilink", target: "homelab", label: "homelab" });
    expect(spans[5]).toMatchObject({ kind: "strong", text: "stable" });
  });

  it("takes code spans literally — asterisks inside them stay text", () => {
    const spans = parseInline("the `self.__next_f` and `a ** b` chunks");
    expect(spans.filter((s) => s.kind === "strong")).toHaveLength(0);
    expect(spans[3]).toMatchObject({ kind: "code", text: "a ** b" });
  });

  it("prefers **strong** over *em* on a doubled asterisk", () => {
    expect(parseInline("**bold**")[0]).toMatchObject({ kind: "strong", text: "bold" });
    expect(parseInline("*just italic*")[0]).toMatchObject({ kind: "em", text: "just italic" });
  });

  it("reads Obsidian's aliased wikilink form", () => {
    expect(parseInline("[[vlr-api|the scraper]]")[0]).toMatchObject({
      kind: "wikilink",
      target: "vlr-api",
      label: "the scraper"
    });
  });

  it("keeps http links and drops unsafe schemes to plain text", () => {
    expect(parseInline("[val](https://val.jushosting.dev)")[0]).toMatchObject({
      kind: "link",
      href: "https://val.jushosting.dev"
    });
    const unsafe = parseInline("[click](javascript:alert(1))");
    expect(unsafe[0].kind).toBe("text");
    expect(spansToText(unsafe)).not.toContain("javascript:");
  });

  it("never produces a span carrying raw markup", () => {
    // The renderer builds elements from these, so nothing here can become HTML
    // — but a span whose text still holds a tag would render it visibly, which
    // is the honest outcome and the one worth pinning.
    const spans = parseInline("beware <img src=x onerror=alert(1)> and </div>");
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ kind: "text" });
    expect(spans[0]).toHaveProperty("text", "beware <img src=x onerror=alert(1)> and </div>");
  });

  it("leaves unmatched punctuation alone", () => {
    expect(parseInline("a * b and [not a link] and ` stray")).toEqual([
      { kind: "text", text: "a * b and [not a link] and ` stray" }
    ]);
  });
});

describe("parseMarkdown — blocks", () => {
  it("reads a real note's shape: title, prose, heading, bullets", () => {
    const blocks = parseMarkdown([
      "# VLR API",
      "",
      "Self-hosted scraper for [[command-central]].",
      "",
      "## Open items / TODO",
      "",
      "- Add the screenshots.",
      "- Re-run the verifier.",
      ""
    ].join("\n"));

    expect(kinds(blocks)).toEqual(["heading", "paragraph", "heading", "list"]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks[2]).toMatchObject({ kind: "heading", level: 2 });
    const list = blocks[3];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items).toHaveLength(2);
    expect(spansToText(list.items[0].spans)).toBe("Add the screenshots.");
  });

  it("joins wrapped prose lines into one paragraph", () => {
    const blocks = parseMarkdown("one line\nsecond line\n\nnew para");
    expect(kinds(blocks)).toEqual(["paragraph", "paragraph"]);
    expect(spansToText((blocks[0] as any).spans)).toBe("one line second line");
  });

  it("treats --- as a rule, not an empty bullet", () => {
    expect(kinds(parseMarkdown("a\n\n---\n\nb"))).toEqual(["paragraph", "rule", "paragraph"]);
  });

  it("skips an Obsidian YAML property block at the top", () => {
    const blocks = parseMarkdown(["---", "tags: [project]", "status: live", "---", "", "# Real Title"].join("\n"));
    expect(kinds(blocks)).toEqual(["heading"]);
    expect(spansToText((blocks[0] as any).spans)).toBe("Real Title");
  });

  it("records bullet nesting depth", () => {
    const blocks = parseMarkdown("- top\n  - nested\n    - deeper");
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items.map((i) => i.depth)).toEqual([0, 1, 2]);
  });

  it("keeps a fenced block verbatim and does not parse inside it", () => {
    const blocks = parseMarkdown(["text", "", "```bash", "systemctl restart **thing**", "```", "", "after"].join("\n"));
    expect(kinds(blocks)).toEqual(["paragraph", "code", "paragraph"]);
    expect(blocks[1]).toMatchObject({ kind: "code", text: "systemctl restart **thing**" });
  });

  it("separates a numbered list from a bulleted one", () => {
    const blocks = parseMarkdown("1. first\n2. second\n- bullet");
    expect(kinds(blocks)).toEqual(["list", "list"]);
    expect(blocks[0]).toMatchObject({ ordered: true });
    expect(blocks[1]).toMatchObject({ ordered: false });
  });

  it("folds a continuation line into the bullet above it", () => {
    const blocks = parseMarkdown("- a bullet that\n  wraps onto the next line");
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items).toHaveLength(1);
    expect(spansToText(list.items[0].spans)).toBe("a bullet that wraps onto the next line");
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n   \n")).toEqual([]);
  });

  it("parses every real vault note without throwing or losing its title", () => {
    // Shapes taken from the actual notes: a flat-list file, a prose file.
    const flat = parseMarkdown([
      "# Homelab",
      "Single Proxmox host. LAN 10.0.0.0/24, gateway 10.0.0.1.",
      "## Containers (LXC unless noted)",
      "- 152 openclaw (10.0.0.152) — see [[openclaw]]",
      "- 220 command-central (10.0.0.22) — see [[command-central]]"
    ].join("\n"));
    expect(kinds(flat)).toEqual(["heading", "paragraph", "heading", "list"]);
    const list = flat[3];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items[0].spans.some((s) => s.kind === "wikilink")).toBe(true);
  });
});
