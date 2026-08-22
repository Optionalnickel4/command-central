import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:3000/media";
const out = process.argv[3] || "/tmp/media.png";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // let boot gate release + first poll land
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("shot ->", out);
