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

/**
 * A bot-wall is the single most dangerous Phase-0 failure: the capture
 * "succeeds" (exit 0, a real PNG, a cheerful log line) but the image is a
 * Cloudflare/Akamai interstitial. An agent that does not open the file then
 * invents a whole art direction from nothing. Detect it and fail loudly.
 */
const blockSignals = [
  /sorry, you have been blocked/i,
  /you are unable to access/i,
  /attention required/i,
  /checking your browser/i,
  /verify you are (a )?human/i,
  /access denied/i,
  /request blocked/i,
  /just a moment\.\.\./i,
];
const pageTitle = await page.title();
const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || "");
const hit = blockSignals.find(re => re.test(pageTitle) || re.test(bodyText));

if (hit && url) {
  await page.screenshot({ path: out });   // keep it for inspection
  await browser.close();
  console.error(
    `\n❌ BOT WALL — this is NOT usable recon.\n` +
    `   Page title: ${JSON.stringify(pageTitle)}\n` +
    `   Matched:    ${hit}\n` +
    `   Saved anyway for inspection: ${out}\n\n` +
    `   Plain headless Chromium is blocked on this host. Capture through an\n` +
    `   anti-detect browser instead — this repo runs a CloakBrowser manager:\n\n` +
    `     curl -s -X POST http://localhost:8080/api/profiles \\\n` +
    `       -H 'Content-Type: application/json' -d '{"name":"recon","platform":"windows"}'\n` +
    `     curl -s -X POST http://localhost:8080/api/profiles/<id>/launch\n` +
    `     # then connect Playwright over CDP:\n` +
    `     chromium.connectOverCDP('http://localhost:8080/api/profiles/<id>/cdp')\n\n` +
    `   No login is needed for a public marketing page — the fingerprint is\n` +
    `   what gets you through. Do NOT proceed to Phase 1 on a block page.\n`
  );
  process.exit(2);
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
