#!/usr/bin/env node
/**
 * Visual self-test for Command Central.
 *
 * Drives the RUNNING service with headless Chromium and captures the states
 * that are impossible to verify from markup alone. Re-runnable:
 *
 *     node scripts/shoot.mjs
 *     node scripts/shoot.mjs --url http://localhost:3001 --out /tmp/shots
 *
 * Dev tool only — never imported by the app, never part of the build.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const URL = argOf("--url", "http://localhost:3000");
const OUT = argOf("--out", "/home/builder/shots");
// Seconds to sit on the page before capturing. The rolling history graphs
// need several 15s polls before they have anything to draw, so a fresh load
// always shows "collecting samples".
const DWELL = Number(argOf("--dwell", "0"));
const VIEWPORT = { width: 1920, height: 1080 };

const saved = [];
const skipped = [];

async function shoot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: file, ...opts });
    saved.push(file);
    return file;
  } catch (err) {
    skipped.push(`${name}: ${err.message.split("\n")[0]}`);
    return null;
  }
}

/** Element close-up. Playwright scrolls the element into view itself, which
 *  page-level clip rects do not — below-the-fold clips just fail. */
async function shootEl(locator, name) {
  const file = path.join(OUT, `${name}.png`);
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
    await locator.screenshot({ path: file });
    saved.push(file);
    return file;
  } catch (err) {
    skipped.push(`${name}: ${err.message.split("\n")[0]}`);
    return null;
  }
}

/** Wait for real telemetry, not a fixed sleep: container rows only exist
 *  once the client's first homelab fetch has resolved. */
async function waitForCockpit(page) {
  await page.waitForSelector("#sol-core", { timeout: 20000 });
  await page.waitForSelector("[aria-expanded]", { timeout: 30000 });
  await page.waitForSelector(".command-bar", { timeout: 10000 });
}

