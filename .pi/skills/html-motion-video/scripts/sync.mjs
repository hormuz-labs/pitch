#!/usr/bin/env node
/**
 * sync.mjs — cut the picture to the narration.
 *
 *   node sync.mjs [--shots=shots.js] [--words=audio/vo-words.json] [--lead=0.12] [--write]
 *
 * Shots (and beats, word-build lines, device-notif `more`) declare the phrase
 * of the script they land on:
 *
 *   { id: "step2", type: "…", dur: 2.4, cue: "step two", … }
 *   beats: [{ cue: "magic", kind: "flash" }]
 *   lines: [{ cue: "you want", parts: […] }, { cue: "editing", parts: […] }]
 *   more:  [{ cue: "second", … }]
 *
 * With the word timeline from align.mjs this script computes when each cue
 * is spoken and RETIMES the shot list so the cued shot starts `lead` seconds
 * before its word (a visual that lands a hair early reads as "on the word").
 * Shots between two cues are scaled proportionally to fill the interval.
 * Beat `at`, `lineAt` and `moreAt` are filled from their cues (relative to
 * the shot). With --write the numbers are written back into shots.js and an
 * existing audio/sfx-cues.json is re-timed the same way; without it you get
 * the plan only.
 *
 * shots.js stays the single source of truth for the engine, the studio, the
 * mixer and the audit — this script only edits numbers in it.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findPhrase, loadShots, loadWords, voStartOf, wordsPathFor } from "./lib/vo-words.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};
const SHOTS_PATH = resolve(flag("shots", "shots.js"));
const WRITE = !!flag("write");
const LEAD = Number(flag("lead", 0.12));
const MIN_DUR = 0.6;

const spec = loadShots(SHOTS_PATH);
if (!spec) { console.error(`❌ ${SHOTS_PATH} not found or has no window.SHOTS`); process.exit(1); }
const voFile = typeof spec.audio?.vo === "string" ? spec.audio.vo : null;
if (!voFile) {
  console.error("❌ shots.js audio.vo must be the continuous narration path (e.g. audio: { vo: \"audio/vo.wav\" }).\n   Per-shot vo/voDur clips are the fragmented, robotic mode — retire them.");
  process.exit(1);
}
const WORDS_PATH = resolve(flag("words", wordsPathFor(voFile)));
const timeline = loadWords(WORDS_PATH);
if (!timeline) { console.error(`❌ ${WORDS_PATH} not found — run motion_align on ${voFile} first.`); process.exit(1); }
const words = timeline.words;
const VO_START = voStartOf(spec);
const shots = spec.shots;
const legacy = shots.filter(s => typeof s.vo === "string").length;

// --- 1. resolve every cue to a time on the film's clock -------------------------
const notFound = [];
let cursor = 0;
const cueTime = (phrase, from) => {
  const hit = findPhrase(words, phrase, from);
  if (!hit) { notFound.push(phrase); return null; }
  return hit;
};
const plan = shots.map((s, i) => ({ id: s.id || `shot${i + 1}`, i, oldDur: Number(s.dur) || 0, cue: s.cue || null, cueAt: null, wordIndex: null }));
for (const p of plan) {
  if (!p.cue) continue;
  const hit = cueTime(p.cue, cursor);
  if (!hit) continue;
  p.cueAt = hit.start; p.wordIndex = hit.index; cursor = hit.index + hit.count;
  p.target = Math.max(0, VO_START + hit.start - LEAD);
}

// --- 2. retime: cued shots are anchors; the shots between them share the interval
const anchors = plan.filter(p => p.cueAt !== null && p.i > 0);
const newDur = plan.map(p => p.oldDur);
const squeezed = [];
let segStart = 0, segFrom = 0;
const order = [...anchors, null];
for (const a of order) {
  const to = a ? a.i : shots.length;          // exclusive
  if (a) {
    const interval = a.target - segStart;
    const oldSum = plan.slice(segFrom, to).reduce((t, p) => t + p.oldDur, 0);
    if (interval <= 0.2) {
      squeezed.push(`${plan[segFrom].id}…${plan[to - 1].id}: cue "${a.cue}" is spoken ${interval.toFixed(2)}s after the previous anchor — merge shots or move the cue`);
    }
    for (let k = segFrom; k < to; k++) {
      newDur[k] = oldSum > 0 ? Math.max(0.05, plan[k].oldDur * Math.max(interval, 0.2) / oldSum) : Math.max(interval, 0.2) / (to - segFrom);
    }
    segStart = a.target; segFrom = to;
  }
}
// the tail after the last anchor keeps its authored durations, but must cover the read
const speechEnd = VO_START + (timeline.speechEnd ?? words[words.length - 1].e);
let total = newDur.reduce((t, d) => t + d, 0);
let tailNote = null;
if (total < speechEnd + 0.6) {
  const add = speechEnd + 0.8 - total;
  newDur[newDur.length - 1] += add;
  tailNote = `last shot extended +${add.toFixed(2)}s so the picture outlasts the final word (${speechEnd.toFixed(2)}s)`;
} else if (total - speechEnd > 3.5) {
  tailNote = `⚠ ${(total - speechEnd).toFixed(1)}s of picture after the last word — trim the tail or add copy`;
}
newDur.forEach((d, k) => { newDur[k] = Math.round(d * 20) / 20; if (newDur[k] < MIN_DUR) squeezed.push(`${plan[k].id}: ${newDur[k]}s — under ${MIN_DUR}s; the cues are too close for this many shots`); });
total = newDur.reduce((t, d) => t + d, 0);

// shot starts under the new durations
const starts = []; let t = 0;
for (const d of newDur) { starts.push(t); t += d; }

// --- 3. intra-shot cues: beats, word-build lines, device-notif more -------------
const inner = [];   // { i, field, path, values }
shots.forEach((s, i) => {
  const D = newDur[i], base = plan[i].wordIndex ?? 0;
  const relAt = (phrase) => {
    const hit = cueTime(phrase, base);
    if (!hit) return null;
    const at = VO_START + hit.start - LEAD - starts[i];
    return Math.min(Math.max(0.05, at), D - 0.1);
  };
  if (Array.isArray(s.beats)) {
    const ats = s.beats.map(b => (b.cue ? relAt(b.cue) : (b.at ?? null)));
    if (ats.some((a, k) => s.beats[k].cue)) inner.push({ i, field: "beats", ats });
  }
  if (Array.isArray(s.lines) && s.lines.some(l => l && l.cue)) {
    const ats = s.lines.map((l, k) => (l.cue ? relAt(l.cue) : (Array.isArray(s.lineAt) ? s.lineAt[k] : (k * D) / s.lines.length)));
    inner.push({ i, field: "lineAt", ats });
  }
  if (Array.isArray(s.more) && s.more.some(m => m && m.cue)) {
    const ats = s.more.map((m, k) => (m.cue ? relAt(m.cue) : (Array.isArray(s.moreAt) ? s.moreAt[k] : null)));
    inner.push({ i, field: "moreAt", ats });
  }
});

// --- 4. report ---------------------------------------------------------------------
const rel = p => (p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1) : p);
console.log(`🎯 sync — ${rel(SHOTS_PATH)} ⟵ ${rel(WORDS_PATH)}  (VO starts at ${VO_START}s, lead ${LEAD}s)\n`);
console.log("   #  id                 old    new    start   cue");
plan.forEach((p, k) => {
  const cue = p.cue ? `"${p.cue}"${p.cueAt !== null ? ` @${(VO_START + p.cueAt).toFixed(2)}s` : "  (NOT FOUND)"}` : "";
  const delta = newDur[k] !== p.oldDur ? (newDur[k] > p.oldDur ? "▲" : "▼") : " ";
  console.log(`  ${String(k + 1).padStart(2)}  ${p.id.padEnd(18)} ${p.oldDur.toFixed(2).padStart(5)} ${delta}${newDur[k].toFixed(2).padStart(5)}  ${starts[k].toFixed(2).padStart(6)}   ${cue}`);
});
for (const x of inner) {
  console.log(`      ${plan[x.i].id}.${x.field} → [${x.ats.map(a => (a === null ? "–" : a.toFixed(2))).join(", ")}]`);
}
console.log(`\n   film ${total.toFixed(2)}s · narration ${VO_START.toFixed(2)}→${speechEnd.toFixed(2)}s · ${anchors.length} anchors from ${plan.filter(p => p.cue).length} cued shots`);
if (tailNote) console.log(`   ${tailNote}`);
if (legacy) console.log(`   ⚠ ${legacy} shot(s) still carry per-shot vo/voDur — delete those fields; the mixer uses audio.vo.`);
for (const s of squeezed) console.log(`   ⚠ ${s}`);
if (notFound.length) {
  console.log(`\n❌ cue phrase(s) not in the script: ${notFound.map(c => `"${c}"`).join(", ")}`);
  console.log(`   script: ${timeline.text}`);
  process.exit(1);
}
if (!anchors.length) {
  console.log(`\n❌ no cued shot after the first — add \`cue: "<phrase>"\` to the shots that must land on a word.`);
  process.exit(1);
}
if (!WRITE) { console.log("\n   (plan only — pass --write to apply to shots.js)"); process.exit(0); }

// --- 5. write back: edit numbers in place, keep the author's file intact ---------
let src = readFileSync(SHOTS_PATH, "utf8");
const bak = SHOTS_PATH + ".bak";
copyFileSync(SHOTS_PATH, bak);

/** Byte range of the object literal for shot `id` (from its `id:` to the next shot's `id:`). */
function shotRange(text, id, ordinal) {
  const re = new RegExp(`\\bid\\s*:\\s*["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`, "g");
  const m = re.exec(text);
  if (!m) return null;
  // find the enclosing "{"
  let depth = 0, open = -1;
  for (let k = m.index; k >= 0; k--) {
    if (text[k] === "}") depth++;
    else if (text[k] === "{") { if (depth === 0) { open = k; break; } depth--; }
  }
  if (open < 0) return null;
  depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === "{") depth++;
    else if (text[k] === "}") { depth--; if (depth === 0) return [open, k + 1]; }
  }
  return null;
}
function fmt(n) { return String(+n.toFixed(2)); }
function setNumberField(block, field, value) {
  const re = new RegExp(`(\\b${field}\\s*:\\s*)[-\\d.]+`);
  if (re.test(block)) return block.replace(re, `$1${fmt(value)}`);
  return null;
}
function setArrayField(block, field, values) {
  const arr = `[${values.map(v => (v === null ? "null" : fmt(v))).join(", ")}]`;
  const re = new RegExp(`(\\b${field}\\s*:\\s*)\\[[^\\]]*\\]`);
  if (re.test(block)) return block.replace(re, `$1${arr}`);
  // insert after the dur line, matching its indentation
  const dm = block.match(/(\n[ \t]*)dur\s*:\s*[-\d.]+\s*,?/);
  if (!dm) return null;
  const insertAt = dm.index + dm[0].length;
  const comma = dm[0].trim().endsWith(",") ? "" : ",";
  return block.slice(0, insertAt) + comma + `${dm[1]}${field}: ${arr},` + block.slice(insertAt);
}
/** Set `at` on the k-th beat object inside the shot block. */
function setBeatAts(block, ats, beats) {
  const bm = block.match(/\bbeats\s*:\s*\[/);
  if (!bm) return null;
  let pos = bm.index + bm[0].length;
  let out = block;
  for (let k = 0; k < beats.length; k++) {
    if (ats[k] === null || !beats[k].cue) { // skip this object
      const o = out.indexOf("{", pos); if (o < 0) return null;
      pos = closeOf(out, o) + 1; continue;
    }
    const o = out.indexOf("{", pos); if (o < 0) return null;
    const c = closeOf(out, o);
    let obj = out.slice(o, c + 1);
    if (/\bat\s*:\s*[-\d.]+/.test(obj)) obj = obj.replace(/(\bat\s*:\s*)[-\d.]+/, `$1${fmt(ats[k])}`);
    else obj = obj.replace(/^\{\s*/, m => `${m}at: ${fmt(ats[k])}, `);
    out = out.slice(0, o) + obj + out.slice(c + 1);
    pos = o + obj.length;
  }
  return out;
}
function closeOf(text, open) {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === "{" || text[k] === "[") depth++;
    else if (text[k] === "}" || text[k] === "]") { depth--; if (depth === 0) return k; }
  }
  return -1;
}

