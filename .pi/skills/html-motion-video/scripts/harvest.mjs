#!/usr/bin/env node
/**
 * harvest.mjs — pull the target site's OWN images, video posters, logos and
 * icons into the project, with a manifest that says where each one came from.
 *
 * Phase 0 asset capture. A launch film built entirely from grey placeholder
 * rectangles looks like a wireframe; the same film using the product's real
 * photography, real screens and real logomark looks like their own design team
 * made it. Those assets already exist on the page — take them.
 *
 * Usage (run from the project folder):
 *   node $SKILL/scripts/harvest.mjs --url=https://example.com
 *   node $SKILL/scripts/harvest.mjs --url=... --cdp=http://localhost:8080/api/profiles/<id>/cdp
 *   node $SKILL/scripts/harvest.mjs --url=... --min-px=320 --max=60
 *
 * Options:
 *   --url       page to harvest (required)
 *   --cdp       attach to an existing browser over CDP instead of launching
 *               headless Chromium. REQUIRED for bot-walled sites — same
 *               endpoint screenshot.mjs suggests when it detects a block page.
 *   --out       asset directory (default assets/harvested)
 *   --manifest  manifest path (default recon/harvested.json)
 *   --min-px    ignore images smaller than this on both axes (default 240)
 *   --max       max assets to download (default 48)
 *   --max-mb    skip any single asset larger than this (default 20)
 *   --no-scroll skip the lazy-load scroll pass
 *
 * RIGHTS: these are the product's own brand assets. Using them in a film about
 * that product is the intended case. They are NOT free-floating stock — never
 * carry them into a different product's video, and record provenance (this
 * script writes the source URL for every file).
 */
import { openStudioBrowser } from "./lib/browser.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf("=");
  return i === -1 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
}));

const url = args.url;
if (!url) { console.error("--url=<page> is required"); process.exit(1); }

const outDir = args.out ?? "assets/harvested";
const manifestPath = args.manifest ?? "recon/harvested.json";
const minPx = Number(args["min-px"] ?? 240);
const maxAssets = Number(args.max ?? 48);
// A launch film never needs an 80MB source file, and a page full of hero
// videos will happily fill a disk. Skip anything oversized and say so.
const maxBytes = Number(args["max-mb"] ?? 20) * 1e6;
const doScroll = !args["no-scroll"];

mkdirSync(resolve(outDir), { recursive: true });
mkdirSync(resolve(manifestPath, ".."), { recursive: true });

// ---------------------------------------------------------------------------
// The CloakBrowser by default — the logo and screens have to come off the real
// page, not off a bot wall.
const studio = await openStudioBrowser({
  cdp: args.cdp === true ? null : args.cdp,
  viewport: { width: 1920, height: 1080 },
});
const page = await studio.newPage();

console.log(`🔎 Harvesting ${url} (${studio.mode === "cdp" ? "CloakBrowser over CDP" : "local Chromium"})`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);

// Lazy-loaded media only exists after it scrolls into view.
if (doScroll) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const steps = Math.min(24, Math.max(4, Math.round(height / 900)));
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(y => window.scrollTo(0, y), Math.round((height * i) / steps));
    await page.waitForTimeout(650);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

