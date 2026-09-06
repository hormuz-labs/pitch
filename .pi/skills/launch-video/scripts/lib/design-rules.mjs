/**
 * design-rules.mjs — what the gate expects of a film, by the design it chose.
 *
 * Two grammars were measured frame by frame (docs/studies/): the continuous
 * chain (one object across every scene, no cuts) and the prompt chapters
 * (prompt → product → payoff, repeated, cuts on floods and beats). They ask
 * different things of a shot list, so the limits and the tells are decided
 * here, as pure functions of the shot list, and audit.mjs only reports them.
 */

export const DESIGNS = {
  chain: {
    shots: [6, 16],
    avg: 3.6,
    typeMax: 6.0,      // a `line` with steps is a scene, not a caption
    demoMax: 6.0,
    hook: 3.0,
    label: "continuous chain",
  },
  chapters: {
    shots: [8, 40],
    avg: 3.4,
    typeMax: 4.0,
    demoMax: 6.0,
    hook: 3.5,
    label: "prompt chapters",
  },
  // A film that named no design is judged by the older, stricter numbers.
  none: { shots: [8, 16], avg: 3.4, typeMax: 3.2, demoMax: 6.0, hook: 3.0, label: "no design named" },
};

export const TYPE_BEATS = new Set(["word-build", "pile", "type-field", "overlay-type", "logo-sting", "type-wipe", "icon-marquee", "word-cut", "color-punch", "logo-cta", "stat-counter", "line"]);
export const TRANSITION_CUTS = new Set(["dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "push-left", "push-right", "push-up", "push-down", "iris", "zoom", "zoom-out", "flip", "flood"]);

/** The design a spec declares, normalised. */
export function designOf(spec) {
  const d = spec && typeof spec.design === "string" ? spec.design.trim().toLowerCase() : "";
  return DESIGNS[d] ? d : "none";
}

/**
 * Lint the shot list against its design. `spec.shots[]` carry id, type, dur,
 * cut, exit, beats (count), steps (count), actors (count), chapter, breaths
 * (count); `spec.actors` is the actor count; `spec.ambient` the stage.
 * Returns [{ level: "fail" | "warn", msg }].
 */
export function lintDesign(spec) {
  const out = [];
  const shots = spec.shots || [];
  const design = designOf(spec);
  const R = DESIGNS[design];
  const n = shots.length;
  if (design === "none") out.push({ level: "warn", msg: "No `design` on the film. Name the grammar direction.md chose — `design: \"chain\"` (one object across every scene, no cuts) or `design: \"chapters\"` (prompt → product → payoff, repeated) — so the gate judges the film by its own rules." });
  if (n < R.shots[0]) out.push({ level: "fail", msg: `Only ${n} shots — a ${R.label} film runs ${R.shots[0]}–${R.shots[1]}. Cut ideas into more beats.` });
  if (n > R.shots[1]) out.push({ level: "warn", msg: `${n} shots — over ${R.shots[1]} for a ${R.label} film; make sure each is one idea.` });
  const avg = shots.reduce((a, s) => a + (Number(s.dur) || 0), 0) / Math.max(1, n);
  if (avg > R.avg) out.push({ level: "fail", msg: `Average shot length ${avg.toFixed(2)}s — over ${R.avg}s the film reads as slides.` });
  shots.forEach((s, i) => {
    const typeBeat = TYPE_BEATS.has(s.type);
    // A `line` with three or more steps, or a shot that poses actors, is a
    // scene with its own second and third acts; it gets the demo allowance.
    const scene = s.type === "line" && (s.steps || 0) >= 3 || (s.actors || 0) > 0;
    const max = i === n - 1 ? Math.max(4.0, R.typeMax) : typeBeat && !scene ? R.typeMax : R.demoMax;
    if (s.dur > max) out.push({ level: "fail", msg: `#${s.id} (${s.type}): ${s.dur}s — ${typeBeat && !scene ? "a type beat" : "a shot"} in a ${R.label} film is ≤ ${max}s. Split it, or give it steps, actors or beats.` });
    if (i === 0 && s.dur > R.hook) out.push({ level: "warn", msg: `#${s.id}: the hook is ${s.dur}s — the first ${R.hook} seconds should be a designed hook, not a hold.` });
  });

  const hard = shots.slice(1).filter((s) => !s.cut || s.cut === "hard" || s.cut === "punch");
  const carried = shots.slice(1).filter((s) => s.carry || (s.actors || 0) > 0 || TRANSITION_CUTS.has(s.cut));
  const actorsUsed = (spec.actors || 0) > 0;
  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  const punches = shots.filter((s) => s.cut === "punch").length;

  if (design === "chain") {
    if (!actorsUsed) out.push({ level: "warn", msg: "A chain film with no `actors` — the chain is the object that crosses the cuts (the folder, the card, the mark). Declare it and pose it in every shot it passes through." });
    if (n > 2 && hard.length > Math.ceil((n - 1) * 0.35) && carried.length < Math.ceil((n - 1) * 0.5)) out.push({ level: "warn", msg: `${hard.length} of ${n - 1} boundaries are plain cuts with nothing crossing them. In a chain the cut is invisible: an actor, a carry, a flood or an exit-and-arrive on every boundary.` });
    const blurExits = shots.filter((s) => (s.exit ?? spec.motionExit) === "blur").length;
    if (blurExits === 0 && spec.motionExit !== "blur") out.push({ level: "warn", msg: "No `blur` exits — the continuous take's one exit is rise-and-blur (`motion.exit: \"blur\"`); scatter and slides read as cuts." });
  }
  if (design === "chapters") {
    const chapters = new Set(shots.map((s) => s.chapter).filter(Boolean));
    if (chapters.size < 2) out.push({ level: "warn", msg: "A chapters film with fewer than two `chapter` labels — mark the prompt → product → payoff groups so the rhythm reads at the minute scale." });
    const wordCam = shots.filter((s) => s.type === "line" && (s.zoomBeats || 0) > 0).length;
    if (!wordCam) out.push({ level: "warn", msg: "No word camera — no `line` with `zoom` beats on its words. The chapters grammar opens every chapter on a sentence the camera travels one word at a time (the noun last); a line handed over whole is read like a slide." });
    const floods = shots.filter((s) => s.cut === "flood" || (s.floodBeats || 0) > 0).length;
    const zooms = shots.filter((s) => s.cut === "zoom" || s.cut === "zoom-out" || (s.zoomBeats || 0) > 0).length;
    if (!floods && !zooms) out.push({ level: "warn", msg: "No flood and no scale cut — chapters land their payoffs on a full-bleed flood or a push-in; hard cuts between prompt and product read as slides." });
  }
  // The tells the last films had, whatever the design.
  const first = shots[0];
  if (first && first.type === "line" && first.typing) out.push({ level: "fail", msg: `#${first.id}: the film opens on a caret typing at hero scale. The first second is a move (a snap, the word camera, a countdown, a ripple on the plate); \`typing\` belongs only to a prompt box inside a rebuilt \`ui-frame\`, mid-film.` });
  shots.forEach((s) => {
    if (s.type === "line" && s.typing && s.chapter !== undefined && !(s.container === "none")) { /* hero typing is judged by the opener rule and the review sheets */ }
    if ((s.rippleBeats || 0) > 0) out.push({ level: "fail", msg: `#${s.id}: a \`ripple\` beat — rings expanding from a press are banned. A press is the control's own state change (the pill grows, the button splits, the toggle snaps) or a \`flood\`.` });
    if (s.type === "ui-frame" && s.capturedSrc) out.push({ level: "fail", msg: `#${s.id}: a captured screen as the product (\`src\`). The screenshot is the reference; rebuild the screen as \`html\` in the film's type and palette so its field, rows and button can move. (\`device-3d\` may still take a frame as its screen texture.)` });
  });
  if (design !== "chain" && n >= 8 && punches === 0) out.push({ level: "warn", msg: "No `punch` cuts — mark 2–3 boundaries where a beat lands." });
  if (!breaths && n >= 8) out.push({ level: "warn", msg: "No `breath` beats — the reference films duck the bed for half a second before every payoff. Put one before the moment the film is about." });
  const bare = !spec.ambient || spec.ambient.kind === "none";
  if (bare && design !== "chain") out.push({ level: "warn", msg: "No `ambient` stage layer — the film has no life between events. Pick the kind direction.md's background system calls for, or say in direction.md why the stage is bare." });
  return out;
}

/** The per-shot line the audit prints for the design summary. */
export function designSummary(spec) {
  const d = designOf(spec);
  const shots = spec.shots || [];
  const parts = [`design ${d === "none" ? "—" : d}`];
  if (spec.actors) parts.push(`actors ${spec.actors}`);
  const chapters = new Set(shots.map((s) => s.chapter).filter(Boolean));
  if (chapters.size) parts.push(`chapters ${chapters.size}`);
  const breaths = shots.reduce((a, s) => a + (s.breaths || 0), 0);
  parts.push(`breaths ${breaths}`);
  return parts.join(" · ");
}
