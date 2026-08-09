#!/usr/bin/env node
/**
 * Reference Screenshot Generator & Web Recon Capture Tool.
 * Captures live screenshots from URLs or renders HTML UI templates into synthetic reference screenshots.
 *
 * Usage:
 *   # Live URL capture:
 *   node scripts/screenshot.mjs --url=https://example.com --out=recon/screenshots/01-hero.png [--width=1920] [--height=1080] [--selector=".hero-card"]
 *
 *   # Synthetic HTML template capture:
 *   node scripts/screenshot.mjs --html=recon/templates/dashboard.html --out=recon/screenshots/02-dashboard.png [--scale=2]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf("=");
  return i === -1 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
}));

const url = args.url;
const html = args.html;
const out = args.out ?? "recon/screenshots/screenshot.png";
const width = Number(args.width ?? 1920);
const height = Number(args.height ?? 1080);
const scale = Number(args.scale ?? 2);
const selector = args.selector;
const fullPage = args.fullPage === "true" || args.fullPage === true;

if (!url && !html) {
  console.error("Either --url or --html argument is required.");
  process.exit(1);
}

mkdirSync(dirname(resolve(out)), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: scale
});

const targetUrl = url ? url : "file://" + resolve(html);
console.log(`📸 Capturing screenshot from: ${targetUrl}`);

await page.goto(targetUrl, { waitUntil: "networkidle" });
if (args.wait) {
  await page.waitForTimeout(Number(args.wait));
}

if (selector) {
  const element = await page.$(selector);
  if (element) {
    await element.screenshot({ path: out });
  } else {
    console.warn(`Selector "${selector}" not found, falling back to viewport screenshot.`);
    await page.screenshot({ path: out, fullPage });
  }
} else {
  await page.screenshot({ path: out, fullPage });
}

await browser.close();
console.log(`✨ Reference screenshot saved to: ${out}\n`);