const edits = [];
for (let k = 0; k < shots.length; k++) {
  const id = plan[k].id;
  const range = shotRange(src, id);
  if (!range) { console.log(`   ⚠ could not locate shot "${id}" in shots.js — set dur: ${fmt(newDur[k])} by hand`); continue; }
  let block = src.slice(range[0], range[1]);
  let next = setNumberField(block, "dur", newDur[k]);
  if (next === null) { console.log(`   ⚠ shot "${id}" has no numeric dur to edit`); continue; }
  block = next;
  for (const x of inner.filter(x => x.i === k)) {
    if (x.field === "beats") next = setBeatAts(block, x.ats, shots[k].beats);
    else next = setArrayField(block, x.field, x.ats);
    if (next === null) console.log(`   ⚠ could not write ${id}.${x.field} — set it by hand: [${x.ats.map(a => a === null ? "null" : fmt(a)).join(", ")}]`);
    else block = next;
  }
  if (block !== src.slice(range[0], range[1])) edits.push(id);
  src = src.slice(0, range[0]) + block + src.slice(range[1]);
}
writeFileSync(SHOTS_PATH, src);

// verify the file still evaluates and carries the numbers we meant to write
let check;
try { check = loadShots(SHOTS_PATH); } catch (err) {
  copyFileSync(bak, SHOTS_PATH);
  console.error(`\n❌ shots.js no longer evaluates after the edit (${err.message}) — restored from backup.`);
  process.exit(1);
}
const bad = check.shots.map((s, k) => [s.id, Number(s.dur), newDur[k]]).filter(([, a, b]) => Math.abs(a - b) > 0.011);
if (bad.length) {
  copyFileSync(bak, SHOTS_PATH);
  console.error(`\n❌ verification failed for ${bad.map(b => b[0]).join(", ")} — restored from backup. Apply the plan by hand.`);
  process.exit(1);
}