// A block page has no assets worth taking — fail loudly rather than write junk.
const title = await page.title();
const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || "");
if (/sorry, you have been blocked|attention required|checking your browser|access denied|just a moment/i
      .test(`${title} ${bodyText}`)) {
  await studio.close();
  console.error(
    `\n❌ BOT WALL — nothing harvested.\n   Title: ${JSON.stringify(title)}\n` +
    `   Re-run with --cdp=<cloakbrowser CDP url> (see screenshot.mjs for the recipe).\n`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Collect candidates, with the section heading each one sits under — that
// context is what makes an asset usable ("the studio photo from Design Freely")
// rather than an anonymous file.
// ---------------------------------------------------------------------------
const candidates = await page.evaluate((minPxIn) => {
  const out = [];
  const seen = new Set();

  const sectionOf = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const h = n.querySelector?.("h1,h2,h3");
      if (h?.innerText?.trim()) return h.innerText.trim().slice(0, 80);
      n = n.parentElement;
    }
    return null;
  };

  const push = (o) => {
    if (!o.src || o.src.startsWith("blob:")) return;
    if (o.src.startsWith("data:") && o.src.length < 2048) return;
    const key = o.src.slice(0, 300);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };

  // <img>, choosing the largest srcset candidate
  for (const img of document.querySelectorAll("img")) {
    const r = img.getBoundingClientRect();
    let best = img.currentSrc || img.src;
    if (img.srcset) {
      const parsed = img.srcset.split(",").map(s => s.trim()).map(s => {
        const [u, d] = s.split(/\s+/);
        return { u, w: d && d.endsWith("w") ? parseInt(d) : 0 };
      }).filter(x => x.u);
      if (parsed.length) {
        parsed.sort((a, b) => b.w - a.w);
        best = new URL(parsed[0].u, location.href).href;
      }
    }
    const w = img.naturalWidth || r.width;
    const h = img.naturalHeight || r.height;
    if (w < minPxIn && h < minPxIn) continue;
    push({
      kind: "image", src: best, natW: img.naturalWidth, natH: img.naturalHeight,
      renderW: Math.round(r.width), renderH: Math.round(r.height),
      alt: (img.alt || "").slice(0, 120), section: sectionOf(img),
    });
  }

  // CSS background images on reasonably large boxes
  for (const el of document.querySelectorAll("*")) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none" || !/url\(/.test(bg)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < minPxIn || r.height < minPxIn) continue;
    const m = bg.match(/url\(["']?(.*?)["']?\)/);
    if (!m) continue;
    push({
      kind: "background", src: new URL(m[1], location.href).href,
      renderW: Math.round(r.width), renderH: Math.round(r.height),
      section: sectionOf(el),
    });
  }

  // <video> — real sources plus poster frames
  for (const v of document.querySelectorAll("video")) {
    const r = v.getBoundingClientRect();
    const srcs = [v.currentSrc, v.src, ...[...v.querySelectorAll("source")].map(s => s.src)]
      .filter(Boolean);
    for (const s of srcs) {
      push({
        kind: "video", src: new URL(s, location.href).href,
        renderW: Math.round(r.width), renderH: Math.round(r.height),
        section: sectionOf(v),
      });
    }
    if (v.poster) {
      push({
        kind: "poster", src: new URL(v.poster, location.href).href,
        renderW: Math.round(r.width), renderH: Math.round(r.height),
        section: sectionOf(v),
      });
    }
  }

  // Third-party players (Wistia/YouTube/Vimeo) cannot be downloaded directly —
  // record them so the agent knows video exists and can ask or screen-grab.
  const embeds = [];
  for (const f of document.querySelectorAll("iframe")) {
    const s = f.src || "";
    if (/wistia|youtube|vimeo|loom|mux/i.test(s)) {
      const r = f.getBoundingClientRect();
      embeds.push({ src: s, provider: (s.match(/wistia|youtube|vimeo|loom|mux/i) || [])[0],
        renderW: Math.round(r.width), renderH: Math.round(r.height), section: sectionOf(f) });
    }
  }

  // Inline SVG — this is how logomarks usually ship. Serialize them directly.
  const svgs = [];
  for (const svg of document.querySelectorAll("svg")) {
    const r = svg.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) continue;
    const html = svg.outerHTML;
    if (html.length > 60000) continue;
    const cls = (svg.getAttribute("class") || "") + " " +
      (typeof svg.closest("a,header")?.className === "string" ? svg.closest("a,header").className : "");
    // "It's in the header" is far too loose on its own — nav chevrons and
    // caret icons are 200-byte paths that live in headers too. Require either
    // an explicit brand class, or real path complexity plus a wordmark-ish
    // aspect ratio.
    const named = /logo|brand|wordmark/i.test(cls);
    const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const aspect = vb.length === 4 && vb[3] ? vb[2] / vb[3] : r.height ? r.width / r.height : 1;
    const complex = html.length > 1200;
    svgs.push({
      markup: html,
      renderW: Math.round(r.width), renderH: Math.round(r.height),
      logoish: named || (complex && aspect >= 1.8 && !!svg.closest("header,nav,footer,a")),
      section: sectionOf(svg),
    });
  }

  const meta = {};
  for (const [k, sel] of Object.entries({
    ogImage: 'meta[property="og:image"]',
    ogVideo: 'meta[property="og:video"]',
    icon: 'link[rel~="icon"]',
    appleIcon: 'link[rel="apple-touch-icon"]',
  })) {
    const el = document.querySelector(sel);
    const v = el?.content || el?.href;
    if (v) meta[k] = new URL(v, location.href).href;
  }

  return { assets: out, svgs, embeds, meta };
}, minPx);

for (const [k, v] of Object.entries(candidates.meta)) {
  candidates.assets.push({ kind: k === "ogVideo" ? "video" : "image", src: v, section: `meta:${k}` });
}

console.log(`   found ${candidates.assets.length} media candidates, ` +
  `${candidates.svgs.length} inline svg, ${candidates.embeds.length} third-party embeds`);

// ---------------------------------------------------------------------------
// Download. page.request inherits the page's cookies and headers, which is what
// stops a CDN from 403-ing a bare fetch.
// ---------------------------------------------------------------------------
const extFor = (ct, src) => {
  const fromUrl = extname(new URL(src, url).pathname).split("?")[0];
  if (fromUrl && fromUrl.length <= 5) return fromUrl;
  if (/png/.test(ct)) return ".png";
  if (/jpe?g/.test(ct)) return ".jpg";
  if (/webp/.test(ct)) return ".webp";
  if (/avif/.test(ct)) return ".avif";
  if (/gif/.test(ct)) return ".gif";
  if (/svg/.test(ct)) return ".svg";
  if (/mp4/.test(ct)) return ".mp4";
  if (/webm/.test(ct)) return ".webm";
  return ".bin";
};

async function probe(file) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name",
      "-show_entries", "format=duration",
      "-of", "default=nw=1", file,
    ], { timeout: 20000 });
    const g = k => (stdout.match(new RegExp(`${k}=([^\\n]+)`)) || [])[1];
    return {
      width: Number(g("width")) || null,
      height: Number(g("height")) || null,
      codec: g("codec_name") || null,
      duration: g("duration") ? Number(g("duration")) : null,
    };
  } catch { return {}; }
}

