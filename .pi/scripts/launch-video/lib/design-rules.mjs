/**
 * design-rules.mjs — timeline validity and review hints, independent of style.
 *
 * A treatment chooses shot lengths, animation vocabulary and composition.
 * The checker must not turn one reference film into a mandatory template.
 * Pure functions of the shot list;
 * cues.mjs --check prints them while the film is being built, audit.mjs
 * reports them at the gate.
 */

/**
 * The shot list as the lint sees it, read from window.SHOTS inside the page:
 * `page.evaluate(extractSpec)`. Self-contained on purpose (Playwright
 * serialises the function), so it must not close over anything here.
 */
export function extractSpec() {
  const s = window.SHOTS;
  if (!s || !Array.isArray(s.shots)) return null;
  const beatsOf = (x, kind) => (Array.isArray(x.beats) ? x.beats.filter((b) => b && b.kind === kind).length : 0);
  return {
    ambient: s.ambient || null,
    motion: s.motion || null,
    motionExit: s.motion && s.motion.exit ? s.motion.exit : null,
    audio: s.audio || null,
    actors: s.actors ? Object.keys(s.actors).length : 0,
    captions: s.captions ? { subtitles: !!s.captions.subtitles, jump: !!(s.captions.style && s.captions.style.jump) } : null,
    shots: s.shots.map((x) => {
      const names = x.actors ? Object.keys(x.actors) : [];
      return {
      id: x.id, type: x.type, dur: Number(x.dur) || 0, vo: x.vo || null, voDur: x.voDur || 0, cue: x.cue || null,
      beats: Array.isArray(x.beats) ? x.beats.length : 0, exit: x.exit ?? null, cut: x.cut || "hard",
      steps: Array.isArray(x.steps) ? x.steps.length : 0, actors: names.length, carry: !!x.carry, morph: x.morph || null,
      chapter: x.chapter || null, typing: !!x.typing, container: x.container || null,
      breaths: beatsOf(x, "breath"), floodBeats: beatsOf(x, "flood"), zoomBeats: beatsOf(x, "zoom"), rippleBeats: beatsOf(x, "ripple"),
      capturedSrc: x.type === "ui-frame" && typeof x.src === "string" && !x.html && /^assets\//.test(x.src),
      // what gives a shot a second act without a beat
      more: Array.isArray(x.more) ? x.more.length : 0, items: Array.isArray(x.items) ? x.items.length : 0,
      focus: !!x.focus, cursor: !!x.cursor, clickZoom: !!(x.cursor && x.cursor.zoom), cursors: Array.isArray(x.cursors) ? x.cursors.length : 0,
      frame: x.frame || null, tilt: !!x.tilt, layers: !!x.layers, html: !!x.html,
      src: x.src, rows: x.rows,
      // footage montage: each clip plays `dur` or `every`, the last holds to the end
      every: Number(x.every) > 0 ? Number(x.every) : null,
      clipDurs: Array.isArray(x.clips) ? x.clips.map((c) => (c && Number(c.dur) > 0 ? Number(c.dur) : null)) : null,
      srcs: [x.src, ...(Array.isArray(x.clips) ? x.clips.map((c) => c && c.src) : [])].filter((v) => typeof v === "string"),
      };
    }),
  };
}

const CUTS = new Set(["hard", "punch", "flood", "glitch"]);

/**
 * Lint the shot list (the shape extractSpec returns).
 * Returns [{ level: "fail" | "warn", code, msg }].
 */
export function lintDesign(spec) {
  const out = [];
  const shots = spec.shots || [];
  if (!shots.length) out.push({ level: "fail", code: "count", msg: "The timeline has no shots. Add the first shot before auditing." });
  shots.forEach((s, i) => {
    if (!Number.isFinite(s.dur) || s.dur <= 0) out.push({ level: "fail", code: "duration", msg: `#${s.id}: duration must be a finite, positive number (got ${s.dur}).` });
    if (!CUTS.has(s.cut)) out.push({ level: "fail", code: "cut", msg: `#${s.id}: cut "${s.cut}" does not exist — cuts are ${[...CUTS].join(", ")}, and none moves a whole shot. Join by the elements: the outgoing ones leave (exit), one becomes the next (morph), or the camera pushes in (a zoom beat).` });
    if (s.carry) out.push({ level: "fail", code: "carry", msg: `#${s.id}: carry is gone — write morph: { from, to } (one element becomes the next).` });
    if (s.morph && (i === 0 || !s.morph.from)) out.push({ level: "fail", code: "morph", msg: `#${s.id}: morph needs { from } in the shot before it${i === 0 ? ", and the first shot has none" : ""}.` });
    if (s.type === "ui-frame" && s.frame !== "phone" && !s.focus && !s.clickZoom && !s.layers && !s.html) out.push({ level: "warn", code: "desktop", msg: `#${s.id}: review this whole-screen ${s.frame || "browser"} view at delivery size. An overview is valid; if a particular control or label must be read, crop, focus or rebuild that detail.` });
  });
  return out;
}