// re-time an existing SFX cue sheet the same way (cue stays inside its shot, same fraction)
const SFX = resolve("audio/sfx-cues.json");
if (existsSync(SFX)) {
  try {
    const sheet = JSON.parse(readFileSync(SFX, "utf8"));
    const oldStarts = []; let ot = 0; for (const p of plan) { oldStarts.push(ot); ot += p.oldDur; }
    let moved = 0;
    for (const c of sheet.cues || []) {
      let k = oldStarts.findIndex((s, i) => c.t >= s && c.t < s + plan[i].oldDur);
      if (k < 0) k = plan.length - 1;
      const frac = plan[k].oldDur ? (c.t - oldStarts[k]) / plan[k].oldDur : 0;
      const nt = +(starts[k] + frac * newDur[k]).toFixed(2);
      if (Math.abs(nt - c.t) > 0.01) moved++;
      c.t = nt;
    }
    writeFileSync(SFX, JSON.stringify(sheet, null, 2) + "\n");
    console.log(`\n   re-timed audio/sfx-cues.json (${moved} cue(s) moved) — rebuild the bus: motion_sfx build, duration ${total.toFixed(2)}`);
  } catch (err) { console.log(`\n   ⚠ audio/sfx-cues.json could not be re-timed: ${err.message}`); }
}

console.log(`\n✅ wrote ${rel(SHOTS_PATH)} (${edits.length} shot(s) edited, backup at ${rel(bak)}) — film is now ${total.toFixed(2)}s.`);
console.log(`   next: motion_cues → motion_sfx build → motion_mix (duration ${total.toFixed(2)}) → motion_audit`);