/** Skip the boot overlay if it's still playing. */
async function clearBoot(page) {
  const overlay = page.locator(".boot-overlay");
  if (await overlay.count()) {
    await page.mouse.click(10, 10).catch(() => {});
    await overlay.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await mkdir(OUT, { recursive: true });

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

// --- 0. boot sequence, caught while it plays -------------------------------
const bootShot = await page.locator(".boot-overlay").count();
if (bootShot) await shoot(page, "00-boot-sequence");
await clearBoot(page);
await waitForCockpit(page);
await page.waitForTimeout(1200); // let power-on stagger settle

if (DWELL > 0) {
  console.log(`  dwelling ${DWELL}s so history graphs accumulate samples…`);
  await page.waitForTimeout(DWELL * 1000);
}

// --- 1. default cockpit ----------------------------------------------------
await shoot(page, "01-cockpit-viewport");
await shoot(page, "01b-cockpit-fullpage", { fullPage: true });
await shootEl(page.locator(".hud-panel").first(), "01c-node-panel");

// --- 1d. esports band ------------------------------------------------------
if (await page.locator("#section-esports").count()) {
  await shootEl(page.locator("#section-esports"), "01d-esports-section");
}

// --- 2. expanded container row --------------------------------------------
const rows = page.locator("[aria-expanded]");
const rowCount = await rows.count();
console.log(`  container rows: ${rowCount}`);
if (rowCount > 0) {
  // Pick a running LXC with real detail (first row is vmid 100).
  await rows.first().click();
  await page.waitForSelector(".row-detail", { timeout: 15000 });
  // Detail grid needs the 30s heavy route; give it a beat to populate.
  await page.waitForFunction(
    () => !document.querySelector(".row-detail")?.textContent?.includes("Loading detail"),
    { timeout: 40000 }
  ).catch(() => console.log("  ! detail still loading at timeout"));
  await page.waitForTimeout(400);
  await shoot(page, "02-row-expanded");
  // The containers panel, so the expanded row is readable in context.
  await shootEl(page.locator(".row-detail").first(), "02b-row-detail-closeup");
  await shootEl(
    page.locator(".row-detail").first().locator("xpath=ancestor::div[contains(@class,'hud-panel')][1]"),
    "02c-containers-panel"
  );
}

// --- 3. assistant mid-reply: the orb lifecycle -----------------------------
// Burst-capture across the round trip so motion is provable from stills.
const orb = page.locator(".sol-orb");
const backendClaude = page.locator(".backend-opt", { hasText: "Claude" });
if (await backendClaude.count()) await backendClaude.first().click();

await shootEl(orb, "03a-orb-idle");
const idleState = await orb.getAttribute("data-state");

const input = page.locator('input[placeholder="> query sol"]');
await input.fill(
  "In about six sentences, describe what a Proxmox homelab is and why someone would run one at home."
);
await page.locator("button[aria-label='Send']").click();

// Sample state + a rotating element's transform across the whole turn.
const timeline = [];
const probe = async (label) => {
  const state = await orb.getAttribute("data-state");
  const matrix = await page.evaluate(() => {
    const el = document.querySelector(".orb-spin");
    return el ? getComputedStyle(el).transform : null;
  });
  timeline.push({ label, state, matrix });
  return state;
};

let speakingShot = false;
for (let i = 0; i < 40; i++) {
  const state = await probe(`t+${(i * 0.4).toFixed(1)}s`);
  if (state === "thinking" && !timeline.some((t) => t.shot === "thinking")) {
    await shootEl(orb, "03b-orb-thinking");
    timeline[timeline.length - 1].shot = "thinking";
    // Second frame a beat later: proves the rings are advancing, not frozen.
    await page.waitForTimeout(500);
    await shootEl(orb, "03b2-orb-thinking-later");
  }
  if (state === "speaking" && !speakingShot) {
    await shootEl(orb, "03c-orb-speaking");
    await shoot(page, "03d-console-reply");
    speakingShot = true;
  }
  if (speakingShot && state === "idle") break;
  await page.waitForTimeout(400);
}
await shootEl(orb, "03e-orb-after");

// --- 3f. precise state timing (no screenshots) -----------------------------
// Screenshots take real time, so the burst loop above can only bracket a
// transition. This pass polls at 100ms with nothing else running, which is
// the only way to get trustworthy durations for each orb state.
const durations = [];
{
  // Mute first: with voice on, "thinking" also covers Piper synthesis, which
  // makes this a TTS benchmark rather than an orb-lifecycle measurement.
  const voiceBtn = page.locator(".voice-toggle");
  if (await voiceBtn.count()) {
    const on = await voiceBtn.getAttribute("aria-pressed");
    if (on === "true") await voiceBtn.click();
  }
  await input.fill("In two sentences, what is a hypervisor?");
  await page.locator("button[aria-label='Send']").click();
  const t0 = Date.now();
  let last = null;
  let lastAt = t0;
  for (let i = 0; i < 400; i++) {
    const s = await orb.getAttribute("data-state");
    if (s !== last) {
      const now = Date.now();
      if (last !== null) durations.push({ state: last, ms: now - lastAt });
      last = s;
      lastAt = now;
    }
    if (s === "idle" && durations.length >= 2) break;
    await page.waitForTimeout(100);
  }
}

// --- 4. command bar close-up ----------------------------------------------
await shootEl(page.locator(".command-bar"), "04-command-bar");
await shootEl(page.locator(".core-console"), "04b-core-console");

// --- 5. narrow viewport: does anything overflow? ---------------------------
await page.setViewportSize({ width: 900, height: 1000 });
await page.waitForTimeout(600);
await shoot(page, "05-narrow-900");
const overflow = await page.evaluate(() => ({
  docWidth: document.documentElement.scrollWidth,
  winWidth: window.innerWidth
}));

// --- report ----------------------------------------------------------------
const states = [...new Set(timeline.map((t) => t.state))];
const matrices = [...new Set(timeline.map((t) => t.matrix))];
const report = {
  url: URL,
  idleState,
  orbStatesObserved: states,
  distinctRotationMatrices: matrices.length,
  timeline,
  measuredDurations: durations,
  horizontalOverflowAt900: overflow.docWidth > overflow.winWidth,
  overflow,
  consoleErrors: errors
};
await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

console.log("\n--- orb lifecycle ---");
console.log("states observed :", states.join(" → "));
console.log("distinct rotation matrices:", matrices.length, "(>1 means it is actually rotating)");
console.log("measured durations (100ms poll, no screenshots):");
durations.forEach((d) => console.log(`  ${d.state.padEnd(9)} ${d.ms} ms`));
console.log("\n--- layout ---");
console.log(`h-overflow @900px: ${report.horizontalOverflowAt900} (doc ${overflow.docWidth} vs win ${overflow.winWidth})`);
console.log("console errors  :", errors.length ? errors.slice(0, 5) : "none");
if (skipped.length) {
  console.log("\n--- skipped captures ---");
  skipped.forEach((s) => console.log(" !", s));
}
console.log("\n--- saved ---");
saved.forEach((f) => console.log(f));
console.log(path.join(OUT, "report.json"));

await browser.close();
