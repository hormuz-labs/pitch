/**
 * frame-text.mjs — what the words on a seeked frame are doing.
 *
 *   covered — something sits on the words: a card over another card's
 *             heading, a graphic over a title, a chat bubble over a caption.
 *             Probe points across every visible line box ask the browser what
 *             is painted on top there (elementsFromPoint, with pointer-events
 *             forced on so decoration is hit too). A point is covered when an
 *             element that paints — a background, an image, a canvas, a video,
 *             an SVG shape, other words — lies above the words and is neither
 *             their own box nor inside it. The audit fails an overlap that
 *             holds for a second; a wipe or an exit crossing them does not.
 *   carets  — a caret and the words before it, so the audit can tell a prompt
 *             that is typed from one that sits there already written.
 *
 * measureFrameText runs inside the page (`page.evaluate(measureFrameText)`)
 * after a seek, so it stays self-contained; frameTextFindings turns the
 * samples into lint lines.
 */

export function measureFrameText() {
  const W = (window.__STAGE && window.__STAGE.w) || innerWidth;
  const H = (window.__STAGE && window.__STAGE.h) || innerHeight;
  const force = document.createElement("style");
  force.textContent = "*{pointer-events:auto!important}";
  document.head.appendChild(force);
  try {
    const styles = new Map();
    const style = (el) => styles.get(el) || (styles.set(el, getComputedStyle(el)), styles.get(el));
    const opacities = new Map();
    const opacity = (el) => {
      if (!el || el === document.documentElement) return 1;
      if (opacities.has(el)) return opacities.get(el);
      const cs = style(el);
      const o = cs.display === "none" || cs.visibility === "hidden" ? 0 : parseFloat(cs.opacity) * opacity(el.parentElement);
      opacities.set(el, o);
      return o;
    };
    const name = (el) => {
      if (el.id) return `#${el.id}`;
      const own = el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
      return el.classList.length || !el.parentElement ? own : `${name(el.parentElement)} > ${own}`;
    };
    const range = document.createRange();
    const ownWordsAt = (el, x, y) => {
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !/\S/.test(n.data)) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      }
      return false;
    };
    const paints = (el, x, y) => {
      if (opacity(el) < 0.35) return false;
      if (el instanceof SVGElement) return !(el instanceof SVGSVGElement) && !(el instanceof SVGGElement); // shapes are hit only where they paint
      if (["IMG", "CANVAS", "VIDEO", "IFRAME"].includes(el.tagName)) return true;
      const cs = style(el);
      if (cs.backgroundImage !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")) return true;
      const rgba = /rgba?\(([^)]*)\)/.exec(cs.backgroundColor);
      const alpha = rgba ? Number(rgba[1].split(/[\s,/]+/).filter(Boolean)[3] ?? 1) : 0;
      return alpha >= 0.35 || ownWordsAt(el, x, y);
    };

    const seen = new Map(); // element holding words -> { probes, covered, by }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !/\S/.test(node.data) || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
      if (opacity(el) < 0.5) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 6 || r.height < 6) continue;
        for (const fx of [0.05, 0.27, 0.5, 0.73, 0.95]) {
          for (const fy of [0.4, 0.65]) {
            const x = r.left + r.width * fx, y = r.top + r.height * fy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const stack = document.elementsFromPoint(x, y);
            const at = stack.indexOf(el);
            if (at < 0) continue; // clipped here: behind its mask, or off the stage
            const s = seen.get(el) || { probes: 0, covered: 0, by: new Map() };
            seen.set(el, s);
            s.probes++;
            const over = stack.slice(0, at).find((e) => !e.contains(el) && !el.contains(e) && paints(e, x, y));
            if (over) {
              s.covered++;
              s.by.set(name(over), (s.by.get(name(over)) || 0) + 1);
            }
          }
        }
      }
    }
    const covered = [];
    for (const [el, s] of seen) {
      if (s.probes < 2 || s.covered / s.probes < 0.15) continue; // a first letter under a card is already a broken word
      const by = [...s.by].sort((a, b) => b[1] - a[1])[0][0];
      covered.push({ shot: el.closest(".shot")?.id || "", el: name(el), text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 48), by, share: +(s.covered / s.probes).toFixed(2) });
    }

    // A caret, and the words before it as they read now. Typing changes them
    // (TextPlugin, a scramble, letters revealed one by one) or moves the caret
    // along them; a prompt that never changes was never typed.
    const carets = [];
    for (const c of document.querySelectorAll('[class*="caret"]')) {
      const box = c.parentElement;
      const cr = c.getBoundingClientRect(), br = box?.getBoundingClientRect();
      if (!box || cr.width <= 0 || cr.height <= 0 || br.width < 1 || opacity(box) < 0.5) continue;
      if (cr.right < 0 || cr.left > W || cr.bottom < 0 || cr.top > H) continue;
      const text = box.innerText.trim().replace(/\s+/g, " ");
      if (text.length < 2) continue;
      carets.push({ shot: box.closest(".shot")?.id || "", el: name(box), text: text.slice(0, 48), at: +((cr.left - br.left) / br.width).toFixed(2), read: text });
    }
    return { covered, carets };
  } finally {
    force.remove();
  }
}

