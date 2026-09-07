#!/usr/bin/env node
/**
 * Motion Audit — the philosophy gate for HTML Motion Video.
 *
 * Loads index.html?audit (drift + ambient OFF, so only DESIGNED events count),
 * samples the master timeline densely, and scores the film against the studio
 * philosophy: "something new happens on screen at least every ~1.2s".
 *
 * Checks:
 *   1. Shot-list lint (window.SHOTS): the shot-list rules (lib/design-rules.mjs —
 *      shot count, durations, hook, breaths, the stage), and the
 *      narration contract — ONE continuous read (audio.vo) with the picture cut
 *      to its words (shot `cue`s vs audio/vo-words.json); per-shot clips fail.
 *   2. Event density: consecutive samples (every 0.25s) that differ by more than
 *      --event are "events". A quiet gap over --max-quiet or a film under
 *      --min-eps events per second is a ⚠️ pacing note, not a failure: the
 *      numbers come from the reference films, but a held frame can be the
 *      design, and an effect ported whole should not be rebuilt to satisfy a
 *      counter. The agent answers the note or says in direction.md why not.
 *   3. Scene overlap at every scene midpoint; seek determinism (❌).
 *
 * Screenshots are what costs time on the CloakBrowser (~1.5s each over CDP,
 * 150 of them for a 37s film), so the samples are taken by several tabs at
 * once, each seeking its own slice of the timeline — capture.mjs's pattern —
 * and at half scale: 960×540 keeps a 0.6% event at ~3,100px, far above the
 * browser's raster noise, and a frame on disk still readable.
 *
 * Usage:
 *   node scripts/audit.mjs page.html [--step=0.25] [--event=0.006] [--max-quiet=1.5]
 *                          [--min-eps=0.7] [--threshold=0.003] [--out=audit] [--workers=6]
 *                          [--shots=cta,tools]
 *
 * --shots samples only the named shots (lib/audit-span.mjs): the shot-list
 * lint and the narration contract still cover the film — they cost no
 * captures — but the density table, the still stretches, the overlap and the
 * determinism probe are measured inside those shots alone, on the same step
 * grid, and their frames replace the matching ones in audit/.
 */
import os from "node:os";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { pixelDiffRatio } from "./lib/png.mjs";
import { findPhrase, loadWords, speechGaps, voStartOf, wordsPathFor } from "./lib/vo-words.mjs";
import { BUILT_IN, TYPE_BEATS, designSummary, extractSpec, lintDesign } from "./lib/design-rules.mjs";
import { quietStretches, sampleTimes, spansFor } from "./lib/audit-span.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));

const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const step = Number(args.step ?? args.interval ?? 0.25);     // dense sampling step
const eventThreshold = Number(args.event ?? 0.006);           // ≥ 0.6% sampled pixels changed = an event
const maxQuiet = Number(args["max-quiet"] ?? 1.5);            // longest allowed stretch without an event
const minEps = Number(args["min-eps"] ?? 0.7);                // events per second, whole film (a scoped run does not judge it)
const threshold = Number(args.threshold ?? 0.003);            // static-hold: 1s apart, < 0.3% change
const outDir = resolve(String(args.out ?? "audit"));
const only = args.shots ? String(args.shots).split(",").map(x => x.trim()).filter(Boolean) : [];
// Tabs sampling in parallel (capture.mjs uses the same bound).
const workers = Math.max(1, Math.min(8, Number(args.workers ?? Math.max(1, Math.min(6, os.cpus().length - 2)))));
const SCALE = 0.5;
const shotOpts = { format: "png", captureBeyondViewport: false, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: SCALE } };

if (!only.length) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log(`\n🔍 Motion Audit — ${pageArg}`);

// The CloakBrowser is not on this machine; the page is served into it from
// disk over the studio.local origin (see lib/browser.mjs).
// Where the seconds go, printed at the end: the studio measured this at 55s
// where the same call from a shell takes 20s, and nothing outside it says why.
const T = { start: Date.now(), marks: {} };
const mark = (k) => { T.marks[k] = Date.now(); };
const studio = await openStudioBrowser({ cdp: args.cdp === true ? null : args.cdp, deviceScaleFactor: SCALE });
mark("connect");
const page = await studio.newPage();
const cdp = await page.context().newCDPSession(page);
/** Seek a tab and capture it at SCALE (physical pixels — see capture.mjs on clip.scale). */
const grabAt = async (pg, sess, t) => {
  await pg.evaluate((seekT) => { window.__SEEK(seekT); }, t);
  const { data } = await sess.send("Page.captureScreenshot", shotOpts);
  return Buffer.from(data, "base64");
};

