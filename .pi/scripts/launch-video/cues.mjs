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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { extractSpec, lintWhileBuilding } from "./lib/design-rules.mjs";
import { measureMotion, motionFindings } from "./lib/motion-lint.mjs";
import { actionableOverruns } from "./lib/overruns.mjs";

const args = process.argv.slice(2);
const page_ = args.find(a => !a.startsWith("--")) || "index.html";
const outArg = args.find(a => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : "audio/cues.json";
const CHECK = args.includes("--check");

// Every file the page pulls is served from disk (see lib/browser.mjs).
const studio = await openStudioBrowser();
const page = await studio.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto(localPageUrl(page_), { waitUntil: "domcontentloaded" });
try {
  await page.waitForFunction("window.__READY === true || Boolean(window.__BOOT_ERROR)", null, { timeout: 30000 });
} catch {
  // Read the state below. A missing compiler still needs the generic timeout
  // diagnosis, while an authored compile exception is now available directly.
}
const readiness = await page.evaluate(() => ({
  ready: window.__READY === true,
  bootError: window.__BOOT_ERROR || null,
})).catch(() => ({ ready: false, bootError: null }));
if (!readiness.ready) {
  await studio.close();
  const failures = [...new Set([
    ...(readiness.bootError ? [`compiler: ${readiness.bootError}`] : []),
    ...errors,
  ])];
  console.error(`❌ window.__READY never became true in ${page_}` +
    (failures.length ? `\n   page errors:\n   - ${failures.join("\n   - ")}` : "\n   (no page error was thrown — is compiler.js loaded last, and does shots.js define window.SHOTS?)"));
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
  // Captions and footage: missing cue words, files that would not load.
  media: window.__MEDIA_REPORT || null,
  stage: window.__STAGE || null,
}));
const spec = CHECK ? await page.evaluate(extractSpec) : null;
const motionRows = CHECK ? await page.evaluate(measureMotion) : [];
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
  const buildLint = [...(spec ? lintWhileBuilding(spec) : []), ...motionFindings(motionRows)];
  for (const l of buildLint) console.log(`${l.level === "fail" ? "❌" : "⚠"} ${l.msg}`);
}
const media = data.media;
const mediaProblems = media ? [
  ...media.captions.missing.map((m) => `caption cue not in the narration: ${m} — use the words as spoken (pitch motion align writes them to audio/vo-words.json)`),
  ...media.issues,
] : [];
if (media && (media.captions.phrases || media.captions.subtitles || media.captions.missing.length)) {
  console.log(`   captions: ${media.captions.phrases} phrase${media.captions.phrases === 1 ? "" : "s"}${media.captions.subtitles ? ` + ${media.captions.subtitles} subtitle lines` : ""} · ${media.captions.words} words on their spoken onsets`);
}
if (data.stage && data.stage.format && data.stage.format !== "16:9") console.log(`   format: ${data.stage.format} (${data.stage.w}×${data.stage.h})`);
for (const m of mediaProblems) console.log(`❌ ${m}`);
for (const m of (media && media.warnings) || []) console.log(`⚠ ${m}`);
if (errors.length) {
  console.log(`\n❌ page errors:\n   - ${errors.join("\n   - ")}`);
  process.exit(1);
}
if (CHECK && mediaProblems.length) process.exit(1);
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
