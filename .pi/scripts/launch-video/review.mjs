/**
 * review.mjs — look at the film: contact sheets of the compiled page.
 *
 *   node review.mjs [index.html] [--shots=hook,s3] [--per-shot=3] [--times=1.2,8]
 *                   [--out=review] [--cols=4] [--rows=3] [--tile=480] [--workers=6]
 *
 * Seeks the page (including any authored ambient and drift) at a
 * few moments per shot, stamps each frame with its shot, type and time inside
 * the page, captures it small, and tiles the frames into sheets with ffmpeg.
 * Forty frames become three or four images the agent can read at once, which
 * is how it sees an overlap, an empty frame or a colour that is not the
 * brand's. Two things it does not have to see:
 *
 *   • Clipped type. At every frame the page measures each visible run of text
 *     against the mask that holds it (an `overflow: hidden` ancestor, or the
 *     stage), using the font's real ascent and descent — a line-height under
 *     1 makes the line box smaller than the glyphs, and that is where
 *     descenders and accents go missing. Every frame, not only the settled
 *     one: a headline scaled up on its entrance ran past both stage edges at
 *     20% and 90% and fitted at 55%, and the settled-only check saw nothing.
 *
 *   • The ground. At the settled frame: a colour outside the declared brand
 *     and treatment palette is named. The director can correct an accidental
 *     mismatch or declare a deliberate treatment colour in brand.palette.
 *     Composition belongs to the treatment; the review does not count objects.
 *
 * Like the audit, frames are captured by several Chromium tabs at once, each
 * with its own label.
 */
import { execFileSync } from "node:child_process";
import os from "node:os";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fitStage, localPageUrl, openStudioBrowser, seekFilm } from "./lib/browser.mjs";
import { normalizeGrade, reviewFilter } from "./lib/encode.mjs";
import { planSamples, sheetOf } from "./lib/review-plan.mjs";

/**
 * Runs inside the page (Playwright serialises it — no closures). For every
 * element that directly holds visible hero-size text: the ink box of that
 * string, from the font's own metrics (a Range rect is the font's content
 * area; canvas measureText says where the ink of THESE glyphs sits inside
 * it), against the nearest clipping ancestor and the stage (window.__STAGE).
 *
 * `settled` is whether this is the shot's settled frame. Mid-move, a run of
 * type is cut by its mask on purpose all the time — that is what a mask
 * reveal is — so between frames only type that does not FIT its mask is
 * reported: a headline scaled past its own row on the snap, a line-height
 * mask shorter than its glyphs. At the settled frame every cut counts, and a
 * deliberate bleed there is hundreds of px where a lost descender is 2–60.
 *
 * The metrics are in CSS px and the rects in rendered px: with a transform on
 * the way in (a snap from 1.15×) the two differ, and the ink box is scaled by
 * the rendered width over the measured advance so the edges line up.
 */
