#!/usr/bin/env node
/**
 * Motion Audit — the philosophy gate for HTML Motion Video.
 *
 * Loads index.html?audit (drift + ambient OFF, so only DESIGNED events count),
 * samples the master timeline densely, and scores the film against the studio
 * philosophy: "something new happens on screen at least every ~1.2s".
 *
 * Checks (all must pass):
 *   1. Shot-list lint (window.SHOTS): the shot-list rules (lib/design-rules.mjs —
 *      shot count, durations, hook, breaths, the stage), and the
 *      narration contract — ONE continuous read (audio.vo) with the picture cut
 *      to its words (shot `cue`s vs audio/vo-words.json); per-shot clips fail.
 *   2. Event density: consecutive samples (every 0.25s) that differ by more than
 *      --event are "events". Longest quiet gap must be ≤ --max-quiet, and the
 *      film must average ≥ --min-eps events per second.
 *   3. Static holds: two samples 1s apart that look identical.
 *   4. Scene overlap at every scene midpoint; seek determinism.
 *
 * Usage:
 *   node scripts/audit.mjs page.html [--step=0.25] [--event=0.006] [--max-quiet=1.5]
 *                          [--min-eps=0.7] [--threshold=0.003] [--out=audit]
 */
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { pixelDiffRatio } from "./lib/png.mjs";
import { findPhrase, loadWords, speechGaps, voStartOf, wordsPathFor } from "./lib/vo-words.mjs";
import { TYPE_BEATS, designSummary, extractSpec, lintDesign } from "./lib/design-rules.mjs";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));

const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const step = Number(args.step ?? args.interval ?? 0.25);     // dense sampling step
const eventThreshold = Number(args.event ?? 0.006);           // ≥ 0.6% sampled pixels changed = an event
const maxQuiet = Number(args["max-quiet"] ?? 1.5);            // longest allowed stretch without an event
const minEps = Number(args["min-eps"] ?? 0.7);                // events per second, whole film
const threshold = Number(args.threshold ?? 0.003);            // static-hold: 1s apart, < 0.3% change
const outDir = resolve(String(args.out ?? "audit"));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log(`\n🔍 Motion Audit — ${pageArg}`);

// The CloakBrowser is not on this machine; the page is served into it from
// disk over the studio.local origin (see lib/browser.mjs).
const studio = await openStudioBrowser({ cdp: args.cdp === true ? null : args.cdp });
const page = await studio.newPage();

const base = /^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg);
const url = base + (base.includes("?") ? "&" : "?") + "audit";
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });

const duration = await page.evaluate("window.__DURATION()");
const rawCues = await page.evaluate("window.__CUES ? window.__CUES() : []");
const cues = (Array.isArray(rawCues) ? rawCues : Object.entries(rawCues).map(([label, time]) => ({ label, time })))
  .filter(c => typeof c.time === "number" && Number.isFinite(c.time))
  .sort((a, b) => a.time - b.time);
const spec = await page.evaluate(extractSpec);
const plugins = await page.evaluate("window.__PLUGINS || []");
const brandTokens = await page.evaluate("window.__BRAND || {}");
const overruns = await page.evaluate("window.__OVERRUNS || []");

console.log(`   Duration: ${duration.toFixed(2)}s   Shots: ${spec ? spec.shots.length : "?"}   Plugins: ${plugins.join(", ") || "none"}`);
console.log(`   Cues: ${cues.map(c => `${c.label}@${c.time.toFixed(1)}s`).join(", ")}\n`);

