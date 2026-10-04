/**
 * frame-objects.mjs — what the things on a seeked frame are doing, for the
 * agent to look at rather than a gate to pass. Four moments a viewer may read
 * as a mistake, none of which a check on the words can see:
 *
 *   mark    — a logo or an icon with something on top of part of it: a chip
 *             slid over the corner of the page logo.
 *   overlap — a filled box over part of another from a different group: cards
 *             sitting on a timeline. Boxes that share a parent are an
 *             arrangement (a stack, a fan, a wall of tiles) and are left alone.
 *   empty   — a filled or outlined box with nothing in it: bars that stand for
 *             nothing, a page with no content.
 *   small   — everything on screen fits in a sliver of the frame: a chip alone
 *             in white. The page's corner chrome (a small logo near an edge)
 *             does not count.
 *   chrome  — the same small words at the frame's edges on shot after shot: a
 *             website's header and footer ("AI PRODUCTION STUDIO" top right,
 *             the URL bottom left) kept through a film. A logo alone is not.
 *
 * Glows, washes and blurred shapes are atmosphere, not boxes. Each measured
 * case came from a film the user had to correct (trypitch, 2026-10-04); on
 * twenty other films the same rules mostly find arrangements that were meant,
 * so the audit lists the moments and draws them outlined in audit/look.jpg,
 * and the agent decides. `pitch motion look` numbers every thing on a frame,
 * so the agent can name what it sees without reading its code.
 *
 * measureFrameObjects and drawOutlines run inside the page
 * (`page.evaluate(fn, arg)`), so each is self-contained; frameObjectFindings
 * turns the samples into moments.
 */