/**
 * Pace and type rules for an ad (`audio.pace: "ad"`): the picture changes at
 * least 1.5 times a second, no still picture holds past 1.5s (the reveal and
 * one proof may reach 2.5s; the closing card is free), no clip is reused
 * across beats, and the keywords stand alone without a subtitle tier.
 * Shots that move inside themselves (float, exploded, signal, cascade…) count
 * as one picture but are not held against the still-picture limit.
 */
const STILL_TYPES = new Set(["footage", "card", "evidence", "line", "ui-frame"]);
const CLOSE_TYPES = new Set(["logo-cta", "logo-sting"]);
export function paceStats(spec) {
  const shots = spec.shots || [];
  let changes = 0, total = 0;
  const holds = [];
  shots.forEach((s, i) => {
    total += s.dur;
    let spans = [s.dur];
    if (s.type === "footage" && s.clipDurs && s.clipDurs.length > 1) {
      const n = s.clipDurs.length, every = s.every ?? s.dur / n;
      spans = [];
      let clock = 0;
      s.clipDurs.forEach((d, k) => {
        const end = k === n - 1 ? s.dur : Math.min(s.dur, clock + (d ?? every));
        if (end > clock) spans.push(end - clock);
        clock = end;
      });
    }
    changes += spans.length;
    const last = i === shots.length - 1 && CLOSE_TYPES.has(s.type);
    if (STILL_TYPES.has(s.type) && !last) holds.push({ id: s.id, type: s.type, hold: Math.max(...spans) });
  });
  return { changes, duration: total, rate: total ? changes / total : 0, holds };
}
export function lintAd(spec) {
  if (!spec.audio || spec.audio.pace !== "ad") return [];
  const out = [];
  const st = paceStats(spec);
  if (st.rate < 1.5) out.push({ level: "warn", code: "pace", msg: `picture changes ${st.rate.toFixed(2)}/s (${st.changes} in ${st.duration.toFixed(1)}s) — an ad targets ≥1.5/s: split long beats into \`clips\` bursts (every 0.2–0.5s) rather than speeding the voice.` });
  const long = st.holds.filter((h) => h.hold > 1.5).sort((a, b) => b.hold - a.hold);
  // The reveal and one proof hold may run to 2.5s.
  const allowed = long.filter((h) => h.hold <= 2.5).slice(0, 2).map((h) => h.id);
  for (const h of long) {
    if (allowed.includes(h.id)) continue;
    out.push({ level: "warn", code: "hold", msg: `#${h.id}: one ${h.type === "footage" ? "picture" : h.type} holds ${h.hold.toFixed(2)}s — over 1.5s; make it a burst (more \`clips\`, or \`every\` so the last clip does not hold) or split the card.` });
  }
  const seen = new Map();
  for (const s of spec.shots || []) {
    for (const src of new Set(s.srcs || [])) {
      if (!/\.(mp4|webm|mov|m4v)$/i.test(src)) continue;
      if (seen.has(src) && seen.get(src) !== s.id) out.push({ level: "warn", code: "reuse", msg: `#${s.id}: ${src} already plays in #${seen.get(src)} — a clip belongs to one beat; find another (pitch motion stock).` });
      else seen.set(src, s.id);
    }
  }
  if (spec.captions && spec.captions.subtitles) out.push({ level: "warn", code: "subtitles", msg: "captions.subtitles is on — ads use moving keywords only unless the user asked for subtitles." });
  return out;
}

/** The lints worth hearing while the film is still being built (cues.mjs --check). */
export function lintWhileBuilding(spec) {
  return [...lintDesign(spec).filter((l) => l.code !== "count"), ...lintAd(spec)];
}

/** The per-shot line the audit prints for the summary. */
export function designSummary(spec) {
  const shots = spec.shots || [];
  const parts = [];
  if (spec.actors) parts.push(`actors ${spec.actors}`);
  const chapters = new Set(shots.map((s) => s.chapter).filter(Boolean));
  if (chapters.size) parts.push(`chapters ${chapters.size}`);
  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  parts.push(`breaths ${breaths}`);
  return parts.join(" · ");
}
