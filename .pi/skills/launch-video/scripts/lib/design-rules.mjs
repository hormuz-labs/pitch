/**
 * design-rules.mjs — what the gate expects of any shot list.
 *
 * Limits measured from reference launch films (docs/studies/), loose enough
 * that any structure fits: the tells here are the ones every film shares —
 * shots that hold, a slideshow's rhythm, an opener that fades in. Pure
 * functions of the shot list; audit.mjs only reports them.
 */

export const LIMITS = {
  shots: [4, 40],
  avg: 3.6,       // over this the film reads as slides
  shotMax: 6.0,   // one idea per shot, even a scene with steps or actors
  hook: 3.5,      // the first shot is a designed hook, not a hold
};

export const TYPE_BEATS = new Set(["word-build", "pile", "type-field", "overlay-type", "logo-sting", "type-wipe", "icon-marquee", "word-cut", "color-punch", "logo-cta", "stat-counter", "line"]);
export const TRANSITION_CUTS = new Set(["dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "push-left", "push-right", "push-up", "push-down", "iris", "zoom", "zoom-out", "flip", "flood"]);

/**
 * Lint the shot list. `spec.shots[]` carry id, type, dur, cut, exit, beats
 * (count), steps (count), actors (count), chapter, breaths (count);
 * `spec.actors` is the actor count; `spec.ambient` the stage.
 * Returns [{ level: "fail" | "warn", msg }].
 */
export function lintDesign(spec) {
  const out = [];
  const shots = spec.shots || [];
  const R = LIMITS;
  const n = shots.length;
  if (n < R.shots[0]) out.push({ level: "fail", msg: `Only ${n} shots — a launch film runs ${R.shots[0]}–${R.shots[1]}. Cut ideas into more beats.` });
  if (n > R.shots[1]) out.push({ level: "warn", msg: `${n} shots — over ${R.shots[1]}; make sure each is one idea.` });
  const avg = shots.reduce((a, s) => a + (Number(s.dur) || 0), 0) / Math.max(1, n);
  if (avg > R.avg) out.push({ level: "fail", msg: `Average shot length ${avg.toFixed(2)}s — over ${R.avg}s the film reads as slides.` });
  shots.forEach((s, i) => {
    if (s.dur > R.shotMax) out.push({ level: "fail", msg: `#${s.id} (${s.type}): ${s.dur}s — a shot is ≤ ${R.shotMax}s. Split it, or give it steps, actors or beats.` });
    if (i === 0 && s.dur > R.hook) out.push({ level: "warn", msg: `#${s.id}: the hook is ${s.dur}s — the first ${R.hook} seconds should be a designed hook, not a hold.` });
  });

  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  const punches = shots.filter((s) => s.cut === "punch").length;

  const first = shots[0];
  if (first && first.type === "line" && first.typing) out.push({ level: "fail", msg: `#${first.id}: the film opens on a caret typing at hero scale. The first second is a move; \`typing\` belongs only to a prompt box inside a rebuilt \`ui-frame\`, mid-film.` });
  shots.forEach((s) => {
    if ((s.rippleBeats || 0) > 0) out.push({ level: "fail", msg: `#${s.id}: a \`ripple\` beat — rings expanding from a press are banned. A press is the control's own state change (the pill grows, the button splits, the toggle snaps) or a \`flood\`.` });
    if (s.type === "ui-frame" && s.capturedSrc) out.push({ level: "warn", msg: `#${s.id}: a captured screen sits still as the product (\`src\`, no \`html\`). A still screenshot cannot have a second act — give the shot a focus move, a cursor, a beat, or rebuild the part that moves as \`html\`.` });
  });
  if (n >= 8 && punches === 0) out.push({ level: "warn", msg: "No `punch` cuts — mark 2–3 boundaries where a beat lands." });
  if (!breaths && n >= 8) out.push({ level: "warn", msg: "No `breath` beats — the reference films duck the bed for half a second before every payoff. Put one before the moment the film is about." });
  const bare = !spec.ambient || spec.ambient.kind === "none";
  if (bare && !(spec.actors > 0)) out.push({ level: "warn", msg: "No `ambient` stage layer and no actors — the film has no life between events. Pick a stage kind, or say in direction.md why the stage is bare." });
  return out;
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