function measureClippedText(settled) {
  const out = [];
  const ctx = document.createElement("canvas").getContext("2d");
  const clips = (cs) => /hidden|clip/.test(cs.overflow) || /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY);
  const isStage = (el) => el === document.body || el === document.documentElement || el.id === "viewport" || el.id === "camera" || el.classList.contains("shot") || el.classList.contains("shot-inner");
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.85) return false;
    }
    return true;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const done = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    const el = node.parentElement;
    // An evidence page bleeds past the frame by design; it is a document, not type.
    if (!text || !el || done.has(el) || el.id === "__review_label" || el.closest(".marquee-field, .ui-screen, .ev-page, script, style")) continue;
    done.add(el);
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (!(size >= 28)) continue; // captions and UI copy are not where the fault shows
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    const m = ctx.measureText(text);
    const first = rects[0], last = rects[rects.length - 1];
    const fontAsc = m.fontBoundingBoxAscent ?? size * 0.95;
    // rendered px per CSS px — 1 unless a transform is on the text right now
    const k0 = rects.length === 1 && m.width > 0 ? first.width / m.width : 1;
    const k = k0 > 0.5 && k0 < 3 ? k0 : 1;
    const ink = {
      top: first.top + (fontAsc - (m.actualBoundingBoxAscent ?? size * 0.75)) * k,
      bottom: last.top + (fontAsc + (m.actualBoundingBoxDescent ?? size * 0.25)) * k,
      left: rects.length === 1 ? first.left - Math.max(0, m.actualBoundingBoxLeft ?? 0) * k : Math.min(...rects.map(r => r.left)),
      right: rects.length === 1 ? first.left + (m.actualBoundingBoxRight ?? first.width / k) * k : Math.max(...rects.map(r => r.right)),
    };
    let mask = null, maskName = "the stage";
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (isStage(n)) break;
      if (clips(getComputedStyle(n))) { mask = n.getBoundingClientRect(); maskName = n.classList.length ? "." + [...n.classList].slice(0, 2).join(".") : n.tagName.toLowerCase(); break; }
    }
    // The stage clips too, whatever mask sits inside it: a headline scaled up
    // on its entrance runs past both edges while its own mask runs with it.
    const S = window.__STAGE || { w: 1920, h: 1080 };
    const stage = { left: 0, top: 0, right: S.w, bottom: S.h };
    if (!mask) mask = stage;
    else {
      const m = { left: Math.max(mask.left, stage.left), top: Math.max(mask.top, stage.top), right: Math.min(mask.right, stage.right), bottom: Math.min(mask.bottom, stage.bottom) };
      if (m.left !== mask.left || m.top !== mask.top || m.right !== mask.right || m.bottom !== mask.bottom) maskName = maskName === "the stage" ? maskName : `${maskName} at the stage edge`;
      mask = m;
    }
    const lhRaw = parseFloat(cs.lineHeight);
    const lineHeight = Number.isFinite(lhRaw) ? (lhRaw / size).toFixed(2) : "normal";
    const fits = ink.right - ink.left <= mask.right - mask.left + 2 && ink.bottom - ink.top <= mask.bottom - mask.top + 2;
    if (!settled && fits) continue; // mid-move and it fits: a reveal in progress, not a fault
    const cap = settled ? 60 : 200;
    const cuts = [["below", ink.bottom - mask.bottom], ["above", mask.top - ink.top], ["on the left", mask.left - ink.left], ["on the right", ink.right - mask.right]];
    for (const [side, px] of cuts) {
      if (px >= 2 && px <= cap) {
        const fix = /the stage/.test(maskName) ? `Pull it inside 80px of the edge, or size it so the longest line fits ${S.w - 160}px — at every frame, an entrance scale included.`
          : `Give the mask room — padding .16em .08em .24em with the same negative margin — or line-height ≥ 1.1 (it is ${lineHeight}).`;
        out.push({ text: text.slice(0, 40), side, px: Math.round(px), mask: maskName, font: `${Math.round(size)}px, line-height ${lineHeight}${k > 1.02 || k < 0.98 ? `, at ${k.toFixed(2)}×` : ""}`, fix: fits ? fix : (/the stage/.test(maskName) ? `It is wider than the picture here — keep the largest scale of the move inside ${S.w - 160}px.` : `It is bigger than its mask ${maskName} here — the move scales past the row; grow the mask with it (padding, or overflow visible on the row) or cap the scale.`) });
      }
    }
  }
  return out;
}

/**
 * Runs inside the page at a settled frame. What the frame is about, by size.
 * Text under 22px is counted too: at 1080p it is the copy nobody can read.
 */
