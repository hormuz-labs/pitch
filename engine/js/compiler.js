/* Compile window.SHOTS → DOM + paused GSAP master timeline. */
(function () {
  const BG_TOKENS = new Set(["accent", "ink", "bg"]);

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

  function hardCut(outgoing, incoming) {
    const tl = gsap.timeline();
    tl.set(incoming, { opacity: 1, pointerEvents: "auto", x: 0, y: 0, scale: 1, rotationY: 0 }, 0);
    tl.set(outgoing, { opacity: 0, pointerEvents: "none" }, 0);
    return tl;
  }
  function punchCut(outgoing, incoming) {
    const tl = gsap.timeline();
    tl.set(incoming, { opacity: 1, pointerEvents: "auto", scale: 1.12 }, 0);
    tl.set(outgoing, { opacity: 0, pointerEvents: "none" }, 0);
    tl.to(incoming, { scale: 1, duration: 0.38, ease: "expo.out" }, 0);
    return tl;
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
      el, cx: 1920 * rand(), cy: 1080 * rand(),
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
        drift(it, { cx: 960 + (rand() - 0.5) * 500, cy: 540 + (rand() - 0.5) * 300, ax: 260 + rand() * 200, ay: 160 + rand() * 140, fx: 0.03 + rand() * 0.03, fy: 0.025 + rand() * 0.03, spin: 0 });
      }
    } else if (kind === "blueprint" || kind === "halftone") {
      // One oversized pattern plate; panning it is the whole motion.
      const cell = a.size || (kind === "blueprint" ? 96 : 14);
      const it = item(2600, 1700, kind === "blueprint" ? 0.18 : 0.26);
      it.style.backgroundImage = kind === "blueprint"
        ? `linear-gradient(${cssColor} 1px, transparent 1px), linear-gradient(90deg, ${cssColor} 1px, transparent 1px)`
        : `radial-gradient(${cssColor} ${(cell * 0.16).toFixed(1)}px, transparent ${(cell * 0.19).toFixed(1)}px)`;
      it.style.backgroundSize = `${cell}px ${cell}px`;
      drift(it, { cx: 1300, cy: 850, ax: cell * 2.5, ay: cell * 1.5, fx: 0.012, fy: 0.009, px: 0, py: 1.2, rot: 0, spin: 0 });
    } else if (kind === "hairlines") {
      const n = a.count || 5;
      for (let i = 0; i < n; i++) {
        const horizontal = i % 2 === 0;
        const it = item(horizontal ? 2600 : 1, horizontal ? 1 : 1700, 0.18);
        it.style.background = cssColor;
        drift(it, horizontal
          ? { cx: 1300, cy: 1080 * rand(), ax: 0, ay: 40 + rand() * 90, fx: 0, fy: 0.02 + rand() * 0.03, rot: 0, spin: 0 }
          : { cx: 1920 * rand(), cy: 850, ax: 40 + rand() * 90, ay: 0, fx: 0.02 + rand() * 0.03, fy: 0, rot: 0, spin: 0 });
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
  // freezing until the cut. shot.exit / spec.motion.exit: up | down | scale | scatter | none
  function exitTween(wrap, inner, shot, D, mode) {
    const tl = gsap.timeline();
    const dur = Math.min(0.32, D * 0.25);
    const at = Math.max(0, D - dur);
    if (mode === "up") tl.to(wrap, { y: -140, opacity: 0, duration: dur, ease: "power4.in" }, at);
    else if (mode === "down") tl.to(wrap, { y: 140, opacity: 0, duration: dur, ease: "power4.in" }, at);
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
  function beatTweens(el, inner, wrap, shot, D, beats, spec) {
    const tl = gsap.timeline();
    (beats || []).forEach((b, i) => {
      const at = Math.min(Math.max(0, b.at ?? (D * (i + 1)) / (beats.length + 1)), D - 0.05);
      const sel = b.sel ? inner.querySelector(b.sel) : inner.querySelector(".type-center, .type-line, .word, .punch-card .word, .stat-num, .kicker");
      switch (b.kind) {
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

  function compile(spec) {
    if (!spec) throw new Error("SHOTS spec missing");
    registerPlugins();
    applyBrand(spec.brand || {});

    const camera = document.querySelector("#camera");
    if (!camera) throw new Error("#camera missing");
    camera.innerHTML = "";

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
      // The end card never exits by default — the film ends on the mark, not on air.
      const exitMode = shot.exit ?? (i === shots.length - 1 ? "none" : motion.exit ?? "up");
      if (exitMode && exitMode !== "none") body.add(exitTween(exitWrap, inner, shot, D, exitMode), 0);
      if (Array.isArray(shot.beats) && shot.beats.length) body.add(beatTweens(el, inner, exitWrap, shot, D, shot.beats, spec), 0);
      if (ambient) body.add(ambientAnimate(ambient, clock, D), 0);
      clock += D;
      if (shot.drift !== false && !AUDIT) {
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
        const cut = (shot.cut || "hard") === "punch"
          ? punchCut(prev, el)
          : hardCut(prev, el);
        master.add(cut, start).add(body, start).addLabel(shot.id, start);
      }
    });
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

    window.__SEEK = (t) => {
      master.seek(t, false);
      syncShotPointerEvents();
    };
    window.__DURATION = () => CONTENT_DURATION;
    window.__CUES = () => Object.entries(master.labels).map(([label, time]) => ({ label, time }));
    window.__MASTER = master;

    master.eventCallback("onUpdate", () => {
      syncShotPointerEvents();
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

    const ready = () => { window.__READY = true; };
    if (document.fonts && document.fonts.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]).then(ready).catch(ready);
    } else {
      ready();
    }
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

  // The studio scales this 1920x1080 page down to fit its stage; size the
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
    if (!window.SHOTS) throw new Error("window.SHOTS is not defined");
    compile(window.SHOTS);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
