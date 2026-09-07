/**
 * design-rules.mjs — what the gate expects of any shot list.
 *
 * Limits measured from reference launch films (docs/studies/), loose enough
 * that any structure fits: the tells here are the ones every film shares —
 * shots that hold, a slideshow's rhythm, text that only enters, a whole
 * desktop where one control should be. Pure functions of the shot list;
 * cues.mjs --check prints them while the film is being built, audit.mjs
 * reports them at the gate.
 */

export const LIMITS = {
  shots: [4, 40],
  avg: 3.6,       // over this the film reads as slides
  shotMax: 6.0,   // one idea per shot, even a scene with steps or actors
  hook: 3.5,      // the first shot is a designed hook, not a hold
  hold: 1.5,      // the audit's longest quiet stretch: a shot longer than this needs a second act
};

export const TYPE_BEATS = new Set(["word-build", "pile", "type-field", "overlay-type", "logo-sting", "type-wipe", "icon-marquee", "word-cut", "color-punch", "logo-cta", "stat-counter", "line"]);
/** Built-in type beats whose whole move is an entrance — the lab's text family does the same job with a real move. */
export const PLAIN_TYPE = new Set(["word-cut", "type-wipe", "color-punch", "type-field", "overlay-type"]);
export const TRANSITION_CUTS = new Set(["dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "push-left", "push-right", "push-up", "push-down", "iris", "zoom", "zoom-out", "flip", "flood"]);

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
    shots: s.shots.map((x) => ({
      id: x.id, type: x.type, dur: Number(x.dur) || 0, vo: x.vo || null, voDur: x.voDur || 0, cue: x.cue || null,
      beats: Array.isArray(x.beats) ? x.beats.length : 0, exit: x.exit ?? null, cut: x.cut || "hard",
      steps: Array.isArray(x.steps) ? x.steps.length : 0, actors: x.actors ? Object.keys(x.actors).length : 0, carry: !!x.carry,
      chapter: x.chapter || null, typing: !!x.typing, container: x.container || null,
      breaths: beatsOf(x, "breath"), floodBeats: beatsOf(x, "flood"), zoomBeats: beatsOf(x, "zoom"), rippleBeats: beatsOf(x, "ripple"),
      capturedSrc: x.type === "ui-frame" && typeof x.src === "string" && !x.html && /^assets\//.test(x.src),
      // what gives a shot a second act without a beat
      more: Array.isArray(x.more) ? x.more.length : 0, items: Array.isArray(x.items) ? x.items.length : 0,
      focus: !!x.focus, cursor: !!x.cursor, clickZoom: !!(x.cursor && x.cursor.zoom), cursors: Array.isArray(x.cursors) ? x.cursors.length : 0,
      frame: x.frame || null, tilt: !!x.tilt, layers: !!x.layers, html: !!x.html, lab: x.lab || null,
      src: x.src, rows: x.rows,
    })),
  };
}

/** Whether a shot changes after its entrance without a `beats` entry. */
function secondAct(s) {
  if (s.beats > 0 || s.steps > 0 || s.actors > 0) return true;
  if (s.more > 0 || s.items > 0 || s.focus || s.cursor || s.cursors > 0 || s.tilt || s.typing) return true;
  // these types are a sequence by construction
  return ["pile", "cascade", "word-build", "icon-marquee", "stat-counter", "device-notif", "lottie", "rive", "device-3d"].includes(s.type);
}

/**
 * Lint the shot list (the shape extractSpec returns).
 * Returns [{ level: "fail" | "warn", code, msg }].
 */
