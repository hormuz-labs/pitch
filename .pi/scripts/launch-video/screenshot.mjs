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
 *
 *   # Layers for a parallax ui-frame: a base plate plus each floating piece
 *   # (modal, sticky header, sidebar…) on transparency, with a .layers.json
 *   node scripts/screenshot.mjs --url=https://app.example.com --out=assets/harvested/app.png --layers=auto
 *   node scripts/screenshot.mjs --url=… --out=… --layers=".sidebar,[role=dialog]"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { AUTO_SELECTOR, layersSnippet, planLayers } from "./lib/layers.mjs";

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

// A --html template is served into local Chromium from disk (see lib/browser.mjs).
const studio = await openStudioBrowser({
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
    `   This capture ran through the bundled Chromium and the site blocked it.\n` +
    `   Do NOT proceed to Phase 1 on a block page and do NOT install\n` +
    `   a browser — try a different authorized page on the same site or raise --wait.\n`
  );
  process.exit(2);
}

if (args.layers) {
  const spec = String(args.layers);
  const sels = spec === "auto" || spec === "true" ? null : spec.split(",").map(s => s.trim()).filter(Boolean);
  const cands = await page.evaluate(({ sels, auto }) => {
    const els = [];
    const seen = new Set();
    const add = (el) => { if (el && !seen.has(el)) { seen.add(el); els.push(el); } };
    if (sels) for (const s of sels) { try { document.querySelectorAll(s).forEach(add); } catch (_) {} }
    else {
      document.querySelectorAll(auto).forEach(add);
      for (const el of document.body.querySelectorAll("*")) {
        const pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky") add(el);
      }
    }
    els.forEach((el, i) => el.setAttribute("data-studio-layer", String(i)));
    return els.map((el, i) => {
      const r = el.getBoundingClientRect();
      const ancestors = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.hasAttribute("data-studio-layer")) ancestors.push(Number(p.getAttribute("data-studio-layer")));
      }
      return {
        i, rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        tag: el.tagName.toLowerCase(), id: el.id || "", cls: String(el.className || "").slice(0, 80),
        role: el.getAttribute("role") || "", position: getComputedStyle(el).position, ancestors,
      };
    });
  }, { sels, auto: AUTO_SELECTOR });
  const plan = planLayers(cands, { viewport: { w: width, h: height } });
  if (!plan.length) {
    console.warn(`⚠ --layers=${spec}: nothing worth a layer on this page (${cands.length} candidates, none big enough or all nested). Plain screenshot instead.`);
    await page.screenshot({ path: out, fullPage });
  } else {
    const cdp = await page.context().newCDPSession(page);
    const stem = out.replace(/\.png$/i, "");
    const setStyle = (css) => page.evaluate((c) => {
      let st = document.getElementById("__studio_layers");
      if (!st) { st = document.createElement("style"); st.id = "__studio_layers"; document.head.appendChild(st); }
      st.textContent = c;
    }, css);
    // Base plate: the page with the layers lifted off it.
    await setStyle(plan.map(p => `[data-studio-layer="${p.i}"]{visibility:hidden !important}`).join(""));
    await page.waitForTimeout(80);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
    // Each layer alone on transparency, cut to its own rect.
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const items = [];
    for (const [n, p] of plan.entries()) {
      await setStyle(
        `html,body{background:transparent !important}` +
        `body *{visibility:hidden !important}` +
        `[data-studio-layer="${p.i}"],[data-studio-layer="${p.i}"] *{visibility:visible !important}`,
      );
      await page.waitForTimeout(80);
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: false,
        clip: { x: p.rect.x, y: p.rect.y, width: p.rect.w, height: p.rect.h, scale },
      });
      const file = `${stem}.layer-${n + 1}.png`;
      writeFileSync(resolve(file), Buffer.from(data, "base64"));
      const hint = [p.tag, p.id && `#${p.id}`, p.cls && `.${p.cls.split(/\s+/)[0]}`, p.position !== "static" && p.position].filter(Boolean).join(" ");
      items.push({ src: file, x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h, depth: p.depth, hint });
      console.log(`   layer ${n + 1}: ${hint}  ${Math.round(p.rect.w)}×${Math.round(p.rect.h)} at ${Math.round(p.rect.x)},${Math.round(p.rect.y)}  depth ${p.depth}`);
    }
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", {});
    await setStyle("");
    const json = { w: width, h: height, base: out, items };
    writeFileSync(resolve(`${stem}.layers.json`), JSON.stringify(json, null, 2));
    console.log(`\n✨ Base plate ${out} + ${items.length} layer${items.length === 1 ? "" : "s"} → ${stem}.layers.json`);
    console.log(`   In the ui-frame shot (depth 2 = nearest; edit depths, drop layers you do not want):\n${layersSnippet(json)}`);
  }
} else if (selector) {
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