export function measureFrameObjects(list = false) {
  const W = (window.__STAGE && window.__STAGE.w) || innerWidth;
  const H = (window.__STAGE && window.__STAGE.h) || innerHeight;
  const FRAME = W * H;
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
      const cls = typeof el.className === "string" ? el.className : el.className?.baseVal || "";
      const own = el.tagName.toLowerCase() + cls.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("");
      return cls.trim() || !el.parentElement ? own : `${name(el.parentElement)} > ${own}`;
    };
    const alphaOf = (c) => {
      const m = /rgba?\(([^)]*)\)/.exec(c || "");
      return m ? Number(m[1].split(/[\s,/]+/).filter(Boolean)[3] ?? 1) : 0;
    };
    // A wash is blurred for good; an entrance from a blur leaves blur(0px) behind.
    const glow = (el) => Number(/blur\(([\d.]+)px\)/.exec(style(el).filter || "")?.[1] || 0) > 2;
    const block = (el) => style(el).display !== "inline";
    // A box: a solid fill (a gradient is a wash), or an outline on three sides or more.
    const solid = (el) => block(el) && !glow(el) && alphaOf(style(el).backgroundColor) >= 0.35;
    const outlined = (el) => {
      if (!block(el) || glow(el)) return false;
      const cs = style(el);
      return ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(cs[`border${s}Width`]) >= 1 && alphaOf(cs[`border${s}Color`]) >= 0.35).length >= 3;
    };
    const MEDIA = ["IMG", "CANVAS", "VIDEO", "IFRAME"];
    const picture = (el) => MEDIA.includes(el.tagName) || el instanceof SVGSVGElement || /url\(/.test(style(el).backgroundImage || "");
    const classOf = (el) => (typeof el.className === "string" ? el.className : el.className?.baseVal || "");
    const pointer = (el) => /cursor|pointer|caret/i.test(`${classOf(el)} ${el.getAttribute?.("src") || ""} ${el.id}`);
    const inPointer = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (pointer(e)) return true; return false; };
    const ours = (el) => !!el.closest("#__look, #__review_label");
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
      if (el instanceof SVGElement) return !(el instanceof SVGSVGElement) && !(el instanceof SVGGElement);
      if (MEDIA.includes(el.tagName)) return true;
      const cs = style(el);
      if (cs.backgroundImage !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")) return true;
      return alphaOf(cs.backgroundColor) >= 0.35 || ownWordsAt(el, x, y);
    };
    const onStage = (r) => {
      const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
      return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1, a: (x1 - x0) * (y1 - y0) } : null;
    };
    const box = (v) => [v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0].map(Math.round);
    const shotOf = (el) => el.closest(".shot")?.id || "";

    // Words: the block that holds a line, not each split word in it.
    const holders = new Map(); // element -> { l, t, r, b, text }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let el = n.parentElement;
      if (!el || !/\S/.test(n.data) || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName) || ours(el)) continue;
      if (opacity(el) < 0.5) continue;
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2);
      if (!rects.length) continue;
      while (el.parentElement && el.parentElement !== document.body && /^inline/.test(style(el).display)) el = el.parentElement;
      const h = holders.get(el) || { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity, text: "" };
      for (const r of rects) { h.l = Math.min(h.l, r.left); h.t = Math.min(h.t, r.top); h.r = Math.max(h.r, r.right); h.b = Math.max(h.b, r.bottom); }
      h.text += n.data;
      holders.set(el, h);
    }

    const things = []; // { el, v, kind }
    for (const el of document.body.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "BR"].includes(el.tagName) || ours(el)) continue;
      if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;
      if (opacity(el) < 0.5) continue;
      const kind = picture(el) ? "picture" : solid(el) || outlined(el) ? "box" : null;
      if (!kind) continue;
      const v = onStage(el.getBoundingClientRect());
      if (!v || v.x1 - v.x0 < 4 || v.y1 - v.y0 < 4) continue;
      things.push({ el, v, kind });
    }
    for (const [el, h] of holders) {
      const v = onStage({ left: h.l, top: h.t, right: h.r, bottom: h.b });
      if (v) things.push({ el, v, kind: "words", text: h.text.replace(/\s+/g, " ").trim() });
    }

    // small — what the frame holds, the corner chrome and the ground aside;
    // a full-bleed picture (footage, a canvas) is the frame filled
    const band = (v) => v.x1 <= W * 0.12 || v.x0 >= W * 0.88 || v.y1 <= H * 0.12 || v.y0 >= H * 0.88;
    let u = null;
    for (const th of things) {
      if (inPointer(th.el)) continue;
      if (th.v.a >= FRAME * 0.9) { if (th.kind === "picture") u = { x0: 0, y0: 0, x1: W, y1: H }; continue; }
      if (th.v.a <= FRAME * 0.015 && band(th.v)) continue;
      u = u ? { x0: Math.min(u.x0, th.v.x0), y0: Math.min(u.y0, th.v.y0), x1: Math.max(u.x1, th.v.x1), y1: Math.max(u.y1, th.v.y1) } : { ...th.v };
    }
    const fill = u ? { share: +(((u.x1 - u.x0) * (u.y1 - u.y0)) / FRAME).toFixed(4), rect: box(u) } : { share: 0, rect: null };
    const edge = things.filter((th) => th.kind === "words" && th.v.a <= FRAME * 0.015 && band(th.v) && th.text && !inPointer(th.el))
      .map((th) => ({ shot: shotOf(th.el), text: th.text.slice(0, 60), rect: box(th.v) }));

    // mark — a logo or an icon with something over part of it
    const markLike = (el) => /logo|icon|brand|mark/i.test(`${classOf(el)} ${el.getAttribute("src") || ""} ${el.id} ${el.getAttribute("alt") || ""} ${classOf(el.parentElement || el)}`);
    const marks = [];
    for (const th of things) {
      const el = th.el;
      if (th.kind !== "picture" || !(el.tagName === "IMG" || el instanceof SVGSVGElement) || !markLike(el) || inPointer(el)) continue;
      const v = th.v;
      if (v.x1 - v.x0 < 12 || v.y1 - v.y0 < 12) continue;
      let probes = 0, covered = 0;
      const by = new Map();
      for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
        const x = v.x0 + (v.x1 - v.x0) * fx, y = v.y0 + (v.y1 - v.y0) * fy;
        const stack = document.elementsFromPoint(x, y);
        const at = stack.findIndex((e) => e === el || el.contains(e));
        if (at < 0) continue;
        probes++;
        const over = stack.slice(0, at).find((e) => !e.contains(el) && !el.contains(e) && !inPointer(e) && !ours(e) && paints(e, x, y));
        if (over) { covered++; by.set(over, (by.get(over) || 0) + 1); }
      }
      if (probes < 4 || !covered || covered === probes) continue; // all of it hidden is a layer, not a collision
      const top = [...by].sort((a, b) => b[1] - a[1])[0][0];
      marks.push({ shot: shotOf(el), el: name(el), by: name(top), share: +(covered / probes).toFixed(2), rect: box(v), byRect: box(onStage(top.getBoundingClientRect()) || v) });
    }

    // overlap — a filled box over part of one from another group
    const filled = things.filter((th) => th.kind === "box" && solid(th.el) && th.v.a >= FRAME * 0.002 && th.v.a < FRAME * 0.6 && !inPointer(th.el));
    const overlaps = [];
    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const A = filled[i], B = filled[j];
        if (A.el.contains(B.el) || B.el.contains(A.el) || A.el.parentElement === B.el.parentElement) continue;
        const x0 = Math.max(A.v.x0, B.v.x0), y0 = Math.max(A.v.y0, B.v.y0), x1 = Math.min(A.v.x1, B.v.x1), y1 = Math.min(A.v.y1, B.v.y1);
        if (x1 <= x0 || y1 <= y0) continue;
        const inter = (x1 - x0) * (y1 - y0), small = Math.min(A.v.a, B.v.a);
        if (inter < small * 0.08 || inter > small * 0.9) continue; // a touch, or one laid on the other
        const stack = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
        const ia = stack.findIndex((e) => e === A.el || A.el.contains(e)), ib = stack.findIndex((e) => e === B.el || B.el.contains(e));
        if (ia < 0 || ib < 0) continue; // one of them is clipped away there
        const [top, under] = ia < ib ? [A, B] : [B, A];
        overlaps.push({ shot: shotOf(top.el), top: name(top.el), under: name(under.el), share: +(inter / small).toFixed(2), rect: box(top.v), underRect: box(under.v) });
      }
    }

    // empty — a box with nothing in it, in the DOM or laid over it. A dot or
    // a pill is a shape, and under 32px a box is a rule or a skeleton line.
    const empty = [];
    for (const th of things) {
      const el = th.el, v = th.v;
      if (th.kind !== "box" || inPointer(el)) continue;
      const w = v.x1 - v.x0, h = v.y1 - v.y0;
      if (w < 32 || h < 32 || v.a < FRAME * 0.0025 || v.a > FRAME * 0.5) continue;
      if (parseFloat(style(el).borderTopLeftRadius) >= Math.min(w, h) * 0.45) continue;
      if (/\S/.test(el.innerText || "")) continue;
      const pseudo = [getComputedStyle(el, "::before").content, getComputedStyle(el, "::after").content];
      if (!pseudo.every((c) => c === "none" || c === "normal" || c === '""')) continue;
      let content = false;
      for (const c of el.querySelectorAll("*")) {
        if (opacity(c) < 0.35 || !onStage(c.getBoundingClientRect())) continue;
        if (picture(c) || c instanceof SVGElement || solid(c) || outlined(c)) { content = true; break; }
      }
      if (!content) content = things.some((o) => o !== th && o.v.a < v.a && !o.el.contains(el) && (o.v.x0 + o.v.x1) / 2 > v.x0 && (o.v.x0 + o.v.x1) / 2 < v.x1 && (o.v.y0 + o.v.y1) / 2 > v.y0 && (o.v.y0 + o.v.y1) / 2 < v.y1);
      if (!content) empty.push({ shot: shotOf(el), el: name(el), share: +(v.a / FRAME).toFixed(4), rect: box(v) });
    }

    const out = { marks, overlaps, empty, fill, edge };
    if (list) {
      // Every thing on the frame, biggest first, numbered top to bottom for `look`.
      const keep = things
        .filter((th) => th.v.a < FRAME * 0.9 && (th.kind === "words" || th.v.a >= FRAME * 0.001))
        .sort((a, b) => b.v.a - a.v.a)
        .slice(0, 30)
        .sort((a, b) => a.v.y0 - b.v.y0 || a.v.x0 - b.v.x0);
      const emptyNames = new Set(empty.map((e) => e.el));
      const holds = (th) => {
        if (th.kind === "words") return `"${th.text.slice(0, 48)}"`;
        if (th.kind === "picture") return (th.el.getAttribute("src") || "").split("/").pop() || th.el.tagName.toLowerCase();
        const t = (th.el.innerText || "").replace(/\s+/g, " ").trim();
        return t ? `"${t.slice(0, 48)}"` : emptyNames.has(name(th.el)) ? "nothing in it" : "";
      };
      out.things = keep.map((th, k) => ({
        n: k + 1,
        el: name(th.el),
        shot: shotOf(th.el),
        kind: inPointer(th.el) ? "cursor" : th.kind,
        rect: box(th.v),
        holds: holds(th),
      }));
    }
    return out;
  } finally {
    force.remove();
  }
}

