/**
 * audio-fx.mjs — the mix automation a film declares in shots.js `audio.fx`.
 *
 * Effects that let the soundtrack make the argument, as the reference ads
 * do: the whole mix goes muffled while the narrator says "they make music
 * muffled", a thin tone rings under "damage your hearing forever", and the
 * bass drops out of the bed until the line the film turns on.
 *
 *   audio: { vo: "audio/vo.wav", voStart: 0.3, fx: [
 *     { kind: "muffle", cue: "they make music muffled", until: "conversations",
 *       cutoff: 800, voCutoff: 3200 },
 *     { kind: "ring", cue: "forever", until: "sunglasses", freq: 3600, level: -30 },
 *   ] }
 *
 * Times are film seconds (`from`/`to`), or phrases of the narration (`cue`:
 * onset of its first word; `until`: end of its last word) resolved against the
 * aligned read, so a re-recorded voice keeps its effects on the right words.
 *
 * muffle — a low-pass over [from, to] with eased edges. The bed and the SFX
 *          take `cutoff` (800Hz: through a wall); the voice takes `voCutoff`
 *          (3200Hz: dulled but every word intelligible). `voCutoff: null`
 *          leaves the voice untouched. `targets` narrows the stems.
 * ring   — a sine tone at `freq` (3600Hz) and `level` dBFS (−30, capped at
 *          −12), faded in over `attack` and out over `release`. It is not
 *          ducked or muffled: it is the sound in the listener's head.
 * thin   — the bass pulled out of the bed over [from, to] (a high-pass at
 *          `cutoff`, 300Hz) with eased edges: the breakdown before a drop. When
 *          the window ends the low end slams back — put that end on the word
 *          the film turns on. `targets` defaults to the bed only.
 */
import { findPhrase } from "./vo-words.mjs";