const saved = [];
const hashes = new Set();
let n = 0;

for (const c of candidates.assets) {
  if (saved.length >= maxAssets) break;
  n++;
  try {
    // Check the size before pulling the bytes down.
    try {
      const head = await page.request.fetch(c.src, { method: "HEAD", timeout: 20000 });
      const len = Number(head.headers()["content-length"] || 0);
      if (len > maxBytes) {
        console.log(`   ⊘ ${(len / 1e6).toFixed(0)}MB (over --max-mb) ${c.src.split("/").pop().slice(0, 60)}`);
        continue;
      }
    } catch { /* no HEAD support — fall through and size-check the body */ }

    const res = await page.request.get(c.src, { timeout: 45000 });
    if (!res.ok()) { console.log(`   ✗ ${res.status()} ${c.src.slice(0, 90)}`); continue; }
    const buf = await res.body();
    if (buf.length > maxBytes) {
      console.log(`   ⊘ ${(buf.length / 1e6).toFixed(0)}MB (over --max-mb) ${c.src.split("/").pop().slice(0, 60)}`);
      continue;
    }
    if (buf.length < 1500) continue;                     // tracking pixels, spacers

    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 10);
    if (hashes.has(hash)) continue;                      // same bytes, different URL
    hashes.add(hash);

    const ct = (res.headers()["content-type"] || "").toLowerCase();
    const base = `${String(saved.length + 1).padStart(2, "0")}-${c.kind}-${hash}`;
    const file = join(outDir, base + extFor(ct, c.src));
    writeFileSync(resolve(file), buf);

    const meta = await probe(resolve(file));
    // Drop anything that turned out to be tiny once decoded.
    if (meta.width && meta.height && meta.width < minPx && meta.height < minPx && c.kind !== "image") {
      continue;
    }
    saved.push({
      file, kind: c.kind, source: c.src, bytes: buf.length, contentType: ct,
      width: meta.width ?? c.natW ?? null, height: meta.height ?? c.natH ?? null,
      duration: meta.duration ?? null, codec: meta.codec ?? null,
      renderedAt: c.renderW && c.renderH ? `${c.renderW}x${c.renderH}` : null,
      alt: c.alt || null, section: c.section || null,
    });
    console.log(`   ✓ ${file}  ${meta.width ?? "?"}x${meta.height ?? "?"}` +
      (meta.duration ? ` ${meta.duration.toFixed(1)}s` : "") +
      (c.section ? `  « ${c.section}` : ""));
  } catch (e) {
    console.log(`   ✗ ${c.src.slice(0, 90)} — ${e.message.slice(0, 60)}`);
  }
}

// Inline SVGs (logomarks) — written verbatim, never redrawn by hand.
const svgFiles = [];
const logoSvgs = candidates.svgs.filter(s => s.logoish).slice(0, 6);
const otherSvgs = candidates.svgs.filter(s => !s.logoish).slice(0, 10);
for (const [i, s] of [...logoSvgs, ...otherSvgs].entries()) {
  const hash = createHash("sha1").update(s.markup).digest("hex").slice(0, 8);
  const file = join(outDir, `svg-${s.logoish ? "logo" : "icon"}-${i + 1}-${hash}.svg`);
  writeFileSync(resolve(file), s.markup);
  svgFiles.push({ file, logoish: s.logoish, size: `${s.renderW}x${s.renderH}`, section: s.section });
}
if (svgFiles.length) console.log(`   ✓ ${svgFiles.length} svg written (${logoSvgs.length} look like logomarks)`);

const manifest = {
  harvested: new Date().toISOString(),
  url,
  note: "The product's OWN brand assets. Use them in a film about THIS product only; " +
        "never carry them into another product's video. Provenance is the `source` field.",
  counts: { media: saved.length, svg: svgFiles.length, embeds: candidates.embeds.length },
  media: saved,
  svg: svgFiles,
  thirdPartyEmbeds: candidates.embeds,
};
writeFileSync(resolve(manifestPath), JSON.stringify(manifest, null, 2));

await studio.close();

console.log(`\n✨ ${saved.length} media + ${svgFiles.length} svg → ${outDir}`);
console.log(`   manifest: ${manifestPath}`);
if (candidates.embeds.length) {
  console.log(`\n⚠ ${candidates.embeds.length} third-party video embed(s) found and NOT downloaded:`);
  for (const e of candidates.embeds) {
    console.log(`   ${e.provider} ${e.renderW}x${e.renderH}${e.section ? `  « ${e.section}` : ""}`);
  }
  console.log(`   These are players, not files. To use their content, screen-capture the`);
  console.log(`   playing embed via CDP, or ask the user for the source file.`);
}