const base = /^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg);
const url = base + (base.includes("?") ? "&" : "?") + "audit";
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });
mark("load");

const duration = await page.evaluate("window.__DURATION()");
const rawCues = await page.evaluate("window.__CUES ? window.__CUES() : []");
const cues = (Array.isArray(rawCues) ? rawCues : Object.entries(rawCues).map(([label, time]) => ({ label, time })))
  .filter(c => typeof c.time === "number" && Number.isFinite(c.time))
  .sort((a, b) => a.time - b.time);
const spec = await page.evaluate(extractSpec);
const brandTokens = await page.evaluate("window.__BRAND || {}");
const overruns = await page.evaluate("window.__OVERRUNS || []");

const unknown = only.filter(id => !cues.some(c => c.label === id));
if (unknown.length) {
  console.error(`❌ No shot named ${unknown.join(", ")}. Shots: ${cues.map(c => c.label).join(", ")}`);
  await studio.close();
  process.exit(1);
}
const spans = spansFor({ cues, duration, only });
const scoped = only.length > 0;
const spanLabel = scoped ? spans.map(sp => `${sp.ids.join("+")} ${sp.start.toFixed(1)}→${sp.end.toFixed(1)}s`).join(", ") : "";
console.log(`   Duration: ${duration.toFixed(2)}s   Shots: ${spec ? spec.shots.length : "?"}   Sampling: every ${step}s on ${workers} tab${workers === 1 ? "" : "s"}${scoped ? `   Only: ${spanLabel}` : ""}`);
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
    if (o.speed < 1.1) continue; // a 2% squeeze is invisible; only a real mistiming is worth a turn
    lint.push({ level: o.speed > 1.6 ? "fail" : "warn", msg: `#${o.id} (${o.type}): its factory timeline runs ${o.ran}s but the shot is ${o.dur}s — compressed ${o.speed}× to fit. Time the factory as fractions of D, or give the beat more words in the script so the cue interval matches.` });
  }
  // ---- Brand applied? Unset tokens mean the engine's default palette --------------
  const unsetTokens = ["bg", "ink", "accent"].filter(k => !brandTokens[k]);
  if (unsetTokens.length) lint.push({ level: "fail", msg: `brand.${unsetTokens.join(", brand.")} not set — every shot is rendering in the engine's default palette, not the product's, and the ambient stage is invisible. Set the measured hex values on brand (top level), then re-run.` });

  // ---- Template tells: what makes two films look like the same film -------------
  // The shared engine gives every product the same ten looks; a film with no
  // project-local shot type is assembled, not directed.
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
const groups = sampleTimes(spans, step, duration);
const times = groups.flat();
const spanOf = groups.flatMap((g, gi) => g.map(() => gi));
const samples = new Array(times.length);
const chunk = Math.ceil(times.length / workers);
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const from = w * chunk, to = Math.min(from + chunk, times.length);
  if (from >= to) return;
  let pg = page, sess = cdp;
  if (w > 0) {
    pg = await studio.newPage();
    sess = await pg.context().newCDPSession(pg);
    await pg.goto(url, { waitUntil: "domcontentloaded" });
    await pg.waitForFunction("window.__READY === true", null, { timeout: 30000 });
  }
  for (let i = from; i < to; i++) samples[i] = { t: times[i], buf: await grabAt(pg, sess, times[i]) };
  if (w > 0) await pg.close();
}));
mark("capture");
// keep one frame per second on disk for the agent to look at; a scoped run
// replaces the frames of its stretch and leaves the rest of the film's
const frameName = t => `frame_${String(Math.round(t)).padStart(3, "0")}_${t.toFixed(1)}s.png`;
if (scoped) {
  for (const f of readdirSync(outDir)) {
    const t = Number(/^frame_\d+_([\d.]+)s\.png$/.exec(f)?.[1]);
    if (Number.isFinite(t) && spans.some(sp => t >= sp.start - 1e-6 && t <= sp.end + 1e-6)) unlinkSync(join(outDir, f));
  }
}
samples.forEach((s) => {
  if (Math.abs(s.t - Math.round(s.t)) < 1e-6) writeFileSync(join(outDir, frameName(s.t)), s.buf);
});