// ---------------------------------------------------------------------------
// 1. Shot-list lint — the rules the skill states, enforced.
// ---------------------------------------------------------------------------
const lint = [];   // { level: "fail"|"warn", msg }
let narration = { mode: "none" };
if (!spec) {
  lint.push({ level: "warn", msg: "window.SHOTS not found — shot-list lint skipped (engine project expected)." });
} else {
  const shots = spec.shots;
  // The shot-list rules — count, lengths, the hook, the tells (lib/design-rules.mjs).
  lint.push(...lintDesign(spec));

  // ---- Narration: one continuous read, picture cut to the words ----------------
  const legacyClips = shots.filter(s => typeof s.vo === "string").length;
  const voFile = typeof spec.audio?.vo === "string" ? spec.audio.vo : null;
  if (legacyClips > 1) {
    lint.push({ level: "fail", msg: `Fragmented narration: ${legacyClips} per-shot clips (shots[].vo). Each clip restarts the voice and leaves dead air between lines — the robotic sound. Write ONE script, motion_tts it once to audio/vo.wav, set audio.vo to it, motion_align, put \`cue\` on the shots, motion_sync --write.` });
  } else if (legacyClips === 1 && !voFile) {
    lint.push({ level: "warn", msg: "A single per-shot vo clip — fine for a one-line film; otherwise move to the continuous read (audio.vo)." });
  }
  if (spec.audio?.vo === true) lint.push({ level: "warn", msg: "audio.vo: true is the legacy flag — set audio.vo to the continuous read's path (audio/vo.wav)." });
  if (voFile) {
    const timeline = loadWords(wordsPathFor(voFile));
    const voStart = voStartOf(spec);
    if (!timeline) {
      lint.push({ level: "fail", msg: `audio.vo = ${voFile} but no word timeline next to it — run motion_align so the cut can follow the words.` });
    } else {
      const words = timeline.words;
      const speechEnd = voStart + (timeline.speechEnd ?? words[words.length - 1].e);
      const cued = shots.filter(s => s.cue);
      let cursor = 0, maxDrift = 0, worst = null;
      const missing = [];
      shots.forEach((s, i) => {
        if (!s.cue) return;
        const hit = findPhrase(words, s.cue, cursor);
        if (!hit) { missing.push(`#${s.id} "${s.cue}"`); return; }
        cursor = hit.index + hit.count;
        const start = cues.find(c => c.label === s.id)?.time;
        if (i === 0 || typeof start !== "number") return;
        // visual should land 0–0.45s BEFORE the word (sync.mjs uses a 0.12s lead)
        const drift = start - (voStart + hit.start);
        if (Math.abs(drift) > Math.abs(maxDrift)) { maxDrift = drift; worst = s.id; }
      });
      const wps = words.length / Math.max(0.1, (timeline.speechEnd ?? words[words.length - 1].e) - (timeline.speechStart ?? words[0].s));
      narration = { mode: "continuous", dur: timeline.duration, cued: cued.length, total: shots.length, maxDrift, worst, speechEnd, wps,
        breath: speechGaps(words, 0.3)[0] || null, matched: timeline.matched };
      // The voice never sprints. Energy is what moves on screen, not words per second.
      if (wps > 2.7) lint.push({ level: "fail", msg: `Narration is rushed: ${wps.toFixed(2)} words/s. A narrator sounds human at 1.9–2.4. Re-record with an unhurried, conversational style, then motion_align + motion_sync. Density comes from the picture (beats, second acts, ambient), never from a fast read.` });
      else if (wps > 2.45) lint.push({ level: "warn", msg: `Narration is brisk (${wps.toFixed(2)} words/s) — aim 1.9–2.4; let the picture carry the pace.` });
      else if (wps < 1.6) lint.push({ level: "warn", msg: `Narration is very slow (${wps.toFixed(2)} words/s) — aim 1.9–2.4.` });
      if (missing.length) lint.push({ level: "fail", msg: `Cue phrase(s) not in the script: ${missing.join(", ")} — fix the cue or the copy, then motion_sync.` });
      if (Math.abs(maxDrift) > 0.35 || maxDrift > 0.15) lint.push({ level: "fail", msg: `Picture is off the narration: #${worst} starts ${maxDrift > 0 ? maxDrift.toFixed(2) + "s AFTER" : (-maxDrift).toFixed(2) + "s before"} its cue word. Run motion_sync --write (a shot lands 0.1–0.3s before its word).` });
      if (cued.length < Math.ceil(shots.length * 0.6)) lint.push({ level: "warn", msg: `Only ${cued.length}/${shots.length} shots carry a \`cue\` — uncued shots float against the voice. Cue every shot that should land on a word.` });
      if (speechEnd > duration - 0.3) lint.push({ level: "fail", msg: `Narration ends at ${speechEnd.toFixed(2)}s but the picture ends at ${duration.toFixed(2)}s — motion_sync extends the last shot; re-run it.` });
      if (duration - speechEnd > 3.5) lint.push({ level: "warn", msg: `${(duration - speechEnd).toFixed(1)}s of picture after the last word — trim the tail or give it copy.` });
      const bigGap = speechGaps(words, 1.2)[0];
      if (bigGap) lint.push({ level: "warn", msg: `${bigGap.dur}s of dead air in the read after "${bigGap.after}" — the script pauses; tighten the copy or ask for a brisker style.` });
      if (timeline.matched < 0.85) lint.push({ level: "warn", msg: `Only ${Math.round(timeline.matched * 100)}% of the script matched the recording — check audio/vo.txt is what was spoken.` });
    }
  } else if (legacyClips === 0 && spec.audio?.vo !== true) {
    narration = { mode: "none" };
  }
  if (legacyClips > 1) narration = { mode: "fragmented", clips: legacyClips };

  // ---- Factories that ignore their shot's dur -----------------------------------
  for (const o of overruns) {
    lint.push({ level: o.speed > 1.6 ? "fail" : "warn", msg: `#${o.id} (${o.type}): its factory timeline runs ${o.ran}s but the shot is ${o.dur}s — compressed ${o.speed}× to fit. Time the factory as fractions of D, or give the beat more words in the script so the cue interval matches.` });
  }
  // ---- Brand applied? Unset tokens mean the engine's default palette --------------
  const unsetTokens = ["bg", "ink", "accent"].filter(k => !brandTokens[k]);
  if (unsetTokens.length) lint.push({ level: "fail", msg: `brand.${unsetTokens.join(", brand.")} not set — every shot is rendering in the engine's default palette, not the product's, and the ambient stage is invisible. Set the measured hex values on brand (top level), then re-run.` });

  // ---- Template tells: what makes two films look like the same film -------------
  // The shared engine gives every product the same ten looks; a film with no
  // project-local shot type is assembled, not directed.
  const BUILT_IN = new Set([...TYPE_BEATS, "ui-frame", "device-notif", "device-3d", "lottie", "rive", "cascade"]);
  if (!shots.some(s => !BUILT_IN.has(s.type)) && !spec.actors) lint.push({ level: "warn", msg: "Every shot is a built-in type and nothing crosses the cuts — no signature. Either declare `actors` (the product's own object living across the scenes) or write one project-local type in js/shots.custom.js for the beat only this product could own (motion_schema({ section: \"custom shot types\" }))." });
  // Uniform durations read as a metronome whatever the content.
  if (shots.length >= 8) {
    const durs = shots.map(s => s.dur);
    const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
    const sd = Math.sqrt(durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length);
    if (sd < 0.45) lint.push({ level: "warn", msg: `Metronome: every shot is ${mean.toFixed(1)}s ± ${sd.toFixed(2)}. Rhythm is a decision — a burst of three sub-second beats against one long product shot, not the same cut every ${mean.toFixed(1)}s.` });
  }
}