function measureSubject() {
  const W = (window.__STAGE || { w: 1920 }).w, H = (window.__STAGE || { h: 1080 }).h;
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.5) return false;
    }
    return true;
  };
  const skip = (el) => el.id === "__review_label" || !!el.closest("#__review_label, script, style");
  const onStage = (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
  let maxFont = 0, maxFontText = "", tiny = 0;
  const tinyEx = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    const el = node.parentElement;
    if (!text || !el || seen.has(el) || skip(el)) continue;
    seen.add(el);
    if (!shown(el) || !onStage(el.getBoundingClientRect())) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > maxFont) { maxFont = size; maxFontText = text.slice(0, 40); }
    if (size < 22) { tiny++; if (tinyEx.length < 3) tinyEx.push(text.slice(0, 28)); }
  }
  let block = 0, blockName = "";
  // The ground: the last painted box covering the stage — a shot's own bg —
  // or the body's when nothing does.
  let ground = getComputedStyle(document.body).backgroundColor;
  for (const el of document.body.querySelectorAll("*")) {
    if (skip(el) || !shown(el)) continue;
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    const solid = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
    const paints = ["img", "video", "canvas", "svg", "iframe"].includes(tag)
      || solid
      || cs.backgroundImage !== "none"
      || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none")
      || cs.boxShadow !== "none";
    if (!paints) continue;
    const r = el.getBoundingClientRect();
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
    if (x1 <= x0 || y1 <= y0) continue;
    const frac = ((x1 - x0) * (y1 - y0)) / (W * H);
    if (frac >= 0.95) { if (solid && !/rgba\(.*, 0(\.\d+)?\)$/.test(cs.backgroundColor)) ground = cs.backgroundColor; continue; } // the stage, an ambient layer, a background wash — not a subject
    if (frac > block) {
      block = frac;
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
      blockName = tag + (cls ? "." + cls : "");
    }
  }
  return { maxFont: Math.round(maxFont), maxFontText, tiny, tinyEx, block: +block.toFixed(3), blockName, ground };
}

/** "#rgb", "#rrggbb", "rgb(a)(…)" → [r, g, b], or null. */
export function rgbOf(c) {
  if (typeof c !== "string") return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map(x => parseInt(x + x, 16));
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
}

const hexOf = (rgb) => "#" + rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/**
 * The ground against the brand: a note when the shot sits on a colour that is
 * none of bg, ink, accent or the palette (within 40 per channel — a tint is
 * within the declared palette's tolerance).
 */
export function groundNote(ground, brand, shot) {
  const g = rgbOf(ground);
  if (!g || !brand) return null;
  const named = [["bg", brand.bg], ["ink", brand.ink], ["accent", brand.accent], ...Object.entries(brand.palette || {})].filter(([, v]) => rgbOf(v));
  if (!named.length) return null;
  const near = named.find(([, v]) => { const b = rgbOf(v); return Math.max(...g.map((x, i) => Math.abs(x - b[i]))) <= 40; });
  if (near) return null;
  return `#${shot} sits on ${hexOf(g)} — outside the declared palette (${named.map(([k, v]) => `${k} ${v}`).join(", ")}). Correct an accidental mismatch, or declare this treatment colour in brand.palette and explain the creative choice in direction.md. Do not present an authored colour as measured brand evidence.`;
}


const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const perShot = Math.max(1, Math.min(6, Number(args["per-shot"] ?? 1)));
const only = args.shots ? String(args.shots).split(",").map(s => s.trim()).filter(Boolean) : [];
const times = args.times ? String(args.times).split(",").map(Number).filter(Number.isFinite) : [];
let cols = Number(args.cols ?? 4);
let rows = Number(args.rows ?? 3);
let tile = Number(args.tile ?? 480);
const outDir = resolve(String(args.out ?? "review"));
const framesDir = join(outDir, ".frames");