export function lintDesign(spec) {
  const out = [];
  const shots = spec.shots || [];
  const R = LIMITS;
  const n = shots.length;
  if (n < R.shots[0]) out.push({ level: "fail", code: "count", msg: `Only ${n} shots — a launch film runs ${R.shots[0]}–${R.shots[1]}. Cut ideas into more beats.` });
  if (n > R.shots[1]) out.push({ level: "warn", code: "count", msg: `${n} shots — over ${R.shots[1]}; make sure each is one idea.` });
  const avg = shots.reduce((a, s) => a + (Number(s.dur) || 0), 0) / Math.max(1, n);
  if (avg > R.avg) out.push({ level: "fail", code: "avg", msg: `Average shot length ${avg.toFixed(2)}s — over ${R.avg}s the film reads as slides.` });
  shots.forEach((s, i) => {
    if (s.dur > R.shotMax) out.push({ level: "fail", code: "long", msg: `#${s.id} (${s.type}): ${s.dur}s — a shot is ≤ ${R.shotMax}s. Split it, or give it steps, actors or beats.` });
    if (i === 0 && s.dur > R.hook) out.push({ level: "warn", code: "hook", msg: `#${s.id}: the hook is ${s.dur}s — the first ${R.hook} seconds should be a designed hook, not a hold.` });
  });

  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  const punches = shots.filter((s) => s.cut === "punch").length;

  const first = shots[0];
  if (first && first.type === "line" && first.typing) out.push({ level: "fail", code: "typing", msg: `#${first.id}: the film opens on a caret typing at hero scale. The first second is a move; \`typing\` belongs only to a prompt box inside a rebuilt \`ui-frame\`, mid-film.` });
  shots.forEach((s) => {
    if ((s.rippleBeats || 0) > 0) out.push({ level: "fail", code: "ripple", msg: `#${s.id}: a \`ripple\` beat — rings expanding from a press are banned. A press is the control's own state change (the pill grows, the button splits, the toggle snaps) or a \`flood\`.` });
    if (s.type === "ui-frame" && s.capturedSrc && !secondAct(s)) out.push({ level: "warn", code: "still", msg: `#${s.id}: a captured screen sits still as the product (\`src\`, no \`html\`). A still screenshot cannot have a second act — give the shot a focus move, a cursor, a beat, or rebuild the part that moves as \`html\`.` });
    // A shot that enters and then holds is the quiet stretch the audit fails.
    if (s.dur > R.hold && !secondAct(s)) out.push({ level: "warn", code: "hold", msg: `#${s.id} (${s.type}): ${s.dur}s with nothing after the entrance — the audit fails a quiet stretch over ${R.hold}s. Give it a second act now (\`beats\`, \`steps\`, an actor, a \`focus\` or \`cursor\`) or cut it at ${R.hold}s; do not wait for the gate to say so.` });
    // Text that only slides in: the lab's text family exists for exactly this beat.
    if (PLAIN_TYPE.has(s.type) && !s.lab) out.push({ level: "warn", code: "plain-type", msg: `#${s.id}: \`${s.type}\` is text that only enters. The lab has 69 text effects — motion_effects({ query: "<what this line should do>", family: "text" }) — port one as a custom type, or put the copy in a \`line\` with steps.` });
    // A whole desktop at 1560px is wallpaper; the reference films keep one thing big and centred.
    if (s.type === "ui-frame" && s.frame !== "phone" && !s.focus && !s.clickZoom && !s.layers && !s.html) out.push({ level: "warn", code: "desktop", msg: `#${s.id}: a whole screen in a ${s.frame || "browser"} frame with no \`focus\`, no \`cursor.zoom\` and no layers — a full desktop is never the subject. Crop to the one control the copy is about (motion_screenshot({ selector }) at 2×), or push in with \`focus\` so it fills the frame.` });
  });
  if (n >= 8 && punches === 0) out.push({ level: "warn", code: "punch", msg: "No `punch` cuts — mark 2–3 boundaries where a beat lands." });
  if (!breaths && n >= 8) out.push({ level: "warn", code: "breath", msg: "No `breath` beats — the reference films duck the bed for half a second before every payoff. Put one before the moment the film is about." });
  const bare = !spec.ambient || spec.ambient.kind === "none";
  if (bare && !(spec.actors > 0)) out.push({ level: "warn", code: "stage", msg: "No `ambient` stage layer and no actors — the film has no life between events. Pick a stage kind, or say in direction.md why the stage is bare." });
  return out;
}

/** The lints worth hearing while the film is still being built (cues.mjs --check). */
export function lintWhileBuilding(spec) {
  const n = (spec.shots || []).length;
  return lintDesign(spec).filter((l) => !["punch", "breath", "stage"].includes(l.code) && !(l.code === "count" && n < LIMITS.shots[0]));
}

/** The per-shot line the audit prints for the summary. */
export function designSummary(spec) {
  const shots = spec.shots || [];
  const parts = [];
  if (spec.actors) parts.push(`actors ${spec.actors}`);
  const chapters = new Set(shots.map((s) => s.chapter).filter(Boolean));
  if (chapters.size) parts.push(`chapters ${chapters.size}`);
  const lab = shots.filter((s) => s.lab || !TYPE_BEATS.has(s.type) && !["ui-frame", "device-notif", "device-3d", "lottie", "rive", "cascade"].includes(s.type)).length;
  parts.push(`lab moves ${lab}`);
  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  parts.push(`breaths ${breaths}`);
  return parts.join(" · ");
}
