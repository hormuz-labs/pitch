/**
 * motion-lint.mjs — what the film's tweens do, read off the timeline.
 *
 *   page — an element filling most of the frame, holding words, travels a
 *          good part of the frame as one piece: a slide coming in or going
 *          out. Motion design moves the parts; the audit fails it.
 *   pop  — a long move at full speed on its first frame (an `.out` ease such
 *          as expo.out over hundreds of pixels): it has nearly landed before
 *          the eye can follow it. A note; `move`, the default ease, starts
 *          from rest. A move born hidden — out of a mask it clears, or out of
 *          a heavy blur — is not one: its first frames are not seen.
 *   block — a line of two or more words, heading-sized, arrives in one piece
 *          while nothing moves its words or letters: type that slides in
 *          already written. A note when most headings arrive that way.
 *
 * measureMotion runs inside the page (`page.evaluate(measureMotion)`), so it
 * stays self-contained; motionFindings turns its rows into lint lines.
 */

export function measureMotion() {
  const master = window.__MASTER;
  if (!master || !window.gsap) return [];
  const W = (window.__STAGE && window.__STAGE.w) || 1920;
  const H = (window.__STAGE && window.__STAGE.h) || 1080;
  const starts = Object.entries(master.labels).sort((a, b) => a[1] - b[1]);
  const shotAt = (t) => starts.reduce((id, [label, s]) => (s <= t + 1e-6 ? label : id), starts.length ? starts[0][0] : "");
  const toMaster = (a, t) => {
    while (a && a !== master) { t = a.startTime() + t / a.timeScale(); a = a.parent; }
    return t;
  };
  const name = (el) => (el.id ? `#${el.id}` : el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => `.${c}`).join(""));
  // A value as pixels: a number, "120px", "50%" of the element, or "+=40".
  const px = (v, size) => {
    if (typeof v === "number") return v;
    const m = typeof v === "string" ? /^([+-]=)?\s*(-?[\d.]+)(px|%)?$/.exec(v.trim()) : null;
    if (!m) return null;
    const n = parseFloat(m[2]) * (m[3] === "%" ? size / 100 : 1);
    return m[1] === "-=" ? -n : n;
  };
  // How far a tween carries its target on one axis. A fromTo keeps its start
  // in vars.startAt; a from() runs from vars to where the element rests; a
  // to() is read from rest unless it is relative.
  const along = (v, key, pct, size) => {
    const from = v.startAt || {};
    const at = (o) => (px(o[key], size) ?? 0) + ((px(o[pct], 100) ?? 0) * size) / 100;
    if (v[key] === undefined && v[pct] === undefined) return 0;
    return Math.abs(at(v) - (v.startAt ? at(from) : 0));
  };
  // Where a tween starts: a fromTo keeps it in startAt, a from() in its vars.
  const startOf = (v) => v.startAt || (v.runBackwards ? v : null);
  const blurOf = (o) => Number(/blur\(\s*([\d.]+)px/.exec(String(o?.filter ?? ""))?.[1] ?? 0);
  // Behind a mask: the nearest ancestor clipping that axis hugs the element
  // and the travel clears it (a word rising through its line, not a card
  // crossing a panel or entering from beyond the frame).
  const masked = (el, dx, dy) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const clip = cs.clipPath !== "none";
      if (dy > 0 && (clip || cs.overflowY !== "visible")) return a.clientHeight <= 2 * el.offsetHeight && dy >= 0.8 * a.clientHeight;
      if (dx > 0 && (clip || cs.overflowX !== "visible")) return a.clientWidth <= 2 * el.offsetWidth && dx >= 0.8 * a.clientWidth;
    }
    return false;
  };
  const words = (el) => (el.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  // A line of type: a few words, nothing inside it but inline text.
  const line = (el) => {
    const n = words(el);
    return n >= 2 && n <= 12 && [...el.querySelectorAll("*")].every((c) => getComputedStyle(c).display.startsWith("inline"));
  };
  const heading = (el) => parseFloat(getComputedStyle(el).fontSize) >= 48;
  const split = new Set(); // lines whose words or letters move on their own
  const blocks = new Map();
  const rows = [];
  for (const tw of master.getChildren(true, true, false)) {
    const dur = tw.duration();
    const v = tw.vars;
    const t = toMaster(tw.parent, tw.startTime());
    for (const el of tw.targets()) {
      if (!(el instanceof HTMLElement) || !el.isConnected) continue;
      if (words(el) === 1) {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (words(a) >= 2) { if (line(a)) split.add(a); break; }
      }
      if (!(dur > 0)) continue;
      const w = el.offsetWidth, h = el.offsetHeight;
      const dx = along(v, "x", "xPercent", w), dy = along(v, "y", "yPercent", h);
      const start = startOf(v);
      const typed = v.text !== undefined || v.scrambleText !== undefined;
      const fades = start && Number(start.opacity ?? start.autoAlpha ?? 1) <= 0.1;
      if (start && !typed && (dx || dy || fades || blurOf(start) >= 4) && line(el) && heading(el) && !blocks.has(el))
        blocks.set(el, { kind: "block", shot: shotAt(t), t: +t.toFixed(2), el: name(el), text: el.innerText.trim().replace(/\s+/g, " ") });
      if (v.scale !== undefined || (v.startAt && v.startAt.scale !== undefined && v.startAt.scale !== v.scale)) continue; // a camera push
      const share = Math.max(dx / W, dy / H);
      if (share < 0.12) continue;
      const row = { shot: shotAt(t), t: +t.toFixed(2), el: name(el), travel: Math.round(Math.max(dx, dy)), share: +share.toFixed(2) };
      if ((w * h) / (W * H) >= 0.6 && (el.textContent || "").trim().length >= 3) rows.push({ kind: "page", ...row, fills: +((w * h) / (W * H)).toFixed(2) });
      const ease = typeof v.ease === "string" ? v.ease : v.ease ? "a custom ease" : "move";
      const curve = gsap.parseEase(v.ease || "move");
      const slope = curve ? curve(0.02) / 0.02 : 1;
      const firstFrame = (Math.max(dx, dy) * slope) / dur / 30;
      const hidden = masked(el, dx, dy) || blurOf(start) >= 8;
      if (share >= 0.15 && slope >= 2.5 && firstFrame >= 60 && !hidden) rows.push({ kind: "pop", ...row, ease, firstFrame: Math.round(firstFrame) });
    }
  }
  for (const [el, row] of blocks) if (!split.has(el) && ![...split].some((s) => el.contains(s))) rows.push(row);
  for (const s of split) if (heading(s)) rows.push({ kind: "split", el: name(s), shot: s.closest(".shot")?.id || "" });
  return rows;
}

