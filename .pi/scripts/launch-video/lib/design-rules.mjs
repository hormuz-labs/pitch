/**
 * design-rules.mjs — what the gate expects of any shot list.
 *
 * Limits measured from reference launch films (docs/studies/), loose enough
 * that any structure fits: the tells here are the ones every film shares —
 * shots that hold, a slideshow's rhythm, text that only enters, a whole
 * desktop where one control should be, boundaries nothing crosses. Pure functions of the shot list;
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
/** The engine's own types. A project type (js/shots/<type>.js) is a lab port whose factory timeline carries its own acts — the check does not second-guess it; the audit measures it. */
export const BUILT_IN = new Set([...TYPE_BEATS, "ui-frame", "device-notif", "device-3d", "lottie", "rive", "cascade"]);
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
    shots: s.shots.map((x) => {
      // which actors this shot poses, and which of them leave or land here —
      // what joinsOf needs to see an object cross the boundary
      const names = x.actors ? Object.keys(x.actors) : [];
      const posesOf = (n) => (Array.isArray(x.actors[n]) ? x.actors[n] : [x.actors[n]]).filter(Boolean);
      return {
      id: x.id, type: x.type, dur: Number(x.dur) || 0, vo: x.vo || null, voDur: x.voDur || 0, cue: x.cue || null,
      beats: Array.isArray(x.beats) ? x.beats.length : 0, exit: x.exit ?? null, cut: x.cut || "hard",
      steps: Array.isArray(x.steps) ? x.steps.length : 0, actors: names.length, carry: !!x.carry,
      actorNames: names,
      actorOut: names.filter((n) => posesOf(n).some((p) => p.out)),
      actorHold: names.filter((n) => posesOf(n).some((p) => p.hold === true)),
      chapter: x.chapter || null, typing: !!x.typing, container: x.container || null,
      breaths: beatsOf(x, "breath"), floodBeats: beatsOf(x, "flood"), zoomBeats: beatsOf(x, "zoom"), rippleBeats: beatsOf(x, "ripple"),
      capturedSrc: x.type === "ui-frame" && typeof x.src === "string" && !x.html && /^assets\//.test(x.src),
      // what gives a shot a second act without a beat
      more: Array.isArray(x.more) ? x.more.length : 0, items: Array.isArray(x.items) ? x.items.length : 0,
      focus: !!x.focus, cursor: !!x.cursor, clickZoom: !!(x.cursor && x.cursor.zoom), cursors: Array.isArray(x.cursors) ? x.cursors.length : 0,
      frame: x.frame || null, tilt: !!x.tilt, layers: !!x.layers, html: !!x.html, lab: x.lab || null,
      src: x.src, rows: x.rows,
      };
    }),
  };
}

/** The cuts that carry the picture across: the frame fills, or the camera moves into part of what is there. */
const JOIN_CUTS = new Set(["flood", "zoom", "zoom-out"]);

/**
 * What crosses each boundary. The reference films read as one piece because
 * almost nothing arrives new: the bar that wipes a line away turns into the
 * phone the next shot is about. In the engine that is an actor posed on both
 * sides of a cut (or held across it), a `carry`, an actor landing `into` the
 * next shot's element, or a flood / zoom cut. A `punch` is a cut kept on
 * purpose. Returns one entry per boundary: { from, to, kind | null }.
 */