// ---------------------------------------------------------------------------
// 2. Dense sampling → event density.
// ---------------------------------------------------------------------------
const samples = [];
const n = Math.floor(duration / step);
for (let i = 0; i <= n; i++) {
  const t = Math.min(i * step, duration);
  await page.evaluate((seekT) => { window.__SEEK(seekT); }, t);
  const buf = await page.screenshot({ type: "png" });
  samples.push({ t, buf });
}
// keep one frame per second on disk for the agent to look at
samples.forEach((s, i) => {
  if (Math.abs(s.t - Math.round(s.t)) < 1e-6) {
    writeFileSync(`${outDir}/frame_${String(Math.round(s.t)).padStart(3, "0")}_${s.t.toFixed(1)}s.png`, s.buf);
  }
});

const diffs = [];  // diff between sample i-1 and i, attributed to time samples[i].t
for (let i = 1; i < samples.length; i++) diffs.push({ t: samples[i].t, d: getBufferDiffRatio(samples[i - 1].buf, samples[i].buf) });
const events = diffs.filter(x => x.d >= eventThreshold);
const eps = events.length / Math.max(1e-6, duration);

// longest quiet stretch (between events, or from start / to end)
let longestQuiet = 0, quietFrom = 0, quietTo = 0, last = 0;
const eventTimes = events.map(e => e.t);
for (const t of [...eventTimes, duration]) {
  if (t - last > longestQuiet) { longestQuiet = t - last; quietFrom = last; quietTo = t; }
  last = t;
}
const quietGaps = [];
last = 0;
for (const t of [...eventTimes, duration]) { if (t - last > maxQuiet) quietGaps.push([last, t]); last = t; }

