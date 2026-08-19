#!/usr/bin/env node
/**
 * cues.mjs — export the master timeline's REAL scene labels to audio/cues.json.
 *
 * Run from the project folder, after the master timeline exists:
 *   node $SKILL/scripts/cues.mjs [index.html] [--out=audio/cues.json]
 *
 * WHY: scene start times can be derived two ways, and only one is correct.
 * Summing `SCENE_TIMING[].dur` gives the times a scene WOULD start if every
 * boundary were a plain cut — but any boundary overlap shifts every later
 * label earlier. Placing voiceover or SFX against the summed numbers puts them
 * progressively out of sync with the picture (it cost a full 4K re-render once).
 *
 * The page itself is the only authority. `mix.mjs` and the SFX cue sheet both
 * read from this file when it exists.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const page_ = args.find(a => !a.startsWith("--")) || "index.html";
const outArg = args.find(a => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : "audio/cues.json";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto("file://" + resolve(page_), { waitUntil: "domcontentloaded" });
try {
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
} catch {
  await browser.close();
  console.error(`❌ window.__READY never became true in ${page_}` +
    (errors.length ? `\n   page errors:\n   - ${errors.join("\n   - ")}` : ""));
  process.exit(1);
}

const data = await page.evaluate(() => ({
  duration: window.__DURATION(),
  cues: window.__CUES(),
}));
await browser.close();

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2));

console.log(`✨ ${out} — duration ${data.duration.toFixed(2)}s, ${data.cues.length} labels`);
for (const c of data.cues) console.log(`   ${c.label.padEnd(10)} ${c.time.toFixed(2)}s`);
if (errors.length) {
  console.log(`\n⚠ page errors during load:\n   - ${errors.join("\n   - ")}`);
}
