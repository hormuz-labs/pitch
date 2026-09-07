/**
 * vo-words.mjs — shared helpers for the continuous-narration pipeline.
 *
 * audio/vo-words.json (written by align.mjs) is the word timeline of the one
 * continuous read:  { file, duration, text, matched, words: [{ w, n, s, e }] }
 *   w = word as written in the script, n = normalised form, s/e = seconds.
 *
 * sync.mjs and audit.mjs both locate cue phrases with findPhrase(), so the
 * timing the sync applies is exactly the timing the audit checks.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SMALL = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve",
  "thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
const ALIAS = { "&": "and", "%": "percent", "+": "plus", "1st": "first", "2nd": "second", "3rd": "third",
  "ok": "okay", "ui": "ui", "ai": "ai", "vs": "versus" };

/** Numbers to words so "10" and "ten" compare equal. */
function numWords(n) {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? SMALL[n % 10] : "");
  if (n < 1000) return SMALL[Math.floor(n / 100)] + "hundred" + (n % 100 ? numWords(n % 100) : "");
  if (n < 1000000) return numWords(Math.floor(n / 1000)) + "thousand" + (n % 1000 ? numWords(n % 1000) : "");
  return String(n);
}

/** Normalise a token for comparison: lowercase, no punctuation, numbers spelled out. */
export function normWord(raw) {
  let t = String(raw).toLowerCase().trim();
  if (ALIAS[t]) return ALIAS[t];
  t = t.replace(/[’']/g, "");
  const num = t.replace(/[,$]/g, "").match(/^(\d+)(k|m)?$/);
  if (num) {
    let n = Number(num[1]);
    if (num[2] === "k") n *= 1000;
    if (num[2] === "m") n *= 1000000;
    return numWords(n);
  }
  return t.replace(/[^a-z0-9]+/g, "");
}

/** Split free text into script words (keeps the written form). */
export function tokenize(text) {
  return String(text).replace(/[—–]/g, " ").split(/\s+/).map(w => w.trim()).filter(w => normWord(w).length > 0);
}

export function loadWords(path) {
  const p = resolve(path);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (!Array.isArray(data.words)) return null;
    return data;
  } catch { return null; }
}

/** Default word-timeline path next to the VO file. */
export function wordsPathFor(voFile) {
  return resolve(dirname(resolve(voFile)), "vo-words.json");
}

/**
 * Find a phrase in the word timeline, searching forward from `from` (word index)
 * first, then anywhere. Returns { start, end, index, count } or null.
 * `start` is the onset of the phrase's first word.
 */
export function findPhrase(words, phrase, from = 0) {
  const target = tokenize(phrase).map(normWord).filter(Boolean);
  if (!target.length) return null;
  const scan = (lo, hi) => {
    for (let i = lo; i <= hi - target.length; i++) {
      let ok = true;
      for (let j = 0; j < target.length; j++) {
        if (words[i + j].n !== target[j]) { ok = false; break; }
      }
      if (ok) return { start: words[i].s, end: words[i + target.length - 1].e, index: i, count: target.length };
    }
    return null;
  };
  return scan(Math.max(0, from), words.length) || scan(0, words.length);
}

/** Longest silence between consecutive words, and where. */
export function speechGaps(words, min = 0.6) {
  const gaps = [];
  for (let i = 1; i < words.length; i++) {
    const g = words[i].s - words[i - 1].e;
    if (g >= min) gaps.push({ at: words[i - 1].e, dur: +g.toFixed(2), after: words[i - 1].w, before: words[i].w });
  }
  return gaps.sort((a, b) => b.dur - a.dur);
}

/** Evaluate shots.js (a data literal) → window.SHOTS, or null. */
export function loadShots(path = "shots.js") {
  const p = resolve(path);
  if (!existsSync(p)) return null;
  const w = {};
  try { new Function("window", readFileSync(p, "utf8"))(w); } catch (err) {
    throw new Error(`Could not evaluate ${path}: ${err.message}`);
  }
  return w.SHOTS || null;
}

/** Narration placement: where the continuous read starts on the timeline. */
export const DEFAULT_VO_START = 0.3;
export function voStartOf(spec) {
  const v = Number(spec?.audio?.voStart);
  return Number.isFinite(v) ? v : DEFAULT_VO_START;
}