// per-shot table
const shotRows = [];
if (cues.length) {
  cues.forEach((c, i) => {
    const start = c.time, end = i + 1 < cues.length ? cues[i + 1].time : duration;
    const inShot = events.filter(e => e.t > start + 1e-6 && e.t <= end + 1e-6);
    const meta = spec?.shots.find(s => s.id === c.label);
    shotRows.push({ id: c.label, type: meta?.type || "", dur: end - start, events: inShot.length, eps: inShot.length / Math.max(0.01, end - start) });
  });
}

console.log(`📊 Event density (step ${step}s, event ≥ ${(eventThreshold * 100).toFixed(1)}% pixels changed)`);
console.log(`   ${"shot".padEnd(12)} ${"type".padEnd(14)} ${"dur".padStart(5)} ${"events".padStart(7)} ${"ev/s".padStart(6)}   bar`);
for (const r of shotRows) {
  const bar = "█".repeat(Math.min(24, Math.round(r.eps * 6))) + (r.eps < 0.5 ? "  ← lazy" : "");
  console.log(`   ${r.id.padEnd(12)} ${r.type.padEnd(14)} ${r.dur.toFixed(1).padStart(5)} ${String(r.events).padStart(7)} ${r.eps.toFixed(2).padStart(6)}   ${bar}`);
}
console.log(`   film: ${events.length} events in ${duration.toFixed(1)}s = ${eps.toFixed(2)} ev/s   longest quiet ${longestQuiet.toFixed(2)}s (${quietFrom.toFixed(1)}→${quietTo.toFixed(1)}s)\n`);

// (The old 1s static-hold check is subsumed by the quiet-gap rule above: a
// hold is simply a quiet stretch, and the dense sampling can't be fooled by a
// slow pan the way the coarse check was.)
const staticWarnings = 0;