const MUFFLE_TARGETS = ["bed", "sfx", "vo"];
const KINDS = ["muffle", "ring", "thin"];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (v, d) => (v == null || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

/**
 * Resolve spec.audio.fx into timed effects.
 * @param spec   the evaluated window.SHOTS
 * @param words  the vo-words.json word list, or null
 * @param duration the film's length in seconds (clamps windows)
 * @returns {{ muffles: object[], rings: object[], thins: object[], problems: string[] }}
 */
export function resolveAudioFx(spec, words, duration = Infinity) {
  const list = Array.isArray(spec?.audio?.fx) ? spec.audio.fx : [];
  const voStart = num(spec?.audio?.voStart, 0.3);
  const problems = [];
  const muffles = [];
  const rings = [];
  const thins = [];
  const phraseStart = (phrase, what) => {
    if (!words) { problems.push(`${what} "${phrase}" needs the aligned narration (audio/vo-words.json) — run pitch motion align, or use from/to seconds`); return null; }
    const hit = findPhrase(words, phrase, 0);
    if (!hit) { problems.push(`${what} "${phrase}" is not in the narration`); return null; }
    return voStart + hit.start;
  };
  const phraseEnd = (phrase, what) => {
    if (!words) { problems.push(`${what} "${phrase}" needs the aligned narration (audio/vo-words.json) — run pitch motion align, or use from/to seconds`); return null; }
    const hit = findPhrase(words, phrase, 0);
    if (!hit) { problems.push(`${what} "${phrase}" is not in the narration`); return null; }
    return voStart + hit.end;
  };
  list.forEach((fx, i) => {
    const label = `audio.fx[${i}]${fx?.kind ? ` (${fx.kind})` : ""}`;
    if (!fx || !KINDS.includes(fx.kind)) {
      problems.push(`${label}: kind must be ${KINDS.map((k) => `"${k}"`).join(", ")}`);
      return;
    }
    const from = fx.from != null ? num(fx.from, null) : fx.cue ? phraseStart(fx.cue, `${label} cue`) : null;
    const to = fx.to != null ? num(fx.to, null) : fx.until ? phraseEnd(fx.until, `${label} until`) : fx.cue ? phraseEnd(fx.cue, `${label} cue`) : null;
    if (from == null || to == null) {
      if (fx.from == null && !fx.cue) problems.push(`${label}: give from/to seconds or a cue phrase`);
      return;
    }
    const a = clamp(from, 0, duration), b = clamp(to, 0, duration);
    if (!(b - a >= 0.1)) { problems.push(`${label}: its window ${a.toFixed(2)}–${b.toFixed(2)}s is shorter than 0.1s`); return; }
    const attack = clamp(num(fx.attack, 0.12), 0.01, 2);
    const release = clamp(num(fx.release, 0.25), 0.01, 3);
    if (fx.kind === "thin") {
      const targets = Array.isArray(fx.targets) ? fx.targets.filter((t) => MUFFLE_TARGETS.includes(t)) : ["bed"];
      thins.push({ from: +a.toFixed(3), to: +b.toFixed(3), attack, release: clamp(num(fx.release, 0.05), 0.01, 3), cutoff: clamp(num(fx.cutoff, 300), 60, 2000), targets });
    } else if (fx.kind === "muffle") {
      const targets = Array.isArray(fx.targets) ? fx.targets.filter((t) => MUFFLE_TARGETS.includes(t)) : MUFFLE_TARGETS;
      if (Array.isArray(fx.targets) && targets.length !== fx.targets.length) problems.push(`${label}: targets are ${MUFFLE_TARGETS.join(", ")}`);
      muffles.push({
        from: +a.toFixed(3), to: +b.toFixed(3), attack, release,
        cutoff: clamp(num(fx.cutoff, 800), 150, 8000),
        voCutoff: fx.voCutoff === null || fx.voCutoff === false ? null : clamp(num(fx.voCutoff, 3200), 1200, 8000),
        targets,
      });
    } else {
      rings.push({
        from: +a.toFixed(3), to: +b.toFixed(3),
        attack: clamp(num(fx.attack, 0.3), 0.01, 3), release: clamp(num(fx.release, 0.15), 0.01, 3),
        freq: clamp(num(fx.freq, 3600), 200, 12000),
        level: clamp(num(fx.level, -30), -60, -12),
      });
    }
  });
  return { muffles, rings, thins, problems };
}

/** 0→1 over [from−attack, from], 1 until `to`, 1→0 over [to, to+release]; cosine-eased. */
function windowExpr({ from, to, attack, release }) {
  const smooth = (x) => `(0.5-0.5*cos(PI*clip(${x},0,1)))`;
  const a = from.toFixed(3), b = to.toFixed(3);
  return `${smooth(`(t-(${a}-${attack.toFixed(3)}))/${attack.toFixed(3)}`)}*${smooth(`((${b}+${release.toFixed(3)})-t)/${release.toFixed(3)}`)}`;
}

/**
 * The ffmpeg -filter_complex that muffles one stereo stem over `windows`, all
 * at one cutoff: a dry copy and a low-passed copy (24dB/oct) crossfaded by the
 * eased envelope, so the edges glide rather than click. Input [0:a], output [out].
 */
export function muffleGraph(windows, cutoff, pass = "lowpass") {
  if (!windows.length) return null;
  const env = windows.map(windowExpr).reduce((acc, w) => (acc ? `max(${acc},${w})` : w), "");
  const f = Math.round(cutoff);
  return `[0:a]asplit=2[dry][wet];` +
    `[wet]${pass}=f=${f}:p=2,${pass}=f=${f}:p=2,volume=volume='${env}':eval=frame[w];` +
    `[dry]volume=volume='1-(${env})':eval=frame[d];` +
    `[d][w]amix=inputs=2:normalize=0:dropout_transition=0[out]`;
}

/**
 * Groups of muffle windows per stem, one group per distinct cutoff, so each
 * group is one muffleGraph pass. The voice uses voCutoff and skips windows
 * that leave it clear.
 */
export function muffleStages(muffles, stem) {
  const groups = new Map();
  for (const m of muffles) {
    if (!m.targets.includes(stem)) continue;
    const cutoff = stem === "vo" && "voCutoff" in m ? m.voCutoff : m.cutoff;
    if (cutoff == null) continue;
    if (!groups.has(cutoff)) groups.set(cutoff, []);
    groups.get(cutoff).push(m);
  }
  return [...groups.entries()].map(([cutoff, windows]) => ({ cutoff, windows }));
}

/** ffmpeg arguments (after -y) that write one ring as a full-length stereo stem. */
export function ringArgs(ring, total, out) {
  const len = Math.max(0.1, ring.to - ring.from);
  const ms = Math.round(ring.from * 1000);
  const fadeOut = Math.max(0, len - ring.release);
  return [
    "-f", "lavfi", "-i", `sine=frequency=${ring.freq}:sample_rate=48000:duration=${len.toFixed(3)}`,
    "-af",
    `volume=${ring.level}dB,afade=t=in:st=0:d=${Math.min(ring.attack, len).toFixed(3)},` +
    `afade=t=out:st=${fadeOut.toFixed(3)}:d=${Math.min(ring.release, len).toFixed(3)},` +
    `aformat=channel_layouts=stereo,adelay=${ms}|${ms},apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}`,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out,
  ];
}