/** Lint lines ({ level, msg }) from measureMotion's rows, optionally only for some shots. */
export function motionFindings(rows, only = []) {
  const mine = (rows || []).filter((r) => !only.length || only.includes(r.shot));
  const where = (r) => `#${r.shot} ${r.el} at ${r.t}s`;
  const out = [];
  const pages = mine.filter((r) => r.kind === "page");
  if (pages.length) {
    out.push({
      level: "fail",
      msg: `The composition moves as one page: ${pages.slice(0, 3).map((r) => `${where(r)} (fills ${Math.round(r.fills * 100)}% of the frame, travels ${Math.round(r.share * 100)}% of it)`).join("; ")}${pages.length > 3 ? ` and ${pages.length - 3} more` : ""}. Move its parts instead: each element arrives and leaves on its own (exit), or one becomes the next (morph).`,
    });
  }
  const pops = mine.filter((r) => r.kind === "pop");
  if (pops.length) {
    out.push({
      level: "warn",
      msg: `Moves at full speed on their first frame: ${pops.slice(0, 4).map((r) => `${where(r)} (${r.travel}px on ${r.ease}, ${r.firstFrame}px in frame one)`).join("; ")}${pops.length > 4 ? ` and ${pops.length - 4} more` : ""}. A move the eye should follow starts from rest: drop the ease (\`move\` is the default) or use one that starts slowly; keep \`.out\` eases for short arrivals out of a mask or a blur.`,
    });
  }
  const blocks = mine.filter((r) => r.kind === "block");
  const split = mine.filter((r) => r.kind === "split").length;
  if (blocks.length >= 2 && blocks.length > split) {
    out.push({
      level: "warn",
      msg: `Most headings arrive whole, already written: ${blocks.slice(0, 4).map((r) => `${where(r)} "${r.text}"`).join("; ")}${blocks.length > 4 ? ` and ${blocks.length - 4} more` : ""}. A line that slides in as one piece reads as a slide. Let its words or letters arrive the way the effect you ported moves them (SplitText, \`ShotKit.revealWords\`), or type it.`,
    });
  }
  return out;
}
