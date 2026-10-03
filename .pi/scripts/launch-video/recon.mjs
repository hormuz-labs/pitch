#!/usr/bin/env node
/**
 * recon.mjs — measure a product site's brand tokens from the live DOM.
 *
 * Phase 0.1 / 0.3 / 0.4 in one pass. The agent's own shell has no browser and
 * no network, so this runs on the host and writes what the skill asks the
 * agent to "measure, never guess":
 *
 *   recon/brand-tokens.md    human-readable, cited by direction.md
 *   recon/brand-tokens.json  the same numbers for scripts
 *   assets/fonts/*.woff2     the brand's own web fonts (self-hosted for
 *                            deterministic renders) + a brand.fonts snippet
 *
 * Measured: body background/ink/font, every --custom-property on :root, the
 * headline and body type (family, weight, size, tracking), the primary CTA's
 * computed styles, surfaces ranked by area, saturated colors ranked by use,
 * <meta theme-color>, and the page copy (title, description, headings, CTA
 * labels, nav, first paragraphs) so the agent can write direction.md from
 * the product's own words.
 *
 * Usage (run from the project folder):
 *   node $SKILL/scripts/recon.mjs --url=https://example.com
 *   node $SKILL/scripts/recon.mjs --url=... --out=recon/brand-tokens.md --fonts=assets/fonts
 *   node $SKILL/scripts/recon.mjs --url=... --no-fonts
 *   node $SKILL/scripts/recon.mjs --url=https://example.com
 */
import { openWebBrowser, settle } from "./lib/browser.mjs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  return i === -1 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
}));

const url = args.url;
if (!url || !/^https?:\/\//i.test(String(url))) {
  console.error("Usage: recon.mjs --url=https://... [--out=recon/brand-tokens.md] [--fonts=assets/fonts|--no-fonts] [--logo=assets/logo|--no-logo]");
  process.exit(1);
}
const out = String(args.out ?? "recon/brand-tokens.md");
const jsonOut = out.replace(/\.md$/, "") + ".json";
const fontsDir = args["no-fonts"] ? null : String(args.fonts ?? "assets/fonts");
const logoDir = args["no-logo"] ? null : String(args.logo ?? "assets/logo");
const width = Number(args.width ?? 1440);
const height = Number(args.height ?? 900);
const waitMs = Number(args.wait ?? 1500);
const MAX_FONT_FILES = 8;
const MAX_FONT_BYTES = 2.5e6;