/**
 * Draws `{ items, caption }` — boxes ({ rect: [x, y, w, h], label, tone })
 * and a corner caption — over the page in one fixed layer, or clears it when there are
 * none. Runs inside the page.
 */
export function drawOutlines({ items = [], caption = "" } = {}) {
  document.getElementById("__look")?.remove();
  if (!items.length && !caption) return;
  const tones = { mark: "#ff2bd6", with: "#00b7ff", note: "#ffb800" };
  const layer = document.createElement("div");
  layer.id = "__look";
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  for (const it of items) {
    const [x, y, w, h] = it.rect;
    const c = tones[it.tone] || tones.mark;
    const o = document.createElement("div");
    o.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border:4px solid ${c};box-shadow:0 0 0 2px rgba(0,0,0,.55)`;
    if (it.label) {
      const tag = document.createElement("div");
      tag.textContent = it.label;
      tag.style.cssText = `position:absolute;left:-4px;${y > 44 ? "bottom:100%" : "top:100%"};padding:4px 10px;font:700 26px/1.1 ui-monospace,Menlo,monospace;color:#fff;background:${c};white-space:nowrap`;
      o.appendChild(tag);
    }
    layer.appendChild(o);
  }
  if (caption) {
    const tag = document.createElement("div");
    tag.textContent = caption;
    tag.style.cssText = "position:absolute;left:0;bottom:0;padding:14px 24px;font:700 44px/1 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.78);border-radius:0 14px 0 0";
    layer.appendChild(tag);
  }
  document.body.appendChild(layer);
}

