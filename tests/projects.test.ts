import { describe, expect, it } from "vitest";
import { summarizeProjects } from "@/lib/projects";

/**
 * The PROJECTS.md trim. ~15KB of markdown goes in; what comes out is the
 * per-project status lines, capped so the chat snapshot stays affordable.
 *
 * These assert the SHAPE of the trim — which paragraphs survive, where a cut
 * lands, that the cap holds — never the wording of any particular project,
 * which changes every time the file is edited on 152.
 */

const sentence = (n: number) => `${"word ".repeat(n).trim()}.`;

describe("summarizeProjects — what survives the trim", () => {
  it("keeps a project's heading and its status paragraph", () => {
    const out = summarizeProjects([
      "# PROJECTS",
      "This file describes the projects.",
      "",
      "## 1. vlr-api",
      "**Build status.** Phase 3 shipped; the cache landed last week.",
      ""
    ].join("\n"));

    expect(out).toContain("## 1. vlr-api".replace("1. ", ""));
    expect(out).toContain("Build status.");
    expect(out).toContain("Phase 3 shipped");
  });

  it("drops architecture prose in favour of the status paragraph", () => {
    const out = summarizeProjects([
      "## command-central",
      "**What it is.** A Next.js dashboard with a registry of widgets.",
      "**Data model.** Every route returns WidgetResponse<T>.",
      "**Phase status.** Phase 2 in progress.",
      ""
    ].join("\n"));

    expect(out).toContain("Phase 2 in progress");
    expect(out).not.toContain("Data model");
  });

  it("falls back to one line of prose for a section with nothing labelled", () => {
    const out = summarizeProjects([
      "## some-project",
      "It does a thing nobody has labelled with a status.",
      "A second paragraph that should not be kept.",
      ""
    ].join("\n"));

    expect(out).toContain("It does a thing");
    expect(out).not.toContain("second paragraph");
  });

  it("gives the document title no fallback — its preamble describes the file", () => {
    const out = summarizeProjects([
      "# PROJECTS",
      "This document tracks every project.",
      ""
    ].join("\n"));

    expect(out).toBe("");
  });

  it("keeps a bulleted section, which is already a summary", () => {
    const out = summarizeProjects([
      "## how these fit together",
      "- vlr-api feeds command-central.",
      "- Sol runs on 152.",
      ""
    ].join("\n"));

    expect(out).toContain("- vlr-api feeds command-central.");
    expect(out).toContain("- Sol runs on 152.");
  });

  it("drops fenced code blocks entirely", () => {
    const out = summarizeProjects([
      "## a-project",
      "**Status.** Running.",
      "```",
      "SECRET_TOKEN=hunter2",
      "```",
      ""
    ].join("\n"));

    expect(out).toContain("Running.");
    expect(out).not.toContain("hunter2");
  });

  it("returns an empty string for empty input rather than throwing", () => {
    expect(summarizeProjects("")).toBe("");
    expect(summarizeProjects("no headings here, just prose")).toBe("");
  });
});

describe("summarizeProjects — sentence-boundary clipping", () => {
  it("cuts a long status paragraph at a sentence boundary, not mid-sentence", () => {
    // Two long sentences: the first ends well past the halfway mark of the
    // per-paragraph budget, so the clip should drop the second whole.
    const first = `**Status.** ${sentence(70)}`;
    const second = `${"tail ".repeat(60).trim()}.`;
    const out = summarizeProjects(["## p", `${first} ${second}`, ""].join("\n"));
    const body = out.split("\n")[1].trim();

    // The whole first sentence is kept and the second dropped whole — never a
    // cut inside either. (Markdown emphasis is flattened out on the way.)
    expect(body.endsWith(".")).toBe(true);
    expect(body.endsWith("\u2026")).toBe(false);
    expect(body).toBe(first.replace(/\*+/g, ""));
    expect(body).not.toContain("tail");
  });

  it("falls back to a whole-word cut with an ellipsis when there is no boundary to use", () => {
    // One unbroken sentence longer than the budget: there is no ". " to cut at,
    // so the clip must still not split a word.
    const out = summarizeProjects(["## p", `**Status.** ${"alpha ".repeat(200)}omega.`, ""].join("\n"));
    const body = out.split("\n")[1].trim();

    expect(body.endsWith("…")).toBe(true);
    expect(body.replace(/…$/, "").endsWith("alpha")).toBe(true);
  });

  it("leaves a status paragraph under the budget untouched", () => {
    const text = "Phase 3 shipped. Remaining: docs, then the release note.";
    const out = summarizeProjects(["## p", `**Status.** ${text}`, ""].join("\n"));

    expect(out.split("\n")[1].trim()).toBe(`Status. ${text}`);
  });
});

describe("summarizeProjects — the overall cap", () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    [`## project-${i}`, `**Status.** ${sentence(30)}`, ""].join("\n")
  ).join("\n");

  it("passes a summary already under the cap through without a truncation marker", () => {
    const out = summarizeProjects(["## p", "**Status.** Phase 3 shipped.", ""].join("\n"));

    expect(out).not.toContain("truncated");
    expect(out.length).toBeLessThan(3000);
  });

  it("caps the content at the requested budget and says it truncated", () => {
    const cap = 1000;
    const out = summarizeProjects(many, cap);
    const [content, marker] = out.split("\n  … (truncated");

    expect(marker).toBeDefined();
    expect(content.length).toBeLessThanOrEqual(cap);
  });

  it("honours the default ~3000 char budget", () => {
    const out = summarizeProjects(many);
    const content = out.split("\n  … (truncated")[0];

    expect(content.length).toBeLessThanOrEqual(3000);
  });

  it("cuts at a whole word, never mid-word, when the cap bites", () => {
    const cap = 1000;
    const full = summarizeProjects(many, Number.MAX_SAFE_INTEGER);
    const content = summarizeProjects(many, cap).split("\n  … (truncated")[0];

    // The kept text is a real prefix of the untruncated summary, and the very
    // next character in that summary is whitespace — i.e. a word ended here.
    expect(full.startsWith(content)).toBe(true);
    expect(full.slice(content.length, content.length + 1)).toMatch(/\s/);
  });
});
