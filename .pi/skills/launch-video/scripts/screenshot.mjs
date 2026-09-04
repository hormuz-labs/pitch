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
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";

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

// The CloakBrowser: it is the one that gets past bot walls, and a --html
// template is served into it from disk (see lib/browser.mjs).
const studio = await openStudioBrowser({
  cdp: args.cdp === true ? null : args.cdp,
  viewport: { width, height },
  deviceScaleFactor: scale,
});
const page = await studio.newPage();

const targetUrl = url ? String(url) : localPageUrl(html);
console.log(`📸 Capturing screenshot from: ${targetUrl}`);

// "load", then a bounded wait for the network to settle: a real product site
// with analytics beacons or a long-poll never reaches networkidle, and a
// screenshot that times out on that is a screenshot of nothing.
try {
  await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });
} catch (err) {
  console.error(`❌ could not load ${targetUrl}: ${err.message.split("\n")[0]}`);
  await studio.close().catch(() => {});
  process.exit(1);
}
await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(Number(args.wait) || 800);

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
  await studio.close();
  console.error(
    `\n❌ BOT WALL — this is NOT usable recon.\n` +
    `   Page title: ${JSON.stringify(pageTitle)}\n` +
    `   Matched:    ${hit}\n` +
    `   Saved anyway for inspection: ${out}\n\n` +
    `   This capture already ran through ${studio.mode === "cdp" ? "the CloakBrowser" : "a local Chromium"}, and the site still\n` +
    `   blocked it. Do NOT proceed to Phase 1 on a block page and do NOT install\n` +
    `   a browser — try a different page on the same site, raise --wait, or pass\n` +
    `   --cdp=<endpoint> for a profile that is signed in.\n`
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

await studio.close();
console.log(`✨ Reference screenshot saved to: ${out}\n`);
