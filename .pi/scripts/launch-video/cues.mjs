#!/usr/bin/env node
/**
 * cues.mjs — compile-check the page and export the master timeline's REAL
 * shot labels to audio/cues.json.
 *
 * Run from the project folder, after the master timeline exists:
 *   node $SKILL/scripts/cues.mjs [index.html] [--out=audio/cues.json]
 *   node $SKILL/scripts/cues.mjs --check        # compile check + refresh labels
 *
 * WHY: scene start times can be derived two ways, and only one is correct.
 * Summing `SCENE_TIMING[].dur` gives the times a scene WOULD start if every
 * boundary were a plain cut — but any boundary overlap shifts every later
 * label earlier. Placing voiceover or SFX against the summed numbers puts them
 * progressively out of sync with the picture (it cost a full 4K re-render once).
 *
 * The page itself is the only authority. `mix.mjs` and the SFX cue sheet both
 * read from this file when it exists.
 *
 * `--check` is the fast loop while building shot by shot: it loads the page
 * in a headless browser and reports page errors, the shot count, the real
 * duration, every shot's start time, any factory overruns (a factory
 * timeline longer than its shot's `dur`, which the compiler compresses) and
 * the shot-list lint (lib/design-rules.mjs) — so a shot that holds, text that
 * only enters or a whole desktop is heard while the film is being built.
 * Exit 1 on a page error or a page that never becomes ready.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { extractSpec, lintEffectSources, lintWhileBuilding } from "./lib/design-rules.mjs";
import { actionableOverruns } from "./lib/overruns.mjs";

const args = process.argv.slice(2);
const page_ = args.find(a => !a.startsWith("--")) || "index.html";
const outArg = args.find(a => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : "audio/cues.json";
const CHECK = args.includes("--check");
const cdpArg = args.find(a => a.startsWith("--cdp="));
const inspectedEffects = (() => {
  try {
    const receipt = JSON.parse(readFileSync(resolve(".studio/effect-sources.json"), "utf8"));
    return Array.isArray(receipt.effects) ? receipt.effects : [];
  } catch {
    return [];
  }
})();

// The browser is the CloakBrowser, so it cannot see this folder: the page and
// every file it pulls are served into it from disk (see lib/browser.mjs).
const studio = await openStudioBrowser({ cdp: cdpArg?.slice(6) });
const page = await studio.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto(localPageUrl(page_), { waitUntil: "domcontentloaded" });
try {
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
} catch {
  await studio.close();
  console.error(`❌ window.__READY never became true in ${page_}` +
    (errors.length ? `\n   page errors:\n   - ${errors.join("\n   - ")}` : "\n   (no page error was thrown — is compiler.js loaded last, and does shots.js define window.SHOTS?)"));
  process.exit(1);
}

const data = await page.evaluate(() => ({
  duration: window.__DURATION(),
  cues: window.__CUES(),
  shots: (window.SHOTS && Array.isArray(window.SHOTS.shots)) ? window.SHOTS.shots.map((s) => ({ id: s.id, type: s.type, dur: s.dur })) : [],
  overruns: window.__OVERRUNS || [],
  brand: window.__BRAND || {},
  // `breath` beats: the bed ducks here (mix.mjs reads them from cues.json).
  breaths: window.__BREATHS || [],
}));
const spec = CHECK ? await page.evaluate(extractSpec) : null;
await studio.close();

if (!errors.length) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify({ duration: data.duration, cues: data.cues, breaths: data.breaths }, null, 2));
}

const overruns = actionableOverruns(data.overruns);
const head = CHECK
  ? `${errors.length ? "❌" : "✅"} ${page_} compiles — ${data.shots.length} shots · ${data.duration.toFixed(2)}s · ${overruns.length} actionable overrun${overruns.length === 1 ? "" : "s"}`
  : `✨ ${out} — duration ${data.duration.toFixed(2)}s, ${data.cues.length} labels${data.breaths.length ? `, ${data.breaths.length} breath${data.breaths.length === 1 ? "" : "s"}` : ""}`;
console.log(head);
const byLabel = new Map(data.cues.map((c) => [c.label, c.time]));
for (const c of data.cues) {
  const shot = data.shots.find((s) => s.id === c.label);
  console.log(`   ${c.label.padEnd(14)} ${c.time.toFixed(2).padStart(6)}s${shot ? `  ${String(shot.dur).padStart(5)}s  ${shot.type}` : ""}`);
}
for (const o of overruns) {
  // compiler.js records { id, type, dur, ran, speed }
  const speed = Number(o.speed) || (o.ran && o.dur ? o.ran / o.dur : 0);
  if (speed < 1.1) continue; // a 2% squeeze is invisible; retiming it cost a run thirteen turns
  console.log(`⚠ overrun: ${o.id ?? "?"} (${o.type ?? "?"}) factory timeline ${Number(o.ran ?? 0).toFixed(2)}s in a ${Number(o.dur ?? 0).toFixed(2)}s shot — compressed ${speed.toFixed(2)}×${speed > 1.6 ? " (audit FAILS above 1.6×)" : ""}; time the factory as fractions of D`);
}
if (overruns.length) console.log("   Include repeats and stagger: a tween at .6*D with duration .3*D and repeat:1 ends at 1.2*D. yoyo does not shorten it.");
if (CHECK) {
  // The shot-list rules, now — the audit says the same things after a render,
  // and a film that hears them there gets rebuilt instead of built.
  const buildLint = spec ? [...lintWhileBuilding(spec), ...lintEffectSources(spec, inspectedEffects)] : [];
  for (const l of buildLint) console.log(`${l.level === "fail" ? "❌" : "⚠"} ${l.msg}`);
  if (buildLint.some(l => l.code === "lab-source")) {
    process.exit(1);
  }
}
if (errors.length) {
  console.log(`\n❌ page errors:\n   - ${errors.join("\n   - ")}`);
  process.exit(1);
}
if (CHECK) {
  const tokens = ["bg", "ink", "accent"];
  const unset = tokens.filter((k) => !data.brand[k]);
  console.log(`   brand: ${tokens.map((k) => `${k} ${data.brand[k] ?? "—"}`).join(" · ")} · font ${data.brand.font ? "set" : "—"}`);
  if (unset.length) console.log(`⚠ brand.${unset.join(", brand.")} not set — the film is rendering the engine's DEFAULT palette, not the product's. Put the measured values in brand.bg / brand.ink / brand.accent (the audit fails on this).`);
  const missing = data.shots.filter((s) => !byLabel.has(s.id));
  if (missing.length) console.log(`⚠ shots without a timeline label: ${missing.map((s) => s.id).join(", ")}`);
  console.log(`   ${out} refreshed; no separate cues call is needed for this cut.`);
  console.log(`   The preview shows this cut. Check the complete film with one compact contact sheet; extra frames only for a specific unresolved issue. Launch MP4 export belongs to the user. Audio-only edits need only motion mix.`);
}
