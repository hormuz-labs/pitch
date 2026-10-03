/* Compile window.SHOTS → DOM + paused GSAP master timeline. */
(function () {
  const BG_TOKENS = new Set(["accent", "ink", "bg"]);
  // The stage size factories.js derived from SHOTS.format (16:9 unless set).
  const STAGE = window.__STAGE || { format: "16:9", w: 1920, h: 1080 };
  const W = STAGE.w, H = STAGE.h;

  function applyBrand(brand) {
    const r = document.documentElement;
    const map = {
      bg: "--bg",
      ink: "--ink",
      accent: "--accent",
      font: "--font",
      mono: "--mono",
    };
    // The three colour tokens may also arrive inside brand.palette (films
    // have shipped that way and rendered in the engine's default palette
    // without a word). Top level wins; the palette fills what it left out.
    const palette = (brand && brand.palette) || {};
    const resolved = {};
    for (const k of ["bg", "ink", "accent"]) {
      const v = (brand && typeof brand[k] === "string" && brand[k]) || (typeof palette[k] === "string" && palette[k]) || null;
      if (v) { r.style.setProperty(map[k], v); resolved[k] = v; }
    }
    const font = (brand && (brand.font || brand.headline)) || null;
    if (typeof font === "string" && font) { r.style.setProperty("--font", font); resolved.font = font; }
    if (brand && typeof brand.mono === "string" && brand.mono) { r.style.setProperty("--mono", brand.mono); resolved.mono = brand.mono; }
    window.__BRAND = resolved;
    // Extra named colors from the product's own palette: brand.palette =
    // { paper: "#FAF9F6", sage: "#9CB59B" } → usable as shot.bg = "sage".
    Object.entries(brand.palette || {}).forEach(([k, v]) => {
      if (typeof v === "string") r.style.setProperty(`--p-${k}`, v);
    });
    // Self-hosted fonts keep type metrics deterministic across render workers:
    // brand.fonts = [{ family, src, weight?, style? }] (paths relative to index.html).
    if (Array.isArray(brand.fonts) && brand.fonts.length) {
      const css = brand.fonts.map((f) => `@font-face{font-family:"${f.family}";src:url("${f.src}");font-weight:${f.weight || "100 900"};font-style:${f.style || "normal"};${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ""}font-display:block;}`).join("\n");
      const style = document.createElement("style");
      style.id = "brand-fonts";
      style.textContent = css;
      document.head.appendChild(style);
    }
    document.body.style.background = resolved.bg || "#F4F7FB";
  }

  function luminance(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    let c = m[1];
    if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
    const [rr, gg, bb] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
    return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  }

  // shot.bg is a token (accent | ink | bg), a brand.palette name, or any CSS
  // color. shot.ink overrides the text color; otherwise it is picked for contrast.
  function applyShotBackground(el, shot, spec) {
    const bg = shot.bg;
    if (!bg) return;
    const palette = (spec.brand && spec.brand.palette) || {};
    if (BG_TOKENS.has(bg)) {
      el.dataset.bg = bg;
    } else {
      const color = palette[bg] || bg;
      el.style.background = color;
      const lum = luminance(color);
      el.style.color = shot.ink || (lum == null ? "var(--ink)" : lum > 0.5 ? "var(--ink)" : "#fff");
    }
    if (shot.ink) el.style.color = shot.ink;
  }

  // The state a shot element is in when it is simply "on": every cut resets
  // to it, because a transition may have left the previous incoming shot
  // pushed, clipped or blurred.
  const RESTING = { opacity: 1, pointerEvents: "auto", x: 0, y: 0, scale: 1, rotationX: 0, rotationY: 0, clipPath: "none", filter: "none" };

  // A colour token as CSS: accent | ink | bg | a brand.palette name | any CSS colour.
  function cssColor(name, spec) {
    if (!name) return "var(--accent)";
    if (BG_TOKENS.has(name)) return `var(--${name})`;
    const palette = (spec && spec.brand && spec.brand.palette) || {};
    return palette[name] || name;
  }
  // Centre of an element in stage pixels (the page is the W×H stage).
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function hardCut(outgoing, incoming) {
    const tl = gsap.timeline();
    tl.set(incoming, RESTING, 0);
    tl.set(outgoing, { opacity: 0, pointerEvents: "none" }, 0);
    return tl;
  }
  function punchCut(outgoing, incoming) {
    const tl = gsap.timeline();
    tl.set(incoming, { ...RESTING, scale: 1.12 }, 0);
    tl.set(outgoing, { opacity: 0, pointerEvents: "none" }, 0);
    tl.to(incoming, { scale: 1, duration: 0.38, ease: "expo.out" }, 0);
    return tl;
  }

  // ---- Cross-shot transitions ---------------------------------------------
  // `shot.cut` on the incoming shot. `hard` and `punch` are one-frame cuts; the
  // kinds below composite the two shots for `cutDur` seconds (default 0.5,
  // capped at 45% of the incoming shot) — the one place two shots share the
  // frame. The outgoing shot's exit motion is suppressed under a transition
  // unless that shot sets `exit` itself, so nothing leaves twice.
  const TRANSITIONS = new Set([
    "dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
    "push-left", "push-right", "push-up", "push-down", "iris", "zoom", "zoom-out", "flip", "flood", "glitch",
  ]);
  // A digital tear: whole-frame jumps between the two shots on a 25fps
  // cadence, each step displaced sideways, colour-broken and cut by a noise
  // band, landing clean on the incoming shot. The same steps drive the
  // `glitch` beat on a single shot. Seeded, so every render tears the same way.
  const GLITCH_FILTERS = [
    "none",
    "hue-rotate(95deg) saturate(3) contrast(1.35)",
    "invert(1) hue-rotate(180deg) contrast(1.2)",
    "saturate(4) contrast(1.6) brightness(1.1)",
    "grayscale(1) contrast(2.2)",
  ];
  function glitchBand() {
    const band = document.createElement("div");
    band.className = "glitch-band";
    band.style.cssText = "position:absolute;left:-5%;width:110%;opacity:0;pointer-events:none;mix-blend-mode:difference;" +
      "background:repeating-linear-gradient(0deg,rgba(255,255,255,.9) 0 2px,rgba(0,0,0,0) 2px 5px),linear-gradient(90deg,#f0f,#0ff,#ff0,#0f0);";
    return band;
  }
  function glitchSteps(tl, { show, hide, at, dur, seed, band }) {
    const rand = rng(seed || 7);
    const n = Math.max(3, Math.round(dur * 25));
    const step = dur / n;
    for (let k = 0; k < n; k++) {
      const t = at + k * step;
      const flip = show && hide && k < n - 1 ? (k % 2 === 0 ? hide : show) : show;
      const other = flip === show ? hide : show;
      const dx = (rand() - 0.5) * W * 0.09;
      const top = rand() * 70, h = 6 + rand() * 18;
      tl.set(flip, { opacity: 1, x: dx, filter: GLITCH_FILTERS[1 + Math.floor(rand() * (GLITCH_FILTERS.length - 1))], clipPath: rand() > 0.45 ? `inset(${top.toFixed(1)}% 0% ${Math.max(0, 100 - top - h - 30).toFixed(1)}% 0%)` : "none" }, t);
      if (other) tl.set(other, { opacity: 0 }, t);
      if (band) tl.set(band, { opacity: 0.85, top: `${(rand() * 92).toFixed(1)}%`, height: `${(2 + rand() * 9).toFixed(1)}%`, x: (rand() - 0.5) * W * 0.1 }, t);
    }
    tl.set(show, { x: 0, filter: "none", clipPath: "none", opacity: 1 }, at + dur);
    if (band) tl.set(band, { opacity: 0 }, at + dur);
  }
  // The flood: a blurred halo of one colour grows behind the outgoing shot in
  // its last 0.2s, the frame is that colour for one instant at the cut, and
  // the colour retreats to the centre over T, uncovering the incoming shot.
  // The Google Vids "Creating…" cut and its blue flip, as one cut kind.
  function floodPlate(spec, shot) {
    const f = shot.flood || {};
    const color = cssColor(f.color || "accent", spec);
    const plate = document.createElement("div");
    plate.className = "flood-plate";
    plate.style.background = color;
    const halo = document.createElement("div");
    halo.className = "flood-halo";
    halo.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    const ax = (f.at && f.at.x != null ? f.at.x : 0.5) * W;
    const ay = (f.at && f.at.y != null ? f.at.y : 0.5) * H;
    halo.style.left = `${ax - 700}px`;
    halo.style.top = `${ay - 700}px`;
    const layer = document.getElementById("cut-layer");
    layer.appendChild(halo);
    layer.appendChild(plate);
    return { plate, halo, ax, ay, pre: f.pre ?? 0.3, hold: f.hold ?? 0.08 };
  }
  function transitionCut(outgoing, incoming, kind, T, spec, shot) {
    const tl = gsap.timeline();
    const io = "power3.inOut";
    tl.set(outgoing, { pointerEvents: "none" }, 0);
    switch (kind) {
      case "zoom-out": {
        // The outgoing shot shrinks into the frame and blurs away; the incoming
        // one arrives from past the camera, blurred, and lands.
        tl.set(incoming, { ...RESTING, opacity: 0, scale: 2.4, filter: "blur(14px)" }, 0);
        tl.to(outgoing, { scale: 0.35, opacity: 0, filter: "blur(12px)", duration: T * 0.7, ease: "power3.in", transformOrigin: "50% 50%" }, 0);
        tl.to(incoming, { scale: 1, opacity: 1, filter: "blur(0px)", duration: T, ease: "power3.out", transformOrigin: "50% 50%" }, 0);
        break;
      }
      case "flood": {
        const fp = floodPlate(spec, shot);
        // At the cut: incoming at rest under the plate, outgoing gone.
        tl.set(incoming, RESTING, 0);
        tl.set(outgoing, { opacity: 0 }, 0);
        tl.set(fp.halo, { autoAlpha: 0 }, 0);
        tl.set(fp.plate, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0% round 0px)" }, 0);
        // The retreat: the colour pulls back to the point it flooded from.
        const l = (fp.ax / W) * 100, tp = (fp.ay / H) * 100;
        tl.to(fp.plate, { clipPath: `inset(${tp}% ${100 - l}% ${100 - tp}% ${l}% round 600px)`, duration: T, ease: "power3.inOut" }, fp.hold);
        tl.set(fp.plate, { autoAlpha: 0 }, fp.hold + T);
        tl.__flood = fp;
        break;
      }
      case "dissolve":
        tl.set(incoming, { ...RESTING, opacity: 0 }, 0);
        tl.to(incoming, { opacity: 1, duration: T, ease: "power2.inOut" }, 0);
        break;
      case "wipe-left": case "wipe-right": case "wipe-up": case "wipe-down": {
        // The edge travels in the named direction, revealing the incoming shot.
        // Every value carries a unit: GSAP interpolates the numbers and keeps
        // the end string's units, and an intermediate "inset(0 0 0 85)" is
        // invalid CSS that leaves the element fully clipped.
        const from = { "wipe-left": "inset(0% 0% 0% 100%)", "wipe-right": "inset(0% 100% 0% 0%)", "wipe-up": "inset(100% 0% 0% 0%)", "wipe-down": "inset(0% 0% 100% 0%)" }[kind];
        tl.set(incoming, { ...RESTING, clipPath: from }, 0);
        tl.to(incoming, { clipPath: "inset(0% 0% 0% 0%)", duration: T, ease: io }, 0);
        break;
      }
      case "push-left": case "push-right": case "push-up": case "push-down": {
        const axis = /left|right/.test(kind) ? "x" : "y";
        const size = axis === "x" ? W : H;
        const sign = /left|up/.test(kind) ? -1 : 1;
        tl.set(incoming, { ...RESTING, [axis]: -sign * size }, 0);
        tl.to(outgoing, { [axis]: sign * size, duration: T, ease: io }, 0);
        tl.to(incoming, { [axis]: 0, duration: T, ease: io }, 0);
        break;
      }
      case "iris":
        tl.set(incoming, { ...RESTING, clipPath: "circle(0px at 50% 50%)" }, 0);
        tl.to(incoming, { clipPath: `circle(${Math.ceil(Math.hypot(W, H) / 2) + 20}px at 50% 50%)`, duration: T, ease: "power2.inOut" }, 0);
        break;
      case "zoom":
        // The outgoing shot flies past the camera; the incoming one arrives from behind it.
        tl.set(incoming, { ...RESTING, opacity: 0, scale: 0.78 }, 0);
        tl.to(outgoing, { scale: 2.6, opacity: 0, filter: "blur(16px)", duration: T * 0.8, ease: "power3.in", transformOrigin: "50% 50%" }, 0);
        tl.to(incoming, { scale: 1, opacity: 1, duration: T, ease: "power3.out", transformOrigin: "50% 50%" }, 0);
        break;
      case "glitch": {
        const band = glitchBand();
        document.getElementById("cut-layer").appendChild(band);
        tl.set(incoming, { ...RESTING, opacity: 0 }, 0);
        glitchSteps(tl, { show: incoming, hide: outgoing, at: 0, dur: T, seed: (shot.seed || 0) + shot.id.length * 31 + 5, band });
        break;
      }
      case "flip":
        tl.set(incoming, { ...RESTING, opacity: 0, rotationY: 90 }, 0);
        tl.to(outgoing, { rotationY: -90, opacity: 0, duration: T * 0.5, ease: "power2.in", transformOrigin: "50% 50%" }, 0);
        tl.to(incoming, { rotationY: 0, opacity: 1, duration: T * 0.5, ease: "power2.out", transformOrigin: "50% 50%" }, T * 0.5);
        break;
    }
    tl.set(outgoing, { opacity: 0 }, T);
    return tl;
  }
  function cutTween(outgoing, incoming, shot, motion, spec) {
    const kind = shot.cut || "hard";
    if (kind === "punch") return punchCut(outgoing, incoming);
    if (TRANSITIONS.has(kind)) {
      const T = Math.max(0.1, Math.min(shot.cutDur ?? motion.cutDur ?? 0.5, shot.dur * 0.45));
      return transitionCut(outgoing, incoming, kind, T, spec, shot);
    }
    if (kind !== "hard") console.warn("[compiler] unknown cut kind", kind, "in", shot.id, "— hard cut used");
    return hardCut(outgoing, incoming);
  }
  window.__TRANSITIONS = [...TRANSITIONS];

  // ---- Carry: a match cut on one element ----------------------------------
  // shot.carry = { from: sel, to: sel, dur?, ease? } on the incoming shot. At
  // the cut a ghost of `from` — measured in the outgoing shot at the cut
  // instant — travels to where `to` sits in the incoming shot `dur` later,
  // and `to` stays hidden until the ghost lands. Measured after fonts and
  // assets are ready by seeking the master to the two instants, so the
  // geometry is what the frames really show. Pairs with a hard cut.
  function measureBox(el) {
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth || r.width;
    const h = el.offsetHeight || r.height;
    return { left: r.left, top: r.top, width: r.width, height: r.height, w, h, scale: w ? r.width / w : 1 };
  }
  function buildCarries(master, nodes, shots) {
    const carries = [];
    let clock = 0;
    shots.forEach((shot, i) => {
      const start = clock;
      clock += shot.dur;
      if (!shot.carry || i === 0) return;
      const c = shot.carry;
      const fromEl = nodes[i - 1].inner.querySelector(c.from || c.to);
      const toEl = nodes[i].inner.querySelector(c.to || c.from);
      if (!fromEl || !toEl) { console.warn("[compiler] carry in", shot.id, "found no element for", c.from, "→", c.to); return; }
      carries.push({ start, dur: Math.max(0.15, Math.min(c.dur ?? 0.55, shot.dur * 0.6)), ease: c.ease || "power3.inOut", fromEl, toEl });
    });
    if (!carries.length) return;
    const layer = document.createElement("div");
    layer.className = "carry-layer";
    document.getElementById("camera").appendChild(layer);
    const wasAt = master.time();
    for (const k of carries) {
      master.seek(Math.max(0, k.start - 0.001), false);
      const a = measureBox(k.fromEl);
      master.seek(k.start + k.dur, false);
      const b = measureBox(k.toEl);
      const cs = getComputedStyle(k.fromEl);
      const ghost = k.fromEl.cloneNode(true);
      ghost.classList.add("carry-ghost");
      ghost.style.cssText = `position:absolute;left:${a.left}px;top:${a.top}px;width:${a.w}px;height:${a.h}px;margin:0;transform-origin:0 0;color:${cs.color};font:${cs.font};letter-spacing:${cs.letterSpacing};visibility:hidden;opacity:0;`;
      layer.appendChild(ghost);
      const tl = gsap.timeline();
      tl.set(ghost, { autoAlpha: 1, x: 0, y: 0, scale: a.scale }, 0);
      tl.set(k.toEl, { visibility: "hidden" }, 0);
      tl.to(ghost, { x: b.left - a.left, y: b.top - a.top, scale: a.w ? b.width / a.w : 1, duration: k.dur, ease: k.ease }, 0);
      tl.set(ghost, { autoAlpha: 0 }, k.dur);
      tl.set(k.toEl, { visibility: "inherit" }, k.dur);
      master.add(tl, k.start);
    }
    master.seek(wasAt, false);
  }

  // ---- Actors: one object across many shots -------------------------------
  // spec.actors = { name: { kind: image | text | shape | element, ... } } and
  // shot.actors = { name: pose | [pose, ...] }. An actor is one element in a
  // layer above the shots; each shot that names it gives it a pose (centre
  // x/y in stage px, scale, rotation, blur, opacity — and for a shape w, h, r,
  // fill; for an svg shape a `path` MorphSVG can morph to) and the compiler
  // tweens from wherever the actor was to that pose at the shot's start (+at)
  // over `dur`. Cuts stop mattering to it: the folder that sat between two
  // words is the same folder that drops into the laptop in the next shot.
  //
  //   kind: image   { src, w }                       a harvested file
  //         text    { text, size, tone, weight }     a word in the brand font
  //         shape   { w, h, r, fill } or { path, fill, w, h }   a rect/pill/disc, or an SVG path
  //         element { from: "#shot .sel" }           born from a shot's own element: cloned at that
  //                                                   shot's last instant with its measured geometry
  //   pose: { at?, dur? (0.45), ease?, x, y, anchor?: sel (centre on this shot's element instead),
  //           scale?, rotation?, blur?, opacity?, w?, h?, r?, fill?, path?,
  //           enter?: scale-blur | fly | fade | none (first pose only; fly needs `from: {x,y}`),
  //           out?: blur | left | right | shrink | fade (the actor leaves at the end of this pose),
  //           into?: sel (lands into this shot's element, which stays hidden until it does) }
  function actorsBuild(master, spec, nodes, shots) {
    const defs = spec.actors || {};
    const names = Object.keys(defs);
    if (!names.length) return;
    const layer = document.createElement("div");
    layer.id = "actors";
    document.getElementById("camera").appendChild(layer);
    const starts = [];
    let clock = 0;
    shots.forEach((s) => { starts.push(clock); clock += s.dur; });
    const shotIndex = (sel) => {
      const m = /^#([\w-]+)/.exec(sel || "");
      return m ? shots.findIndex((s) => s.id === m[1]) : -1;
    };
    for (const name of names) {
      const def = defs[name];
      let el;
      const kind = def.kind || (def.src ? "image" : def.text != null ? "text" : def.from ? "element" : "shape");
      if (kind === "image") {
        el = document.createElement("img");
        el.src = def.src;
        el.draggable = false;
        if (def.w) el.style.width = def.w + "px";
        if (def.h) el.style.height = def.h + "px";
      } else if (kind === "text") {
        el = document.createElement("div");
        el.className = "actor-text";
        el.textContent = def.text;
        el.style.fontSize = (def.size || 96) + "px";
        el.style.fontWeight = String(def.weight || 500);
        el.style.color = def.tone === "accent" ? "var(--accent)" : def.tone === "muted" ? "color-mix(in srgb, var(--ink) 45%, transparent)" : def.tone ? cssColor(def.tone, spec) : "var(--ink)";
      } else if (kind === "shape") {
        if (def.path) {
          el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          el.setAttribute("viewBox", def.viewBox || "0 0 100 100");
          el.setAttribute("class", "actor-shape actor-svg");
          el.style.width = (def.w || 200) + "px";
          el.style.height = (def.h || def.w || 200) + "px";
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", def.path);
          p.setAttribute("fill", cssColor(def.fill || "accent", spec));
          el.appendChild(p);
        } else {
          el = document.createElement("div");
          el.className = "actor-shape";
          el.style.width = (def.w || 200) + "px";
          el.style.height = (def.h || 200) + "px";
          el.style.borderRadius = (def.r ?? 0) + "px";
          el.style.background = def.fill ? cssColor(def.fill, spec) : "var(--accent)";
        }
      } else if (kind === "element") {
        el = document.createElement("div");
        el.className = "actor-born";
      } else {
        console.warn("[actors]", name, "has an unknown kind", kind);
        continue;
      }
      el.classList.add("actor");
      if (def.material) el.classList.add("mat-" + def.material);
      el.dataset.actor = name;
      gsap.set(el, { autoAlpha: 0, xPercent: -50, yPercent: -50, x: W / 2, y: H / 2, scale: 1, rotation: 0, filter: "blur(0px)" });
      layer.appendChild(el);

      // Every pose in film order.
      const poses = [];
      shots.forEach((s, i) => {
        const p = s.actors && s.actors[name];
        if (!p) return;
        (Array.isArray(p) ? p : [p]).forEach((pose) => poses.push({ ...pose, shot: i, t: starts[i] + (pose.at ?? 0), node: nodes[i] }));
      });
      if (!poses.length) { console.warn("[actors]", name, "is defined but no shot poses it"); continue; }

      (() => {
        const tl = gsap.timeline();
        // Born from an element: clone it at the last instant of its shot.
        let bornAt = null;
        if (kind === "element") {
          const si = shotIndex(def.from);
          if (si < 0) { console.warn("[actors]", name, "from must be '#shotId .selector'"); return; }
          const src = nodes[si].inner.querySelector(def.from.replace(/^#[\w-]+\s*/, "")) || nodes[si].inner.querySelector(def.from);
          if (!src) { console.warn("[actors]", name, "found no element for", def.from); return; }
          const endT = starts[si] + shots[si].dur - 0.001;
          master.seek(endT, false);
          const box = measureBox(src);
          const cs = getComputedStyle(src);
          const clone = src.cloneNode(true);
          clone.style.cssText = `position:relative;margin:0;width:${box.w}px;height:${box.h}px;color:${cs.color};font:${cs.font};letter-spacing:${cs.letterSpacing};background:${cs.background};border-radius:${cs.borderRadius};box-shadow:${cs.boxShadow};transform:none;opacity:1;`;
          el.appendChild(clone);
          el.style.width = box.w + "px";
          el.style.height = box.h + "px";
          bornAt = { t: endT, x: box.left + box.width / 2, y: box.top + box.height / 2, scale: box.scale };
          tl.set(src, { visibility: "hidden" }, endT);
          tl.set(el, { autoAlpha: 1, x: bornAt.x, y: bornAt.y, scale: bornAt.scale }, endT);
        }
        let visible = false;
        poses.forEach((pose, k) => {
          const dur = pose.dur ?? 0.45;
          const target = {};
          // Anchor: centre on an element of this shot, measured at the pose's landing time.
          if (pose.anchor || pose.into) {
            const sel = pose.anchor || pose.into;
            const target_el = pose.node.inner.querySelector(sel);
            if (target_el) {
              master.seek(pose.t + dur, false);
              const c = centerOf(target_el);
              target.x = c.x + (pose.dx || 0);
              target.y = c.y + (pose.dy || 0);
              if (pose.into) {
                if (kind === "image" || kind === "element") target.scale = pose.scale ?? (c.w / Math.max(1, parseFloat(el.style.width) || el.offsetWidth || c.w));
                tl.set(target_el, { visibility: "hidden" }, starts[pose.shot]);
                tl.set(target_el, { visibility: "inherit" }, pose.t + dur);
              }
            } else console.warn("[actors]", name, "anchor", sel, "not found in", shots[pose.shot].id);
          }
          if (pose.x != null) target.x = pose.x;
          if (pose.y != null) target.y = pose.y;
          if (pose.scale != null) target.scale = pose.scale;
          if (pose.rotation != null) target.rotation = pose.rotation;
          if (pose.blur != null) target.filter = `blur(${pose.blur}px)`;
          if (pose.opacity != null) target.autoAlpha = pose.opacity;
          if (pose.w != null) target.width = pose.w;
          if (pose.h != null) target.height = pose.h;
          if (pose.r != null) target.borderRadius = pose.r + "px";
          if (pose.fill) target.background = cssColor(pose.fill, spec);
          if (pose.path && kind === "shape" && def.path) {
            const p = el.querySelector("path");
            if (window.MorphSVGPlugin) tl.to(p, { morphSVG: pose.path, duration: dur, ease: pose.ease || "power3.inOut" }, pose.t);
            else tl.set(p, { attr: { d: pose.path } }, pose.t);
            if (pose.fill) tl.to(p, { attr: { fill: cssColor(pose.fill, spec) } , duration: dur }, pose.t);
          }
          const ease = pose.ease || "expo.out";
          if (!visible && !bornAt) {
            // First appearance.
            const enter = pose.enter || "scale-blur";
            const from = { autoAlpha: 0, x: target.x ?? W / 2, y: target.y ?? H / 2, scale: (target.scale ?? 1) * 0.6, filter: "blur(20px)" };
            if (enter === "fly" && pose.from) { from.x = pose.from.x; from.y = pose.from.y; from.scale = (target.scale ?? 1) * 1.3; }
            if (enter === "fade") { from.scale = target.scale ?? 1; from.filter = "blur(0px)"; }
            if (enter === "none") { tl.set(el, { ...target, autoAlpha: target.autoAlpha ?? 1, filter: target.filter || "blur(0px)" }, pose.t); visible = true; }
            else {
              tl.set(el, from, pose.t);
              tl.to(el, { ...target, autoAlpha: target.autoAlpha ?? 1, filter: target.filter || "blur(0px)", scale: target.scale ?? 1, duration: dur, ease }, pose.t);
              visible = true;
            }
          } else {
            tl.to(el, { ...target, duration: dur, ease }, pose.t);
            visible = true;
          }
          if (pose.into) tl.set(el, { autoAlpha: 0 }, pose.t + dur);
          if (pose.out) {
            const outAt = pose.outAt != null ? starts[pose.shot] + pose.outAt : starts[pose.shot] + shots[pose.shot].dur - 0.3;
            const o = pose.out === true ? "blur" : pose.out;
            if (o === "blur") tl.to(el, { y: "-=70", autoAlpha: 0, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }, outAt);
            else if (o === "left" || o === "right") tl.to(el, { x: o === "left" ? -400 : 2320, duration: 0.5, ease: "power3.in" }, outAt - 0.2);
            else if (o === "shrink") tl.to(el, { scale: 0, autoAlpha: 0, filter: "blur(6px)", duration: 0.3, ease: "power3.in" }, outAt);
            else if (o === "fade") tl.to(el, { autoAlpha: 0, duration: 0.3 }, outAt);
            visible = false;
          }
          if (k === poses.length - 1 && !pose.out && !pose.into && pose.hold !== true) {
            // Nothing after the last pose: the actor leaves with its last shot.
            const end = starts[pose.shot] + shots[pose.shot].dur;
            if (pose.shot < shots.length - 1) tl.to(el, { autoAlpha: 0, filter: "blur(10px)", duration: 0.25, ease: "power2.in" }, end - 0.25);
          }
        });
        master.add(tl, 0);
      })();
    }
  }

  // Canvas stages (ShotKit.three / ShotKit.rive) redraw after every timeline
  // render, in both seek directions, so a WebGL frame is a pure function of
  // time and never one frame behind the DOM.
  function runFrameHooks() {
    const hooks = window.__FRAME_HOOKS;
    if (!hooks || !hooks.length) return;
    for (const hk of hooks) {
      const shot = hk.el && hk.el.closest ? hk.el.closest(".shot") : null;
      if (shot && shot.style.opacity === "0") continue;
      try { hk.render(); } catch (e) { console.warn("[compiler] frame hook failed", e); }
    }
  }

  // Every GSAP plugin the thin shell loads is registered here, so factories
  // and project types can use CustomEase/CustomWiggle/ScrambleText/Physics2D/
  // MotionPath/… without touching index.html. Missing ones are simply skipped.
  function registerPlugins() {
    const names = [
      "CustomEase", "CustomWiggle", "CustomBounce", "SplitText", "TextPlugin",
      "ScrambleTextPlugin", "Physics2DPlugin", "PhysicsPropsPlugin", "MotionPathPlugin",
      "MorphSVGPlugin", "DrawSVGPlugin", "Flip", "RoughEase", "SlowMo", "ExpoScaleEase",
      // The rest of the licensed set. A custom shot type can reach for any of
      // them: Draggable/InertiaPlugin for thrown cards, Observer for input,
      // CSSRulePlugin for ::before/::after, EaselPlugin and PixiPlugin for
      // canvas stages, ScrollTrigger/ScrollSmoother/ScrollToPlugin for a
      // scrolled UI shot. All of them ship in ../../assets/gsap/.
      "Draggable", "InertiaPlugin", "Observer", "CSSRulePlugin", "EaselPlugin",
      "PixiPlugin", "ScrollTrigger", "ScrollSmoother", "ScrollToPlugin",
    ];
    const found = names.map((n) => window[n]).filter(Boolean);
    if (found.length) gsap.registerPlugin(...found);
    window.__PLUGINS = names.filter((n) => window[n]);
    // Named eases the whole engine shares (CustomEase is in the thin shell).
    if (window.CustomEase) {
      try {
        CustomEase.create("whip", "M0,0 C0.1,0 0.15,1 1,1");          // violent in, long settle
        CustomEase.create("slamHard", "M0,0 C0.05,0.6 0.15,1 1,1");   // faster than expo.out
        CustomEase.create("settle", "M0,0 C0.2,1.2 0.4,0.95 1,1");    // one overshoot, no wobble
      } catch (_) {}
    }
    if (window.CustomWiggle) {
      try {
        CustomWiggle.create("shake", { wiggles: 6, type: "easeOut" });
        CustomWiggle.create("shakeSoft", { wiggles: 3, type: "easeOut" });
      } catch (_) {}
    }
  }

  // `index.html?audit` — the audit samples frames with the rest layers OFF
  // (drift, ambient) so only designed events count as motion.
  const AUDIT = /(?:\?|&)audit\b/.test(location.search);

  function rng(seed) {
    return () => ((seed = Math.imul(48271, seed)) >>> 0) / 4294967296;
  }

  // ---- Ambient stage -------------------------------------------------------
  // A persistent layer that lives BETWEEN a shot's background and its content
  // and moves continuously through the whole film (positions are a function of
  // global time, so cuts don't reset it). Position-only motion: nothing here
  // ever changes opacity, so it reads as a stage, not a flicker.
  //
  // spec.ambient = { kind, color?, count?, seed?, blur?, opacity?, size? }
  //   kind: blobs     soft blurred discs (deep space + glow, studio backdrop)
  //         light     one large soft light source orbiting slowly (studio backdrop)
  //         grid      blurred rounded tiles (the old "grid")
  //         blueprint a fine line grid panning slowly (technical / infra)
  //         hairlines a few 1px rules drifting on their normal (editorial light, terminal noir)
  //         halftone  a dot screen panning slowly (duotone poster, print)
  //         shapes    flat geometry — discs, bars, rounded slabs — drifting and turning (solid brand field)
  //         none
  function ambientMount(spec, shot) {
    const a = spec.ambient;
    if (!a || a.kind === "none" || shot.ambient === false) return null;
    const kind = a.kind || "blobs";
    const layer = document.createElement("div");
    layer.className = "ambient " + kind;
    const rand = rng(a.seed || 11);
    const color = a.color || "accent";
    const cssColor = color === "accent" ? "var(--accent)" : color === "ink" ? "var(--ink)" : color;
    const items = [];
    const item = (w, h, o) => {
      const it = document.createElement("div");
      it.className = "ambient-item";
      it.style.width = w + "px";
      it.style.height = h + "px";
      it.style.opacity = String(a.opacity ?? o);
      layer.appendChild(it);
      return it;
    };
    // Every item: rest position (cx, cy), drift amplitude (ax, ay), drift
    // frequency (fx, fy, cycles/s), phase (px, py), rest rotation and spin (deg/s).
    const drift = (el, over) => items.push({
      el, cx: W * rand(), cy: H * rand(),
      ax: 180 + rand() * 320, ay: 120 + rand() * 260,
      fx: 0.08 + rand() * 0.12, fy: 0.07 + rand() * 0.12,
      px: rand() * 6.28, py: rand() * 6.28,
      rot: rand() * 40 - 20, spin: 4, ...over,
    });

    if (kind === "grid") {
      const n = a.count || 9;
      for (let i = 0; i < n; i++) {
        const size = a.size || 120;
        const it = item(size, size, 0.9);
        it.style.borderRadius = "18px";
        it.style.background = cssColor;
        it.style.filter = `blur(${a.blur ?? 14}px)`;
        drift(it);
      }
    } else if (kind === "light") {
      const n = a.count || 1;
      for (let i = 0; i < n; i++) {
        const size = (a.size || 1500) * (0.85 + rand() * 0.3);
        const it = item(size, size, 0.32);
        it.style.borderRadius = "50%";
        it.style.background = `radial-gradient(circle, ${cssColor} 0%, transparent 70%)`;
        it.style.filter = `blur(${a.blur ?? 40}px)`;
        drift(it, { cx: W / 2 + (rand() - 0.5) * 500, cy: H / 2 + (rand() - 0.5) * 300, ax: 260 + rand() * 200, ay: 160 + rand() * 140, fx: 0.03 + rand() * 0.03, fy: 0.025 + rand() * 0.03, spin: 0 });
      }
    } else if (kind === "blueprint" || kind === "halftone") {
      // One oversized pattern plate; panning it is the whole motion.
      const cell = a.size || (kind === "blueprint" ? 96 : 14);
      const it = item(W + 680, H + 620, kind === "blueprint" ? 0.18 : 0.26);
      it.style.backgroundImage = kind === "blueprint"
        ? `linear-gradient(${cssColor} 1px, transparent 1px), linear-gradient(90deg, ${cssColor} 1px, transparent 1px)`
        : `radial-gradient(${cssColor} ${(cell * 0.16).toFixed(1)}px, transparent ${(cell * 0.19).toFixed(1)}px)`;
      it.style.backgroundSize = `${cell}px ${cell}px`;
      drift(it, { cx: W * 0.68, cy: H * 0.79, ax: cell * 2.5, ay: cell * 1.5, fx: 0.012, fy: 0.009, px: 0, py: 1.2, rot: 0, spin: 0 });
    } else if (kind === "hairlines") {
      const n = a.count || 5;
      for (let i = 0; i < n; i++) {
        const horizontal = i % 2 === 0;
        const it = item(horizontal ? W + 680 : 1, horizontal ? 1 : H + 620, 0.18);
        it.style.background = cssColor;
        drift(it, horizontal
          ? { cx: W * 0.68, cy: H * rand(), ax: 0, ay: 40 + rand() * 90, fx: 0, fy: 0.02 + rand() * 0.03, rot: 0, spin: 0 }
          : { cx: W * rand(), cy: H * 0.79, ax: 40 + rand() * 90, ay: 0, fx: 0.02 + rand() * 0.03, fy: 0, rot: 0, spin: 0 });
      }
    } else if (kind === "aurora") {
      // Three or four very soft discs in the brand's own hues, drifting slowly
      // — the stage under a hero type beat; `colors` names them, else the
      // accent and two tints of it.
      const cols = Array.isArray(a.colors) && a.colors.length ? a.colors
        : [cssColor, `color-mix(in srgb, ${cssColor} 55%, #ff9ad5)`, `color-mix(in srgb, ${cssColor} 45%, #ffffff)`];
      const n = a.count || 4;
      for (let i = 0; i < n; i++) {
        const size = (a.size || 1100) * (0.7 + rand() * 0.6);
        const it = item(size, size, 0.22);
        it.style.borderRadius = "50%";
        it.style.background = cols[i % cols.length];
        it.style.filter = `blur(${a.blur ?? 120}px)`;
        drift(it, { cx: 300 + rand() * (W - 600), cy: 200 + rand() * (H - 400), ax: 220 + rand() * 260, ay: 140 + rand() * 200, fx: 0.03 + rand() * 0.03, fy: 0.025 + rand() * 0.03, spin: 0 });
      }
    } else if (kind === "shapes") {
      const n = a.count || 6;
      for (let i = 0; i < n; i++) {
        const base = (a.size || 320) * (0.4 + rand() * 1.2);
        const form = i % 3; // disc, bar, slab
        const w = form === 1 ? base * 2.4 : base;
        const h = form === 1 ? base * 0.28 : form === 2 ? base * 0.72 : base;
        const it = item(w, h, 0.12);
        it.style.background = cssColor;
        it.style.borderRadius = form === 0 ? "50%" : `${Math.round(h * 0.22)}px`;
        drift(it, { ax: 120 + rand() * 220, ay: 90 + rand() * 180, fx: 0.04 + rand() * 0.06, fy: 0.035 + rand() * 0.06, rot: rand() * 360, spin: (rand() - 0.5) * 12 });
      }
    } else {
      const n = a.count || 5;
      for (let i = 0; i < n; i++) {
        const size = (a.size || 420) * (0.6 + rand() * 0.9);
        const it = item(size, size, 0.5);
        it.style.borderRadius = "50%";
        it.style.background = cssColor;
        it.style.filter = `blur(${a.blur ?? 90}px)`;
        drift(it);
      }
    }
    layer.__items = items;
    return layer;
  }
  function ambientState(items, t) {
    items.forEach((it) => {
      const x = it.cx + Math.sin(t * it.fx * 6.28 + it.px) * it.ax - 0.5 * parseFloat(it.el.style.width);
      const y = it.cy + Math.cos(t * it.fy * 6.28 + it.py) * it.ay - 0.5 * parseFloat(it.el.style.height);
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(it.rot + t * (it.spin ?? 4)).toFixed(2)}deg)`;
    });
  }
  function ambientAnimate(layer, start, D) {
    const tl = gsap.timeline();
    const proxy = { t: start };
    ambientState(layer.__items, start);
    tl.to(proxy, { t: start + D, duration: D, ease: "none", onUpdate: () => ambientState(layer.__items, proxy.t) }, 0);
    return tl;
  }

  // ---- Exit motion --------------------------------------------------------
  // The outgoing shot's content leaves the frame in its last 0.28s instead of
  // freezing until the cut. shot.exit / spec.motion.exit:
  //   up | down | scale | scatter | blur | left | right | none
  //   blur  — rises 70px and blurs to nothing over 9 frames (the continuous-take exit)
  //   left / right — the whole line accelerates off that side (ease-in, 0.5s)
  function exitTween(wrap, inner, shot, D, mode) {
    const tl = gsap.timeline();
    const dur = Math.min(0.32, D * 0.25);
    const at = Math.max(0, D - dur);
    if (mode === "up") tl.to(wrap, { y: -140, opacity: 0, duration: dur, ease: "power4.in" }, at);
    else if (mode === "down") tl.to(wrap, { y: 140, opacity: 0, duration: dur, ease: "power4.in" }, at);
    else if (mode === "blur") tl.to(wrap, { y: -70, opacity: 0, filter: "blur(14px)", duration: Math.min(0.3, D * 0.25), ease: "power3.in" }, Math.max(0, D - Math.min(0.3, D * 0.25)));
    else if (mode === "left" || mode === "right") {
      const d = Math.min(0.5, D * 0.3);
      tl.to(wrap, { x: mode === "left" ? -1400 : 1400, duration: d, ease: "power3.in" }, Math.max(0, D - d));
    }
    else if (mode === "scale") tl.to(wrap, { scale: 1.25, opacity: 0, duration: dur, ease: "power3.in", transformOrigin: "50% 50%" }, at);
    else if (mode === "scatter") {
      const parts = inner.querySelectorAll(".word, .mq-item, .pile-item, .notif, .stat-col, .logo-lockup, .ui-frame, .punch-card");
      const rand = rng((shot.seed || 5) + 17);
      const targets = parts.length ? parts : [wrap];
      tl.to(targets, {
        x: () => (rand() - 0.5) * 900, y: () => (rand() - 0.5) * 700,
        rotation: () => (rand() - 0.5) * 60, opacity: 0,
        duration: dur + 0.08, ease: "power3.in", stagger: { each: 0.012, from: "random" },
      }, at - 0.08);
    }
    return tl;
  }

  // ---- Beats --------------------------------------------------------------
  // Mid-shot events any shot (built-in or custom) can carry:
  // shot.beats = [{ at, kind, sel?, text?, amount?, color? }]
  //   swap      — replace the text of `sel` (default: the biggest line) with `text`
  //   pulse     — scale pop on `sel` (amount, default 1.14)
  //   shake     — camera-shake the whole shot (amount px, default 14)
  //   kick      — whole shot scale kick (amount, default 1.06), like a beat hit
  //   flash     — one-frame accent flash over the shot (color, default accent)
  //   hide/show — opacity of `sel`
  //   nudge     — move `sel` by amount px on x (y via `y`)
  //   halo      — a blurred disc of `color` blooms behind `sel` (size px, default 900); `fade: false` keeps it
  //   ripple    — rings expand from `sel`: `count` (5), `color`; the press feedback
  //   blurout   — `sel` blurs and fades in place (0.3s); the kept-word move when `sel` is a word
  //   flood     — the frame floods with `color` from `sel` (or the centre) and retreats over `dur` (0.9s)
  //   zoom      — the camera pushes into `sel` so it fills `fill` of the width (0.6) over `dur` (0.25s);
  //               `dof: true` blurs everything else; `release` (s) pulls back after
  //   breath    — no picture: the music bed ducks for `dur` (0.45s) — the pause before a payoff
  function beatTweens(el, inner, wrap, shot, D, beats, spec, deferred, shotStart) {
    const tl = gsap.timeline();
    (beats || []).forEach((b, i) => {
      const at = Math.min(Math.max(0, b.at ?? (D * (i + 1)) / (beats.length + 1)), D - 0.05);
      const sel = b.sel ? inner.querySelector(b.sel) : inner.querySelector(".type-center, .type-line, .word, .punch-card .word, .stat-num, .kicker");
      switch (b.kind) {
        case "halo": {
          const hl = document.createElement("div");
          hl.className = "beat-halo";
          const size = b.size || 900;
          hl.style.width = hl.style.height = size + "px";
          hl.style.background = `radial-gradient(circle, ${cssColor(b.color || "accent", spec)} 0%, transparent 70%)`;
          el.insertBefore(hl, el.querySelector(".shot-exit"));
          deferred.push({ t: shotStart + at, fn: () => {
            const c = sel ? centerOf(sel) : { x: W / 2, y: H / 2 };
            gsap.set(hl, { left: c.x - size / 2, top: c.y - size / 2 });
          } });
          tl.fromTo(hl, { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: b.opacity ?? 0.55, duration: b.dur ?? 0.3, ease: "power2.out", transformOrigin: "50% 50%" }, at);
          if (b.fade !== false) tl.to(hl, { autoAlpha: 0, duration: 0.5, ease: "power2.in" }, at + (b.dur ?? 0.3) + (b.hold ?? 0.4));
          break;
        }
        case "ripple": {
          const n = b.count || 5;
          const color = cssColor(b.color || "accent", spec);
          const rings = [];
          for (let k = 0; k < n; k++) {
            const r = document.createElement("div");
            r.className = "beat-ring";
            r.style.borderColor = color;
            el.appendChild(r);
            rings.push(r);
          }
          deferred.push({ t: shotStart + at, fn: () => {
            const c = sel ? centerOf(sel) : { x: W / 2, y: H / 2, w: 400, h: 140 };
            const w = Math.max(120, c.w + 40), hgt = Math.max(60, c.h + 40);
            gsap.set(rings, { left: c.x - w / 2, top: c.y - hgt / 2, width: w, height: hgt, borderRadius: Math.min(w, hgt) / 2 + "px" });
          } });
          rings.forEach((r, k) => {
            tl.fromTo(r, { scale: 1, autoAlpha: 0.9 }, { scale: 1 + (k + 1) * 0.9, autoAlpha: 0, duration: 0.9, ease: "power2.out", transformOrigin: "50% 50%", immediateRender: false }, at + k * 0.07);
          });
          break;
        }
        case "blurout":
          if (sel) tl.to(sel, { opacity: 0, filter: "blur(8px)", y: b.y ?? 0, duration: b.dur ?? 0.3, ease: "power2.in" }, at);
          break;
        case "flood": {
          const color = cssColor(b.color || "accent", spec);
          const plate = document.createElement("div");
          plate.className = "beat-flood";
          plate.style.background = color;
          el.appendChild(plate);
          const halo = document.createElement("div");
          halo.className = "beat-halo";
          halo.style.width = halo.style.height = "1400px";
          halo.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
          el.appendChild(halo);
          let cx = W / 2, cy = H / 2;
          deferred.push({ t: shotStart + at, fn: () => {
            const c = sel ? centerOf(sel) : { x: W / 2, y: H / 2 };
            cx = c.x; cy = c.y;
            gsap.set(halo, { left: cx - 700, top: cy - 700 });
          } });
          const pre = b.pre ?? 0.2, dur = b.dur ?? 0.9;
          tl.fromTo(halo, { scale: 0.2, autoAlpha: 0 }, { scale: 1.3, autoAlpha: 0.8, duration: pre, ease: "power2.in", transformOrigin: "50% 50%" }, Math.max(0, at - pre));
          tl.set(halo, { autoAlpha: 0 }, at);
          tl.set(plate, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0% round 0px)" }, at);
          if (b.stay) break;
          tl.to(plate, { clipPath: () => `inset(${(cy / H) * 100}% ${100 - (cx / W) * 100}% ${100 - (cy / H) * 100}% ${(cx / W) * 100}% round 600px)`, duration: dur, ease: "power3.inOut" }, at + (b.hold ?? 0.08));
          tl.set(plate, { autoAlpha: 0 }, at + (b.hold ?? 0.08) + dur);
          break;
        }
        case "zoom": {
          if (!sel) break;
          const dur = b.dur ?? 0.25;
          const fill = b.fill ?? 0.6;
          const others = [...inner.children].filter((c) => !c.contains(sel));
          // Measured at ready (fonts and assets in), like a carry: the camera
          // lands on where the element really is.
          deferred.push({ t: shotStart + at, fn: () => {
            const c = centerOf(sel);
            const s = Math.min(6, Math.max(1.05, (W * fill) / Math.max(40, c.w)));
            tl.to(wrap, { scale: s, x: W / 2 - s * c.x, y: H / 2 - s * c.y, duration: dur, ease: b.ease || "power3.inOut", transformOrigin: "0 0" }, at);
            if (b.dof !== false && others.length) tl.to(others, { filter: "blur(10px)", opacity: 0.35, duration: dur, ease: "power2.in" }, at);
            if (b.release) {
              tl.to(wrap, { scale: 1, x: 0, y: 0, duration: 0.6, ease: "power3.inOut" }, at + dur + b.release);
              if (b.dof !== false && others.length) tl.to(others, { filter: "blur(0px)", opacity: 1, duration: 0.5 }, at + dur + b.release);
            }
          } });
          break;
        }
        case "glitch": {
          // The shot tears in place for `dur` (0.28s) and lands clean.
          const band = glitchBand();
          el.appendChild(band);
          glitchSteps(tl, { show: wrap, hide: null, at, dur: b.dur ?? 0.28, seed: (b.seed || 0) + i * 13 + 3, band });
          break;
        }
        case "breath":
          (window.__BREATHS = window.__BREATHS || []).push({ at: +(shotStart + at).toFixed(3), dur: b.dur ?? 0.45, depth: b.depth ?? 0.35, attack: b.attack ?? 0.15, release: b.release ?? 0.3, shot: shot.id });
          break;
        case "swap": {
          if (!sel) break;
          const target = sel.classList.contains("word") ? sel : (sel.querySelector(".word") || sel);
          tl.to(target, { opacity: 0, y: -18, duration: 0.14, ease: "power3.in" }, at);
          tl.set(target, { text: { value: b.text || "" } }, at + 0.14);
          tl.fromTo(target, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, at + 0.15);
          break;
        }
        case "pulse":
          if (sel) tl.fromTo(sel, { scale: 1 }, { scale: b.amount || 1.14, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1, transformOrigin: "50% 50%" }, at);
          break;
        case "shake": {
          const amt = b.amount || 14;
          if (window.CustomWiggle) tl.to(wrap, { x: amt, duration: 0.5, ease: "shake" }, at);
          else tl.to(wrap, { keyframes: [{ x: amt }, { x: -amt * 0.8 }, { x: amt * 0.5 }, { x: 0 }], duration: 0.4, ease: "power2.out" }, at);
          break;
        }
        case "kick":
          tl.fromTo(el, { scale: b.amount || 1.06 }, { scale: 1, duration: 0.34, ease: "expo.out", transformOrigin: "50% 50%" }, at);
          break;
        case "flash": {
          const f = document.createElement("div");
          f.className = "beat-flash";
          f.style.background = b.color === "ink" ? "var(--ink)" : b.color === "bg" ? "var(--bg)" : b.color || "var(--accent)";
          el.appendChild(f);
          tl.fromTo(f, { opacity: 0.9 }, { opacity: 0, duration: 0.28, ease: "power2.out" }, at);
          break;
        }
        case "hide":
          if (sel) tl.to(sel, { opacity: 0, y: -12, duration: 0.18, ease: "power3.in" }, at);
          break;
        case "show":
          if (sel) tl.fromTo(sel, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, at);
          break;
        case "nudge":
          if (sel) tl.to(sel, { x: "+=" + (b.amount || 40), y: "+=" + (b.y || 0), duration: 0.35, ease: "power3.inOut" }, at);
          break;
        default:
          console.warn("unknown beat kind", b.kind, "in", shot.id);
      }
    });
    return tl;
  }

  // ---- Captions: the spoken words on screen, film-wide ----------------------
  // spec.captions = { style: {…}, phrases: [{ cue | text | words, … }] }. A
  // phrase names the words the narrator says (`cue`); each word appears on its
  // own onset in the aligned read (audio/vo-words.json from pitch motion
  // align), so re-recording and re-aligning the voice moves every caption with
  // it. Without a voice, `at` (and `each`) place the words by hand. The layer
  // sits above every shot and ignores cuts and camera moves: a stack can keep
  // building while the footage under it cuts every few frames.
  //
  // Everything is a pure function of film time (captionsApply), so seeking in
  // either direction and parallel capture tabs agree frame for frame.
  const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const ALIAS = { "&": "and", "%": "percent", "+": "plus", "1st": "first", "2nd": "second", "3rd": "third", ok: "okay", vs: "versus" };
  function numWords(n) {
    if (n < 20) return SMALL[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? SMALL[n % 10] : "");
    if (n < 1000) return SMALL[Math.floor(n / 100)] + "hundred" + (n % 100 ? numWords(n % 100) : "");
    if (n < 1000000) return numWords(Math.floor(n / 1000)) + "thousand" + (n % 1000 ? numWords(n % 1000) : "");
    return String(n);
  }
  // Must match .pi/scripts/launch-video/lib/vo-words.mjs normWord/tokenize,
  // which wrote the `n` of every word in vo-words.json.
  function normWord(raw) {
    let t = String(raw).toLowerCase().trim();
    if (ALIAS[t]) return ALIAS[t];
    t = t.replace(/[’']/g, "");
    const num = t.replace(/[,$]/g, "").match(/^(\d+)(k|m)?$/);
    if (num) {
      let n = Number(num[1]);
      if (num[2] === "k") n *= 1000;
      if (num[2] === "m") n *= 1000000;
      return numWords(n);
    }
    return t.replace(/[^a-z0-9]+/g, "");
  }
  const tokenize = (text) => String(text).replace(/[—–]/g, " ").split(/\s+/).map((w) => w.trim()).filter((w) => normWord(w).length > 0);
  function findPhrase(words, phrase, from) {
    const target = tokenize(phrase).map(normWord).filter(Boolean);
    if (!target.length) return null;
    const scan = (lo) => {
      for (let i = lo; i <= words.length - target.length; i++) {
        let ok = true;
        for (let j = 0; j < target.length; j++) if (words[i + j].n !== target[j]) { ok = false; break; }
        if (ok) return { index: i, count: target.length };
      }
      return null;
    };
    return scan(Math.max(0, from || 0)) || scan(0);
  }
  const CAP_POS = { top: 0.12, upper: 0.24, center: 0.5, lower: 0.66, bottom: 0.84 };
  // `jump`: the slots a phrase can land in (top edge, alignment), inside the
  // safe zone.
  const JUMP_SLOTS = [
    { y: 0.14, align: "left" }, { y: 0.42, align: "center" }, { y: 0.58, align: "right" }, { y: 0.2, align: "right" },
    { y: 0.34, align: "left" }, { y: 0.12, align: "center" }, { y: 0.52, align: "left" }, { y: 0.28, align: "center" },
  ];
  // A walk of 3 or 5 steps round the ring (both coprime to 8): the next slot
  // is never the current one.
  function jumpSlot(pi) {
    let at = 0;
    for (let k = 1; k <= pi; k++) {
      let h = Math.imul(k ^ 0x5bd1e995, 0x27d4eb2d);
      h = Math.imul(h ^ (h >>> 15), 0x165667b1);
      at = (at + ((h ^ (h >>> 13)) & 4 ? 3 : 5)) % JUMP_SLOTS.length;
    }
    return at;
  }
  const jumpAmount = (v) => (v === true ? 0.6 : Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
  const CAP_ENTER = 0.14;
  function captionsWordsUrl(spec) {
    const c = spec.captions || {};
    if (typeof c.words === "string") return c.words;
    const vo = spec.audio && typeof spec.audio.vo === "string" ? spec.audio.vo : null;
    if (!vo) return null;
    return (vo.includes("/") ? vo.slice(0, vo.lastIndexOf("/") + 1) : "") + "vo-words.json";
  }
  // One phrase: its element in the layer and its words, not yet timed.
  function captionsPhrase(p, pi, style, layer) {
    const base = Math.min(W, H);
    const px = (v, d) => (v == null ? d : v < 2 ? v * base : v);
    const s = { ...style, ...p };
    const el = document.createElement("div");
    const stack = s.stack || "word";
    // Jump: a phrase that does not place itself takes the next slot, a tilt
    // and a pop entrance. Everything is seeded by the phrase index, so every
    // render and every seek agrees.
    const jump = jumpAmount(s.jump);
    const r = rng(7919 * (pi + 1) + 17);
    const placed = ["pos", "y", "x", "align"].some((k) => p[k] != null);
    const slotAt = jump && !placed ? jumpSlot(pi) : null;
    if (slotAt != null) {
      const slot = JUMP_SLOTS[slotAt];
      s.y = slot.y; s.align = slot.align; s.pos = null;
    }
    const align = s.align || "left";
    const rot = Number.isFinite(s.rotate) ? s.rotate : jump ? (r() - 0.5) * 2 * 7 * jump : 0;
    if (rot) { el.style.transform = `rotate(${rot.toFixed(2)}deg)`; el.style.transformOrigin = "50% 50%"; }
    const enterDefault = s.enter || (jump ? "pop" : "cut");
    el.className = `cap-phrase ${stack === "line" ? "line" : stack === "replace" ? "replace" : "stack"} align-${align}`;
    el.dataset.phrase = String(pi);
    if (s.tier) el.dataset.tier = s.tier;
    el.style.fontSize = `${px(s.size, Math.round(base * 0.105))}px`;
    el.style.fontWeight = String(s.weight || 800);
    el.style.lineHeight = String(s.leading || 0.92);
    el.style.letterSpacing = s.tracking || "-0.01em";
    if (s.case !== "none") el.style.textTransform = s.case === "lower" ? "lowercase" : s.case === "title" ? "capitalize" : "uppercase";
    if (p.color) el.style.setProperty("--cap-color", p.color);
    if (p.font) el.style.fontFamily = p.font;
    // box: a backing behind the line so it reads over any picture, light or dark.
    if (s.box) {
      el.style.background = s.box === true ? "rgba(0,0,0,0.58)" : s.box;
      el.style.padding = "0.2em 0.5em 0.24em";
      el.style.borderRadius = "0.4em";
    }
    if (p.shadow !== undefined && p.shadow !== style.shadow) el.style.setProperty("--cap-shadow", p.shadow === false ? "none" : p.shadow);
    const margin = s.margin ?? 0.09;
    const maxW = W * (1 - 2 * margin);
    // A line phrase wraps at the margins but is only as wide as its words,
    // so centring and right-aligning place the text, not an empty box.
    if (stack === "line") { el.style.width = "fit-content"; el.style.maxWidth = `${maxW}px`; }
    const raw = Array.isArray(p.words) ? p.words : tokenize(p.text || p.cue || "");
    const words = raw.map((w) => (typeof w === "string" ? { text: w } : w || { text: "" })).map((w) => {
      const node = document.createElement("span");
      const fx = [].concat(w.fx || []);
      node.className = "cap-w" + fx.map((f) => ` fx-${f}`).join("");
      node.textContent = w.text;
      // Mixed type inside one phrase: a serif italic "you", a heavy "WANT",
      // a small light "to" — the reference ads set nearly every line this way.
      if (w.color) node.style.color = w.color;
      if (w.scale) node.style.fontSize = `${w.scale}em`;
      if (w.font) node.style.fontFamily = w.font;
      if (w.weight) node.style.fontWeight = String(w.weight);
      if (w.italic) node.style.fontStyle = "italic";
      if (w.case) node.style.textTransform = w.case === "none" ? "none" : w.case === "lower" ? "lowercase" : w.case === "title" ? "capitalize" : "uppercase";
      el.appendChild(node);
      // A word's own tilt and nudge (em); under jump each word leans a little,
      // and in a `replace` stack each word hops to its own spot (placed later).
      const wr = Number.isFinite(w.rotate) ? w.rotate : jump ? (r() - 0.5) * 2 * 3.5 * jump : 0;
      const hop = jump && stack === "replace" ? { x: (r() - 0.5) * 2 * 0.2 * jump, y: (r() - 0.5) * 2 * 0.12 * jump } : null;
      return { el: node, text: String(w.text), fx, at: Number.isFinite(w.at) ? w.at : null, end: Number.isFinite(w.end) ? w.end : null,
        enter: w.enter || enterDefault, rot: wr, dx: Number(w.dx) || 0, dy: Number(w.dy) || 0, hop, ox: 0, oy: 0 };
    });
    layer.appendChild(el);
    return { el, spec: p, style: s, stack, align, margin, words, jump, slotAt, tier: s.tier || "main", start: null, out: null };
  }
  function captionsMount(spec, viewport) {
    const c = spec.captions;
    const phrases = c && Array.isArray(c.phrases) ? c.phrases : [];
    if (!c || (!phrases.length && !c.subtitles)) return null;
    const style = c.style || {};
    const layer = document.createElement("div");
    layer.id = "captions";
    layer.style.setProperty("--cap-color", style.color || "#fff");
    if (style.font) layer.style.setProperty("--cap-font", style.font);
    layer.style.setProperty("--cap-shadow", style.shadow === false ? "none" : style.shadow || "0 0.03em 0.3em rgba(0,0,0,0.35)");
    const model = { layer, style, phrases: phrases.map((p, pi) => captionsPhrase(p, pi, style, layer)) };
    viewport.appendChild(layer);
    return model;
  }
  // `captions.subtitles`: the whole read as a small running line, a few words
  // at a time, under the big keywords (a second tier with its own timing).
  function captionsSubtitles(model, spec, words, voStart, lead) {
    const cfg = spec.captions.subtitles === true ? {} : spec.captions.subtitles;
    const maxWords = Math.max(1, Math.min(8, Number(cfg.words) || 4));
    const chunks = [];
    let cur = [];
    words.forEach((w, i) => {
      cur.push(w);
      const next = words[i + 1];
      const stop = /[.,!?;:]$/.test(w.w) || !next || next.s - w.e > 0.35 || cur.length >= maxWords;
      if (stop) { chunks.push(cur); cur = []; }
    });
    const style = { size: 0.036, weight: 600, case: "none", stack: "line", align: "center", pos: 0.78, margin: 0.12, leading: 1.15, tracking: "0em", box: true, shadow: false, ...cfg, tier: "sub" };
    delete style.words;
    const build = !!cfg.build;
    chunks.forEach((ch, k) => {
      const at0 = Math.max(0, voStart + ch[0].s - lead);
      const p = {
        tier: "sub", hold: cfg.hold ?? 0.15,
        words: ch.map((w) => ({ text: w.w.replace(/[.,;:]+$/, ""), at: build ? Math.max(0, voStart + w.s - lead) : at0, end: voStart + w.e })),
      };
      model.phrases.push(captionsPhrase(p, model.phrases.length + k, style, model.layer));
    });
  }
  // Word and clear times, from the aligned read or from the authored `at`s.
  // Each tier is timed on its own: a keyword and its subtitle may share the screen.
  function captionsTime(model, spec, timeline, report) {
    const voStart = Number.isFinite(Number(spec.audio && spec.audio.voStart)) ? Number(spec.audio.voStart) : 0.3;
    const lead = Number((spec.captions.style || {}).lead ?? spec.captions.lead ?? 0.04);
    const words = timeline && Array.isArray(timeline.words) ? timeline.words : null;
    if (spec.captions.subtitles) {
      if (words) captionsSubtitles(model, spec, words, voStart, lead);
      else report.missing.push("subtitles (no aligned narration — run pitch motion align)");
    }
    const cursors = {};
    model.phrases.forEach((ph, pi) => {
      const p = ph.spec;
      const n = ph.words.length;
      let hit = null;
      if (p.cue) {
        if (!words) report.missing.push(`"${p.cue}" (no aligned narration — run pitch motion align)`);
        else {
          hit = findPhrase(words, p.cue, cursors[ph.tier] || 0);
          if (!hit) report.missing.push(`"${p.cue}"`);
          else cursors[ph.tier] = hit.index + hit.count;
        }
      }
      ph.words.forEach((w, k) => {
        if (w.at != null) { w.end = w.end ?? w.at + 0.3; return; }
        if (hit) {
          const j = hit.index + Math.min(hit.count - 1, Math.floor((k * hit.count) / n));
          w.at = Math.max(0, voStart + words[j].s - lead);
          w.end = voStart + words[j].e;
        } else if (Number.isFinite(p.at)) {
          w.at = p.at + k * (p.each ?? 0.22);
          w.end = w.at + (p.each ?? 0.22);
        }
      });
      if (ph.words.some((w) => w.at == null)) {
        if (!p.cue) report.missing.push(`phrase ${pi + 1} has neither cue nor at`);
        ph.words.forEach((w) => { w.at = null; });
        return;
      }
      ph.start = Math.min(...ph.words.map((w) => w.at));
      ph.lastEnd = Math.max(...ph.words.map((w) => w.end));
      // Fewer shown words than spoken ("12+" for "twelve plus"): the phrase
      // stays up until the whole cue has been said, not its mapped word.
      if (hit) ph.lastEnd = Math.max(ph.lastEnd, voStart + words[hit.index + hit.count - 1].e);
      ph.lastAt = Math.max(...ph.words.map((w) => w.at));
    });
    const live = model.phrases.filter((ph) => ph.start != null).sort((a, b) => a.start - b.start);
    live.forEach((ph, i) => {
      const p = ph.spec;
      let out = null;
      if (Number.isFinite(p.out)) out = p.out;
      else if (p.until && words) {
        const u = findPhrase(words, p.until, 0);
        if (u) out = voStart + words[u.index].s - lead;
        else report.missing.push(`until "${p.until}"`);
      }
      const later = live.slice(i + 1).find((o) => o.tier === ph.tier);
      const next = later ? later.start : Infinity;
      if (out == null) out = Math.min(next, ph.lastEnd + (p.hold ?? ph.style.hold ?? 0.35));
      ph.out = Math.max(out, ph.lastAt + 0.2);
      if (ph.out > next + 1e-3 && !(Number.isFinite(p.out) || p.until)) ph.out = next;
    });
    report.phrases = live.filter((ph) => ph.tier !== "sub").length;
    report.subtitles = live.filter((ph) => ph.tier === "sub").length;
    report.words = live.reduce((t, ph) => t + ph.words.length, 0);
  }
  // Place each phrase once its words have their final size (all laid out, only hidden).
  // What a caption must not cover at time t: the media and the large type of
  // the shot on screen (a film window, a logo, a card's headline). Full-bleed
  // pictures do not count — type over them is the point.
  function captionsBusy(ctx, t) {
    if (!ctx || !ctx.master) return [];
    const node = ctx.nodes.find((n) => {
      const st = ctx.master.labels[n.shot.id];
      return Number.isFinite(st) && t >= st && t < st + (n.shot.dur || 0);
    });
    if (!node) return [];
    const vp = (document.getElementById("viewport") || document.body).getBoundingClientRect();
    const sx = W / (vp.width || W), sy = H / (vp.height || H);
    const big = Math.min(W, H) * 0.03;
    const out = [];
    for (const el of node.inner.querySelectorAll("img, video, canvas, svg, .ft-window, *")) {
      const media = /^(IMG|VIDEO|CANVAS|SVG)$/i.test(el.tagName) || el.classList.contains("ft-window");
      const text = !media && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
        && parseFloat(getComputedStyle(el).fontSize) >= big;
      const cs = getComputedStyle(el);
      // A visible box — a pill, a card, a window frame — is content too.
      const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); return m ? (m[1].split(",")[3] == null ? 1 : Number(m[1].split(",")[3])) : 0; };
      const boxed = !media && !text && (alpha(cs.backgroundColor) > 0.3 || (parseFloat(cs.borderTopWidth) > 0 && alpha(cs.borderTopColor) > 0.3));
      if (!media && !text && !boxed) continue;
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      const pad = H * 0.02;
      const box = { l: (r.left - vp.left) * sx - pad, t: (r.top - vp.top) * sy - pad, r: (r.right - vp.left) * sx + pad, b: (r.bottom - vp.top) * sy + pad };
      const area = Math.max(0, box.r - box.l) * Math.max(0, box.b - box.t);
      if (area < 1 || area > W * H * 0.7) continue;
      out.push(box);
    }
    return out;
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  function captionsPlace(model, ctx) {
    const wasAt = ctx && ctx.master ? ctx.master.time() : null;
    let prevSlot = null;
    for (const ph of model.phrases) {
      const s = ph.style;
      const el = ph.el;
      // A jumping phrase tries its slot, then walks the ring until it clears
      // the shot's content at its own moment (and never repeats the last slot).
      if (ph.slotAt != null && ph.start != null && ctx && ctx.master) {
        // Sample the phrase's whole life: it can outlast its shot, and a logo
        // or window may still be animating in at its first word.
        const end = Number.isFinite(ph.out) ? ph.out : ph.start + 1;
        const busy = [];
        for (const t of [ph.start + 0.12, (ph.start + end) / 2, end - 0.08]) {
          if (t < ph.start) continue;
          ctx.master.seek(t, false);
          busy.push(...captionsBusy(ctx, t));
        }
        let best = null;
        for (let k = 0; k < JUMP_SLOTS.length; k++) {
          const idx = (ph.slotAt + k * 3) % JUMP_SLOTS.length;
          if (idx === prevSlot) continue;
          const box = captionsBox(ph, JUMP_SLOTS[idx]);
          const hit = busy.reduce((n, b) => n + overlap(box, b), 0) / Math.max(1, (box.r - box.l) * (box.b - box.t));
          if (!best || hit < best.hit) best = { idx, hit };
          if (hit < 0.02) break;
        }
        ph.slotAt = best.idx;
        prevSlot = best.idx;
        ph.clash = best.hit >= 0.02 ? best.hit : 0;
      }
      const box = captionsBox(ph, ph.slotAt != null ? JUMP_SLOTS[ph.slotAt] : null);
      const left = box.l, top = box.t;
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      // Replace-stack hops, in px, clamped so each word stays on screen.
      for (const wd of ph.words) {
        if (!wd.hop) continue;
        const x0 = left + wd.el.offsetLeft, y0 = top + wd.el.offsetTop;
        const ww = wd.el.offsetWidth, wh = wd.el.offsetHeight;
        wd.ox = Math.round(Math.min(Math.max(wd.hop.x * W, W * 0.05 - x0), W * 0.95 - ww - x0));
        wd.oy = Math.round(Math.min(Math.max(wd.hop.y * H, H * 0.06 - y0), H * 0.8 - wh - y0));
      }
    }
    if (wasAt != null) ctx.master.seek(wasAt, false);
  }
  // Where a phrase's box sits, for its own style or a jump slot.
  function captionsBox(ph, slot) {
    const s = slot ? { ...ph.style, y: slot.y, pos: null } : ph.style;
    const el = ph.el;
    if (slot) {
      ph.align = slot.align;
      el.classList.remove("align-left", "align-center", "align-right");
      el.classList.add(`align-${slot.align}`);
    }
    // scrollWidth: a single word wider than the margins overflows its box.
    const w = Math.max(el.offsetWidth, el.scrollWidth), hgt = el.offsetHeight;
    const y = typeof s.pos === "number" ? s.pos : s.y ?? CAP_POS[s.pos || "upper"] ?? CAP_POS.upper;
    // A stack grows downward from its top edge, so top/upper/lower pin the
    // top; center centres the finished phrase; bottom pins its last line.
    let top = y * H;
    if (s.pos === "center") top -= hgt / 2;
    else if (s.pos === "bottom") top -= hgt;
    let left;
    if (ph.align === "center") left = (s.x != null ? s.x * W : W / 2) - w / 2;
    else if (ph.align === "right") left = W - (s.x != null ? s.x * W : ph.margin * W) - w;
    else left = s.x != null ? s.x * W : ph.margin * W;
    // A jumping phrase is kept inside the safe zone: 5% side margins, clear
    // of the platform UI in the bottom fifth.
    if (ph.jump) {
      left = Math.min(Math.max(left, W * 0.05), Math.max(W * 0.05, W * 0.95 - w));
      top = Math.min(Math.max(top, H * 0.06), Math.max(H * 0.06, H * 0.8 - hgt));
    }
    return { l: left, t: top, r: left + w, b: top + hgt };
  }
  const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  function captionsApply(model, t) {
    for (const ph of model.phrases) {
      const on = ph.start != null && t >= ph.start && t < ph.out;
      ph.el.style.visibility = on ? "visible" : "hidden";
      if (!on) continue;
      const fade = (ph.style.exit === "fade") ? Math.min(1, Math.max(0, (ph.out - t) / 0.15)) : 1;
      ph.el.style.opacity = String(fade);
      ph.words.forEach((w, k) => {
        const nextAt = ph.stack === "replace" && k + 1 < ph.words.length ? ph.words[k + 1].at : Infinity;
        const shown = t >= w.at && t < nextAt;
        w.el.style.visibility = shown ? "inherit" : "hidden";
        if (!shown) return;
        const since = t - w.at;
        const k01 = easeOut(since / CAP_ENTER);
        let tf = "", op = 1, blur = null;
        if (w.ox || w.oy) tf += `translate(${w.ox}px, ${w.oy}px) `;
        if (w.dx || w.dy) tf += `translate(${w.dx}em, ${w.dy}em) `;
        if (w.rot) tf += `rotate(${w.rot.toFixed(2)}deg) `;
        if (w.enter === "pop") tf += `scale(${(1.14 - 0.14 * k01).toFixed(4)}) `;
        else if (w.enter === "rise") { tf += `translateY(${((1 - k01) * 0.28).toFixed(4)}em) `; op = k01; }
        else if (w.enter === "blur") { blur = (1 - k01) * 14; op = 0.3 + 0.7 * k01; }
        if (w.fx.includes("glitch") && since < 0.34) {
          const f = Math.floor(since * 25);
          const r = rng(1000 + f * 97 + k * 13)();
          tf += `translateX(${((r - 0.5) * 0.22).toFixed(3)}em) skewX(${((r - 0.5) * 18).toFixed(2)}deg) `;
        }
        if (w.fx.includes("shake") && since < 0.35) {
          tf += `translateX(${(Math.sin(since * 70) * 0.06 * (1 - since / 0.35)).toFixed(4)}em) `;
        }
        w.el.style.transform = tf || "";
        w.el.style.opacity = String(op);
        if (blur != null) w.el.style.filter = `blur(${blur.toFixed(2)}px)`;
        else if (w.enter === "blur") w.el.style.filter = "";
        const span = Math.max(0.15, (w.end ?? w.at + 0.3) - w.at);
        const prog = Math.min(1, since / span);
        if (w.fx.includes("type")) {
          w.el.textContent = w.text.slice(0, Math.max(1, Math.ceil(prog * w.text.length)));
        } else if (w.fx.includes("count")) {
          const m = /^([^\d]*)([\d,]*\.?\d+)(.*)$/.exec(w.text);
          if (m) {
            const digits = m[2].replace(/,/g, "");
            const dec = (digits.split(".")[1] || "").length;
            const v = Number(digits) * easeOut(prog);
            let s = v.toFixed(dec);
            if (m[2].includes(",")) s = Number(s).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
            w.el.textContent = m[1] + s + m[3];
          }
        }
      });
    }
  }

  function compile(spec) {
    if (!spec) throw new Error("SHOTS spec missing");
    registerPlugins();
    applyBrand(spec.brand || {});

    const camera = document.querySelector("#camera");
    if (!camera) throw new Error("#camera missing");
    camera.innerHTML = "";
    // A non-landscape format resizes the page itself: the shell's CSS is the
    // 1920×1080 stage, and every layout below measures against the real one.
    if (W !== 1920 || H !== 1080) {
      let st = document.getElementById("stage-format");
      if (!st) { st = document.createElement("style"); st.id = "stage-format"; document.head.appendChild(st); }
      st.textContent = `html, body, #viewport, .shot { width: ${W}px; height: ${H}px; }`;
    }
    const viewport = document.getElementById("viewport") || camera.parentElement;
    const oldCaptions = document.getElementById("captions");
    if (oldCaptions) oldCaptions.remove();
    // What check reports about footage and captions: missing cues, files
    // that would not load, a highlight not in its quote.
    const report = { captions: { phrases: 0, words: 0, missing: [] }, issues: window.__MEDIA_ISSUES || (window.__MEDIA_ISSUES = []), warnings: [] };
    window.__MEDIA_REPORT = report;
    const captions = captionsMount(spec, viewport);
    if (captions) {
      const url = captionsWordsUrl(spec);
      const needsWords = !!spec.captions.subtitles || (spec.captions.phrases || []).some((p) => p && p.cue);
      const words = url && needsWords
        ? fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null);
      (window.__PENDING = window.__PENDING || []).push(words.then((timeline) => captionsTime(captions, spec, timeline, report.captions)));
    }
    // Where the flood plates and halos of cuts live: above the shots, below the actors.
    const cutLayer = document.createElement("div");
    cutLayer.id = "cut-layer";
    camera.appendChild(cutLayer);
    // Work that needs the page laid out with its fonts and assets in — anchors,
    // zoom beats, actors born from elements — runs at ready(), against the master.
    const deferred = [];
    window.__DESIGN = spec.design || null;
    window.__BREATHS = [];

    // Project-local shot types (js/shots.custom.js → window.ProjectShotFactories)
    // extend or override the shared ones.
    const factories = Object.assign({}, window.ShotFactories, window.ProjectShotFactories || {});
    window.ShotFactoriesResolved = factories;

    const shots = spec.shots || [];
    const nodes = [];
    shots.forEach((shot, i) => {
      const id = shot.id || `shot${i + 1}`;
      shot.id = id;
      const fac = factories[shot.type];
      if (!fac) throw new Error("unknown shot type: " + shot.type + " (add it in js/shots.custom.js)");
      const el = document.createElement("div");
      el.className = "shot";
      el.id = id;
      const ambient = AUDIT ? null : ambientMount(spec, shot);
      if (ambient) el.appendChild(ambient);
      const exitWrap = document.createElement("div");
      exitWrap.className = "shot-exit";
      const inner = document.createElement("div");
      inner.className = "shot-inner";
      exitWrap.appendChild(inner);
      el.appendChild(exitWrap);
      fac.mount(inner, shot, spec);
      applyShotBackground(el, { ...shot, bg: shot.bg || inner.dataset.bg }, spec);
      camera.appendChild(el);
      nodes.push({ el, inner, exitWrap, ambient, shot });
    });

    const timing = {};
    shots.forEach((s) => {
      timing[s.id] = { dur: s.dur, vo: s.vo || null, voDur: s.voDur || 0 };
    });
    window.SCENE_TIMING = timing;

    gsap.registerPlugin(TextPlugin);
    const master = gsap.timeline({ paused: true });

    const motion = spec.motion || {};
    // A shot lasts exactly its `dur`. Shots are placed on the master at the
    // summed durations (never appended after the previous body), so the cut
    // times the mixer, the SFX sheet, sync.mjs and the studio derive from
    // shots.js are the times the picture really cuts. A factory whose timeline
    // runs past D is compressed to fit (and reported in window.__OVERRUNS) —
    // it never stretches the shot or gets chopped mid-beat.
    const overruns = [];
    const chapters = [];
    let clock = 0;
    shots.forEach((shot, i) => {
      const fac = factories[shot.type];
      const { el, inner, exitWrap, ambient } = nodes[i];
      const D = shot.dur;
      const start = clock;
      const body = gsap.timeline();
      const ft = fac.animate(inner, shot, D, spec);
      const ftDur = ft && typeof ft.duration === "function" ? ft.duration() : 0;
      if (ftDur > D + 0.02) {
        overruns.push({ id: shot.id, type: shot.type, dur: D, ran: +ftDur.toFixed(2), speed: +(ftDur / D).toFixed(2) });
        ft.timeScale(ftDur / D);
      }
      body.add(ft, 0);
      // The end card never exits by default — the film ends on the mark, not on
      // air — and a shot the next cut transitions out of leaves through the
      // transition, not before it.
      const nextCut = i + 1 < shots.length ? shots[i + 1].cut : null;
      const exitMode = shot.exit ?? (i === shots.length - 1 || TRANSITIONS.has(nextCut) ? "none" : motion.exit ?? "none");
      if (exitMode && exitMode !== "none") body.add(exitTween(exitWrap, inner, shot, D, exitMode), 0);
      if (Array.isArray(shot.beats) && shot.beats.length) body.add(beatTweens(el, inner, exitWrap, shot, D, shot.beats, spec, deferred, start), 0);
      if (ambient) body.add(ambientAnimate(ambient, clock, D), 0);
      clock += D;
      // Rest travel is an authored choice, including for custom factories.
      // A shot may opt out of a film-wide drift without changing its own animation.
      if ((shot.drift ?? motion.drift) === true && !AUDIT) {
        body.fromTo(inner, { scale: 1, x: 0, y: 0 }, {
          scale: shot.driftScale ?? 1.045,
          x: shot.driftX ?? 10,
          y: shot.driftY ?? -8,
          duration: D,
          ease: "none",
          transformOrigin: "50% 50%",
        }, 0);
      }
      if (i === 0) {
        gsap.set(el, { opacity: 1, pointerEvents: "auto" });
        master.add(body, 0).addLabel(shot.id, 0);
      } else {
        gsap.set(el, { opacity: 0, pointerEvents: "none" });
        const prev = nodes[i - 1].el;
        const cut = cutTween(prev, el, shot, motion, spec);
        master.add(cut, start).add(body, start).addLabel(shot.id, start);
        // A flood's halo blooms on the outgoing shot before the cut.
        if (cut.__flood) {
          const fp = cut.__flood;
          const halo = gsap.timeline();
          halo.fromTo(fp.halo, { scale: 0.3, autoAlpha: 0 }, { scale: 1.3, autoAlpha: 0.85, duration: fp.pre, ease: "power1.in", transformOrigin: "50% 50%" }, 0);
          master.add(halo, Math.max(0, start - fp.pre));
        }
      }
      // Chapters are a grouping, not a boundary: listed for the studio and the
      // audit, never a label (every label is a shot start).
      if (shot.chapter && (i === 0 || shots[i - 1].chapter !== shot.chapter)) chapters.push({ id: shot.chapter, time: start, shot: shot.id });
    });
    window.__CHAPTERS = chapters;
    // Pin the end of the film to the last shot's `dur` (a zero-length marker
    // keeps master.duration() honest even if something short-changed the tail).
    master.set({}, {}, clock);
    window.__OVERRUNS = overruns;
    if (overruns.length) console.warn("[compiler] factory timelines compressed to fit their shot:", overruns);

    const CONTENT_DURATION = clock;

    function syncShotPointerEvents() {
      const t = master.time();
      let curr = 0;
      shots.forEach((shot, i) => {
        const start = curr;
        const end = curr + shot.dur;
        const isActive = t >= start && (i === shots.length - 1 ? t <= end + 0.05 : t < end);
        nodes[i].el.style.pointerEvents = isActive ? "auto" : "none";
        curr = end;
      });
    }
    syncShotPointerEvents();

    // Layers that are a function of film time rather than tweens: the caption
    // track, and footage (native playback while playing, exact seeks otherwise).
    const syncMedia = () => {
      if (captions && window.__READY) captionsApply(captions, master.time());
      if (window.__FOOTAGE && window.__FOOTAGE.videos.length) window.__FOOTAGE.sync(!master.paused());
    };
    // Resolves once every visible video shows the frame for `t` (capture.mjs,
    // the audit and the review await it); nothing to wait for without footage.
    // A frame at t shows what has happened BY t. GSAP arriving forward at
    // exactly a nested timeline's start leaves its zero-duration sets at 0
    // unrendered, so a shot's first frame showed its finished layout before
    // its `tl.set` start state applied: a one-frame flash at every cut, and
    // export lands on cuts exactly (5.8s is frame 174 at 30fps). A tenth of a
    // millisecond is far below a frame and puts the playhead past them.
    const SEEK_PAST = 1e-4;
    window.__SEEK = (t) => {
      master.seek(t + SEEK_PAST, false);
      syncShotPointerEvents();
      syncMedia();
      return window.__FOOTAGE ? window.__FOOTAGE.settle() : null;
    };
    window.__DURATION = () => CONTENT_DURATION;
    window.__CUES = () => Object.entries(master.labels).map(([label, time]) => ({ label, time }));
    window.__MASTER = master;

    master.eventCallback("onUpdate", () => {
      syncShotPointerEvents();
      runFrameHooks();
      syncMedia();
      window.dispatchEvent(new Event("studio:timeline-update"));
    });

    const preview = /(?:\?|&)play\b/.test(location.search) || location.hash === "#play";
    if (preview) {
      document.body.classList.add("preview");
      const bar = document.createElement("div");
      bar.id = "preview-bar";
      bar.innerHTML = `<div class="fill"></div><span class="t"></span>`;
      document.getElementById("viewport").appendChild(bar);

      let audio = null;
      try {
        audio = new Audio("audio/mix.wav");
        audio.preload = "auto";
      } catch (_) {}

      master.eventCallback("onUpdate", () => {
        const t = master.time();
        syncShotPointerEvents();
        runFrameHooks();
        syncMedia();
        bar.querySelector(".fill").style.width = (t / CONTENT_DURATION * 100) + "%";
        bar.querySelector(".t").textContent =
          t.toFixed(2) + " / " + CONTENT_DURATION.toFixed(2) + "  space play/pause";
        if (audio && !audio.paused && Math.abs(audio.currentTime - t) > 0.15) {
          audio.currentTime = t;
        }
      });

      const playAudio = () => {
        master.play();
        if (audio) {
          audio.currentTime = master.time();
          audio.play().catch(() => {});
        }
      };

      const pauseAudio = () => {
        master.pause();
        if (audio) audio.pause();
      };

      playAudio();
      window.addEventListener("keydown", (e) => {
        if (e.code === "Space") {
          e.preventDefault();
          master.paused() ? playAudio() : pauseAudio();
        } else if (e.code === "ArrowRight") {
          const next = master.time() + 0.5;
          master.seek(next, false);
          if (audio) audio.currentTime = next;
        } else if (e.code === "ArrowLeft") {
          const prevT = Math.max(0, master.time() - 0.5);
          master.seek(prevT, false);
          if (audio) audio.currentTime = prevT;
        }
      });
    }

    const ready = () => {
      if (window.__READY) return;
      const wasAt = master.time();
      master.seek(0, false);
      for (const d of deferred) { try { master.seek(d.t, false); d.fn(); } catch (e) { console.warn("[compiler] deferred build failed", e); } }
      try { actorsBuild(master, spec, nodes, shots); } catch (e) { console.warn("[compiler] actors failed", e); }
      try { buildCarries(master, nodes, shots); } catch (e) { console.warn("[compiler] carry failed", e); }
      master.seek(wasAt, false);
      runFrameHooks();
      if (captions) {
        captionsPlace(captions, { master, nodes });
        const said = (ph) => `"${ph.words.map((w) => w.text).join(" ")}" at ${ph.start.toFixed(2)}s`;
        for (const ph of captions.phrases.filter((x) => x.clash)) {
          report.warnings.push(`caption ${said(ph)} covers ${Math.round(ph.clash * 100)}% of the shot's content — no jump slot is clear; place it by hand (x/y) or shorten it`);
        }
        // The same spot twice in a row reads as subtitles, not type in the edit.
        const main = captions.phrases.filter((x) => x.tier === "main" && x.start != null).sort((a, b) => a.start - b.start);
        const same = [];
        for (let i = 1; i < main.length; i++) {
          const a = main[i - 1].el, b = main[i].el;
          if (Math.abs(a.offsetLeft - b.offsetLeft) < W * 0.05 && Math.abs(a.offsetTop - b.offsetTop) < H * 0.04 && main[i - 1].align === main[i].align) same.push(i);
        }
        if (same.length > 3) report.warnings.push(`${same.length} of ${main.length - 1} captions land where the one before sat (${said(main[same[0]])}, …) — the type reads as subtitles; set captions.style.jump or give phrases their own pos/x/y/align`);
        else for (const i of same) report.warnings.push(`caption ${said(main[i])} sits where ${said(main[i - 1])} did — move it (pos/x/y/align) or set captions.style.jump`);
        captionsApply(captions, master.time());
      }
      window.__READY = true;
      syncMedia();
    };
    const fontsReady = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 800))])
      : Promise.resolve();
    // Assets a factory registered through ShotKit.ready() — a texture, a
    // Lottie file, a .riv — hold the page's readiness, bounded, so the first
    // captured frame already has them.
    const pending = (window.__PENDING || []).map((p) => Promise.race([
      Promise.resolve(p).catch((e) => console.warn("[compiler] an asset failed to load", e)),
      new Promise((resolve) => setTimeout(() => { console.warn("[compiler] an asset took over 15s — rendering without it"); resolve(); }, 15000)),
    ]));
    Promise.all([fontsReady, ...pending]).then(ready, ready);
    return master;
  }

  // --- Element Inspector / Selection for Studio -----------------------------
  let inspectEnabled = false;
  let overlay = null;
  let label = null;

  function ensureInspectorDOM() {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "studio-inspect-overlay";
      overlay.style.cssText =
        "position:fixed;pointer-events:none;z-index:999999;border:2px solid #D97757;background:rgba(217,119,87,0.16);border-radius:4px;display:none;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,0.25);";
      label = document.createElement("div");
      label.id = "studio-inspect-label";
      label.style.cssText =
        "position:absolute;top:-24px;left:-2px;background:#D97757;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;white-space:nowrap;pointer-events:none;line-height:1.3;box-shadow:0 2px 6px rgba(0,0,0,0.35);";
      overlay.appendChild(label);
      document.body.appendChild(overlay);
    }
  }

  function resolveTargetElement(raw) {
    if (!raw || raw === document.body || raw === document.documentElement) return null;
    if (raw.id === "viewport" || raw.id === "camera" || raw.id === "preview-bar" || raw.id?.startsWith("studio-inspect")) {
      return null;
    }

    // 1. If clicking/hovering individual character in splitText, resolve up to word/line/component
    if (raw.classList?.contains("char") || raw.classList?.contains("char-wrap")) {
      const parent = raw.closest(
        ".word, .type-line, .overlay-line, .type-center, .cta-text, .cta-pill, .kicker, .body, .meta, .punch-card, .mq-label, .mq-pill, .logo-word, .d",
      );
      if (parent) return parent;
    }

    // 2. If clicking/hovering SVG internals (path, circle, rect, g), resolve to icon/button/container
    const tag = raw.tagName?.toLowerCase();
    if (tag === "path" || tag === "circle" || tag === "rect" || tag === "polygon" || tag === "g" || tag === "svg") {
      const iconParent = raw.closest(
        ".notif-ic, .app-ic, .ic-dot, .logo-mark, .logo-lockup, .cta-pill, .mq-item, .bot-pill, svg",
      );
      if (iconParent) return iconParent;
    }

    return raw;
  }

  function getReadableSelector(el) {
    if (!el || el === document.body) return "";
    const parts = [];
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement && parts.length < 4) {
      let tag = curr.tagName.toLowerCase();
      if (curr.id && !curr.id.startsWith("studio-")) {
        parts.unshift(`#${curr.id}`);
        break;
      }
      if (curr.classList && curr.classList.length > 0) {
        const validClasses = [...curr.classList].filter(
          (c) => !c.startsWith("studio-") && !c.startsWith("char-wrap") && c !== "char",
        );
        if (validClasses.length > 0) {
          parts.unshift(`${tag}.${validClasses.slice(0, 2).join(".")}`);
        } else {
          parts.unshift(tag);
        }
      } else {
        parts.unshift(tag);
      }
      curr = curr.parentElement;
    }
    return parts.join(" > ");
  }

  // Persistent outlines for elements the studio has collected as targets.
  let markSeq = 0;
  const marks = new Map(); // mark id -> { el, box, tag }
  let markRaf = 0;
  let markScale = 1;

  function markBoxFor(id) {
    const box = document.createElement("div");
    box.className = "studio-mark";
    box.style.cssText =
      "position:fixed;pointer-events:none;z-index:999998;border:2px solid #D97757;border-radius:4px;box-sizing:border-box;";
    const tag = document.createElement("div");
    tag.style.cssText =
      "position:absolute;left:-2px;background:#D97757;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-weight:700;line-height:1.3;white-space:nowrap;";
    box.appendChild(tag);
    document.body.appendChild(box);
    return { box, tag };
  }

  function layoutMarks() {
    const k = markScale > 0 ? 1 / markScale : 1;
    marks.forEach(({ el, box, tag }, id) => {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && el.closest(".shot")?.style.opacity !== "0";
      box.style.display = visible ? "block" : "none";
      if (!visible) return;
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      box.style.borderWidth = `${Math.max(2, Math.round(2 * k))}px`;
      tag.style.fontSize = `${Math.round(11 * k)}px`;
      tag.style.padding = `${Math.round(1 * k)}px ${Math.round(6 * k)}px`;
      tag.style.borderRadius = `${Math.round(3 * k)}px`;
      tag.style.top = `${-Math.round(20 * k)}px`;
      tag.textContent = String(el.dataset.studioRef || id);
    });
    markRaf = marks.size > 0 ? requestAnimationFrame(layoutMarks) : 0;
  }

  function setMarks(ids) {
    const keep = new Set((ids || []).map(Number));
    marks.forEach((m, id) => {
      if (!keep.has(id)) {
        m.box.remove();
        marks.delete(id);
      }
    });
    keep.forEach((id) => {
      if (marks.has(id)) return;
      const el = document.querySelector(`[data-studio-mark="${id}"]`);
      if (!el) return;
      marks.set(id, { el, ...markBoxFor(id) });
    });
    if (marks.size > 0 && !markRaf) markRaf = requestAnimationFrame(layoutMarks);
  }

  function formatElementData(el) {
    if (!el.dataset.studioMark) el.dataset.studioMark = String(++markSeq);
    const mark = Number(el.dataset.studioMark);
    const scene = el.closest(".shot");
    const sceneId = scene ? scene.id : null;
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 150);
    const cls = typeof el.className === "string" ? el.className.replace(/studio-[^\s]+/g, "").trim() : "";
    const selector = getReadableSelector(el);
    const html = el.outerHTML
      ? el.outerHTML.replace(/\s*data-studio-mark="[^"]*"/g, "").slice(0, 200)
      : "";

    let shotInfo = null;
    if (window.SHOTS && Array.isArray(window.SHOTS.shots) && sceneId) {
      shotInfo = window.SHOTS.shots.find((s) => s.id === sceneId) || null;
    }

    return {
      sceneId,
      shotType: shotInfo?.type || null,
      tagName: el.tagName.toLowerCase(),
      className: cls,
      id: el.id || "",
      text,
      selector,
      html,
      mark,
    };
  }

  function updateOverlay(el) {
    if (!el || !overlay) return;
    const r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;

    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    label.textContent = `${tag}${cls}${text ? ` · "${text}"` : ""}`;
  }

  // The studio scales this W×H page down to fit its stage; size the
  // highlight chrome inversely so it reads at the same size on screen.
  function setInspectState(enabled, scale) {
    inspectEnabled = Boolean(enabled);
    ensureInspectorDOM();
    if (scale > 0) markScale = scale;
    const k = scale > 0 ? 1 / scale : 1;
    overlay.style.borderWidth = `${Math.max(2, Math.round(2 * k))}px`;
    label.style.fontSize = `${Math.round(11 * k)}px`;
    label.style.padding = `${Math.round(2 * k)}px ${Math.round(8 * k)}px`;
    label.style.borderRadius = `${Math.round(3 * k)}px`;
    label.style.top = `${-Math.round(24 * k)}px`;
    if (document.body) {
      document.body.style.cursor = inspectEnabled ? "crosshair" : "";
    }
    if (!inspectEnabled && overlay) {
      overlay.style.display = "none";
    }
  }

  let lastPointer = null;

  function hoverAt(x, y) {
    const raw = document.elementFromPoint(x, y);
    const target = raw ? resolveTargetElement(raw) : null;
    if (!target) {
      if (overlay) overlay.style.display = "none";
      return;
    }
    ensureInspectorDOM();
    updateOverlay(target);
  }

  document.addEventListener("pointermove", (e) => {
    if (!inspectEnabled) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    hoverAt(e.clientX, e.clientY);
  }, true);

  // The timeline can change what sits under a resting pointer (a cut, a seek,
  // an element animating away); keep the hover outline honest.
  window.addEventListener("studio:timeline-update", () => {
    if (inspectEnabled && lastPointer) hoverAt(lastPointer.x, lastPointer.y);
  });

  document.addEventListener("click", (e) => {
    if (!inspectEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    const target = resolveTargetElement(e.target);
    if (!target) return;
    ensureInspectorDOM();
    updateOverlay(target);
    const data = formatElementData(target);
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "studio_element_selected", element: data }, "*");
      }
      window.postMessage({ type: "studio_element_selected", element: data }, "*");
    } catch (_) {}
  }, true);

  // --- Studio transport --------------------------------------------------------
  // The studio may embed this page cross-origin (app on one host, API on
  // another), where contentWindow.__MASTER is unreachable. Everything the
  // player needs is therefore also available over postMessage:
  //   → { type: "studio_cmd", op: "play" | "pause" | "seek" | "toggle" | "state", t }
  //   ← { type: "studio_state", ready, t, duration, paused }
  //     (sent on every timeline update, on request, and once when ready)
  const studioParent = () => (window.parent && window.parent !== window ? window.parent : null);
  function postState(force) {
    const p = studioParent();
    if (!p) return;
    const m = window.__MASTER;
    const ready = window.__READY === true && !!m;
    const state = {
      type: "studio_state",
      ready,
      t: m ? m.time() : 0,
      duration: typeof window.__DURATION === "function" ? window.__DURATION() : 0,
      paused: m ? m.paused() : true,
      // The page's own size, so the studio frames a 9:16 film as 9:16.
      stage: { w: W, h: H, format: STAGE.format },
    };
    if (!force && !ready) return;
    p.postMessage(state, "*");
  }
  let stateRaf = 0;
  const scheduleState = () => {
    if (stateRaf) return;
    stateRaf = requestAnimationFrame(() => {
      stateRaf = 0;
      postState(false);
    });
  };
  window.addEventListener("studio:timeline-update", scheduleState);
  const readyPoll = setInterval(() => {
    if (window.__READY === true && window.__MASTER) {
      clearInterval(readyPoll);
      postState(true);
    }
  }, 50);

  function handleCommand(cmd) {
    const m = window.__MASTER;
    if (!m) return;
    switch (cmd.op) {
      case "play":
        if (typeof cmd.t === "number") window.__SEEK(cmd.t);
        m.play();
        break;
      case "pause":
        m.pause();
        if (typeof cmd.t === "number") window.__SEEK(cmd.t);
        break;
      case "toggle":
        if (m.paused()) {
          if (m.time() >= window.__DURATION() - 0.01) window.__SEEK(0);
          m.play();
        } else {
          m.pause();
        }
        break;
      case "seek":
        window.__SEEK(Math.max(0, Math.min(Number(cmd.t) || 0, Math.max(0, window.__DURATION() - 0.001))));
        break;
      case "state":
        break;
    }
    // A pause stops no tween, so footage would keep decoding under its frozen
    // canvas; re-sync so paused videos stop on their exact frame.
    if (window.__FOOTAGE && window.__FOOTAGE.videos.length) window.__FOOTAGE.sync(!m.paused());
    postState(true);
  }

  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "studio_toggle_inspect") {
      setInspectState(e.data.enabled, e.data.scale);
    } else if (e.data.type === "studio_set_marks") {
      setMarks(e.data.marks);
    } else if (e.data.type === "studio_cmd") {
      handleCommand(e.data);
    }
  });

  window.__SET_INSPECT = setInspectState;

  window.ShotEngine = { compile };

  function boot() {
    try {
      if (!window.SHOTS) throw new Error("window.SHOTS is not defined");
      compile(window.SHOTS);
    } catch (error) {
      window.__BOOT_ERROR = error && (error.stack || error.message) || String(error);
      console.error("[compiler] boot failed", error);
      throw error;
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