if (!/^https?:/.test(pageArg) && !existsSync(pageArg)) {
  console.error(`❌ ${pageArg} not found — motion_scaffold first, then shots.js.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const T = { start: Date.now(), marks: {} };
const mark = (k) => { T.marks[k] = Date.now(); };
const studio = await openStudioBrowser({ log: () => {} });
mark("connect");
const page = await studio.newPage();
const cdp = await page.context().newCDPSession(page);
try {
  const url = /^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
  const stage = await fitStage(page);
  // A portrait film tiles six narrow frames per row, so a sheet stays screen-sized.
  if (stage.h > stage.w) {
    if (args.cols == null) cols = 6;
    if (args.rows == null) rows = 2;
    if (args.tile == null) tile = 300;
  }
  mark("load");
  const duration = await page.evaluate("window.__DURATION()");
  const cues = await page.evaluate("window.__CUES ? window.__CUES() : []");
  const shots = await page.evaluate(() => {
    const s = window.SHOTS;
    return s && Array.isArray(s.shots) ? s.shots.map(x => ({ id: x.id, type: x.type, dur: Number(x.dur) || 0 })) : [];
  });
  // The sheets show the film as the render will grade it, so a LUT or a
  // vignette is judged on frames, not discovered in the MP4.
  const { grade, warnings: gradeWarnings } = normalizeGrade(
    await page.evaluate("(window.SHOTS && window.SHOTS.grade) || null"),
    { lutExists: (p) => existsSync(resolve(p)) },
  );
  for (const w of gradeWarnings) console.warn(`⚠ ${w}`);
  if (!shots.length) {
    console.error("❌ window.SHOTS has no shots — nothing to look at yet.");
    process.exit(1);
  }
  const unknown = only.filter(id => !shots.some(s => s.id === id));
  if (unknown.length) {
    console.error(`❌ No shot named ${unknown.join(", ")}. Shots: ${shots.map(s => s.id).join(", ")}`);
    process.exit(1);
  }

  const plan = planSamples({ shots, cues, duration, perShot, only, times });
  const brand = await page.evaluate("Object.assign({}, window.__BRAND || {}, { palette: (window.SHOTS && window.SHOTS.brand && window.SHOTS.brand.palette) || {} })");

  // The label is drawn by the page itself, so no font or filter is needed
  // on the host: one fixed strip per tab, rewritten before every capture.
  const addLabel = (pg) => pg.evaluate(() => {
    const el = document.createElement("div");
    el.id = "__review_label";
    el.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647;padding:16px 26px;font:700 54px/1 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.78);letter-spacing:.01em;pointer-events:none;border-radius:0 14px 0 0";
    document.body.appendChild(el);
  });
  await addLabel(page);

  const clipped = [];
  const grounds = [];
  const groundSeen = new Set();
  const captureAt = async (pg, sess, s, i) => {
    await seekFilm(pg, s.t);
    if (s.pct !== null) {
      const settled = s.pct >= 35 && s.pct <= 80;
      for (const c of await pg.evaluate(measureClippedText, settled)) clipped.push({ ...c, shot: s.shot, t: s.t });
      if (settled && !groundSeen.has(s.shot)) {
        groundSeen.add(s.shot);
        const m = await pg.evaluate(measureSubject);
        const g = groundNote(m.ground, brand, s.shot);
        if (g) grounds.push({ shot: s.shot, t: s.t, note: g, ground: m.ground });
      }
    }
    await pg.evaluate(text => { document.getElementById("__review_label").textContent = text; },
      `${i + 1}  ${s.shot ?? "—"} · ${s.type ?? ""} · ${s.t.toFixed(2)}s${s.pct === null ? "" : ` · ${s.pct}%`}`);
    await pg.waitForTimeout(60);
    const { data } = await sess.send("Page.captureScreenshot", {
      format: "jpeg", quality: 86, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: stage.w, height: stage.h, scale: tile / stage.w },
    });
    writeFileSync(join(framesDir, `f_${String(i).padStart(3, "0")}.jpg`), Buffer.from(data, "base64"));
  };
  // Several tabs, each its own slice of the plan (audit.mjs does the same).
  const workers = Math.max(1, Math.min(Number(args.workers ?? Math.max(1, Math.min(6, os.cpus().length - 2))), plan.length));
  const chunk = Math.ceil(plan.length / workers);
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const from = w * chunk, to = Math.min(from + chunk, plan.length);
    if (from >= to) return;
    let pg = page, sess = cdp;
    if (w > 0) {
      pg = await studio.newPage();
      await pg.setViewportSize({ width: stage.w, height: stage.h });
      sess = await pg.context().newCDPSession(pg);
      await pg.goto(url, { waitUntil: "domcontentloaded" });
      await pg.waitForFunction("window.__READY === true", null, { timeout: 30000 });
      await addLabel(pg);
    }
    for (let i = from; i < to; i++) await captureAt(pg, sess, plan[i], i);
    if (w > 0) await pg.close();
  }));
  mark("capture");

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", "1", "-i", join(framesDir, "f_%03d.jpg"),
    "-vf", reviewFilter({ grade, tile: `tile=${cols}x${rows}:padding=6:margin=6:color=0x141414` }),
    "-q:v", "3", join(outDir, "sheet-%02d.jpg"),
  ], { stdio: "inherit" });

  mark("sheets");
  const sheets = readdirSync(outDir).filter(f => /^sheet-\d+\.jpg$/.test(f)).sort();
  {
    const s = (a, b) => ((T.marks[b] - (a ? T.marks[a] : T.start)) / 1000).toFixed(1);
    console.log(`⏱ Chromium · launch ${s(null, "connect")}s · load ${s("connect", "load")}s · ${plan.length} captures on ${workers} tab${workers === 1 ? "" : "s"} ${s("load", "capture")}s · sheets ${s("capture", "sheets")}s`);
  }
  console.log(`🎞  Review — ${plan.length} frames from ${only.length || shots.length} shots (${duration.toFixed(2)}s) → ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} in ${String(args.out ?? "review")}/, ${cols}×${rows} tiles, read left→right, top→bottom.${grade ? ` Graded (${Object.keys(grade).join(", ")}).` : ""}`);
  sheets.forEach((f, si) => {
    const here = plan.map((s, idx) => ({ s, idx })).filter(({ idx }) => sheetOf(idx, cols, rows).sheet === si);
    console.log(`   ${f}: ${here.map(({ s, idx }) => `[${idx + 1}] ${s.shot ?? "—"} ${s.t.toFixed(1)}s`).join(" · ")}`);
  });
  // One line per run of type, every cut side on it: three lines for one headline is noise.
  const merged = new Map();
  for (const c of clipped) {
    const k = `${c.shot}|${c.text}`;
    const m = merged.get(k);
    if (!m) merged.set(k, { ...c, sides: [{ side: c.side, px: c.px }] });
    else if (!m.sides.some(s => s.side === c.side)) m.sides.push({ side: c.side, px: c.px });
  }
  const unique = [...merged.values()].map(({ side, px, ...c }) => c);
  if (unique.length) {
    console.log(`\n⚠ clipped type (${unique.length}) — the glyphs run past the mask that holds them:`);
    for (const c of unique.slice(0, 14)) console.log(`   #${c.shot} ${c.t.toFixed(1)}s "${c.text}" — cut ${c.sides.map(s => `${s.px}px ${s.side}`).join(", ")} by ${c.mask} (${c.font}). ${c.fix}`);
    if (unique.length > 14) console.log(`   … and ${unique.length - 14} more.`);
  }
  if (grounds.length) {
    console.log(`\n⚠ off-brand ground (${grounds.length}):`);
    for (const g of grounds.slice(0, 8)) console.log(`   ${g.note}`);
  }
  writeFileSync(join(outDir, "plan.json"), JSON.stringify({ cols, rows, tile, plan, sheets, clipped: unique, grounds: grounds.map(({ shot, t, note }) => ({ shot, t, note })) }, null, 2));
} finally {
  rmSync(framesDir, { recursive: true, force: true });
  await studio.close();
}