const diffs = [];  // diff between sample i-1 and i, attributed to time samples[i].t — never across two spans
for (let i = 1; i < samples.length; i++) {
  if (spanOf[i] !== spanOf[i - 1]) continue;
  diffs.push({ t: samples[i].t, d: getBufferDiffRatio(samples[i - 1].buf, samples[i].buf) });
}
const events = diffs.filter(x => x.d >= eventThreshold);
const sampledDur = spans.reduce((a, sp) => a + (sp.end - sp.start), 0);
const eps = events.length / Math.max(1e-6, sampledDur);

// the still stretches, inside each span
const eventTimes = events.map(e => e.t);
const { longest, gaps: quietGaps } = quietStretches(eventTimes, spans, maxQuiet);
const longestQuiet = longest.dur, quietFrom = longest.from, quietTo = longest.to;

// per-shot table
const shotRows = [];
if (cues.length) {
  cues.forEach((c, i) => {
    if (scoped && !only.includes(c.label)) return;
    const start = c.time, end = i + 1 < cues.length ? cues[i + 1].time : duration;
    const inShot = events.filter(e => e.t > start + 1e-6 && e.t <= end + 1e-6);
    const meta = spec?.shots.find(s => s.id === c.label);
    shotRows.push({ id: c.label, type: meta?.type || "", dur: end - start, events: inShot.length, eps: inShot.length / Math.max(0.01, end - start) });
  });
}