/** Content in under this share of the frame for 1.5s is a moment to look at. */
export const SMALL = 0.03;

const span = (m) => `${m.from.toFixed(1)}–${m.to.toFixed(1)}s`;

/**
 * The moments worth a look, from probe samples `{ t, marks, overlaps, empty,
 * fill }` taken every `step` seconds: a mark, an overlap or an empty box seen
 * at two probes running, and a frame whose content fits in under SMALL of it
 * for 1.5s. Ordered mark, empty, overlap, small, then by time; at most `max`.
 * Each carries the probe it is drawn from (`at`) and its outline.
 */
export function frameObjectFindings(samples, { only = [], step = 0.5, max = 8 } = {}) {
  const mine = (shot) => !only.length || only.includes(shot);
  const runs = (kind, keyOf) => {
    const seen = new Map();
    for (const s of samples || []) for (const o of s[kind] || []) {
      if (!mine(o.shot)) continue;
      const k = keyOf(o);
      const e = seen.get(k) || [];
      e.push({ t: s.t, o });
      seen.set(k, e);
    }
    const out = [];
    for (const hits of seen.values()) {
      let run = [hits[0]];
      const flush = () => { if (run.length >= 2) out.push(run); };
      for (let i = 1; i < hits.length; i++) {
        if (hits[i].t - hits[i - 1].t > step * 1.5) { flush(); run = []; }
        run.push(hits[i]);
      }
      flush();
    }
    return out.map((run) => ({ from: run[0].t, to: run[run.length - 1].t + step, at: run[Math.floor((run.length - 1) / 2)] }));
  };
  const moments = [
    ...runs("marks", (o) => `${o.shot}|${o.el}|${o.by}`).map((r) => ({
      kind: "mark", shot: r.at.o.shot, from: r.from, to: r.to, at: r.at.t,
      text: `${r.at.o.el} has ${r.at.o.by} over part of it`,
      outline: [{ rect: r.at.o.rect, label: r.at.o.el, tone: "mark" }, { rect: r.at.o.byRect, label: r.at.o.by, tone: "with" }],
    })),
    ...runs("empty", (o) => `${o.shot}|${o.el}`).map((r) => ({
      kind: "empty", shot: r.at.o.shot, from: r.from, to: r.to, at: r.at.t,
      text: `${r.at.o.el} is a box with nothing in it`,
      outline: [{ rect: r.at.o.rect, label: r.at.o.el, tone: "mark" }],
    })),
  ];
  // One moment per shot and stretch: an arrangement colliding with itself is one look, not seven.
  const pairs = runs("overlaps", (o) => `${o.shot}|${o.top}|${o.under}`).sort((a, b) => b.at.o.share - a.at.o.share);
  const together = [];
  for (const r of pairs) {
    const g = together.find((x) => x.shot === r.at.o.shot && r.from < x.to && x.from < r.to);
    if (g) { g.more++; g.from = Math.min(g.from, r.from); g.to = Math.max(g.to, r.to); } else together.push({ shot: r.at.o.shot, from: r.from, to: r.to, r, more: 0 });
  }
  for (const g of together) {
    const o = g.r.at.o;
    moments.push({
      kind: "overlap", shot: o.shot, from: g.from, to: g.to, at: g.r.at.t,
      text: `${o.top} sits over part of ${o.under}${g.more ? ` (and ${g.more} more pair${g.more === 1 ? "" : "s"} then)` : ""}`,
      outline: [{ rect: o.rect, label: o.top, tone: "mark" }, { rect: o.underRect, label: o.under, tone: "with" }],
    });
  }
  let low = [];
  const flushLow = () => {
    if (low.length && low[low.length - 1].t + step - low[0].t >= 1.5) {
      const at = low[Math.floor((low.length - 1) / 2)];
      moments.push({
        kind: "small", shot: at.shot || "", from: low[0].t, to: low[low.length - 1].t + step, at: at.t,
        text: at.fill.rect ? `everything on screen fits in ${(at.fill.share * 100).toFixed(1)}% of the frame` : "nothing on screen",
        outline: at.fill.rect ? [{ rect: at.fill.rect, label: "all of it", tone: "note" }] : [],
      });
    }
    low = [];
  };
  for (const s of samples || []) {
    if (!s.fill || (only.length && !mine(s.shot))) { flushLow(); continue; }
    if (s.fill.share < SMALL) {
      if (low.length && s.t - low[low.length - 1].t > step * 1.5) flushLow();
      low.push(s);
    } else flushLow();
  }
  flushLow();
  // chrome — words at the edges in most of the film and across three shots or more
  const edges = new Map();
  for (const s of samples || []) for (const e of s.edge || []) {
    const k = e.text.toLowerCase();
    const g = edges.get(k) || { text: e.text, ts: new Set(), shots: new Set(), at: new Map() };
    g.ts.add(s.t); g.shots.add(e.shot || s.shot); g.at.set(s.t, e.rect);
    edges.set(k, g);
  }
  const probes = (samples || []).filter((s) => s.edge).length;
  const kept = [...edges.values()].filter((g) => g.ts.size >= probes * 0.6 && g.shots.size >= 3);
  if (kept.length) {
    const times = [...kept[0].ts].sort((a, b) => a - b);
    const at = times.reduce((best, t) => (kept.filter((g) => g.at.has(t)).length > kept.filter((g) => g.at.has(best)).length ? t : best), times[Math.floor(times.length / 2)]);
    moments.push({
      kind: "chrome", shot: "", from: times[0], to: times[times.length - 1] + step, at,
      text: `the same words sit at the edges of shot after shot: ${kept.map((g) => `"${g.text}"`).join(", ")} — a page's header and footer, not a film's`,
      outline: kept.filter((g) => g.at.has(at)).map((g) => ({ rect: g.at.get(at), label: g.text, tone: "mark" })),
    });
  }
  const order = { mark: 0, chrome: 1, empty: 2, overlap: 3, small: 4 };
  return moments.sort((a, b) => order[a.kind] - order[b.kind] || a.from - b.from).slice(0, max);
}

/** One line per moment, numbered as the tiles of the sheet. */
export function lookLines(moments) {
  return moments.map((m, i) => `[${i + 1}] ${span(m)}${m.shot ? ` #${m.shot}` : ""} — ${m.text}`);
}