/**
 * Lint lines ({ level, msg }) from samples `{ t, covered, carets }`,
 * optionally only for some shots. An overlap fails when the same words are
 * covered at three probes a second or more apart, whatever covers them (a
 * moving card shows its fill, then its title, then its graphic); a caret's
 * prompt is a note when it reads the same at every probe it is seen.
 */
export function frameTextFindings(samples, only = []) {
  const mine = (shot) => !only.length || only.includes(shot);
  const out = [];
  const overlaps = new Map();
  for (const s of samples || []) {
    for (const c of s.covered || []) {
      if (!mine(c.shot)) continue;
      const key = `${c.shot}|${c.el}|${c.text}`;
      const o = overlaps.get(key) || { ...c, times: [], share: 0, bys: new Map() };
      o.times.push(s.t);
      o.share = Math.max(o.share, c.share);
      o.bys.set(c.by, (o.bys.get(c.by) || 0) + 1);
      o.by = [...o.bys].sort((a, b) => b[1] - a[1])[0][0];
      overlaps.set(key, o);
    }
  }
  const held = [...overlaps.values()]
    .filter((o) => o.times.length >= 3 && Math.max(...o.times) - Math.min(...o.times) >= 0.9)
    .sort((a, b) => Math.min(...a.times) - Math.min(...b.times));
  if (held.length) {
    const span = (o) => `${Math.min(...o.times).toFixed(1)}–${Math.max(...o.times).toFixed(1)}s`;
    out.push({
      level: "fail",
      msg: `Words with something on top of them: ${held.slice(0, 4).map((o) => `#${o.shot} "${o.text}" (${o.el}) under ${o.by}, ${span(o)}, ${Math.round(o.share * 100)}% of it`).join("; ")}${held.length > 4 ? ` and ${held.length - 4} more` : ""}. Give each its own space: move or resize one of them, or let one leave before the other arrives.`,
    });
  }
  const prompts = new Map();
  for (const s of samples || []) {
    for (const c of s.carets || []) {
      if (!mine(c.shot)) continue;
      const key = `${c.shot}|${c.el}`;
      const p = prompts.get(key) || { ...c, reads: new Set(), probes: 0 };
      p.reads.add(`${c.read}|${c.at}`);
      p.probes++;
      p.text = c.text;
      prompts.set(key, p);
    }
  }
  const untyped = [...prompts.values()].filter((p) => p.probes >= 2 && p.reads.size === 1);
  if (untyped.length) {
    out.push({
      level: "warn",
      msg: `A caret, but the words are all there from the start: ${untyped.slice(0, 3).map((p) => `#${p.shot} "${p.text}" (${p.el})`).join("; ")}. A prompt with a caret reads as typed; type it (TextPlugin \`text\`, or its letters revealed one by one) or drop the caret.`,
    });
  }
  return out;
}
