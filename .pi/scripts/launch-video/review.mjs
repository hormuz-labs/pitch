/**
 * review.mjs — look at the film: contact sheets of the compiled page.
 *
 *   node review.mjs [index.html] [--shots=hook,s3] [--per-shot=3] [--times=1.2,8]
 *                   [--out=review] [--cols=4] [--rows=3] [--tile=480]
 *
 * Seeks the page (the real look: ambient and drift on, unlike the audit) at a
 * few moments per shot, stamps each frame with its shot, type and time inside
 * the page, captures it small, and tiles the frames into sheets with ffmpeg.
 * Forty frames become three or four images the agent can read at once, which
 * is how it sees an overlap, an empty frame or a colour that is not the
 * brand's. Clipped type it does not have to see: at each shot's settled frame
 * the page measures every visible run of text against the mask that holds it
 * (an `overflow: hidden` ancestor, or the stage), using the font's real
 * ascent and descent — a line-height under 1 makes the line box smaller than
 * the glyphs, and that is where descenders and accents go missing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { normalizeGrade, reviewFilter } from "./lib/encode.mjs";
import { planSamples, sheetOf } from "./lib/review-plan.mjs";

/**
 * Runs inside the page (Playwright serialises it — no closures). For every
 * element that directly holds visible hero-size text: the ink box of that
 * string, from the font's own metrics (a Range rect is the font's content
 * area; canvas measureText says where the ink of THESE glyphs sits inside
 * it), against the nearest clipping ancestor or the 1920×1080 stage. A
 * deliberate bleed is hundreds of px; a cut descender or accent is 2–60.
 */
function measureClippedText() {
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
    if (!text || !el || done.has(el) || el.id === "__review_label" || el.closest(".marquee-field, .ui-screen, script, style")) continue;
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
    const ink = {
      top: first.top + fontAsc - (m.actualBoundingBoxAscent ?? size * 0.75),
      bottom: last.top + fontAsc + (m.actualBoundingBoxDescent ?? size * 0.25),
      left: rects.length === 1 ? first.left - Math.max(0, m.actualBoundingBoxLeft ?? 0) : Math.min(...rects.map(r => r.left)),
      right: rects.length === 1 ? first.left + (m.actualBoundingBoxRight ?? first.width) : Math.max(...rects.map(r => r.right)),
    };
    let mask = null, maskName = "the stage";
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (isStage(n)) break;
      if (clips(getComputedStyle(n))) { mask = n.getBoundingClientRect(); maskName = n.classList.length ? "." + [...n.classList].slice(0, 2).join(".") : n.tagName.toLowerCase(); break; }
    }
    if (!mask) mask = { left: 0, top: 0, right: 1920, bottom: 1080 };
    const lhRaw = parseFloat(cs.lineHeight);
    const lineHeight = Number.isFinite(lhRaw) ? (lhRaw / size).toFixed(2) : "normal";
    const cuts = [["below", ink.bottom - mask.bottom], ["above", mask.top - ink.top], ["on the left", mask.left - ink.left], ["on the right", ink.right - mask.right]];
    for (const [side, px] of cuts) {
      if (px >= 2 && px <= 60) {
        const fix = maskName === "the stage" ? "Pull it inside 80px of the edge, or size it so the longest line fits 1760px."
          : `Give the mask room — padding .16em .08em .24em with the same negative margin — or line-height ≥ 1.1 (it is ${lineHeight}).`;
        out.push({ text: text.slice(0, 40), side, px: Math.round(px), mask: maskName, font: `${Math.round(size)}px, line-height ${lineHeight}`, fix });
      }
    }
  }
  return out;
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const perShot = Math.max(1, Math.min(6, Number(args["per-shot"] ?? 3)));
const only = args.shots ? String(args.shots).split(",").map(s => s.trim()).filter(Boolean) : [];
const times = args.times ? String(args.times).split(",").map(Number).filter(Number.isFinite) : [];
const cols = Number(args.cols ?? 4);
const rows = Number(args.rows ?? 3);
const tile = Number(args.tile ?? 480);
const outDir = resolve(String(args.out ?? "review"));
const framesDir = join(outDir, ".frames");

if (!/^https?:/.test(pageArg) && !existsSync(pageArg)) {
  console.error(`❌ ${pageArg} not found — motion_scaffold first, then shots.js.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const studio = await openStudioBrowser({ log: () => {} });
const page = await studio.newPage();
const cdp = await page.context().newCDPSession(page);
try {
  const url = /^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
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

  // The label is drawn by the page itself, so no font or filter is needed
  // on the host: one fixed strip, rewritten before every capture.
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "__review_label";
    el.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647;padding:16px 26px;font:700 54px/1 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.78);letter-spacing:.01em;pointer-events:none;border-radius:0 14px 0 0";
    document.body.appendChild(el);
  });

  const clipped = [];
  let i = 0;
  for (const s of plan) {
    await page.evaluate(t => { window.__SEEK(t); }, s.t);
    if (s.pct !== null && s.pct >= 35 && s.pct <= 80) {
      for (const c of await page.evaluate(measureClippedText)) clipped.push({ ...c, shot: s.shot, t: s.t });
    }
    await page.evaluate(text => { document.getElementById("__review_label").textContent = text; },
      `${i + 1}  ${s.shot ?? "—"} · ${s.type ?? ""} · ${s.t.toFixed(2)}s${s.pct === null ? "" : ` · ${s.pct}%`}`);
    await page.waitForTimeout(60);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "jpeg", quality: 86, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080, scale: tile / 1920 },
    });
    writeFileSync(join(framesDir, `f_${String(i).padStart(3, "0")}.jpg`), Buffer.from(data, "base64"));
    i++;
  }

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", "1", "-i", join(framesDir, "f_%03d.jpg"),
    "-vf", reviewFilter({ grade, tile: `tile=${cols}x${rows}:padding=6:margin=6:color=0x141414` }),
    "-q:v", "3", join(outDir, "sheet-%02d.jpg"),
  ], { stdio: "inherit" });

  const sheets = readdirSync(outDir).filter(f => /^sheet-\d+\.jpg$/.test(f)).sort();
  console.log(`🎞  Review — ${plan.length} frames from ${only.length || shots.length} shots (${duration.toFixed(2)}s) → ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} in ${String(args.out ?? "review")}/, ${cols}×${rows} tiles, read left→right, top→bottom.${grade ? ` Graded (${Object.keys(grade).join(", ")}).` : ""}`);
  sheets.forEach((f, si) => {
    const here = plan.map((s, idx) => ({ s, idx })).filter(({ idx }) => sheetOf(idx, cols, rows).sheet === si);
    console.log(`   ${f}: ${here.map(({ s, idx }) => `[${idx + 1}] ${s.shot ?? "—"} ${s.t.toFixed(1)}s`).join(" · ")}`);
  });
  const seen = new Set();
  const unique = clipped.filter(c => { const k = `${c.shot}|${c.text}|${c.side}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (unique.length) {
    console.log(`\n⚠ clipped type (${unique.length}) — the glyphs run past the mask that holds them:`);
    for (const c of unique.slice(0, 14)) console.log(`   #${c.shot} ${c.t.toFixed(1)}s "${c.text}" — ${c.px}px cut ${c.side} by ${c.mask} (${c.font}). ${c.fix}`);
    if (unique.length > 14) console.log(`   … and ${unique.length - 14} more.`);
  }
  writeFileSync(join(outDir, "plan.json"), JSON.stringify({ cols, rows, tile, plan, sheets, clipped: unique }, null, 2));
} finally {
  rmSync(framesDir, { recursive: true, force: true });
  await studio.close();
}
