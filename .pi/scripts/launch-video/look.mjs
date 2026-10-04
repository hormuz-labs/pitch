/**
 * look.mjs — what is on the frame at a moment, named.
 *
 *   node look.mjs [index.html] --at=15.5,16.2 [--out=look]
 *
 * Seeks the film to each moment, numbers every thing on screen (words,
 * pictures, filled or outlined boxes; the thirty largest), draws the numbers
 * on the frame and lists them: the selector, the box in film pixels and what
 * it holds. A logo with something over it, a box with nothing in it and a box
 * over part of another are named under the list. The agent sees which
 * element is which without reading its code, then edits it by its selector.
 */
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fitStage, localPageUrl, openStudioBrowser, seekFilm } from "./lib/browser.mjs";
import { drawOutlines, measureFrameObjects } from "./lib/frame-objects.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const times = String(args.at ?? "").split(",").map(Number).filter(Number.isFinite).slice(0, 6);
const outDir = resolve(String(args.out ?? "look"));
const WIDE = 1280;

if (!times.length) {
  console.error("❌ --at=<seconds>[,<seconds>…] — the moments to look at.");
  process.exit(1);
}
if (!/^https?:/.test(pageArg) && !existsSync(pageArg)) {
  console.error(`❌ ${pageArg} not found.`);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const studio = await openStudioBrowser();
try {
  const page = await studio.newPage();
  const cdp = await page.context().newCDPSession(page);
  await page.goto(/^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg), { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
  const stage = await fitStage(page);
  const duration = await page.evaluate("window.__DURATION()");
  const cues = (await page.evaluate("window.__CUES ? window.__CUES() : []")) || [];
  const types = await page.evaluate(() => Object.fromEntries(((window.SHOTS && window.SHOTS.shots) || []).map(s => [s.id, s.type])));
  const shotAt = (t) => [...cues].sort((a, b) => a.time - b.time).reverse().find(c => c.time <= t + 1e-6)?.label || "";
  const tones = { words: "with", picture: "mark", box: "note", cursor: "mark" };

  for (const [i, raw] of times.entries()) {
    const t = Math.max(0, Math.min(raw, duration - 0.01));
    await seekFilm(page, t);
    const m = await page.evaluate(measureFrameObjects, true);
    const num = new Map(m.things.map(th => [`${th.el}|${th.rect.join(",")}`, th.n]));
    const ref = (el, rect) => { const n = num.get(`${el}|${rect.join(",")}`); return n ? `[${n}] ${el}` : el; };
    await page.evaluate(drawOutlines, { items: m.things.map(th => ({ rect: th.rect, label: String(th.n), tone: tones[th.kind] })), caption: `${t.toFixed(2)}s` });
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 82, captureBeyondViewport: false, clip: { x: 0, y: 0, width: stage.w, height: stage.h, scale: WIDE / stage.w } });
    const file = join(outDir, `look-${i + 1}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    await page.evaluate(drawOutlines, {});

    const shot = shotAt(t);
    console.log(`\n👀 ${t.toFixed(2)}s${shot ? ` · #${shot}${types[shot] ? ` (${types[shot]})` : ""}` : ""} → ${String(args.out ?? "look")}/look-${i + 1}.jpg`);
    for (const th of m.things) {
      const [x, y, w, h] = th.rect;
      console.log(`   [${th.n}] ${th.el} — ${th.kind} ${w}×${h} at ${x},${y}${th.holds ? ` · ${th.holds}` : ""}`);
    }
    const notes = [
      ...m.marks.map(k => `${ref(k.el, k.rect)} has ${k.by} over part of it`),
      ...m.overlaps.map(o => `${ref(o.top, o.rect)} sits over part of ${ref(o.under, o.underRect)}`),
      ...m.empty.map(e => `${ref(e.el, e.rect)} is a box with nothing in it`),
    ];
    for (const n of notes) console.log(`   · ${n}`);
  }
  console.log(`\nFilm ${duration.toFixed(2)}s at ${stage.w}×${stage.h}; boxes are in film pixels from the top left.`);
} finally {
  await studio.close();
}