// The threshold in pixels, so a beat that cannot register is not tried twice.
const eventPx = Math.round(eventThreshold * 1920 * 1080);
console.log(`📊 Event density (step ${step}s; an event is ≥ ${(eventThreshold * 100).toFixed(1)}% of the frame changing ≈ ${eventPx.toLocaleString("en-US")}px at 1080p — a pulse on a 200px button does not count, a word-sized move does)`);
console.log(`   ${"shot".padEnd(12)} ${"type".padEnd(14)} ${"dur".padStart(5)} ${"events".padStart(7)} ${"ev/s".padStart(6)}   bar`);
for (const r of shotRows) {
  const bar = "█".repeat(Math.min(24, Math.round(r.eps * 6))) + (r.eps < 0.5 ? "  ← lazy" : "");
  console.log(`   ${r.id.padEnd(12)} ${r.type.padEnd(14)} ${r.dur.toFixed(1).padStart(5)} ${String(r.events).padStart(7)} ${r.eps.toFixed(2).padStart(6)}   ${bar}`);
}
console.log(`   ${scoped ? "span" : "film"}: ${events.length} events in ${sampledDur.toFixed(1)}s = ${eps.toFixed(2)} ev/s   longest quiet ${longestQuiet.toFixed(2)}s (${quietFrom.toFixed(1)}→${quietTo.toFixed(1)}s)\n`);

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
    if (scoped && !only.includes(cues[i].label)) continue;
    const mid = start + (end - start) / 2;
    // One CDP round trip per midpoint: the seek applies its styles synchronously,
    // so the read follows it in the same evaluate (two trips × 10 shots was 6s).
    const vis = await page.evaluate((seekT) => {
      window.__SEEK(seekT);
      let scenes = [...document.querySelectorAll(".shot[id], .scene[id]")];
      if (!scenes.length) scenes = [...document.querySelectorAll("#camera > div[id]")];
      return scenes.map(el => { const cs = getComputedStyle(el); return { id: el.id, opacity: parseFloat(cs.opacity), visibility: cs.visibility }; });
    }, mid);
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
  const sp = spans[0], len = sp.end - sp.start;
  const probe = sp.start + Math.min(len * 0.4, Math.max(Math.min(1, len * 0.3), len - 1));
  const away = sp.start + Math.min(len * 0.8, Math.max(Math.min(2, len * 0.6), len - 0.5));
  const grab = async (t) => { await page.evaluate((tt) => window.__SEEK(tt), t); await page.waitForTimeout(140); return grabAt(page, cdp, t); };
  const first = await grab(probe); await grab(away); const second = await grab(probe);
  // Pixels, not bytes: see getBufferDiffRatio. 0.1% of pixels is far below any
  // designed motion and far above the browser's own rasterization noise.
  const drift = getBufferDiffRatio(first, second);
  if (drift > 0.001) {
    determinismWarnings++;
    console.error(`\n❌ NON-DETERMINISTIC at ${probe.toFixed(1)}s (${(drift * 100).toFixed(1)}% of pixels moved) — something animates on the global ticker (bare gsap.to / CSS animation). Put it on the returned timeline.`);
  }
}
mark("checks");
await studio.close();
{
  const s = (a, b) => ((T.marks[b] - (a ? T.marks[a] : T.start)) / 1000).toFixed(1);
  console.log(`⏱ ${studio.mode === "cdp" ? "CloakBrowser" : "local Chromium"} · connect ${s(null, "connect")}s · load ${s("connect", "load")}s · ${times.length} captures on ${workers} tab${workers === 1 ? "" : "s"} ${s("load", "capture")}s · checks ${s("capture", "checks")}s`);
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------
const fails = [];
const warns = [];
for (const l of lint) (l.level === "fail" ? fails : warns).push(l.msg);
// Pacing is a note, not a gate: the numbers are the reference films', and a
// held frame or a lab effect kept whole can be the right call — said out loud.
if (longestQuiet > maxQuiet) warns.push(`Pacing: the picture sits still for ${longestQuiet.toFixed(2)}s at ${quietFrom.toFixed(1)}→${quietTo.toFixed(1)}s${quietGaps.length > 1 ? ` (${quietGaps.length} stretches over ${maxQuiet}s: ${quietGaps.map(g => `${g[0].toFixed(1)}→${g[1].toFixed(1)}`).join(", ")})` : ""}; the reference films never hold past ${maxQuiet}s. A beat (swap/kick/flash/pulse), a second line, 'more' notifications, a cursor/focus — or a cut — answers it. If the hold is the design, keep it and say why in direction.md — that closes this note; do not re-run the audit for it.`);
// A film-level number, so only a film-level run may raise it: one shot sampled
// alone is a different measurement, and "over the film" would be a lie about it.
if (!scoped && eps < minEps) warns.push(`Pacing: ${eps.toFixed(2)} events/s over the film; the reference films run ≥ ${minEps}. Second and third acts, not more entrances — or say in direction.md why this film breathes slower.`);
if (staticWarnings) fails.push(`${staticWarnings} static hold(s) — see above.`);
if (determinismWarnings) fails.push("Render is not deterministic.");
if (overlapWarnings) fails.push(`${overlapWarnings} scene-visibility violation(s).`);

console.log(`\n──────── Philosophy scorecard ────────`);
console.log(`   brand: bg ${brandTokens.bg ?? "—"} · ink ${brandTokens.ink ?? "—"} · accent ${brandTokens.accent ?? "—"}`);
if (spec) console.log(`   ${designSummary(spec)}`);
console.log(`   shots ${spec ? spec.shots.length : "?"} · avg ${spec ? (spec.shots.reduce((a, s) => a + s.dur, 0) / spec.shots.length).toFixed(2) : "?"}s · ${eps.toFixed(2)} ev/s${scoped ? ` (${spanLabel})` : ""} · longest quiet ${longestQuiet.toFixed(2)}s · ambient ${spec?.ambient ? spec.ambient.kind || "on" : "off"} · beats ${spec ? spec.shots.reduce((a, s) => a + s.beats, 0) : "?"}`);
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
  const pacing = warns.filter(w => w.startsWith("Pacing:")).length;
  console.log(`\n✅ AUDIT PASSED — ${pacing ? `deterministic; ${pacing} pacing note${pacing === 1 ? "" : "s"} above to answer or to justify in direction.md` : "dense, continuous, deterministic"}. Frames in '${outDir}/'.${pacing ? ` A note answered in direction.md is closed. Re-run only after a dur, a cue or a beat changes — and then with --shots for the shots you touched.` : ""}\n`);
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