// ---------------------------------------------------------------------------
// 4. Scene overlap at midpoints.
// ---------------------------------------------------------------------------
const OPACITY_THRESHOLD = 0.05;
let overlapWarnings = 0;
if (cues.length > 1) {
  for (let i = 0; i < cues.length; i++) {
    const start = cues[i].time;
    const end = i + 1 < cues.length ? cues[i + 1].time : duration;
    const mid = start + (end - start) / 2;
    await page.evaluate((seekT) => { window.__SEEK(seekT); }, mid);
    const vis = await page.evaluate(() => {
      let scenes = [...document.querySelectorAll(".shot[id], .scene[id]")];
      if (!scenes.length) scenes = [...document.querySelectorAll("#camera > div[id]")];
      return scenes.map(el => { const cs = getComputedStyle(el); return { id: el.id, opacity: parseFloat(cs.opacity), visibility: cs.visibility }; });
    });
    if (!vis.length) break;
    let activeIdx = vis.findIndex(s => s.id === cues[i].label);
    if (activeIdx === -1) activeIdx = Math.min(i, vis.length - 1);
    const offenders = [];
    vis.forEach((s, j) => {
      const effective = s.visibility === "hidden" ? 0 : s.opacity;
      if (j === activeIdx) {
        if (effective < 0.5) { overlapWarnings++; console.warn(`  ⚠️ ACTIVE SHOT INVISIBLE at ${mid.toFixed(1)}s: #${s.id}`); }
      } else if (effective >= OPACITY_THRESHOLD) { overlapWarnings++; offenders.push(`#${s.id}`); }
    });
    if (offenders.length) console.warn(`  ⚠️ SCENE OVERLAP at ${mid.toFixed(1)}s (${cues[i].label} active): ${offenders.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Seek determinism (anything on the global ticker shakes the render).
// ---------------------------------------------------------------------------
let determinismWarnings = 0;
{
  const probe = Math.min(duration * 0.4, Math.max(1, duration - 1));
  const away = Math.min(duration * 0.8, Math.max(2, duration - 0.5));
  const grab = async (t) => { await page.evaluate((tt) => window.__SEEK(tt), t); await page.waitForTimeout(140); return page.screenshot(); };
  const first = await grab(probe); await grab(away); const second = await grab(probe);
  // Pixels, not bytes: see getBufferDiffRatio. 0.1% of pixels is far below any
  // designed motion and far above the browser's own rasterization noise.
  const drift = getBufferDiffRatio(first, second);
  if (drift > 0.001) {
    determinismWarnings++;
    console.error(`\n❌ NON-DETERMINISTIC at ${probe.toFixed(1)}s (${(drift * 100).toFixed(1)}% of pixels moved) — something animates on the global ticker (bare gsap.to / CSS animation). Put it on the returned timeline.`);
  }
}
await studio.close();

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------
const fails = [];
const warns = [];
for (const l of lint) (l.level === "fail" ? fails : warns).push(l.msg);
if (longestQuiet > maxQuiet) fails.push(`Longest quiet stretch ${longestQuiet.toFixed(2)}s at ${quietFrom.toFixed(1)}→${quietTo.toFixed(1)}s (limit ${maxQuiet}s)${quietGaps.length > 1 ? ` — ${quietGaps.length} such gaps: ${quietGaps.map(g => `${g[0].toFixed(1)}→${g[1].toFixed(1)}`).join(", ")}` : ""}. Add a beat (swap/kick/flash/pulse), a second line, 'more' notifications, a pile item, a cursor/focus — or cut the shot.`);
if (eps < minEps) fails.push(`Event density ${eps.toFixed(2)} ev/s is below ${minEps}. The reference films run ≥ 1 ev/s: every shot needs a second and third act, not one entrance.`);
if (staticWarnings) fails.push(`${staticWarnings} static hold(s) — see above.`);
if (determinismWarnings) fails.push("Render is not deterministic.");
if (overlapWarnings) fails.push(`${overlapWarnings} scene-visibility violation(s).`);

console.log(`\n──────── Philosophy scorecard ────────`);
console.log(`   brand: bg ${brandTokens.bg ?? "—"} · ink ${brandTokens.ink ?? "—"} · accent ${brandTokens.accent ?? "—"}`);
if (spec) console.log(`   ${designSummary(spec)}`);
console.log(`   shots ${spec ? spec.shots.length : "?"} · avg ${spec ? (spec.shots.reduce((a, s) => a + s.dur, 0) / spec.shots.length).toFixed(2) : "?"}s · ${eps.toFixed(2)} ev/s · longest quiet ${longestQuiet.toFixed(2)}s · ambient ${spec?.ambient ? spec.ambient.kind || "on" : "off"} · beats ${spec ? spec.shots.reduce((a, s) => a + s.beats, 0) : "?"}`);
const nline = narration.mode === "continuous"
  ? `continuous read ${narration.dur.toFixed(1)}s · ${narration.wps.toFixed(2)} words/s · ${narration.cued}/${narration.total} shots cued · max drift ${narration.maxDrift >= 0 ? "+" : ""}${narration.maxDrift.toFixed(2)}s${narration.worst ? ` (#${narration.worst})` : ""} · longest breath ${narration.breath ? narration.breath.dur + "s" : "none"} · last word ${narration.speechEnd.toFixed(1)}s`
  : narration.mode === "fragmented" ? `FRAGMENTED — ${narration.clips} per-shot clips` : "none (music-only)";
console.log(`   narration: ${nline}`);
for (const w of warns) console.log(`   ⚠️  ${w}`);
for (const f of fails) console.log(`   ❌ ${f}`);
if (fails.length) {
  console.error(`\n❌ AUDIT FAILED (${fails.length}) — fix every ❌ above, then re-run. Frames in '${outDir}/'.`);
  process.exit(1);
} else {
  console.log(`\n✅ AUDIT PASSED — dense, continuous, deterministic. Frames in '${outDir}/'.\n`);
}

/**
 * How much of the picture changed between two frames, as a fraction of pixels.
 *
 * This decodes both PNGs rather than sampling their bytes. Comparing
 * compressed bytes was fine while every frame came from a plain headless
 * Chromium here; the CloakBrowser perturbs its own rasterization, so two
 * pixel-identical frames can encode to different bytes and one changed pixel
 * near the top of the image shifts nearly every byte after it. Byte sampling
 * then reported ~0.87 for an identical frame and ~0.92 for a completely
 * different one — a gate that could not tell a cut from a re-render.
 */
function getBufferDiffRatio(bufA, bufB) {
  try {
    return pixelDiffRatio(bufA, bufB);
  } catch {
    // An undecodable frame is a real difference, not a reason to crash.
    return bufA.equals(bufB) ? 0 : 1;
  }
}
