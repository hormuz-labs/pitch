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
    shots: s.shots.map((x) => {
      const names = x.actors ? Object.keys(x.actors) : [];
      return {
      id: x.id, type: x.type, dur: Number(x.dur) || 0, vo: x.vo || null, voDur: x.voDur || 0, cue: x.cue || null,
      beats: Array.isArray(x.beats) ? x.beats.length : 0, exit: x.exit ?? null, cut: x.cut || "hard",
      steps: Array.isArray(x.steps) ? x.steps.length : 0, actors: names.length, carry: !!x.carry,
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

/**
 * Lint the shot list (the shape extractSpec returns).
 * Returns [{ level: "fail" | "warn", code, msg }].
 */
export function lintDesign(spec) {
  const out = [];
  const shots = spec.shots || [];
  if (!shots.length) out.push({ level: "fail", code: "count", msg: "The timeline has no shots. Add the first shot before auditing." });
  shots.forEach((s) => {
    if (!Number.isFinite(s.dur) || s.dur <= 0) out.push({ level: "fail", code: "duration", msg: `#${s.id}: duration must be a finite, positive number (got ${s.dur}).` });
    if (s.type === "ui-frame" && s.frame !== "phone" && !s.focus && !s.clickZoom && !s.layers && !s.html) out.push({ level: "warn", code: "desktop", msg: `#${s.id}: review this whole-screen ${s.frame || "browser"} view at delivery size. An overview is valid; if a particular control or label must be read, crop, focus or rebuild that detail.` });
  });
  return out;
}

/** A lab citation means the implementation source was inspected in this workspace. */
export function lintEffectSources(spec, inspected = []) {
  const seen = new Set(inspected);
  const out = [];
  for (const shot of spec?.shots || []) {
    if (shot.lab && !seen.has(shot.lab)) {
      out.push({
        level: "fail",
        code: "lab-source",
        msg: `#${shot.id}: lab \"${shot.lab}\" was cited from a code-free study card. Run pitch effects show ${shot.lab} --source, read the implementation, then adapt it or remove the lab citation.`,
      });
    }
  }
  return out;
}

/** The lints worth hearing while the film is still being built (cues.mjs --check). */
export function lintWhileBuilding(spec) {
  return lintDesign(spec).filter((l) => l.code !== "count");
}

/** The per-shot line the audit prints for the summary. */
export function designSummary(spec) {
  const shots = spec.shots || [];
  const parts = [];
  if (spec.actors) parts.push(`actors ${spec.actors}`);
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