// ---- color helpers (node side) --------------------------------------------
function parseRgb(s) {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(s || "");
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
}
function hex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function hsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
function lum({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const toHex = (s) => { const c = parseRgb(s); return c && c.a > 0.05 ? hex(c) : null; };

// ---- browser ----------------------------------------------------------------
const studio = await openWebBrowser({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const context = studio.context;
const page = await context.newPage();

// Every font file the page pulls, so Google Fonts / CDN faces are known
// even when their stylesheet is cross-origin and hidden from CSSOM.
const fontResponses = new Map();
page.on("response", async (res) => {
  try {
    const u = res.url();
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!/font|application\/octet-stream/.test(ct) && !/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) return;
    if (!/\.(woff2?|ttf|otf)(\?|$)/i.test(u) && !/font/.test(ct)) return;
    const body = await res.body().catch(() => null);
    if (body && body.length > 800) fontResponses.set(u, { bytes: body.length, body, contentType: ct });
  } catch (_) {}
});

console.log(`🔎 Measuring ${url}`);
try {
  await page.goto(String(url), { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (err) {
  console.error(`❌ Could not open ${url}: ${String(err?.message ?? err).split("\n")[0]}`);
  await studio.close();
  process.exit(2);
}
await settle(page, 15000);
await page.waitForTimeout(waitMs);
await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});

const bodyText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 4000)).catch(() => "");
const title0 = await page.title().catch(() => "");
if (/sorry, you have been blocked|attention required|checking your browser|access denied|just a moment|verify you are human/i
  .test(`${title0}\n${bodyText.slice(0, 600)}`)) {
  console.error(
    `❌ Bot wall at ${url} ("${title0}"): the site refused the browser.`,
  );
  await studio.close();
  process.exit(2);
}

// ---- in-page measurement ------------------------------------------------------
const data = await page.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = cs(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const firstFamily = (ff) => (ff || "").split(",")[0].replace(/["']/g, "").trim();

  // :root custom properties, from every same-origin stylesheet + inline.
  const vars = {};
  const faces = [];
  const opaqueSheets = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch (_) { if (sheet.href) opaqueSheets.push(sheet.href); continue; }
    if (!rules) continue;
    const walk = (list) => {
      for (const r of Array.from(list)) {
        if (r.type === 1 && /(^|,)\s*(:root|html|body)\s*(,|$)/.test(r.selectorText || "")) {
          for (const name of Array.from(r.style)) {
            if (name.startsWith("--")) vars[name] = r.style.getPropertyValue(name).trim();
          }
        } else if (r.type === 5) {
          faces.push({
            family: firstFamily(r.style.getPropertyValue("font-family")),
            weight: r.style.getPropertyValue("font-weight") || "400",
            style: r.style.getPropertyValue("font-style") || "normal",
            src: r.style.getPropertyValue("src"),
            unicodeRange: r.style.getPropertyValue("unicode-range") || "",
            base: (r.parentStyleSheet && r.parentStyleSheet.href) || location.href,
          });
        } else if (r.cssRules && r.type !== 5) {
          walk(r.cssRules);
        }
      }
    };
    walk(rules);
  }
  for (const name of Array.from(document.documentElement.style)) {
    if (name.startsWith("--")) vars[name] = document.documentElement.style.getPropertyValue(name).trim();
  }

  const body = cs(document.body);
  const html = cs(document.documentElement);
  const pickType = (el) => {
    if (!el) return null;
    const s = cs(el);
    return {
      text: txt(el).slice(0, 120),
      family: s.fontFamily,
      weight: s.fontWeight,
      size: s.fontSize,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      transform: s.textTransform,
      color: s.color,
    };
  };
  const firstVisible = (sel) => Array.from(document.querySelectorAll(sel)).find(visible) || null;
  const h1 = firstVisible("h1");
  const h2 = firstVisible("h2");
  const h3 = firstVisible("h3");
  // Body copy sample: the longest visible paragraph near the top.
  const paras = Array.from(document.querySelectorAll("p, li"))
    .filter((p) => visible(p) && txt(p).length > 40)
    .slice(0, 60);
  const bodySample = paras.sort((a, b) => txt(b).length - txt(a).length)[0] || null;
  const navLink = firstVisible("nav a, header a");

  // Primary CTA.
  const CTA_RE = /get started|start (free|now|building|for free|your)|sign ?up|try (it|for|free|now)|download|book a demo|get a demo|request|join|install|start free|buy|subscribe|create (an )?account|launch|get (the )?app|app store|google play|get access/i;
  const CTA_SECONDARY_RE = /contact sales|learn more|talk to|watch|docs|log ?in|sign ?in|pricing/i;
  const chromaOf = (rgb) => {
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(rgb || "");
    if (!m) return 0;
    const v = [+m[1], +m[2], +m[3]].map((x) => x / 255);
    return Math.max(...v) - Math.min(...v);
  };
  const candidates = Array.from(document.querySelectorAll("a, button, [role=button]"))
    .filter(visible)
    .map((el) => {
      const t = txt(el);
      if (t.length < 2 || t.length > 40) return null;
      const s = cs(el);
      const r = el.getBoundingClientRect();
      const bg = s.backgroundColor;
      const hasBg = bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(bg);
      const hasImg = s.backgroundImage && s.backgroundImage !== "none";
      let score = 0;
      if (CTA_RE.test(t)) score += 3;
      else if (CTA_SECONDARY_RE.test(t)) score += 1;
      if (hasBg || hasImg) score += 2;
      if (hasBg && chromaOf(bg) > 0.25) score += 2;
      if (r.top < 900) score += 1;
      if (parseFloat(s.borderRadius) > 4) score += 0.5;
      if (parseFloat(s.paddingLeft) > 12) score += 0.5;
      if (el.closest("header, nav")) score += 0.5;
      return {
        score, text: t, tag: el.tagName.toLowerCase(), href: el.getAttribute("href") || "",
        bg, backgroundImage: s.backgroundImage, color: s.color, radius: s.borderRadius,
        shadow: s.boxShadow, border: s.border, weight: s.fontWeight, size: s.fontSize,
        family: s.fontFamily, padding: s.padding, letterSpacing: s.letterSpacing,
        transform: s.textTransform, top: Math.round(r.top),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const cta = candidates[0] || null;
  const ctaLabels = [...new Set(candidates.filter((c) => c.score >= 3).map((c) => c.text))].slice(0, 8);

  // Color census: surfaces by area, saturated colors by use.
  const surfaces = new Map();
  const uses = new Map();
  const all = Array.from(document.querySelectorAll("body *")).slice(0, 5000);
  const bump = (map, key, kind, amount) => {
    if (!key) return;
    const e = map.get(key) || { bg: 0, text: 0, border: 0, area: 0 };
    e[kind] += amount;
    map.set(key, e);
  };
  for (const el of all) {
    if (!visible(el)) continue;
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const area = Math.min(r.width * r.height, 1440 * 900);
    const bg = s.backgroundColor;
    if (bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(bg)) {
      bump(surfaces, bg, "area", area);
      bump(uses, bg, "bg", 1);
    }
    if (txt(el) && el.children.length === 0) bump(uses, s.color, "text", 1);
    const bc = s.borderTopColor;
    if (parseFloat(s.borderTopWidth) > 0 && bc && !/rgba\(\s*0,\s*0,\s*0,\s*0\)/.test(bc)) bump(uses, bc, "border", 1);
    const bi = s.backgroundImage;
    if (bi && bi !== "none" && /gradient/.test(bi)) {
      const e = uses.get("__gradients") || { list: [] };
      if (e.list.length < 6 && !e.list.includes(bi)) e.list.push(bi);
      uses.set("__gradients", e);
    }
  }
  const gradients = (uses.get("__gradients") || { list: [] }).list;
  uses.delete("__gradients");

  // Copy.
  const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content") || "";
  const heads = (sel, max) => [...new Set(Array.from(document.querySelectorAll(sel)).filter(visible).map(txt).filter((t) => t.length > 1))].slice(0, max);
  const navLabels = [...new Set(Array.from(document.querySelectorAll("nav a, header a")).filter(visible).map(txt).filter((t) => t && t.length < 32))].slice(0, 14);
  const paragraphs = [...new Set(paras.map(txt))].slice(0, 8).map((t) => t.slice(0, 260));
  const loadedFonts = [];
  try {
    document.fonts.forEach((f) => { if (f.status === "loaded") loadedFonts.push(`${f.family.replace(/["']/g, "")} ${f.weight} ${f.style}`); });
  } catch (_) {}
  // A header also carries icons that are not the mark — an OS badge, a GitHub
  // link, a hamburger. Their name gives them away (an <svg><title>, an alt, an
  // aria-label), and the mark is the one inside the link home when there is one.
  const ICON_NAME = /^(windows|apple|mac(os)?|linux|ubuntu|android|ios|github|gitlab|x|twitter|discord|slack|linkedin|youtube|facebook|instagram|reddit|mastodon|bluesky|rss|menu|hamburger|search|close|sun|moon|dark|light|theme|arrow|chevron|external)( (icon|logo|mark))?$/i;
  const nameOf = (el) => (el.tagName.toLowerCase() === "svg" ? (el.querySelector("title")?.textContent || "") : el.getAttribute("alt") || "").trim() || (el.getAttribute("aria-label") || el.closest("a")?.getAttribute("aria-label") || el.closest("a")?.getAttribute("title") || "").trim();
  const logoCandidates = Array.from(document.querySelectorAll('header img, header svg, nav img, nav svg, a[href="/"] img, a[href="/"] svg, img[alt*="logo" i], img[src*="logo" i]'))
    .filter(visible)
    .filter((el) => !ICON_NAME.test(nameOf(el)))
    .sort((a, b) => Number(!!b.closest('a[href="/"]')) - Number(!!a.closest('a[href="/"]')))
    .slice(0, 6)
    .map((el) => ({ tag: el.tagName.toLowerCase(), alt: el.getAttribute("alt") || "", name: nameOf(el), home: !!el.closest('a[href="/"]'), src: el.tagName.toLowerCase() === "img" ? (el.currentSrc || el.src || "").slice(0, 600) : "", svg: el.tagName.toLowerCase() === "svg" ? el.outerHTML.slice(0, 400000) : null, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));

  return {
    title: document.title,
    lang: document.documentElement.lang || "",
    description: meta("description") || meta("og:description"),
    ogImage: meta("og:image"),
    themeColor: meta("theme-color"),
    colorScheme: html.colorScheme || body.colorScheme || "",
    body: { bg: body.backgroundColor, htmlBg: html.backgroundColor, color: body.color, family: body.fontFamily, size: body.fontSize, lineHeight: body.lineHeight, weight: body.fontWeight },
    type: { h1: pickType(h1), h2: pickType(h2), h3: pickType(h3), body: pickType(bodySample), nav: pickType(navLink) },
    cta,
    ctaLabels,
    vars,
    faces,
    opaqueSheets,
    surfaces: [...surfaces.entries()].map(([c, e]) => ({ c, area: e.area })),
    uses: [...uses.entries()].map(([c, e]) => ({ c, ...e })),
    gradients,
    copy: { h1: heads("h1", 6), h2: heads("h2", 16), h3: heads("h3", 16), nav: navLabels, paragraphs },
    loadedFonts,
    logoCandidates,
    url: location.href,
  };
});

// Cross-origin stylesheets (Google Fonts, CDNs) hide their rules from CSSOM;
// fetch the CSS text and read the @font-face blocks ourselves.
for (const href of data.opaqueSheets.slice(0, 12)) {
  try {
    const res = await context.request.get(href, { timeout: 15000 });
    if (!res.ok()) continue;
    const css = await res.text();
    const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
    for (const b of blocks) {
      const get = (prop) => (new RegExp(`${prop}\\s*:\\s*([^;}]+)`, "i").exec(b) || [])[1]?.trim() || "";
      faceFromCss(get("font-family").replace(/["']/g, ""), get("font-weight") || "400", get("font-style") || "normal", get("src"), href, get("unicode-range"));
    }
  } catch (_) {}
}
function faceFromCss(family, weight, style, src, base, unicodeRange = "") {
  if (!family || !src) return;
  data.faces.push({ family, weight, style, src, base, unicodeRange });
}

// ---- derive tokens -------------------------------------------------------------
const bodyBgRgb = parseRgb(data.body.bg)?.a > 0.05 ? parseRgb(data.body.bg) : parseRgb(data.body.htmlBg);
const bodyBg = bodyBgRgb && bodyBgRgb.a > 0.05 ? hex(bodyBgRgb) : "#FFFFFF";
const ink = toHex(data.body.color) || "#111111";
const hexToRgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
const scheme = lum(hexToRgb(bodyBg)) > 0.4 ? "light" : "dark";

const saturated = data.uses
  .map((u) => ({ ...u, rgb: parseRgb(u.c) }))
  .filter((u) => u.rgb && u.rgb.a > 0.5)
  .map((u) => ({ ...u, hex: hex(u.rgb), hsl: hsl(u.rgb) }))
  .filter((u) => u.hsl.s > 0.28 && u.hsl.l > 0.12 && u.hsl.l < 0.92)
  .reduce((acc, u) => {
    const e = acc.get(u.hex) || { hex: u.hex, bg: 0, text: 0, border: 0 };
    e.bg += u.bg; e.text += u.text; e.border += u.border;
    acc.set(u.hex, e);
    return acc;
  }, new Map());
const accents = [...saturated.values()]
  .map((e) => ({ ...e, total: e.bg * 3 + e.text + e.border }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 10);

const surfaces = data.surfaces
  .map((s) => ({ hex: toHex(s.c), area: s.area }))
  .filter((s) => s.hex)
  .reduce((acc, s) => { acc.set(s.hex, (acc.get(s.hex) || 0) + s.area); return acc; }, new Map());
const surfaceList = [...surfaces.entries()].map(([hex, area]) => ({ hex, area })).sort((a, b) => b.area - a.area).slice(0, 8);

const ctaBg = data.cta ? toHex(data.cta.bg) : null;
const ctaIsNeutral = (() => {
  if (!ctaBg) return true;
  const c = parseRgb(data.cta.bg);
  const { s: sat, l } = hsl(c);
  const chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
  return chroma < 0.12 || sat < 0.2 || l > 0.9 || l < 0.08;
})();
const accent = (!ctaIsNeutral && ctaBg) || accents[0]?.hex || ink;
const accentSource = !ctaIsNeutral && ctaBg ? "primary CTA background" : accents[0] ? "most-used saturated color" : "the ink — a monochrome brand; contrast comes from the surfaces below, not from a hue";

const firstFamily = (ff) => (ff || "").split(",")[0].replace(/["']/g, "").trim();
const headFamily = firstFamily(data.type.h1?.family || data.type.h2?.family || data.body.family);
const bodyFamily = firstFamily(data.type.body?.family || data.body.family);

// ---- fonts: self-host the brand's own files ---------------------------------------
const wanted = new Set([headFamily, bodyFamily].filter(Boolean).map((f) => f.toLowerCase()));
const fontFiles = [];
const otherFontUrls = [];
if (fontsDir) {
  const seen = new Set();
  const parseSrc = (src, base) => {
    const outUrls = [];
    const re = /url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g;
    let m;
    while ((m = re.exec(src))) {
      try { outUrls.push({ url: new URL(m[1], base).href, format: (m[2] || extname(m[1]).slice(1)).toLowerCase() }); } catch (_) {}
    }
    const pref = { woff2: 0, woff: 1, truetype: 2, ttf: 2, opentype: 3, otf: 3 };
    return outUrls.filter((u) => !/^data:/.test(u.url)).sort((a, b) => (pref[a.format] ?? 9) - (pref[b.format] ?? 9));
  };
  // Web fonts usually ship as unicode-range subsets; the film is set in the
  // latin face, so latin (and latin-ext) subsets are saved, the rest skipped.
  const subsetOf = (ur) => {
    if (!ur) return "";
    if (/U\+0000-00FF/i.test(ur)) return "latin";
    if (/U\+0102-0103/i.test(ur)) return "vietnamese";
    if (/U\+0100-/i.test(ur)) return "latin-ext";
    return "other";
  };
  const rank = (f) => ({ "": 0, latin: 0, "latin-ext": 1 })[subsetOf(f.unicodeRange)] ?? 5;
  const brandFaces = data.faces
    .filter((f) => wanted.has((f.family || "").toLowerCase()))
    .sort((a, b) => rank(a) - rank(b));
  for (const face of brandFaces) {
    if (rank(face) >= 5) continue;
    const subset = subsetOf(face.unicodeRange);
    const key = `${face.family}|${face.weight}|${face.style}|${face.unicodeRange}`;
    if (seen.has(key) || fontFiles.length >= MAX_FONT_FILES) continue;
    const pick = parseSrc(face.src, face.base)[0];
    if (!pick) continue;
    seen.add(key);
    let body = fontResponses.get(pick.url)?.body ?? null;
    if (!body) {
      try {
        const res = await context.request.get(pick.url, { timeout: 20000, headers: { Referer: String(url) } });
        if (res.ok()) body = Buffer.from(await res.body());
      } catch (_) {}
    }
    if (!body || body.length > MAX_FONT_BYTES) continue;
    const ext = pick.format === "woff2" ? "woff2" : pick.format === "woff" ? "woff" : /ttf|truetype/.test(pick.format) ? "ttf" : "otf";
    const w = face.weight.replace(/\s+/g, "-");
    const name = `${face.family.replace(/[^\w-]+/g, "")}-${w}${face.style !== "normal" ? "-" + face.style : ""}${subset ? "-" + subset : ""}.${ext}`;
    mkdirSync(resolve(fontsDir), { recursive: true });
    writeFileSync(join(fontsDir, name), body);
    fontFiles.push({ family: face.family, weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, subset, file: join(fontsDir, name).replace(/\\/g, "/"), from: pick.url, bytes: body.length });
  }
  for (const [u, r] of fontResponses) {
    if (!fontFiles.some((f) => f.from === u)) otherFontUrls.push({ url: u, bytes: r.bytes });
  }
}

// ---- logo: the product's own mark, saved verbatim (never redrawn) ------------------
// Inline <svg> is how a logomark usually ships: it is written as-is. An <img>
// is fetched at its resolved URL. At most three files, largest on screen first.
const logoFiles = [];
if (logoDir) {
  // The mark inside the link home first, then by size on screen.
  const cands = [...data.logoCandidates].sort((a, b) => Number(!!b.home) - Number(!!a.home) || b.w * b.h - a.w * a.h);
  for (const l of cands) {
    if (logoFiles.length >= 3 || l.w * l.h < 400 || l.h < 12) continue;  // a 16×16 header icon is not the mark
    let body = null, ext = null;
    if (l.svg) { body = Buffer.from(l.svg, "utf8"); ext = "svg"; }
    else if (l.src && !/^data:/.test(l.src)) {
      try {
        const res = await context.request.get(l.src, { timeout: 20000, headers: { Referer: String(url) } });
        if (res.ok()) {
          body = Buffer.from(await res.body());
          const ct = (res.headers()["content-type"] || "").toLowerCase();
          ext = /svg/.test(ct) || /\.svg(\?|$)/i.test(l.src) ? "svg" : /png/.test(ct) ? "png" : /webp/.test(ct) ? "webp" : /jpe?g/.test(ct) ? "jpg" : (extname(l.src.split("?")[0]).slice(1) || "png");
        }
      } catch (_) {}
    }
    if (!body || body.length < 80 || body.length > 2.5e6) continue;
    if (logoFiles.some((f) => f.bytes === body.length)) continue;
    const file = join(logoDir, `logo-${logoFiles.length + 1}.${ext}`);
    mkdirSync(resolve(logoDir), { recursive: true });
    writeFileSync(file, body);
    logoFiles.push({ file: file.replace(/\\/g, "/"), tag: l.tag, alt: l.alt, w: l.w, h: l.h, from: l.src || "inline svg", bytes: body.length, currentColor: ext === "svg" && /currentColor/.test(body.toString("utf8")) });
  }
}

await studio.close();

// ---- write -----------------------------------------------------------------------
const tokens = {
  url: data.url, measuredAt: new Date().toISOString(), viewport: { width, height },
  title: data.title, description: data.description, lang: data.lang, themeColor: data.themeColor, scheme,
  colors: { bg: bodyBg, ink, accent, accentSource, ctaBg, surfaces: surfaceList, saturated: accents, gradients: data.gradients },
  vars: data.vars,
  type: { headFamily, bodyFamily, h1: data.type.h1, h2: data.type.h2, h3: data.type.h3, body: data.type.body, nav: data.type.nav, bodyDefault: data.body, loaded: data.loadedFonts },
  cta: data.cta, ctaLabels: data.ctaLabels,
  fonts: fontFiles, otherFontUrls: otherFontUrls.slice(0, 12), faces: data.faces.map(({ family, weight, style }) => ({ family, weight, style })),
  copy: data.copy, logo: logoFiles, logoCandidates: data.logoCandidates.map(({ svg, ...l }) => l), ogImage: data.ogImage,
};
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(jsonOut, JSON.stringify(tokens, null, 2));

const fmtType = (t) => t ? `\`${firstFamily(t.family)}\` (stack: ${t.family}) · weight ${t.weight} · ${t.size} · tracking ${t.letterSpacing} · line-height ${t.lineHeight}${t.transform && t.transform !== "none" ? ` · ${t.transform}` : ""} · color ${toHex(t.color) || t.color}${t.text ? `\n  sample: "${t.text.slice(0, 90)}"` : ""}` : "(none visible)";
const varEntries = Object.entries(data.vars);
const colorVars = varEntries.filter(([, v]) => /#|rgb|hsl|oklch|lab\(/.test(v));
const otherVars = varEntries.filter(([, v]) => !/#|rgb|hsl|oklch|lab\(/.test(v));
const lines = [];
lines.push(`# Brand tokens — ${data.title || url}`);
lines.push(``);
lines.push(`Measured by recon.mjs on ${tokens.measuredAt.slice(0, 16).replace("T", " ")} from ${data.url} (viewport ${width}×${height}). Every value below is a computed style read from the live DOM — cite these in direction.md; do not restyle from memory.`);
lines.push(``);
lines.push(`## Page`);
lines.push(`- title: ${data.title}`);
if (data.description) lines.push(`- description: ${data.description}`);
if (data.themeColor) lines.push(`- <meta theme-color>: ${data.themeColor}`);
lines.push(`- scheme: **${scheme}** (body background ${bodyBg}, ink ${ink})${data.colorScheme ? ` · color-scheme: ${data.colorScheme}` : ""}`);
if (data.ogImage) lines.push(`- og:image: ${data.ogImage}`);
lines.push(``);
lines.push(`## Palette (measured)`);
lines.push(`- **bg**: \`${bodyBg}\` — body background`);
lines.push(`- **ink**: \`${ink}\` — body text color`);
lines.push(`- **accent**: \`${accent}\` — ${accentSource}`);
if (ctaBg && ctaIsNeutral) lines.push(`- CTA is neutral (\`${ctaBg}\` on ${toHex(data.cta.color) || data.cta.color}); the accent above comes from the color census`);
if (surfaceList.length) lines.push(`- Surfaces by on-screen area: ${surfaceList.map((s) => `\`${s.hex}\``).join(", ")}`);
if (accents.length) {
  lines.push(`- Saturated colors by use (bg×3 + text + border):`);
  for (const a of accents) lines.push(`  - \`${a.hex}\` — bg ${a.bg}, text ${a.text}, border ${a.border}`);
} else {
  lines.push(`- No saturated colors found above the threshold: the brand is essentially monochrome.`);
}
if (data.gradients.length) {
  lines.push(`- Gradients seen:`);
  for (const g of data.gradients) lines.push(`  - \`${g.slice(0, 160)}\``);
}
lines.push(``);
lines.push(`## Custom properties on :root (${varEntries.length}${data.opaqueSheets.length ? `; ${data.opaqueSheets.length} cross-origin sheet(s) not readable` : ""})`);
if (varEntries.length === 0) lines.push(`(none — the site does not expose its palette as CSS variables)`);
// A design system exposes hundreds of these; the film needs the palette and
// the type, and every line here is re-read on every model call for the rest
// of the run. The rest sit in the JSON.
for (const [k, v] of colorVars.slice(0, 24)) lines.push(`- \`${k}\`: ${v}`);
for (const [k, v] of otherVars.slice(0, 12)) lines.push(`- \`${k}\`: ${v.length > 80 ? v.slice(0, 77) + "…" : v}`);
if (colorVars.length > 24 || otherVars.length > 12) lines.push(`- … ${Math.max(0, colorVars.length - 24) + Math.max(0, otherVars.length - 12)} more in ${jsonOut} (vars) — the measured palette above is what the film uses`);
lines.push(``);
lines.push(`## Typography`);
lines.push(`- **Headline family**: \`${headFamily}\` · **body family**: \`${bodyFamily}\``);
lines.push(`- h1: ${fmtType(data.type.h1)}`);
lines.push(`- h2: ${fmtType(data.type.h2)}`);
lines.push(`- h3: ${fmtType(data.type.h3)}`);
lines.push(`- body: ${fmtType(data.type.body)}`);
lines.push(`- nav: ${fmtType(data.type.nav)}`);
lines.push(`- body default: \`${data.body.family}\` · ${data.body.size} / ${data.body.lineHeight} · weight ${data.body.weight}`);
if (data.loadedFonts.length) lines.push(`- fonts actually loaded: ${[...new Set(data.loadedFonts)].slice(0, 16).join("; ")}`);
lines.push(``);
lines.push(`## Primary CTA`);
if (data.cta) {
  const c = data.cta;
  lines.push(`- "${c.text}" <${c.tag}>${c.href ? ` → ${c.href.slice(0, 80)}` : ""}`);
  lines.push(`- background: \`${toHex(c.bg) || c.bg}\`${c.backgroundImage && c.backgroundImage !== "none" ? ` · background-image: \`${c.backgroundImage.slice(0, 140)}\`` : ""}`);
  lines.push(`- color: \`${toHex(c.color) || c.color}\` · radius: ${c.radius} · padding: ${c.padding}`);
  lines.push(`- font: ${firstFamily(c.family)} ${c.weight} ${c.size} · tracking ${c.letterSpacing}${c.transform !== "none" ? ` · ${c.transform}` : ""}`);
  lines.push(`- shadow: ${c.shadow} · border: ${c.border}`);
  if (data.ctaLabels.length > 1) lines.push(`- other CTA labels: ${data.ctaLabels.map((t) => `"${t}"`).join(", ")}`);
} else {
  lines.push(`(no CTA-like control found)`);
}
lines.push(``);
lines.push(`## Self-hosted fonts`);
if (fontFiles.length) {
  for (const f of fontFiles) lines.push(`- \`${f.file}\` — ${f.family} ${f.weight} ${f.style}${f.subset ? ` (${f.subset} subset)` : ""} (${(f.bytes / 1024).toFixed(0)} KB from ${f.from})`);
  lines.push(``);
  lines.push("Declare in shots.js so renders are deterministic:");
  lines.push("```js");
  lines.push(`brand: { font: "${headFamily}, ${bodyFamily !== headFamily ? bodyFamily + ", " : ""}system-ui, sans-serif", fonts: [`);
  for (const f of fontFiles) lines.push(`  { family: "${f.family}", src: "${f.file}", weight: "${f.weight}"${f.style !== "normal" ? `, style: "${f.style}"` : ""}${f.unicodeRange ? `, unicodeRange: "${f.unicodeRange}"` : ""} },`);
  lines.push(`] }`);
  lines.push("```");
} else if (fontsDir) {
  lines.push(`(no downloadable @font-face for \`${headFamily}\` / \`${bodyFamily}\` — a system font, or the files are inlined. Pick the closest self-hostable equivalent by personality.)`);
} else {
  lines.push(`(font download skipped: --no-fonts)`);
}
if (otherFontUrls.length) {
  lines.push(`- other font files the page loaded: ${otherFontUrls.slice(0, 8).map((f) => f.url.split("/").pop()?.split("?")[0]).join(", ")}`);
}
lines.push(``);
lines.push(`## Logo (the product's own mark, saved verbatim)`);
if (logoFiles.length) {
  for (const l of logoFiles) lines.push(`- \`${l.file}\` — <${l.tag}> ${l.w}×${l.h} on the page${l.alt ? `, alt "${l.alt}"` : ""} (${l.bytes} bytes)${l.currentColor ? " — uses `currentColor`: inline it and set `color`, or it renders black as an <img>" : ""}`);
  lines.push(`Use the file where the mark appears (\`logo-sting\`, \`logo-cta\`, an \`icon-marquee\` tile); never retype or redraw it.`);
} else if (data.logoCandidates.length) {
  lines.push(`(found in the header but could not be saved: ${data.logoCandidates.map((l) => `<${l.tag}> ${l.w}×${l.h}${l.src ? ` ${l.src}` : ""}`).join("; ")}) — ask the user for the SVG.`);
} else {
  lines.push(`(no logo found in the header — ask the user for the SVG, and keep building meanwhile)`);
}
lines.push(``);
lines.push(`## Copy (the product's own words)`);
if (data.copy.h1.length) lines.push(`- H1: ${data.copy.h1.map((t) => `"${t}"`).join(" · ")}`);
if (data.copy.h2.length) lines.push(`- H2: ${data.copy.h2.map((t) => `"${t}"`).join(" · ")}`);
if (data.copy.h3.length) lines.push(`- H3: ${data.copy.h3.map((t) => `"${t}"`).join(" · ")}`);
if (data.ctaLabels.length) lines.push(`- CTAs: ${data.ctaLabels.map((t) => `"${t}"`).join(", ")}`);
if (data.copy.nav.length) lines.push(`- Nav: ${data.copy.nav.join(" · ")}`);
for (const p of data.copy.paragraphs) lines.push(`- ¶ ${p}`);
lines.push(``);
writeFileSync(out, lines.join("\n"));

console.log(`✨ ${out} + ${jsonOut}`);
console.log(`   scheme ${scheme} · bg ${bodyBg} · ink ${ink} · accent ${accent} (${accentSource})`);
console.log(`   type: ${headFamily} (headline) / ${bodyFamily} (body) · h1 ${data.type.h1?.weight ?? "?"} ${data.type.h1?.size ?? ""} tracking ${data.type.h1?.letterSpacing ?? ""}`);
if (data.cta) console.log(`   CTA "${data.cta.text}": ${toHex(data.cta.bg) || data.cta.bg} on ${toHex(data.cta.color) || data.cta.color}, radius ${data.cta.radius}`);
console.log(`   ${varEntries.length} :root custom properties · ${accents.length} saturated colors · ${fontFiles.length} font file(s) saved${fontsDir ? ` to ${fontsDir}/` : ""}`);
if (data.opaqueSheets.length) console.log(`   note: ${data.opaqueSheets.length} cross-origin stylesheet(s) read by fetch (variables inside them are not visible)`);
// A page that rendered but gave almost nothing (an app shell, a login wall):
// the numbers above are the page's defaults, not the brand.
if (bodyText.trim().length < 200 && !logoFiles.length && !data.copy.h1.length)
  console.log(`   ⚠ The page gave almost nothing to measure (${bodyText.trim().length} characters of text, no headline, no logo), so these colours are likely its defaults. Ask the user to upload screenshots of the product's main screens, the logo and any brand colours or fonts, then end the turn.`);
console.log(`   Next: read ${out}, then choose the treatment in direction.md. Preserve the measured brand identity; distinguish authored treatment colours from these measurements and declare them in brand.palette.`);
console.log(`   ${jsonOut} is the same measurement for the tools (motion_scaffold seeds shots.js from it) — nothing to read there.`);