export function joinsOf(spec) {
  const shots = spec.shots || [];
  // Each actor's runs on screen: from a pose to its `out` (or its last pose);
  // a pose after an `out` starts a new run.
  const runs = [];
  const open = {};
  shots.forEach((s, i) => {
    for (const n of s.actorNames || []) {
      if (!open[n]) { open[n] = { name: n, first: i, last: i }; runs.push(open[n]); }
      open[n].last = i;
      if ((s.actorOut || []).includes(n)) delete open[n];
    }
  });
  const joins = [];
  for (let i = 0; i + 1 < shots.length; i++) {
    const a = shots[i], b = shots[i + 1];
    let kind = null;
    const crossing = runs.find((r) => r.first <= i && r.last > i)?.name;
    const held = (a.actorHold || []).find((n) => !(a.actorOut || []).includes(n));
    if (crossing) kind = `actor ${crossing}`;
    else if (held) kind = `actor ${held} held`;
    else if (b.carry) kind = "carry";
    else if (JOIN_CUTS.has(b.cut)) kind = b.cut;
    joins.push({ from: a.id, to: b.id, kind });
  }
  return joins;
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
  // Length is a note, not a gate: the numbers are the reference films', and a
  // 6.4s signature shot split in two to satisfy a limit became one shot and
  // one static pair of cards.
  if (avg > R.avg) out.push({ level: "warn", code: "avg", msg: `Average shot length ${avg.toFixed(2)}s — over ${R.avg}s a film tends to read as slides. A second act in the long ones, or a cut; not a rule to split a shot that works.` });
  shots.forEach((s, i) => {
    if (s.dur > R.shotMax) out.push({ level: "warn", code: "long", msg: `#${s.id} (${s.type}): ${s.dur}s — the reference films keep a shot under ${R.shotMax}s. Fine for a signature shot with steps, actors or beats all the way through; otherwise split it.` });
    if (i === 0 && s.dur > R.hook) out.push({ level: "warn", code: "hook", msg: `#${s.id}: the hook is ${s.dur}s — the first ${R.hook} seconds should be a designed hook, not a hold.` });
  });

  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  const punches = shots.filter((s) => s.cut === "punch").length;

  const first = shots[0];
  if (first && first.type === "line" && first.typing) out.push({ level: "fail", code: "typing", msg: `#${first.id}: the film opens on a caret typing at hero scale. The first second is a move; \`typing\` belongs only to a prompt box inside a rebuilt \`ui-frame\`, mid-film.` });
  shots.forEach((s) => {
    if ((s.rippleBeats || 0) > 0) out.push({ level: "fail", code: "ripple", msg: `#${s.id}: a \`ripple\` beat — rings expanding from a press are banned. A press is the control's own state change (the pill grows, the button splits, the toggle snaps) or a \`flood\`.` });
    if (s.type === "ui-frame" && s.capturedSrc && !secondAct(s)) out.push({ level: "warn", code: "still", msg: `#${s.id}: a captured screen sits still as the product (\`src\`, no \`html\`). A still screenshot cannot have a second act — give the shot a focus move, a cursor, a beat, or rebuild the part that moves as \`html\`.` });
    // A built-in type that enters and then holds is the quiet stretch the audit notes. A project type is not
    // judged here: its factory timeline is the acts, and adding `beats` on top of a lab port is what made
    // the bouncy films — the audit measures what actually moves.
    if (BUILT_IN.has(s.type) && s.dur > R.hold && !secondAct(s)) out.push({ level: "warn", code: "hold", msg: `#${s.id} (${s.type}): ${s.dur}s of a built-in type with nothing after its entrance — the audit will note the quiet stretch over ${R.hold}s. A \`steps\` sequence, a \`swap\`, a \`focus\` or \`cursor\` changes what the frame says; or cut it at ${R.hold}s. A pulse on a word is not a second act.` });
    // Text that only slides in: the lab's text family exists for exactly this beat.
    if (PLAIN_TYPE.has(s.type) && !s.lab) out.push({ level: "warn", code: "plain-type", msg: `#${s.id}: \`${s.type}\` is text that only enters. The lab has 69 text effects — motion_effects({ query: "<what this line should do>", family: "text" }) — port one as a custom type, or put the copy in a \`line\` with steps.` });
    // A whole desktop at 1560px is wallpaper at 1080p: nothing on it can be read.
    if (s.type === "ui-frame" && s.frame !== "phone" && !s.focus && !s.clickZoom && !s.layers && !s.html) out.push({ level: "warn", code: "desktop", msg: `#${s.id}: a whole screen in a ${s.frame || "browser"} frame with no \`focus\`, no \`cursor.zoom\` and no layers — at 1080p none of it can be read. Push in with \`focus\` or \`cursor.zoom\` to the part the copy is about, or rebuild that part as \`html\`.` });
  });
  if (n >= 8 && punches === 0) out.push({ level: "warn", code: "punch", msg: "No `punch` cuts — mark 2–3 boundaries where a beat lands." });
  if (!breaths && n >= 8) out.push({ level: "warn", code: "breath", msg: "No `breath` beats — the reference films duck the bed for half a second before every payoff. Put one before the moment the film is about." });
  const bare = !spec.ambient || spec.ambient.kind === "none";
  if (bare && !(spec.actors > 0)) out.push({ level: "warn", code: "stage", msg: "No `ambient` stage layer and no actors — the film has no life between events. Pick a stage kind, or say in direction.md why the stage is bare." });
  // Boundaries nothing crosses. The audit measures how much changes between two
  // samples and never whether what arrived came from what was there; this is
  // the one place that asks. Over a third plain and the film reads as slides
  // however dense it is.
  if (n >= R.shots[0]) {
    const joins = joinsOf(spec);
    const plain = joins.filter((j) => !j.kind);
    if (plain.length * 3 > joins.length) {
      const named = plain.slice(0, 4).map((j) => `${j.from}→${j.to}`).join(", ") + (plain.length > 4 ? ", …" : "");
      out.push({ level: "warn", code: "join", msg: `${plain.length} of ${joins.length} boundaries carry nothing across (${named}). The reference films pass one object from shot to shot — the bar that wipes the line away turns into the phone. An actor posed on both sides of the cut (or \`hold: true\`), a \`carry\`, a \`flood\` or a \`zoom\` joins two shots; name the film's object in direction.md and let it cross. A \`punch\` is the cut you keep — on a beat, and few.` });
    }
  }
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
  const joins = joinsOf(spec);
  if (joins.length) parts.push(`joins ${joins.filter((j) => j.kind).length}/${joins.length}`);
  const chapters = new Set(shots.map((s) => s.chapter).filter(Boolean));
  if (chapters.size) parts.push(`chapters ${chapters.size}`);
  // Only a shot that names its lab id is a lab move; a custom type invented on
  // the spot is not one, and counting it as one flattered every film.
  const lab = shots.filter((s) => s.lab).length;
  parts.push(`lab moves ${lab}`);
  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  parts.push(`breaths ${breaths}`);
  return parts.join(" · ");
}
