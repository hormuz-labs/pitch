/* Shot factories: mount(el, shot, ctx) + animate(el, shot, D, ctx) */
(function () {
  // The stage. `SHOTS.format` picks the delivery frame; every factory, the
  // compiler, the studio preview and the capture read the page size from
  // here (window.__STAGE), so a 9:16 ad is laid out, previewed and exported
  // at 1080×1920 rather than letterboxed inside a landscape page.
  const FORMATS = {
    "16:9": { w: 1920, h: 1080 },
    "9:16": { w: 1080, h: 1920 },
    "1:1": { w: 1080, h: 1080 },
    "4:5": { w: 1080, h: 1350 },
  };
  const requested = window.SHOTS && window.SHOTS.format;
  if (requested && !FORMATS[requested]) console.warn(`[factories] unknown format "${requested}" — use ${Object.keys(FORMATS).join(", ")}; 16:9 used`);
  const STAGE = { format: FORMATS[requested] ? requested : "16:9", ...(FORMATS[requested] || FORMATS["16:9"]) };
  window.__STAGE = STAGE;

  // `move` (the house ease, every tween's default) starts from rest and settles
  // long; `slam` is for what is born hidden — behind a mask, out of a blur.
  const EASE = {
    move: "move",
    slam: "expo.out",
    land: "move",
    snap: "back.out(1.7)",
    pop: "back.out(2.2)",
    crash: "power4.in",
    drift: "sine.inOut",
  };

  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function qs(root, sel) {
    const n = root.querySelector(sel);
    if (!n) throw new Error("missing " + sel + " in #" + root.id);
    return n;
  }
  function qsa(root, sel) {
    return Array.from(root.querySelectorAll(sel));
  }
  function splitChars(el, text) {
    el.textContent = "";
    const chars = [];
    [...text].forEach((ch) => {
      const wrap = document.createElement("span");
      wrap.className = "char-wrap";
      const s = document.createElement("span");
      s.className = "char";
      s.textContent = ch === " " ? "\u00A0" : ch;
      wrap.appendChild(s);
      el.appendChild(wrap);
      chars.push(s);
    });
    return chars;
  }
  // Accepts the parts array, a `{ parts: [...] }` line object (the shape
  // overlay-type uses), or a plain string, so shot data can use any of them.
  function mixedLine(el, parts) {
    el.textContent = "";
    const chars = [];
    if (typeof parts === "string") parts = [{ text: parts, weight: "heavy" }];
    else if (parts && !Array.isArray(parts) && Array.isArray(parts.parts)) parts = parts.parts;
    (parts || []).forEach((p) => {
      const word = document.createElement("span");
      word.className = "word " + (p.weight === "thin" ? "thin" : "heavy") + (p.accent ? " accent" : "");
      word.style.fontWeight = p.weight === "thin" ? "300" : "800";
      chars.push(...splitChars(word, p.text));
      el.appendChild(word);
      el.appendChild(document.createTextNode(" "));
    });
    return chars;
  }
  function rng(seed) {
    return () => ((seed = Math.imul(48271, seed)) >>> 0) / 4294967296;
  }
  function smsCard(c) {
    return h(`<div class="sms-card" style="left:${c.x}px;top:${c.y}px">
      <div class="row">
        <div class="ic-dot">${ShotIcons.sms()}</div>
        <span>New message</span>
        <span class="sms-num">${c.phone}</span>
      </div>
      <div class="bar"><span class="hash">${c.hash}</span></div>
    </div>`);
  }

  /* ---------- type-field ---------- */
  function typeFieldMount(el, shot) {
    el.dataset.bg = shot.bg || "accent";
    const stack = h(`<div class="type-stack left"></div>`);
    (shot.lines || []).forEach((line) => {
      const d = h(`<div class="type-line ${line.weight === "thin" ? "thin" : ""}"></div>`);
      splitChars(d, line.text);
      stack.appendChild(d);
    });
    el.appendChild(stack);
    const layer = h(`<div class="chrome-layer"></div>`);
    (shot.chrome || []).forEach((c) => {
      if (c.kind === "sms") layer.appendChild(smsCard(c));
      else if (c.kind === "bot-pill") {
        // Films write `text`; the schema's older example said `phone`. Either
        // is the label — an unset one used to print "undefined" on screen.
        const label = c.text ?? c.label ?? c.phone ?? "";
        layer.appendChild(h(`<div class="bot-pill" style="left:${c.x}px;top:${c.y}px">${c.text || c.label ? "" : '<span class="ghost">👻</span>'}<span class="sms-num">${label}</span></div>`));
      } else if (c.kind === "progress") {
        layer.appendChild(h(`<div class="progress-pill" style="left:${c.x}px;top:${c.y}px"><div class="fill"></div></div>`));
      }
    });
    el.appendChild(layer);
  }
  function typeFieldAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const chars = el.querySelectorAll(".char");
    const chrome = el.querySelectorAll(".sms-card, .bot-pill, .progress-pill");
    tl.from(chars, {
      yPercent: 150, duration: 0.55, ease: EASE.slam, stagger: 0.012,
    }, 0.04);
    tl.from(chrome, {
      x: 520, opacity: 0, duration: 0.7, ease: EASE.land, stagger: 0.07,
    }, 0.18);
    tl.to(chrome, {
      x: "-=70", duration: Math.max(0.4, D - 0.5), ease: "none",
    }, 0.9);
    return tl;
  }

  /* ---------- overlay-type ---------- */
  function overlayMount(el, shot) {
    el.dataset.bg = shot.bg || "ink";
    const frame = h(`<div class="stage-frame"></div>`);
    const phone = h(`<div class="ghost-phone"><div class="inner"></div></div>`);
    const inner = phone.querySelector(".inner");
    const rand = rng(shot.seed || 9);
    for (let i = 0; i < 5; i++) {
      inner.appendChild(h(`<div class="ghost-row">
        <div class="ghost-ava">🕵️</div>
        <div class="ghost-bars">
          <div class="ghost-bar ${i === 1 ? "accent" : ""}" style="width:${40 + rand() * 50}%"></div>
          <div class="ghost-bar" style="width:${30 + rand() * 40}%"></div>
        </div>
      </div>`));
    }
    frame.appendChild(phone);
    el.appendChild(frame);
    (shot.lines || []).forEach((line, i) => {
      const node = h(`<div class="type-center overlay-line" data-i="${i}"></div>`);
      mixedLine(node, line.parts);
      el.appendChild(node);
    });
  }
  function overlayAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const lines = [...el.querySelectorAll(".overlay-line")];
    gsap.set(lines, { opacity: 0 });
    const slot = D / Math.max(1, lines.length);
    lines.forEach((line, i) => {
      const chars = line.querySelectorAll(".char");
      const t0 = i * slot;
      tl.set(line, { opacity: 1 }, t0);
      tl.from(chars, { yPercent: 140, duration: 0.38, ease: EASE.slam, stagger: 0.01 }, t0);
      if (i < lines.length - 1) {
        tl.to(line, { opacity: 0, y: -20, duration: 0.18, ease: EASE.crash }, t0 + slot - 0.18);
      }
    });
    tl.fromTo(qs(el, ".ghost-phone"), { y: 30, scale: 1.04 }, {
      y: -20, scale: 1.12, duration: D, ease: "none",
    }, 0);
    return tl;
  }

  /* ---------- logo-sting ---------- */
  // The lockup is built from the product's own assets: `src` (harvested
  // SVG/PNG logo or wordmark), optional `markSvg` (inline SVG string), and/or
  // `word` typeset in the brand font. `accentFirst` colors the first letter.
  // Nothing brand-specific is drawn by default.
  function logoHTML(shot) {
    const word = shot.word || "";
    const first = word.slice(0, 1);
    const rest = word.slice(1);
    const img = shot.src ? `<img class="logo-img" src="${shot.src}" alt="" draggable="false">` : "";
    const mark = shot.markSvg ? `<span class="logo-mark">${shot.markSvg}</span>` : "";
    const wordHtml = word
      ? `<span class="logo-word">${shot.accentFirst ? `<span class="d">${first}</span><span class="logo-rest">${rest}</span>` : `<span class="logo-rest">${word}</span>`}</span>`
      : "";
    const tag = shot.tag ? `<span class="logo-tag">${shot.tag}</span>` : "";
    return `<div class="logo-lockup ${shot.size === "hero" ? "hero" : ""}">${img}${mark}${wordHtml}${tag}</div>`;
  }
  function logoMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    el.appendChild(h(logoHTML(shot)));
    if (shot.vignette) {
      el.style.boxShadow = "inset 0 0 180px 40px rgba(47,91,255,0.18)";
    }
  }
  function logoAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const lock = qs(el, ".logo-lockup");
    const mark = el.querySelector(".logo-img, .logo-mark");
    const d = el.querySelector(".d");
    const rest = el.querySelector(".logo-rest");
    const tag = el.querySelector(".logo-tag");
    if (shot.mode === "mark" && mark) {
      if (rest) gsap.set(rest, { opacity: 0, width: 0, overflow: "hidden" });
      // Out of the layout, not just invisible: an unseen tag pushed the mark off centre.
      if (tag) gsap.set(tag, { display: "none" });
      tl.from([mark, d].filter(Boolean), { scale: 0.45, opacity: 0, duration: 0.5, ease: EASE.slam }, 0);
    } else {
      if (mark) tl.from(mark, { scale: 0.6, opacity: 0, duration: 0.42, ease: EASE.slam }, 0);
      if (d) tl.from(d, { opacity: 0, duration: 0.35, ease: EASE.land }, 0.08);
      if (rest) tl.from(rest, { x: -20, opacity: 0, duration: 0.5, ease: EASE.land }, mark || d ? 0.14 : 0);
      if (tag) tl.from(tag, { x: 30, opacity: 0, duration: 0.45, ease: EASE.land }, 0.32);
      if (!mark && !d && !rest) tl.from(lock, { scale: 0.8, opacity: 0, duration: 0.5, ease: EASE.slam }, 0);
    }
    return tl;
  }

  /* ---------- type-wipe ---------- */
  function wipeMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const node = h(`<div class="type-center"></div>`);
    mixedLine(node, shot.parts);
    el.appendChild(node);
  }
  function wipeAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const line = qs(el, ".type-center");
    tl.from(line, { x: 420, duration: 0.9, ease: EASE.land }, 0);
    const chars = line.querySelectorAll(".char");
    tl.from(chars, { opacity: 0, duration: 0.01, stagger: 0.018 }, 0);
    return tl;
  }

  /* ---------- icon-marquee ---------- */
  function marqueeItem(it) {
    if (it.kind === "avatar") {
      return `<span class="mq-item"><img class="avatar" src="${it.src}" alt=""><span class="mq-label">${it.label || ""}</span></span>`;
    }
    if (it.kind === "pill") {
      return `<span class="mq-item"><span class="mq-pill">${it.label}</span></span>`;
    }
    if (it.src) {
      // A harvested logo/icon file. `tile` gives it an app-icon tile; default is the bare image.
      const tile = it.tile ? ` app-ic${it.round ? " round" : ""}` : "";
      const style = it.tile && it.bg ? ` style="background:${it.bg}"` : "";
      return `<span class="mq-item"><span class="mq-logo${tile}"${style}><img src="${it.src}" alt="" draggable="false"></span><span class="mq-label">${it.label || ""}</span></span>`;
    }
    const chip = it.icon ? ShotIcons.chip(it.icon) : null;
    if (!chip) {
      return `<span class="mq-item"><span class="mq-label">${it.label || ""}</span></span>`;
    }
    return `<span class="mq-item"><span class="app-ic" style="background:${chip.bg}">${chip.svg}</span><span class="mq-label">${it.label || ""}</span></span>`;
  }
  function marqueeMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const field = h(`<div class="marquee-field"></div>`);
    (shot.rows || []).forEach((row, i) => {
      const strip = h(`<div class="marquee-row" data-row="${i}" style="top:${row.y}px"></div>`);
      const html = row.items.map(marqueeItem).join("");
      strip.innerHTML = html + html; // duplicate for travel
      field.appendChild(strip);
    });
    el.appendChild(field);
    if (shot.anchor) {
      const a = h(`<div class="marquee-anchor type-center"></div>`);
      mixedLine(a, shot.anchor);
      el.appendChild(a);
    }
  }
  function marqueeAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const rows = [...el.querySelectorAll(".marquee-row")];
    rows.forEach((row, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      const dist = 280 + i * 40;
      tl.from(row, { y: dir * 40, opacity: 0, duration: 0.5, ease: EASE.land }, 0.05);
      tl.fromTo(row, { x: 0 }, { x: dir * dist, duration: D, ease: "none" }, 0);
    });
    const anchor = el.querySelector(".marquee-anchor");
    if (anchor) {
      tl.from(anchor, { scale: 0.92, opacity: 0, duration: 0.45, ease: EASE.slam }, 0.1);
    }
    return tl;
  }

  /* ---------- device-notif ---------- */
  function notifHTML(n) {
    const chip = n.src
      ? { bg: n.iconBg || "#fff", svg: `<img class="notif-ic-img" src="${n.src}" alt="" draggable="false">` }
      : (ShotIcons.chip(n.app || "sms") || ShotIcons.chip("sms"));
    return `<div class="notif" style="--notif-tint:${n.tint || "#D9FBE4"};--notif-ink:${n.ink || "#128C4A"}">
      <div class="meta">${n.meta ?? "Verification"}</div>
      <div class="kicker">${n.kicker || ""}</div>
      <div class="body">${n.body || ""}${n.call ? `<div class="call-row"><span>${n.sub || ""}</span><span class="accept">Accept 📞</span></div>` : ""}</div>
      <div class="notif-ic" style="background:${chip.bg}">${chip.svg}</div>
    </div>`;
  }
  function deviceMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const all = [shot.notif || {}, ...(shot.more || [])];
    el.appendChild(h(`<div class="phone">
      <div class="phone-screen">
        <div class="island"></div>
        ${all.map(notifHTML).join("")}
        <div class="phone-ghost-ui">
          <div class="ph-bar"></div>
          <div class="ph-dots"><div class="ph-dot"></div><div class="ph-dot"></div><div class="ph-dot"></div><div class="ph-dot"></div></div>
        </div>
      </div>
    </div>`));
    // Later notifications start hidden; deviceAnimate reveals them.
    gsap.set([...el.querySelectorAll(".notif")].slice(1), { opacity: 0 });
  }
  function deviceAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const phone = qs(el, ".phone");
    const notifs = [...el.querySelectorAll(".notif")];
    const first = notifs[0];
    tl.from(phone, { y: 90, scale: 0.92, duration: 0.55, ease: EASE.slam }, 0);
    tl.from(first, { y: 24, scale: 0.86, opacity: 0, duration: 0.42, ease: EASE.snap }, 0.16);
    tl.from(first.querySelector(".notif-ic"), { scale: 0, duration: 0.4, ease: EASE.pop }, 0.22);
    // `more`: further notifications drop in and push the earlier ones down.
    const extra = notifs.slice(1);
    extra.forEach((n, i) => {
      const at = shot.moreAt?.[i] ?? Math.min(D - 0.6, 0.9 + i * Math.max(0.55, (D - 1.6) / Math.max(1, extra.length)));
      const shift = n.offsetHeight ? n.offsetHeight + 14 : 150;
      const ghost = el.querySelector(".phone-ghost-ui");
      tl.to([...notifs.slice(0, i + 1), ...(ghost ? [ghost] : [])], { y: "+=" + shift, duration: 0.36, ease: "power3.inOut" }, at);
      tl.fromTo(n, { y: -30, scale: 0.86, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: EASE.snap }, at + 0.05);
      tl.from(n.querySelector(".notif-ic"), { scale: 0, duration: 0.4, ease: EASE.pop }, at + 0.12);
      if (shot.tilt !== false) tl.to(phone, { rotation: (i % 2 ? -1 : 1) * 1.6, duration: 0.4, ease: "power2.out" }, at);
    });
    return tl;
  }

  /* ---------- word-cut ---------- */
  function wordMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const node = h(`<div class="type-center"></div>`);
    mixedLine(node, shot.parts || [{ text: shot.text, weight: "heavy" }]);
    el.appendChild(node);
  }
  function wordAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const line = qs(el, ".type-center");
    if (shot.reveal === "words") return revealWords(tl, line, 0.02, { each: shot.each ?? 0.13 });
    const chars = line.querySelectorAll(".char");
    tl.from(line, { scale: 1.35, duration: 0.45, ease: EASE.slam }, 0);
    tl.from(chars, { yPercent: 80, duration: 0.4, ease: EASE.land, stagger: 0.012 }, 0);
    return tl;
  }

  /* ---------- color-punch ---------- */
  function punchMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const card = h(`<div class="punch-card"><div class="punch-text"></div></div>`);
    const txt = card.querySelector(".punch-text");
    if (shot.parts) mixedLine(txt, shot.parts);
    else txt.innerHTML = String(shot.text || "").replace(/\n/g, "<br>");
    el.appendChild(card);
  }
  function punchAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const card = qs(el, ".punch-card");
    const word = qs(el, ".punch-text");
    tl.from(card, { scale: 0.22, duration: 0.55, ease: EASE.slam }, 0);
    if (shot.reveal === "words") revealWords(tl, word, 0.16, { each: shot.each ?? 0.13 });
    else tl.from(word, { yPercent: 90, opacity: 0, duration: 0.4, ease: EASE.land }, 0.12);
    tl.to(card, { scale: 1.12, duration: Math.max(0.3, D - 0.55), ease: "none" }, 0.55);
    return tl;
  }

  /* ---------- logo-cta ---------- */
  function ctaMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    el.appendChild(h(`<div class="cta-col">
      ${logoHTML({ ...shot, size: "hero", tag: null })}
      <div class="cta-pill"><span class="cta-text"></span><span class="caret"></span></div>
    </div>`));
  }
  function ctaAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const lock = qs(el, ".logo-lockup");
    const pill = qs(el, ".cta-pill");
    const text = qs(el, ".cta-text");
    const caret = qs(el, ".caret");
    tl.from(lock, { y: 28, scale: 0.86, opacity: 0, duration: 0.5, ease: EASE.slam }, 0);
    tl.from(pill, { y: 20, scale: 0.9, opacity: 0, duration: 0.4, ease: EASE.snap }, 0.28);
    const full = shot.pill || "";
    const obj = { n: 0 };
    tl.to(obj, {
      n: full.length,
      duration: Math.min(2.2, Math.max(0.8, D - 1.2)),
      ease: "none",
      onUpdate: () => { text.textContent = full.slice(0, Math.round(obj.n)); },
    }, 0.55);
    tl.fromTo(caret, { opacity: 1 }, { opacity: 0.15, duration: 0.9, ease: "none" }, 0.55);
    return tl;
  }

  /* ---------- shared: word-by-word reveal ---------- */
  // Words arrive one after another (the reference-film cadence: "Coding stops
  // you from / Launching your startup?"), accent words pop a little harder.
  // Returns the timeline; `each` is the gap between words.
  function revealWords(tl, root, at, opts) {
    const o = opts || {};
    const words = [...root.querySelectorAll(".word")];
    if (!words.length) return tl;
    const each = o.each ?? 0.13;
    gsap.set(words, { opacity: 0 });
    words.forEach((w, i) => {
      const t = at + i * each;
      const accent = w.classList.contains("accent");
      tl.fromTo(w, { opacity: 0, y: 34, scale: accent ? 0.6 : 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: accent ? 0.42 : 0.3, ease: accent ? EASE.pop : EASE.slam, transformOrigin: "50% 80%" }, t);
      if (accent && o.punch !== false) tl.fromTo(w, { scale: 1.16 }, { scale: 1, duration: 0.24, ease: "power2.out" }, t + 0.42);
    });
    return tl;
  }
  // Words leave in random directions (a scatter), for a line that gets replaced.
  function scatterWords(tl, root, at, seed) {
    const words = [...root.querySelectorAll(".word")];
    if (!words.length) return tl;
    const rand = rng(seed || 3);
    tl.to(words, {
      x: () => (rand() - 0.5) * 700, y: () => (rand() - 0.5) * 500, rotation: () => (rand() - 0.5) * 40,
      opacity: 0, duration: 0.32, ease: "power3.in", stagger: { each: 0.02, from: "random" },
    }, at);
    return tl;
  }

  /* ---------- word-build ---------- */
  // A sentence assembles word by word in the centre; optional further `lines`
  // replace it (previous words scatter out). Accent words carry the beat.
  // { lines: [{ parts: [{text, weight?, accent?}] }, ...], each?, seed?, align? }
  function wordBuildMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const stack = h(`<div class="wb-stack ${shot.align === "left" ? "left" : ""}"></div>`);
    (shot.lines || [{ parts: shot.parts || [{ text: shot.text || "" }] }]).forEach((line, i) => {
      const node = h(`<div class="type-center wb-line" data-i="${i}"></div>`);
      mixedLine(node, line.parts || line);
      stack.appendChild(node);
    });
    el.appendChild(stack);
  }
  function wordBuildAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const lines = [...el.querySelectorAll(".wb-line")];
    const slot = D / Math.max(1, lines.length);
    // lineAt: absolute (shot-relative) start of each line — filled by sync.mjs from
    // the narration cues, so a line lands as the narrator reaches it.
    const at = Array.isArray(shot.lineAt) ? shot.lineAt : null;
    const startOf = (i) => Math.min(Math.max(0, Number(at?.[i] ?? i * slot)), D - 0.2);
    lines.forEach((line, i) => {
      const t0 = startOf(i);
      const t1 = i < lines.length - 1 ? startOf(i + 1) : D;
      gsap.set(line, { opacity: 0 });
      tl.set(line, { opacity: 1 }, t0);
      revealWords(tl, line, t0 + 0.04, { each: shot.each ?? 0.13 });
      if (i < lines.length - 1) scatterWords(tl, line, Math.max(t0 + 0.3, t1 - 0.36), (shot.seed || 3) + i);
    });
    return tl;
  }

  /* ---------- pile ---------- */
  // Chaos beat: windows / toasts / pills pile onto the stage one after another
  // (every 0.2–0.4s), then the whole pile blows away. Ideal for "the problem".
  // { items: [{ kind: "toast"|"window"|"pill", title?, body?, x, y, rot?, w?, tone?: "error"|"warn"|"ok"|"plain" }],
  //   anchor?: parts, every?: 0.3, blowAt?: seconds, seed? }
  function pileItem(it) {
    const tone = it.tone || "plain";
    const w = it.w ? `width:${it.w}px;` : "";
    const style = `left:${it.x}px;top:${it.y}px;${w}--rot:${it.rot || 0}deg`;
    if (it.kind === "window") {
      return h(`<div class="pile-item pile-window ${tone}" style="${style}">
        <div class="pw-bar"><span></span><span></span><span></span><em>${it.title || ""}</em></div>
        <div class="pw-body">${it.body || ""}</div></div>`);
    }
    if (it.kind === "pill") {
      return h(`<div class="pile-item pile-pill ${tone}" style="${style}">${it.title || it.body || ""}</div>`);
    }
    return h(`<div class="pile-item pile-toast ${tone}" style="${style}">
      <div class="pt-ic"></div><div class="pt-txt"><b>${it.title || ""}</b><span>${it.body || ""}</span></div></div>`);
  }
  function pileMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const field = h(`<div class="pile-field"></div>`);
    (shot.items || []).forEach((it) => field.appendChild(pileItem(it)));
    el.appendChild(field);
    if (shot.anchor) {
      const a = h(`<div class="pile-anchor type-center"></div>`);
      mixedLine(a, shot.anchor);
      el.appendChild(a);
    }
  }
  function pileAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const items = [...el.querySelectorAll(".pile-item")];
    const rand = rng(shot.seed || 21);
    const every = shot.every ?? Math.min(0.34, Math.max(0.14, (D * 0.55) / Math.max(1, items.length)));
    items.forEach((it, i) => {
      const t = 0.05 + i * every;
      const rot = parseFloat(it.style.getPropertyValue("--rot")) || 0;
      tl.fromTo(it, { opacity: 0, scale: 0.6, y: 60 + rand() * 60, rotation: rot - 8 + rand() * 16 },
        { opacity: 1, scale: 1, y: 0, rotation: rot, duration: 0.42, ease: EASE.snap, transformOrigin: "50% 50%" }, t);
      // a small nudge later so the pile keeps breathing
      tl.to(it, { y: "-=" + (6 + rand() * 10), rotation: rot + (rand() - 0.5) * 4, duration: 0.6, ease: "sine.inOut" }, t + 0.6);
    });
    const anchor = el.querySelector(".pile-anchor");
    if (anchor) revealWords(tl, anchor, Math.min(D * 0.35, 0.05 + items.length * every * 0.6), { each: 0.12 });
    const blowAt = shot.blowAt ?? (D - 0.55);
    if (shot.blow !== false && blowAt > 0.5) {
      tl.to(items, {
        x: () => (rand() - 0.5) * 1400, y: () => -300 - rand() * 500, rotation: () => (rand() - 0.5) * 90,
        opacity: 0, duration: 0.5, ease: "power3.in", stagger: { each: 0.018, from: "random" },
      }, blowAt);
    }
    return tl;
  }

  /* ---------- stat-counter ---------- */
  // One big number counting up, with a label. Numbers come from recon.
  function fmtNumber(n, decimals) {
    return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function statMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const prefix = shot.prefix || "";
    const suffix = shot.suffix || "";
    el.appendChild(h(`<div class="stat-col">
      <div class="stat-num"><span class="stat-prefix">${prefix}</span><span class="stat-value">0</span><span class="stat-suffix">${suffix}</span></div>
      ${shot.label ? `<div class="stat-label"></div>` : ""}
    </div>`));
    if (shot.label) mixedLine(qs(el, ".stat-label"), shot.label);
  }
  function statAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const num = qs(el, ".stat-num");
    const value = qs(el, ".stat-value");
    const decimals = shot.decimals ?? 0;
    const target = Number(shot.value) || 0;
    const obj = { n: shot.from ?? 0 };
    tl.from(num, { y: 40, opacity: 0, duration: 0.45, ease: EASE.land }, 0);
    tl.to(obj, {
      n: target,
      duration: Math.min(2.2, Math.max(0.9, D * 0.55)),
      ease: "expo.out",
      onUpdate: () => { value.textContent = fmtNumber(obj.n, decimals); },
    }, 0.1);
    const label = el.querySelector(".stat-label");
    if (label) {
      tl.from(label.querySelectorAll(".char"), { yPercent: 140, duration: 0.4, ease: EASE.land, stagger: 0.008 }, 0.35);
    }
    return tl;
  }

  /* ---------- ui-frame ---------- */
  // The product itself: a harvested screenshot (or native `html`) inside a
  // browser / phone frame, with a semantic camera move to one hotspot and an
  // optional cursor click. Coordinates are fractions (0–1) of the screen area.
  const FRAME_SIZES = {
    browser: { w: 1560, h: 900 },
    phone: { w: 430, h: 880 },
    none: { w: 1600, h: 900 },
  };
  // The visible screen inside the frame: the bar and the phone bezel are fixed
  // chrome, so the screen rect is known without DOM measurement.
  function screenGeom(shot, w, hgt) {
    const barH = shot.frame === "phone" || shot.frame === "none" ? 0 : 56;
    const pad = shot.frame === "phone" ? 14 : 0;
    return { barH, pad, sw: w - pad * 2, sh: hgt - barH - pad * 2 };
  }
  // Where an image of natW×natH lands under object-fit: cover in a boxW×boxH
  // screen with an object-position string — the same maths the browser does,
  // so a layer cut from the screenshot sits exactly over its pixels.
  function coverMap(natW, natH, boxW, boxH, align) {
    const s = Math.max(boxW / natW, boxH / natH);
    const rw = natW * s;
    const rh = natH * s;
    const words = String(align || "top center").toLowerCase().split(/\s+/);
    const ax = words.includes("left") ? 0 : words.includes("right") ? 1 : 0.5;
    const ay = words.includes("top") ? 0 : words.includes("bottom") ? 1 : 0.5;
    return { s, ox: (boxW - rw) * ax, oy: (boxH - rh) * ay };
  }
  function uiMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const kind = shot.frame || "browser";
    const size = FRAME_SIZES[kind] || FRAME_SIZES.browser;
    const w = shot.width || size.w;
    const hgt = shot.height || size.h;
    const cam = h(`<div class="ui-cam"></div>`);
    const wrap = h(`<div class="ui-frame ${kind}" style="width:${w}px;height:${hgt}px;left:${(STAGE.w - w) / 2 + (shot.offsetX || 0)}px;top:${(STAGE.h - hgt) / 2 + (shot.offsetY || 0)}px"></div>`);
    if (kind === "browser") {
      wrap.appendChild(h(`<div class="ui-bar"><span class="ui-dot"></span><span class="ui-dot"></span><span class="ui-dot"></span><span class="ui-url">${shot.url || ""}</span></div>`));
    }
    if (kind === "phone") wrap.appendChild(h(`<div class="island"></div>`));
    const screen = h(`<div class="ui-screen"></div>`);
    if (shot.src) {
      screen.appendChild(h(`<img class="ui-img" src="${shot.src}" alt="" draggable="false" style="object-position:${shot.align || "top center"}">`));
    } else if (shot.html) {
      screen.innerHTML = shot.html;
    }
    // Layers cut from the same screenshot (motion_screenshot layers → the
    // .layers.json it prints): each sits over its own pixels and carries a
    // depth, so the focus camera and `tilt` move it in parallax.
    const L = shot.layers;
    if (L && Array.isArray(L.items) && L.items.length && L.w && L.h) {
      screen.classList.add("layered");
      const g = screenGeom(shot, w, hgt);
      const m = coverMap(L.w, L.h, g.sw, g.sh, shot.align);
      L.items.forEach((it) => {
        const img = h(`<img class="ui-layer" src="${it.src}" alt="" draggable="false">`);
        const left = m.ox + it.x * m.s;
        const top = m.oy + it.y * m.s;
        img.style.cssText = `left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${(it.w * m.s).toFixed(2)}px;height:${(it.h * m.s).toFixed(2)}px;`;
        img.dataset.depth = String(it.depth ?? 1);
        img.dataset.left = left.toFixed(2);
        img.dataset.top = top.toFixed(2);
        screen.appendChild(img);
      });
    }
    if (shot.cursor) screen.appendChild(pointer(shot.cursor.hand));
    if (Array.isArray(shot.cursors)) {
      // Named collaborator cursors, each with a colour and a label, moving
      // along waypoints: the product is being used by several people.
      shot.cursors.forEach((c, i) => {
        const color = c.color || "var(--accent)";
        screen.appendChild(h(`<div class="ui-cursor-named" data-i="${i}"><svg viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 8z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span class="tag" style="background:${color}">${c.label || ""}</span></div>`));
      });
    }
    if (shot.cursor && shot.cursor.zoom) screen.appendChild(h(`<div class="ui-veil"></div>`));
    if (shot.aura) wrap.classList.add("aura");
    wrap.appendChild(screen);
    cam.appendChild(wrap);
    el.appendChild(cam);
    if (shot.caption) {
      const cap = h(`<div class="ui-caption ${shot.captionPos === "bottom" ? "bottom" : "top"} type-center"></div>`);
      mixedLine(cap, shot.caption);
      el.appendChild(cap);
    }
  }
  function uiAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const cam = qs(el, ".ui-cam");
    const frame = qs(el, ".ui-frame");
    const screen = qs(el, ".ui-screen");
    const enter = shot.enter || "rise";
    if (enter === "rise") tl.from(frame, { y: 70, scale: 0.96, opacity: 0, duration: 0.6, ease: EASE.land }, 0);
    else if (enter === "scale") tl.from(frame, { scale: 0.82, opacity: 0, duration: 0.55, ease: EASE.slam }, 0);

    // Screen rect in stage coordinates is known from the fixed frame geometry,
    // so hotspot math needs no DOM measurement and stays deterministic.
    const fl = parseFloat(frame.style.left);
    const ft = parseFloat(frame.style.top);
    const { barH, pad, sw, sh } = screenGeom(shot, parseFloat(frame.style.width), parseFloat(frame.style.height));
    const sx = fl + pad;
    const sy = ft + barH + pad;
    const toStage = (fx, fy) => ({ x: sx + fx * sw, y: sy + fy * sh });

    // Layers: the deeper (nearer) a layer, the more it moves — on entrance,
    // under the focus camera, and under `tilt`.
    const layers = [...el.querySelectorAll(".ui-layer")];
    const depthOf = (l) => Number(l.dataset.depth) || 0;
    if (layers.length && enter !== "none") {
      tl.from(layers, { y: (i, l) => 36 + 28 * depthOf(l), opacity: 0, duration: 0.55, ease: EASE.land, stagger: 0.05 }, 0.16);
    }
    const tilt = shot.tilt;
    if (tilt && (tilt.x || tilt.y)) {
      const tAt = tilt.at ?? 0;
      const tDur = Math.max(0.2, tilt.dur ?? (D - tAt));
      const rx = tilt.x ?? 0;
      const ry = tilt.y ?? 0;
      const ez = tilt.ease || "sine.inOut";
      tl.fromTo(frame, { rotationX: rx, rotationY: -ry, transformPerspective: 1600 }, { rotationX: -rx, rotationY: ry, duration: tDur, ease: ez }, tAt);
      layers.forEach((l) => {
        const d = depthOf(l);
        const bl = parseFloat(l.dataset.left);
        const bt = parseFloat(l.dataset.top);
        tl.fromTo(l, { left: bl - ry * d * 1.6, top: bt + rx * d * 1.6 }, { left: bl + ry * d * 1.6, top: bt - rx * d * 1.6, duration: tDur, ease: ez }, tAt);
      });
    }

    const caption = el.querySelector(".ui-caption");
    if (caption) {
      tl.from(caption.querySelectorAll(".char"), { yPercent: 140, duration: 0.45, ease: EASE.slam, stagger: 0.01 }, 0.12);
    }

    const f = shot.focus;
    if (f) {
      const cx = f.x + (f.w || 0) / 2;
      const cy = f.y + (f.h || 0) / 2;
      const c = toStage(cx, cy);
      const scale = f.scale || (f.w ? Math.min(3.2, Math.max(1.3, 0.6 / f.w)) : 1.8);
      const landX = f.landX ?? 960;
      const landY = f.landY ?? 540;
      const at = f.at ?? 0.9;
      const dur = f.duration ?? 0.72;
      tl.to(cam, {
        scale, x: landX - scale * c.x, y: landY - scale * c.y,
        duration: dur, ease: f.ease || "power4.inOut", transformOrigin: "0 0",
      }, at);
      const relAt = Math.min(D - 0.3, at + dur + (f.hold ?? 1.2));
      if (f.release !== false) {
        tl.to(cam, { scale: f.releaseScale ?? 1.06, x: 0, y: 0, duration: 0.9, ease: "power2.inOut" }, relAt);
      }
      // Parallax: a layer slides away from the hotspot and grows a little as
      // the camera dollies in, by its depth; the release brings it home.
      layers.forEach((l) => {
        const d = depthOf(l);
        if (!d) return;
        const lx = parseFloat(l.dataset.left) + parseFloat(l.style.width) / 2;
        const ly = parseFloat(l.dataset.top) + parseFloat(l.style.height) / 2;
        const k = (scale - 1) * d * 0.12;
        tl.to(l, { x: (lx - cx * sw) * k, y: (ly - cy * sh) * k, scale: 1 + (scale - 1) * d * 0.08, duration: dur, ease: f.ease || "power4.inOut", transformOrigin: "50% 50%" }, at);
        if (f.release !== false) tl.to(l, { x: 0, y: 0, scale: 1, duration: 0.9, ease: "power2.inOut" }, relAt);
      });
    }

    const cur = shot.cursor;
    if (cur) {
      const node = qs(el, ".ui-cursor");
      const ripple = qs(el, ".ui-ripple");
      const tx = cur.x * sw;
      const ty = cur.y * sh;
      const at = cur.at ?? ((f ? (f.at ?? 0.9) + (f.duration ?? 0.72) : 0.6) + 0.3);
      gsap.set(node, { x: tx + 180, y: ty + 140, opacity: 0, scale: 1 });
      tl.to(node, { opacity: 1, duration: 0.15 }, at);
      tl.to(node, { x: tx, duration: 0.7, ease: "power2.inOut" }, at);
      tl.to(node, { y: ty, duration: 0.7, ease: "power3.out" }, at);
      tl.to(node, { scale: 0.82, duration: 0.09, ease: "power2.in" }, at + 0.82);
      tl.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: "power2.out" }, at + 0.86);
      tl.to(node, { scale: 1, duration: 0.18, ease: "back.out(2)" }, at + 0.94);
      if (cur.leave !== false && !cur.zoom) tl.to(node, { opacity: 0, duration: 0.25 }, at + 1.5);
      if (cur.then) {
        // Post-click state: swap the screenshot (e.g. the resulting screen).
        tl.set(qs(el, ".ui-img"), { attr: { src: cur.then } }, at + 1.0);
      }
      if (cur.zoom) {
        // The click pushes the camera into the clicked point and the rest of
        // the screen blurs to white: what was clicked becomes the subject.
        const z = cur.zoom === true ? {} : cur.zoom;
        const zs = z.scale || 2.6;
        const zAt = at + (z.at ?? 1.0);
        const zDur = z.dur ?? 0.3;
        const p = toStage(cur.x, cur.y);
        tl.to(cam, { scale: zs, x: 960 - zs * p.x, y: 540 - zs * p.y, duration: zDur, ease: z.ease || "power3.inOut", transformOrigin: "0 0" }, zAt);
        if (z.dof !== false) {
          const veil = el.querySelector(".ui-veil");
          const img = el.querySelector(".ui-img");
          if (veil) tl.to(veil, { opacity: z.veil ?? 0.7, duration: zDur, ease: "power2.in" }, zAt);
          if (img) tl.to(img, { filter: `blur(${z.blur ?? 8}px)`, duration: zDur, ease: "power2.in" }, zAt);
        }
        tl.to(node, { scale: zs > 1.8 ? 0.7 : 1, duration: zDur, ease: "power2.inOut" }, zAt);
      }
    }
    // Named cursors travel their waypoints.
    (shot.cursors || []).forEach((c, i) => {
      const node = el.querySelector(`.ui-cursor-named[data-i="${i}"]`);
      if (!node || !Array.isArray(c.path) || !c.path.length) return;
      const p0 = c.path[0];
      gsap.set(node, { x: p0.x * sw, y: p0.y * sh, opacity: 0 });
      tl.to(node, { opacity: 1, duration: 0.2 }, p0.at ?? 0.2);
      for (let k = 1; k < c.path.length; k++) {
        const a = c.path[k - 1], b = c.path[k];
        const t0 = a.at ?? 0.2, t1 = b.at ?? t0 + 0.8;
        tl.to(node, { x: b.x * sw, y: b.y * sh, duration: Math.max(0.1, t1 - t0), ease: "power1.inOut" }, t0);
      }
    });
    return tl;
  }

  /* ---------- async assets and canvas stages ---------- */
  // A factory that loads something — a texture, a Lottie file, a .riv — hands
  // the promise to ready(); the compiler holds __READY until it settles, so
  // the first captured frame already has the asset.
  window.__PENDING = window.__PENDING || [];
  function ready(p) { window.__PENDING.push(p); return p; }
  // Canvas stages redraw from the compiler's frame hook after every timeline
  // render (both seek directions), so a factory only tweens state — a mesh
  // rotation, a Lottie frame — on its returned timeline and never draws itself.
  window.__FRAME_HOOKS = window.__FRAME_HOOKS || [];
  function frameHook(el, render) { window.__FRAME_HOOKS.push({ el, render }); }

  // A three.js stage the size of the shot. World units are CSS pixels on the
  // z = 0 plane (a 400-unit box is 400px wide at the screen), the camera looks
  // down -z from the front, and the canvas keeps its buffer so the capture
  // reads what the last render drew. `texture(src)` loads through ready().
  function three(el, opts = {}) {
    const THREE = window.THREE;
    if (!THREE) throw new Error("three.js is not on the page — run motion_scaffold again (it writes the module tag)");
    const width = opts.width || STAGE.w;
    const height = opts.height || STAGE.h;
    const fov = opts.fov || 35;
    const canvas = document.createElement("canvas");
    canvas.className = "gl-stage";
    canvas.style.cssText = `position:absolute;left:${opts.x ?? 0}px;top:${opts.y ?? 0}px;width:${width}px;height:${height}px;display:block;pointer-events:none;`;
    el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: opts.alpha !== false, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(opts.pixelRatio || window.devicePixelRatio || 1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (opts.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, width / height, 1, 40000);
    camera.position.set(0, 0, (height / 2) / Math.tan((fov * Math.PI / 180) / 2));
    camera.lookAt(0, 0, 0);
    const render = () => renderer.render(scene, camera);
    const texture = (src, onLoad) => {
      let done;
      ready(new Promise((resolve) => { done = resolve; }));
      const tex = new THREE.TextureLoader().load(src, (t) => { if (onLoad) onLoad(t); done(); }, undefined, (e) => { console.warn("[three] texture failed", src, e); done(); });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return tex;
    };
    frameHook(el, render);
    return { THREE, renderer, scene, camera, canvas, render, texture, width, height };
  }

  // A Lottie file on an SVG stage, driven frame by frame from the timeline.
  // drive(tl, { at, dur, from, to, speed, loop }) plays it at its own frame
  // rate over `dur` unless `to` names the last frame.
  function lottieStage(el, opts = {}) {
    const lib = window.lottie;
    if (!lib) throw new Error("lottie-web is not on the page — run motion_scaffold again");
    const holder = document.createElement("div");
    holder.className = "lottie-stage";
    holder.style.cssText = `position:absolute;left:${opts.x ?? 0}px;top:${opts.y ?? 0}px;width:${opts.width || STAGE.w}px;height:${opts.height || STAGE.h}px;pointer-events:none;`;
    el.appendChild(holder);
    const anim = lib.loadAnimation({
      container: holder, renderer: opts.renderer || "svg", loop: false, autoplay: false,
      path: opts.data ? undefined : opts.src, animationData: opts.data,
      rendererSettings: { preserveAspectRatio: opts.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet", progressiveLoad: false },
    });
    ready(new Promise((resolve) => {
      anim.addEventListener("DOMLoaded", resolve);
      anim.addEventListener("data_failed", () => { console.warn("[lottie] failed to load", opts.src); resolve(); });
    }));
    const drive = (tl, { at = 0, dur = 1, from = 0, to = null, speed = 1, loop = true, ease = "none" } = {}) => {
      const st = { t: 0 };
      tl.to(st, {
        t: 1, duration: dur, ease,
        onUpdate: () => {
          const total = anim.totalFrames || 1;
          const end = to ?? (from + (anim.frameRate || 30) * dur * speed);
          let f = from + (end - from) * st.t;
          f = loop && total > 1 ? ((f % total) + total) % total : Math.min(total - 1, Math.max(0, f));
          anim.goToAndStop(f, true);
        },
      }, at);
    };
    return { anim, holder, drive };
  }

  // A Rive file on a canvas, scrubbed from the timeline: drive(tl, { at, dur,
  // from, speed, animation }) sets the named animation's time as a function of
  // the shot's time. Load with motion_scaffold({ rive: true }).
  function riveStage(el, opts = {}) {
    const lib = window.rive;
    if (!lib) throw new Error("the Rive runtime is not on the page — motion_scaffold({ rive: true })");
    const width = opts.width || STAGE.w;
    const height = opts.height || STAGE.h;
    const dpr = opts.pixelRatio || window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.className = "rive-stage";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.cssText = `position:absolute;left:${opts.x ?? 0}px;top:${opts.y ?? 0}px;width:${width}px;height:${height}px;pointer-events:none;`;
    el.appendChild(canvas);
    const fits = { contain: "Contain", cover: "Cover", fill: "Fill", fitWidth: "FitWidth", fitHeight: "FitHeight", none: "None" };
    let done;
    ready(new Promise((resolve) => { done = resolve; }));
    let loaded = false;
    const r = new lib.Rive({
      src: opts.src, canvas, autoplay: false, artboard: opts.artboard, animations: opts.animation,
      layout: new lib.Layout({ fit: lib.Fit[fits[opts.fit || "contain"] || "Contain"], alignment: lib.Alignment.Center }),
      onLoad: () => { loaded = true; done(); },
      onLoadError: (e) => { console.warn("[rive] failed to load", opts.src, e); done(); },
    });
    const drive = (tl, { at = 0, dur = 1, from = 0, speed = 1, animation = opts.animation } = {}) => {
      const st = { t: 0 };
      tl.to(st, { t: 1, duration: dur, ease: "none", onUpdate: () => { if (loaded) r.scrub(animation, from + st.t * dur * speed); } }, at);
    };
    return { rive: r, canvas, drive };
  }

  /* ---------- lottie / rive shot types ---------- */
  // A vector animation file — harvested from the site or supplied by the user
  // (a mascot, a product animation, an icon set) — as a shot of its own, in
  // the film's palette, with an optional caption.
  const stages = new WeakMap();
  function vectorBox(shot) {
    const hgt = shot.height || 720;
    const w = shot.width || hgt;
    return { w, h: hgt, x: shot.x ?? (STAGE.w - w) / 2, y: shot.y ?? (STAGE.h - hgt) / 2 };
  }
  function captionMount(el, shot) {
    if (!shot.caption) return;
    const cap = h(`<div class="ui-caption ${shot.captionPos === "top" ? "top" : shot.captionPos === "center" ? "center" : "bottom"} type-center"></div>`);
    mixedLine(cap, shot.caption);
    el.appendChild(cap);
  }
  function captionIn(tl, el) {
    const cap = el.querySelector(".ui-caption");
    if (cap) tl.from(cap.querySelectorAll(".char"), { yPercent: 140, duration: 0.45, ease: EASE.slam, stagger: 0.01 }, 0.12);
  }
  function vectorEnter(tl, node, shot) {
    const enter = shot.enter || "rise";
    if (enter === "rise") tl.from(node, { y: 60, opacity: 0, duration: 0.5, ease: EASE.land }, 0);
    else if (enter === "scale") tl.from(node, { scale: 0.85, opacity: 0, duration: 0.5, ease: EASE.slam, transformOrigin: "50% 50%" }, 0);
  }
  function lottieMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const b = vectorBox(shot);
    stages.set(el, lottieStage(el, { src: shot.src, x: b.x, y: b.y, width: b.w, height: b.h, fit: shot.fit, renderer: shot.renderer }));
    captionMount(el, shot);
  }
  function lottieAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const st = stages.get(el);
    vectorEnter(tl, st.holder, shot);
    st.drive(tl, { at: 0, dur: D, from: shot.from ?? 0, to: shot.to ?? null, speed: shot.speed ?? 1, loop: shot.loop !== false });
    captionIn(tl, el);
    return tl;
  }
  function riveMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const b = vectorBox(shot);
    stages.set(el, riveStage(el, { src: shot.src, x: b.x, y: b.y, width: b.w, height: b.h, fit: shot.fit, artboard: shot.artboard, animation: shot.animation }));
    captionMount(el, shot);
  }
  function riveAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const st = stages.get(el);
    vectorEnter(tl, st.canvas, shot);
    st.drive(tl, { at: 0, dur: D, from: shot.from ?? 0, speed: shot.speed ?? 1, animation: shot.animation });
    captionIn(tl, el);
    return tl;
  }

  /* ---------- device-3d ---------- */
  // The product's own screen on a real object — a slab, card, phone or
  // laptop with thickness, a rim light in the accent and a cast shadow —
  // turning on a three.js stage. Fields, not a custom factory: `device`,
  // `src`, `turn: { from: [x°, y°], to: [x°, y°] }`. World units are pixels,
  // so a 1180-wide slab is 1180px wide when it faces the camera.
  const DEVICES = {
    slab: { w: 1180, h: 740, t: 26, r: 22, bezel: 0 },
    card: { w: 900, h: 560, t: 10, r: 28, bezel: 0 },
    phone: { w: 400, h: 820, t: 22, r: 60, bezel: 16 },
    laptop: { w: 1240, h: 800, t: 14, r: 18, bezel: 22, base: true },
  };
  const cssColor = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback;
  function roundedSlab(THREE, w, h, t, r, material) {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x + w, y + h - r); shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x + r, y + h); shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + r); shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 3, curveSegments: 12 });
    geo.translate(0, 0, -t / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  function device3dMount(el, shot) {
    el.dataset.bg = shot.bg || "ink";
    const spec = DEVICES[shot.device];
    if (!spec) throw new Error(`device-3d: \`device\` must be one of ${Object.keys(DEVICES).join(", ")} (shot ${shot.id})`);
    if (!shot.src && !(shot.ring && Array.isArray(shot.ring.srcs) && shot.ring.srcs.length)) throw new Error(`device-3d: \`src\` (a harvested screenshot for the screen) or \`ring.srcs\` is required (shot ${shot.id})`);
    const st = three(el, { shadows: true, fov: shot.fov || 30 });
    const { THREE, scene } = st;
    const accent = new THREE.Color(cssColor("--accent", "#65A8EF"));
    const body = new THREE.Color(shot.color || cssColor("--ink", "#111111"));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, shot.light ?? 2.2);
    key.position.set(700, 900, 1400);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -1800, right: 1800, top: 1400, bottom: -1400, near: 100, far: 6000 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 1.4);
    rim.position.set(-900, 250, -700);
    scene.add(rim);

    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: body, metalness: 0.55, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const sw = spec.w - spec.bezel * 2;
    const sh = spec.h - spec.bezel * 2;
    const align = shot.align || "top";
    // A screen: the slab with a cover-fit texture of `src` on its front.
    const makeLid = (src) => {
      const slab = roundedSlab(THREE, spec.w, spec.h, spec.t, spec.r, bodyMat);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      screenMat.map = st.texture(src, (tex) => {
        // object-fit: cover on the screen plane, from the image's real size.
        const ia = tex.image.width / tex.image.height;
        const sa = sw / sh;
        tex.repeat.set(1, 1); tex.offset.set(0, 0);
        if (ia > sa) { tex.repeat.x = sa / ia; tex.offset.x = (1 - tex.repeat.x) / 2; }
        else { tex.repeat.y = ia / sa; tex.offset.y = align === "top" ? 1 - tex.repeat.y : (1 - tex.repeat.y) / 2; }
        tex.needsUpdate = true;
        screenMat.needsUpdate = true;
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
      screen.position.z = spec.t / 2 + 2.5;
      const lid = new THREE.Group();
      lid.add(slab, screen);
      return lid;
    };
    const ring = shot.ring;
    if (ring && Array.isArray(ring.srcs) && ring.srcs.length) {
      // Several screens on a ring around the view axis, seen from inside:
      // each lies tangent to the circle and leans in toward the camera. The
      // group's spin is the orbit; `turn` still tilts the whole ring.
      const n = ring.srcs.length;
      const R = ring.radius || 760;
      const z = ring.z ?? -250;
      const lean = ring.lean ?? 0.55;
      ring.srcs.forEach((src, i) => {
        const a = (i / n) * Math.PI * 2 + (ring.offset || 0) * Math.PI / 180;
        const lid = makeLid(src);
        lid.position.set(R * Math.cos(a), R * Math.sin(a), z);
        // Face a point in front of the ring's centre, then lie along the ring.
        lid.lookAt(new THREE.Vector3(R * Math.cos(a) * (1 - lean), R * Math.sin(a) * (1 - lean), z + 1400));
        lid.rotateZ(a + Math.PI / 2);
        inner.add(lid);
      });
      inner.userData.ring = true;
    } else {
      inner.add(makeLid(shot.src));
    }
    const lid = inner.children[0];
    let floorY = -spec.h / 2 - 70;
    if (spec.base && !inner.userData.ring) {
      // A laptop: the lid stands on a base and leans back a little.
      const depth = spec.h * 0.72;
      const base = roundedSlab(THREE, spec.w, depth, spec.t, spec.r, bodyMat);
      base.rotation.x = -Math.PI / 2;
      base.position.set(0, -spec.h / 2 - spec.t / 2, depth / 2);
      lid.position.y = 0;
      lid.rotation.x = -0.18;
      inner.add(base);
      floorY = -spec.h / 2 - spec.t - 2;
    }
    if (!inner.userData.ring) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.ShadowMaterial({ opacity: shot.shadow ?? 0.42 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY;
      floor.receiveShadow = true;
      scene.add(floor);
    }
    scene.add(group);
    stages.set(el, { group, inner });
    captionMount(el, shot);
  }
  function device3dAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const { group, inner } = stages.get(el);
    const rad = (d) => (d * Math.PI) / 180;
    const turn = shot.turn || {};
    if (inner.userData.ring) {
      // The ring orbits (spin, degrees from → to) and leans by `turn`; it
      // arrives from far down the axis.
      const spin = shot.ring.spin || [-14, 14];
      const from = turn.from || [4, -6];
      const to = turn.to || [-3, 5];
      tl.fromTo(inner.rotation, { z: rad(spin[0]) }, { z: rad(spin[1]), duration: D, ease: shot.ring.ease || "none" }, 0);
      tl.fromTo(group.rotation, { x: rad(from[0]), y: rad(from[1]) }, { x: rad(to[0]), y: rad(to[1]), duration: D, ease: turn.ease || "sine.inOut" }, 0);
      if (shot.enter !== "none") tl.fromTo(group.position, { z: -2600 }, { z: 0, duration: Math.min(D * 0.5, 1.2), ease: "power3.out" }, 0);
      if (shot.exit3d === "through") tl.to(group.position, { z: 1800, duration: Math.min(0.6, D * 0.25), ease: "power3.in" }, D - Math.min(0.6, D * 0.25));
      captionIn(tl, el);
      return tl;
    }
    if (!shot.turn) console.warn("[device-3d] no `turn` on", shot.id, "— decide the angles; the fallback is a house move");
    const from = turn.from || [8, -55];
    const to = turn.to || [2, 18];
    tl.fromTo(group.rotation, { x: rad(from[0]), y: rad(from[1]) }, { x: rad(to[0]), y: rad(to[1]), duration: D, ease: turn.ease || "power2.inOut" }, 0);
    const oy = shot.offsetY || 0;
    if (shot.enter !== "none") {
      tl.fromTo(group.position, { z: -1000, y: oy - 120 }, { z: 0, y: oy, duration: Math.min(D * 0.6, 1.4), ease: "power3.out" }, 0);
    } else if (oy) tl.set(group.position, { y: oy }, 0);
    if (shot.hover !== false) tl.fromTo(inner.position, { y: -8 }, { y: 8, duration: D, ease: "sine.inOut" }, 0);
    captionIn(tl, el);
    return tl;
  }

  /* ---------- line ---------- */
  // The sentence as protagonist. A line of words that changes over the shot
  // in steps: a word ADDS (present in one frame, the line re-centres and
  // settles), the line is REPLACED (out: shrink + blur; in: from 1.5× and
  // blurred), one word is KEPT (the others blur out in place and it slides
  // to the centre), a word ROTATES through alternatives (instant swaps with
  // shrinking holds), the line TYPES itself (a caret, chars per second, the
  // noun taking its tone as it is typed) and finally goes OUT (blur | left |
  // right | fade | shrink). Parts carry a tone — ink | accent | muted |
  // gradient — never a weight change; a `slot` part reserves room for an
  // actor to sit between the words.
  //
  // { type: "line", size: 96, align?: "center"|"left", x?, y?, weight?,
  //   container?: "glass"|"pill", typing?: { cps: 22, caret: true },
  //   steps: [ { at, add: parts } | { at, replace: parts } | { at, keep: "style" | index }
  //          | { at, out: "blur"|"left"|"right"|"fade"|"shrink" } ] }
  // part: { text, tone?, weight?, rotate?: [alts], every?: seconds | [seconds…], slot?: name, w? }
  function lineWord(p, typing) {
    if (p.slot) {
      const s = document.createElement("span");
      s.className = `lw slot slot-${p.slot}`;
      s.style.width = (p.w || 300) + "px";
      s.style.height = "0.9em";
      return s;
    }
    const w = document.createElement("span");
    w.className = "lw";
    w.dataset.tone = p.tone || "ink";
    if (p.weight) w.style.fontWeight = String(p.weight);
    const text = String(p.text ?? "");
    if (typing) {
      [...text].forEach((ch) => {
        const c = document.createElement("span");
        c.className = "ch pending";
        c.textContent = ch === " " ? " " : ch;
        w.appendChild(c);
      });
    } else w.textContent = text;
    if (Array.isArray(p.rotate)) { w.dataset.rotate = JSON.stringify(p.rotate); w.dataset.every = JSON.stringify(p.every ?? 0.5); }
    return w;
  }
  function lineMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const box = h(`<div class="line-box ${shot.align === "left" ? "left" : ""} ${shot.container ? `${shot.container} mat-${shot.container}` : ""}"></div>`);
    box.style.fontSize = (shot.size || 96) + "px";
    if (shot.weight) box.style.fontWeight = String(shot.weight);
    if (shot.x != null) box.style.left = shot.x + "px";
    if (shot.y != null) box.style.top = shot.y + "px";
    if (shot.color) box.style.color = shot.color;
    const typing = !!shot.typing;
    const steps = shot.steps || [{ at: 0, add: shot.parts || [{ text: shot.text || "" }] }];
    const meta = [];
    steps.forEach((st, k) => {
      const parts = st.add || st.replace;
      const words = [];
      if (Array.isArray(parts)) {
        const spacer = () => {
          const sp = document.createElement("span");
          sp.className = "lw lsp";
          sp.dataset.step = String(k);
          sp.style.display = "none";
          sp.textContent = " ";
          box.appendChild(sp);
          words.push(sp);
        };
        parts.forEach((p, j) => {
          // A space before every word except the first of the line; an added
          // step continues the line, so its first word gets one too — unless
          // the copy already carries the space at a part's edge.
          const prev = j > 0 ? parts[j - 1] : null;
          const edgeSpace = (prev && /\s$/.test(String(prev.text ?? ""))) || /^\s/.test(String(p.text ?? ""));
          if ((j > 0 || (st.add && k > 0)) && !edgeSpace) spacer();
          const w = lineWord(p, typing && !p.slot);
          w.dataset.step = String(k);
          w.style.display = "none";
          box.appendChild(w);
          words.push(w);
        });
      }
      meta.push({ ...st, words });
    });
    if (typing) {
      const caret = h(`<span class="line-caret" style="display:none"></span>`);
      box.appendChild(caret);
    }
    box.__steps = meta;
    el.appendChild(box);
    gsap.set(box, { xPercent: shot.align === "left" ? 0 : -50, yPercent: -50 });
  }
  function lineAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const box = qs(el, ".line-box");
    const steps = box.__steps || [];
    const typing = shot.typing || null;
    const cps = typing ? (typing.cps || 22) : 0;
    const caret = box.querySelector(".line-caret");
    let visible = [];
    let typeEnd = 0;
    const widthOf = (els) => els.reduce((a, w) => a + w.offsetWidth, 0);
    const typeWords = (words, t0) => {
      // Chars appear one by one; the caret sits after the last visible char.
      let t = t0;
      words.forEach((w) => {
        tl.set(w, { display: "inline-block" }, t);
        const chars = w.querySelectorAll(".ch");
        chars.forEach((c) => { tl.set(c, { className: "ch" }, t); t += 1 / cps; });
        if (!chars.length) t += 0.5 / cps;
      });
      if (caret) { tl.set(caret, { display: "inline-block", opacity: 1 }, t0); }
      typeEnd = Math.max(typeEnd, t);
      // A hero line that would outgrow the frame scales down as it is typed
      // (the reference lands its sentence at reading size while still typing):
      // typing.shrink = the scale it settles at, typing.fit = the width that
      // triggers it (1560px), estimated from the character count.
      if (typing.shrink !== false) {
        const size = shot.size || 96;
        const chars = words.reduce((a, w) => a + (w.textContent || "").length, 0);
        const est = chars * size * 0.52;
        const fit = typing.fit || 1560;
        if (est > fit) {
          const atChar = Math.floor((fit / est) * chars);
          const when = t0 + atChar / cps;
          const to = typing.shrink || Math.max(0.3, fit / est);
          tl.to(box, { scale: to, duration: 0.45, ease: "power3.inOut", transformOrigin: "50% 50%" }, when);
        }
      }
      return t;
    };
    steps.forEach((st) => {
      const t = Math.min(Math.max(0, st.at ?? 0), D - 0.05);
      if (st.add) {
        const real = st.words.filter((w) => !w.classList.contains("lsp"));
        if (typing) { typeWords(st.words.filter((w) => !w.classList.contains("slot")), t); tl.set(st.words.filter((w) => w.classList.contains("slot")), { display: "inline-block" }, t); }
        else {
          tl.set(st.words, { display: "inline-block" }, t);
          // The new words are there in one frame; the line settles onto its
          // new centre from where the old words were, a touch oversize.
          tl.fromTo(box, { x: () => widthOf(st.words) / 2 }, { x: 0, duration: 0.4, ease: "expo.out" }, t);
          tl.fromTo(real, { scale: 1.08, y: 8, transformOrigin: "50% 80%" }, { scale: 1, y: 0, duration: 0.4, ease: "expo.out" }, t);
        }
        visible = visible.concat(st.words);
      } else if (st.replace) {
        const old = visible.filter((w) => !w.classList.contains("lsp"));
        if (old.length) {
          tl.to(old, { scale: 0.9, filter: "blur(12px)", opacity: 0, duration: 0.17, ease: "power3.in", transformOrigin: "50% 50%" }, t);
          tl.set(visible, { display: "none" }, t + 0.17);
        }
        const real = st.words.filter((w) => !w.classList.contains("lsp"));
        if (typing) typeWords(st.words, t + 0.1);
        else {
          tl.set(st.words, { display: "inline-block" }, t + 0.1);
          tl.set(box, { x: 0 }, t + 0.1);
          tl.fromTo(real, { scale: 1.5, filter: "blur(20px)", opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.27, ease: "expo.out" }, t + 0.1);
        }
        visible = st.words.slice();
      } else if (st.keep != null) {
        const real = visible.filter((w) => !w.classList.contains("lsp") && !w.classList.contains("slot"));
        const kept = typeof st.keep === "number" ? real[st.keep]
          : real.find((w) => w.textContent.replace(/ /g, " ").trim().toLowerCase() === String(st.keep).trim().toLowerCase());
        if (!kept) { console.warn("[line] keep found no word", st.keep, "in", shot.id); return; }
        const others = visible.filter((w) => w !== kept);
        tl.to(others, { opacity: 0, filter: "blur(6px)", duration: 0.3, ease: "power2.in", stagger: 0.05 }, t);
        if (caret) tl.set(caret, { display: "none" }, t);
        tl.to(box, {
          x: () => { const k = kept.getBoundingClientRect(); const b = box.getBoundingClientRect(); return -(k.left + k.width / 2 - (b.left + b.width / 2)); },
          duration: 0.5, ease: "power3.inOut",
        }, t + 0.2);
        visible = [kept];
      } else if (st.out) {
        const o = st.out === true ? "blur" : st.out;
        if (o === "blur") tl.to(box, { y: "-=70", opacity: 0, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }, t);
        else if (o === "left" || o === "right") tl.to(box, { x: o === "left" ? -1600 : 1600, duration: 0.5, ease: "power3.in" }, t);
        else if (o === "fade") tl.to(box, { opacity: 0, duration: 0.3 }, t);
        else if (o === "shrink") tl.to(box, { scale: 0.3, opacity: 0, filter: "blur(8px)", duration: 0.25, ease: "power3.in" }, t);
      }
    });
    // Rotating words: instant swaps, holds shrinking toward the exit.
    box.querySelectorAll(".lw[data-rotate]").forEach((w) => {
      const alts = JSON.parse(w.dataset.rotate);
      const every = JSON.parse(w.dataset.every);
      const step = steps.find((s) => s.words.includes(w));
      let t = (step ? (step.at ?? 0) : 0) + (Array.isArray(every) ? every[0] : every);
      alts.forEach((alt, i) => {
        tl.set(w, { text: { value: alt } }, Math.min(t, D - 0.05));
        t += Array.isArray(every) ? (every[i + 1] ?? every[every.length - 1]) : every;
      });
    });
    if (caret && typing && typing.caret !== false && typeEnd < D) {
      const n = Math.max(0, Math.floor((D - typeEnd) / 0.9));
      if (n > 0) tl.fromTo(caret, { opacity: 1 }, { opacity: 0.05, duration: 0.45, ease: "steps(1)", repeat: n * 2 - 1, yoyo: true }, typeEnd + 0.2);
    }
    return tl;
  }

  /* ---------- cascade ---------- */
  // Items land one after another at one anchor and push the earlier ones
  // away — up (comments, rows) or left (a strip of cards) — while the earlier
  // ones fall out of focus. { items: [{ src | html, w, h }], every, dir: "up"|"left",
  //   gap, x, y, start, dof: true, enter: "rise"|"fade" }
  function cascadeMount(el, shot) {
    el.dataset.bg = shot.bg || "bg";
    const field = h(`<div class="cascade"></div>`);
    (shot.items || []).forEach((it, i) => {
      const node = h(`<div class="cascade-item" data-i="${i}"></div>`);
      const w = it.w || shot.w || 560, hgt = it.h || shot.h || 340;
      node.style.width = w + "px";
      node.style.height = hgt + "px";
      if (it.r != null) node.style.borderRadius = it.r + "px";
      if (it.src) node.appendChild(h(`<img src="${it.src}" alt="" draggable="false">`));
      else node.appendChild(h(`<div class="ci-html">${it.html || ""}</div>`));
      field.appendChild(node);
    });
    el.appendChild(field);
    if (shot.caption) captionMount(el, shot);
  }
  function cascadeAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const items = [...el.querySelectorAll(".cascade-item")];
    const n = items.length;
    const every = shot.every ?? Math.min(0.5, Math.max(0.12, (D * 0.6) / Math.max(1, n)));
    const dir = shot.dir || "up";
    const gap = shot.gap ?? 24;
    const ax = shot.x ?? 960, ay = shot.y ?? (dir === "up" ? 640 : 540);
    const dof = shot.dof !== false;
    items.forEach((it, k) => {
      const w = parseFloat(it.style.width), hgt = parseFloat(it.style.height);
      gsap.set(it, { left: ax - w / 2, top: ay - hgt / 2, opacity: 0 });
    });
    items.forEach((it, k) => {
      const t = (shot.start ?? 0.1) + k * every;
      const hgt = parseFloat(it.style.height), w = parseFloat(it.style.width);
      // Earlier items step away and defocus by their distance from the newest.
      for (let j = 0; j < k; j++) {
        const d = k - j;
        const move = dir === "up" ? { y: "-=" + (hgt + gap) } : dir === "left" ? { x: "-=" + (w + gap) } : { x: "+=" + (w + gap) };
        tl.to(items[j], { ...move, duration: 0.4, ease: "power3.inOut" }, t);
        if (dof) tl.to(items[j], { filter: `blur(${Math.min(12, 2 * d)}px)`, opacity: Math.max(0.2, 1 - 0.22 * d), scale: 1 - Math.min(0.12, 0.025 * d), duration: 0.4, ease: "power2.out", transformOrigin: "50% 50%" }, t);
      }
      const from = shot.enter === "fade" ? { opacity: 0, filter: "blur(8px)" } : dir === "up" ? { y: "+=90", opacity: 0, filter: "blur(8px)" } : { x: "+=" + (w * 0.6), opacity: 0, filter: "blur(8px)" };
      tl.fromTo(it, from, { x: dir === "up" ? 0 : undefined, y: dir === "up" ? undefined : 0, opacity: 1, filter: "blur(0px)", duration: 0.38, ease: "expo.out" }, t);
    });
    if (shot.scroll && n) {
      // After the last item, the whole set keeps travelling (a marquee).
      const last = (shot.start ?? 0.1) + (n - 1) * every + 0.4;
      const move = dir === "up" ? { y: "-=" + shot.scroll } : { x: "-=" + shot.scroll };
      tl.to(items, { ...move, duration: Math.max(0.3, D - last), ease: "none" }, last);
    }
    captionIn(tl, el);
    return tl;
  }

  /* ---------- footage: real video or stills on the film's clock ---------- */
  // Clips come from `pitch motion footage` (VP9 WebM, silent, cut to the range
  // used) or are stills. A <video> served without byte ranges cannot seek, so
  // every file is fetched once into a blob URL — seekable to the frame — and
  // __READY waits for its first decoded frame.
  //
  // What is SEEN is a canvas the decoded frame is drawn into, never the
  // <video> itself: Chrome does not reliably repaint a paused video that was
  // seeked as it became visible (the capture kept photographing its first
  // frame), while drawImage at `seeked` is exactly the requested frame. The
  // canvas takes the same object-fit, object-position, filter and flip.
  //
  // While the film PLAYS (studio preview) the visible videos play natively at
  // their rate, are only nudged when they drift, and are drawn every tick.
  // While it is PAUSED or SEEKED (scrubbing, capture, audit, review) each
  // visible video is seeked to its exact source time and drawn at `seeked`;
  // window.__SEEK returns a promise for those draws, which the capture awaits
  // before every frame.
  const LOOKS = {
    mono: "grayscale(1) contrast(1.08)",
    "mono-hard": "grayscale(1) contrast(1.4) brightness(0.92)",
    warm: "sepia(0.22) saturate(1.12) contrast(1.04)",
    cool: "saturate(0.85) hue-rotate(-10deg) brightness(0.97) contrast(1.06)",
    faded: "contrast(0.88) saturate(0.78) brightness(1.06)",
    night: "brightness(0.72) contrast(1.18) saturate(0.9)",
    vivid: "saturate(1.35) contrast(1.08)",
  };
  window.__MEDIA_ISSUES = window.__MEDIA_ISSUES || [];
  const mediaIssue = (msg) => { window.__MEDIA_ISSUES.push(msg); console.warn("[media] " + msg); };
  function lookFilter(look) {
    if (!look || look === "none") return "";
    if (LOOKS[look]) return LOOKS[look];
    if (/\(/.test(look)) return look;
    mediaIssue(`unknown look "${look}" — use ${Object.keys(LOOKS).join(", ")} or a CSS filter string`);
    return "";
  }
  const isVideoSrc = (src) => /\.(webm|mp4|mov|m4v|ogv)(?:[?#]|$)/i.test(src);
  const FOOTAGE = { videos: [], pending: [] };
  window.__FOOTAGE = FOOTAGE;
  function loadVideo(v, src) {
    return fetch(src)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((b) => new Promise((resolve) => {
        v.addEventListener("loadeddata", resolve, { once: true });
        v.addEventListener("error", () => { mediaIssue(`${src} cannot be decoded here (${v.error ? v.error.message || v.error.code : "unknown"}) — prepare it with pitch motion footage`); resolve(); }, { once: true });
        v.src = URL.createObjectURL(b);
      }))
      .catch((e) => mediaIssue(`${src} failed to load (${e.message || e})`));
  }
  function drawFrame(e) {
    const v = e.v, c = e.canvas;
    if (!v.videoWidth || v.readyState < 2) return;
    if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
    e.ctx.drawImage(v, 0, 0, c.width, c.height);
    e.drawn = v.currentTime;
  }
  function seekVideo(e, t) {
    const v = e.v;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); drawFrame(e); resolve(); } };
      const timer = setTimeout(finish, 4000);
      v.addEventListener("seeked", finish, { once: true });
      v.currentTime = t;
    });
  }
  // Called by the compiler after every master render with whether it plays.
  FOOTAGE.sync = function (playing) {
    for (const e of FOOTAGE.videos) {
      const v = e.v;
      if (!v.src || v.readyState < 1) continue;
      const shotEl = e.shotEl || (e.shotEl = e.wrap.closest(".shot"));
      const lt = e.st.t;
      const on = !!shotEl && shotEl.style.opacity !== "0" && e.wrap.style.visibility !== "hidden"
        && lt >= e.start - 1e-4 && lt <= e.end + 1e-4;
      if (!on) { if (!v.paused) v.pause(); continue; }
      const len = v.duration || 0;
      // +1ms: a time that lands exactly on a frame boundary (4.1s × 30fps) must
      // show that frame, not the one float rounding leaves just before it.
      let target = e.in + Math.max(0, lt - e.start) * e.rate + 0.001;
      if (len) target = e.loop ? target % len : Math.min(target, Math.max(0, len - 0.04));
      if (playing) {
        if (v.playbackRate !== e.rate) v.playbackRate = e.rate;
        if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
        if (v.paused) v.play().catch(() => {});
        if (!v.seeking) drawFrame(e);
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.0005) FOOTAGE.pending.push(seekVideo(e, target));
        else if (e.drawn !== v.currentTime && !v.seeking) drawFrame(e);
      }
    }
    if (FOOTAGE.pending.length > 64) FOOTAGE.pending.splice(0, FOOTAGE.pending.length - 64);
  };
  // What __SEEK returns: the decode of every frame the last sync asked for.
  FOOTAGE.settle = function () {
    const p = FOOTAGE.pending.splice(0);
    return p.length ? Promise.all(p).then(() => undefined) : null;
  };

  // window: 0.8 (width, a fraction of the stage) or { w, h, x, y, radius,
  // border, borderWidth, glow, glowColor, from, at, dur }. h defaults to a
  // 4:5 frame; x/y centre it (fractions); `from: 1` grows out of full-bleed.
  function footageWindow(shot) {
    const v = shot.window;
    if (!v) return null;
    const o = typeof v === "number" ? { w: v } : v;
    const w = Math.round(STAGE.w * Math.min(1, Math.max(0.2, Number(o.w) || 0.8)));
    const hgt = Math.round(o.h ? STAGE.h * Math.min(1, Number(o.h)) : Math.min(STAGE.h * 0.9, w * 1.25));
    const cx = STAGE.w * (o.x ?? 0.5), cy = STAGE.h * (o.y ?? 0.5);
    return {
      w, h: hgt, x: Math.round(cx - w / 2), y: Math.round(cy - hgt / 2),
      radius: o.radius ?? Math.round(Math.min(w, hgt) * 0.07),
      border: o.border || null, borderWidth: o.borderWidth ?? 10,
      glow: o.glow === true ? 80 : Number(o.glow) || 0, glowColor: o.glowColor || "rgba(255,255,255,0.28)",
      from: o.from != null ? Number(o.from) : null, at: Number(o.at) || 0, dur: Number(o.dur) || 0.35,
    };
  }
  function footageClips(shot) {
    const list = Array.isArray(shot.clips) && shot.clips.length ? shot.clips : [{ src: shot.src }];
    return list.map((c) => (typeof c === "string" ? { src: c } : c || {})).filter((c) => {
      if (typeof c.src === "string" && c.src) return true;
      mediaIssue(`#${shot.id}: a footage clip has no src`);
      return false;
    });
  }
  // [from, to] scale for the slow push (a number is the end scale from 1).
  const pushPair = (p) => (Array.isArray(p) ? [Number(p[0]) || 1, Number(p[1]) || 1] : p ? [1, Number(p)] : null);
  function footageMount(el, shot) {
    el.dataset.bg = shot.bg || "#000";
    const box = h(`<div class="footage"></div>`);
    footageClips(shot).forEach((c, i) => {
      const focus = c.focus || shot.focus || [0.5, 0.5];
      const wrap = h(`<div class="ft-clip" data-clip="${i}"></div>`);
      let media;
      if (isVideoSrc(c.src)) {
        // The decoder stays in the clip (browsers throttle detached or
        // offscreen video) but is covered by the canvas that shows its frames.
        const v = document.createElement("video");
        v.className = "ft-decoder";
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.__loaded = loadVideo(v, c.src);
        ready(v.__loaded);
        wrap.appendChild(v);
        media = document.createElement("canvas");
        media.width = 16;
        media.height = 16;
      } else {
        media = document.createElement("img");
        media.alt = "";
        media.draggable = false;
        media.decoding = "sync";
        // `error` is the only evidence of a missing still; decode() can reject
        // for a load that then succeeds, so it is only awaited, never trusted.
        const img = media;
        ready(new Promise((resolve) => {
          img.addEventListener("load", () => img.decode().catch(() => {}).then(resolve), { once: true });
          img.addEventListener("error", () => { mediaIssue(`${c.src} failed to load`); resolve(); }, { once: true });
        }));
        media.src = c.src;
      }
      media.className = "ft-media";
      media.dataset.src = c.src;
      media.style.objectFit = c.fit || shot.fit || "cover";
      media.style.objectPosition = `${(focus[0] ?? 0.5) * 100}% ${(focus[1] ?? 0.5) * 100}%`;
      const filter = lookFilter(c.look ?? shot.look);
      if (filter) media.style.filter = filter;
      if (c.flip ?? shot.flip) media.style.transform = "scaleX(-1)";
      wrap.appendChild(media);
      box.appendChild(wrap);
    });
    const shade = Number(shot.shade) || 0;
    if (shade > 0) box.appendChild(h(`<div class="ft-shade" style="opacity:${Math.min(1, shade)}"></div>`));
    // A window: the footage in a rounded frame on the shot's ground, the way
    // every reference ad sets UGC, screenshots and archive — optionally
    // shrinking into place from full-bleed at `window.from`.
    const win = footageWindow(shot);
    if (win) {
      box.classList.add("ft-window");
      box.style.borderRadius = `${win.radius}px`;
      if (win.border) box.style.boxShadow = `0 0 0 ${win.borderWidth}px ${win.border}${win.glow ? `, 0 0 ${win.glow}px ${win.glowColor}` : ""}`;
      else if (win.glow) box.style.boxShadow = `0 0 ${win.glow}px ${win.glowColor}`;
      Object.assign(box.style, { left: `${win.x}px`, top: `${win.y}px`, width: `${win.w}px`, height: `${win.h}px`, right: "auto", bottom: "auto" });
    }
    if (shot.flash) {
      const flash = h(`<div class="ft-flash"></div>`);
      flash.style.background = shot.flash === true ? "#fff" : shot.flash;
      box.appendChild(flash);
    }
    el.appendChild(box);
  }
  function footageAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const clips = footageClips(shot);
    const wraps = qsa(el, ".ft-clip");
    const n = wraps.length;
    if (!n) return tl;
    // A montage is hard cuts inside one shot: each clip lasts its `dur`, else
    // `every`, else an equal share; the last one holds to the end of the shot.
    const every = Number(shot.every) > 0 ? Number(shot.every) : D / n;
    const spans = [];
    let clock = 0;
    clips.forEach((c, i) => {
      const len = Number(c.dur) > 0 ? Number(c.dur) : every;
      const end = i === n - 1 && shot.hold !== false ? D : Math.min(D, clock + len);
      spans.push({ start: Math.min(clock, D), end });
      clock += len;
    });
    if (clock > D + 0.02 && n > 1) mediaIssue(`#${shot.id}: its clips need ${clock.toFixed(2)}s but the shot lasts ${D}s — the last ones never show`);
    const flash = el.querySelector(".ft-flash");
    const st = { t: 0 };
    const apply = () => {
      const lt = st.t;
      wraps.forEach((w, i) => {
        const on = lt >= spans[i].start - 1e-6 && (lt < spans[i].end || (i === n - 1 && lt <= D + 1e-6));
        w.style.visibility = on ? "inherit" : "hidden";
      });
      if (flash) flash.style.opacity = spans.some((s, i) => i > 0 && lt >= s.start && lt < s.start + 0.04) ? "1" : "0";
    };
    apply();
    tl.to(st, { t: D, duration: D, ease: "none", onUpdate: apply }, 0);
    const win = footageWindow(shot);
    if (win && win.from != null) {
      // Out of full-bleed into the frame: position, size and corners together.
      const box = qs(el, ".footage");
      tl.fromTo(box, { left: 0, top: 0, width: STAGE.w, height: STAGE.h, borderRadius: 0 },
        { left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: win.radius, duration: win.dur, ease: "expo.inOut" }, win.at);
    }
    clips.forEach((c, i) => {
      const push = pushPair(c.push ?? shot.push);
      const span = spans[i];
      if (push && span.end > span.start) {
        tl.fromTo(wraps[i], { scale: push[0] }, { scale: push[1], duration: span.end - span.start, ease: "none", transformOrigin: "50% 50%" }, span.start);
      }
      // scroll: [from, to] — the kept frame travels down a tall image (a
      // landing page, a wall of reviews, an article), as fractions of it.
      const scroll = c.scroll ?? shot.scroll;
      if (Array.isArray(scroll) && span.end > span.start) {
        const media = wraps[i].querySelector(".ft-media");
        const fx = ((c.focus || shot.focus || [0.5])[0] ?? 0.5) * 100;
        tl.fromTo(media, { objectPosition: `${fx}% ${(Number(scroll[0]) || 0) * 100}%` },
          { objectPosition: `${fx}% ${(Number(scroll[1]) || 0) * 100}%`, duration: span.end - span.start, ease: c.scrollEase || shot.scrollEase || "power1.inOut" }, span.start);
      }
      const v = wraps[i].querySelector("video");
      if (v) {
        const rate = Number(c.rate ?? shot.rate) || 1;
        const canvas = wraps[i].querySelector("canvas.ft-media");
        const entry = { v, canvas, ctx: canvas.getContext("2d"), drawn: null, wrap: wraps[i], st, start: span.start, end: span.end, in: Number(c.in ?? shot.in) || 0, rate, loop: !!(c.loop ?? shot.loop), shotEl: null };
        FOOTAGE.videos.push(entry);
        // Cue every clip on its first frame before the film is ready, so the
        // preview never shows a blank canvas while a clip seeks as it appears.
        ready(Promise.resolve(v.__loaded).then(() => (v.readyState >= 1 ? seekVideo(entry, entry.in + 0.001) : null)));
      }
    });
    return tl;
  }

  /* ---------- evidence: a real source, quoted and highlighted ---------- */
  // The page of an article, study, review or spec sheet — the source's own
  // words, never invented — with the claim highlighted while the camera
  // pushes in on it. The page is wider than the frame on purpose: it reads as
  // a document someone is looking at, not a slide.
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function evidenceMount(el, shot) {
    el.dataset.bg = shot.paper || shot.bg || "#FBFAF7";
    const serif = '"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif';
    const size = shot.size || Math.round(Math.min(STAGE.w, STAGE.h) * 0.05);
    const width = shot.width || Math.round(STAGE.w * 1.3);
    const page = h(`<div class="ev-page"></div>`);
    page.style.cssText = `width:${width}px;font-size:${size}px;color:${shot.ink || "#1B1B1B"};font-family:${shot.font === "sans" ? "var(--font)" : shot.font || serif};`;
    if (shot.title) page.appendChild(h(`<h3 class="ev-title">${escapeHtml(shot.title)}</h3>`));
    const paragraphs = Array.isArray(shot.paragraphs) ? shot.paragraphs : shot.text ? [shot.text] : [];
    if (!paragraphs.length) mediaIssue(`#${shot.id}: evidence needs paragraphs — the source's own text`);
    let marked = !shot.highlight;
    paragraphs.forEach((text) => {
      let html = escapeHtml(text);
      if (!marked) {
        const needle = escapeHtml(shot.highlight);
        let at = html.indexOf(needle);
        if (at < 0) at = html.toLowerCase().indexOf(needle.toLowerCase());
        if (at >= 0) {
          html = `${html.slice(0, at)}<mark class="ev-mark ${shot.mark || "select"}">${html.slice(at, at + needle.length)}</mark>${html.slice(at + needle.length)}`;
          marked = true;
        }
      }
      page.appendChild(h(`<p class="ev-p">${html}</p>`));
    });
    if (!marked) mediaIssue(`#${shot.id}: highlight "${shot.highlight}" is not in the quoted text`);
    el.appendChild(page);
    if (shot.source) el.appendChild(h(`<div class="ev-source" style="font-size:${Math.round(Math.min(STAGE.w, STAGE.h) * 0.024)}px">${escapeHtml(shot.source)}</div>`));
  }
  function evidenceAnimate(el, shot, D) {
    const tl = gsap.timeline();
    const page = qs(el, ".ev-page");
    const mark = el.querySelector(".ev-mark");
    const push = pushPair(shot.push ?? 1.28) || [1, 1];
    // The claim lands at this point of the frame and the push scales about it.
    const fx = STAGE.w * (shot.focusX ?? 0.5);
    const fy = STAGE.h * (shot.focusY ?? 0.45);
    let anchor = null;
    const measure = () => {
      if (anchor) return anchor;
      if (mark) {
        let x = 0, y = 0;
        for (let n = mark; n && n !== page; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
        anchor = { x: x + mark.offsetWidth / 2, y: y + mark.offsetHeight / 2 };
      } else anchor = { x: page.offsetWidth / 2, y: page.offsetHeight / 3 };
      return anchor;
    };
    const scroll = Number(shot.scroll) || 0;
    tl.fromTo(page,
      { scale: push[0], x: () => fx - measure().x, y: () => fy - measure().y + scroll, transformOrigin: () => `${measure().x}px ${measure().y}px` },
      { scale: push[1], x: () => fx - measure().x, y: () => fy - measure().y, duration: D, ease: shot.ease || "power1.inOut" }, 0);
    if (mark) {
      const at = shot.markAt ?? Math.min(0.45, D * 0.3);
      const sweep = (shot.mark || "select") === "select" ? 0.001 : 0.4;
      tl.fromTo(mark, { "--ev-p": 0 }, { "--ev-p": 1, duration: sweep, ease: "power2.out" }, at);
    }
    return tl;
  }

  /* ---------- card: a plain ground for the caption track ---------- */
  // A black (or any colour) frame with nothing on it: the hook and the
  // objection of an ad, where the captions are the whole picture.
  function cardMount(el, shot) {
    el.dataset.bg = shot.bg || "#000";
    if (shot.gradient) el.appendChild(h(`<div class="card-ground" style="background:${shot.gradient}"></div>`));
  }
  function cardAnimate() { return gsap.timeline(); }

  // The pointer, or (`hand`) the big cartoon hand the reference films use at
  // hero scale; `tip` is where each one touches, as a fraction of its box.
  const POINTERS = {
    arrow: { tip: [8 / 48, 4 / 48], svg: `<svg viewBox="0 0 24 24" width="48" height="48"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>` },
    hand: { tip: [22 / 64, 9 / 64], svg: `<svg viewBox="0 0 64 64" width="64" height="64"><path d="M22 58c-6 0-9-4-11-9L5 34c-1-3 1-6 4-6 2 0 3 1 4 3l4 7V14c0-3 2-5 5-5s5 2 5 5v14h2V11c0-3 2-5 5-5s5 2 5 5v17h2V15c0-3 2-5 5-5s5 2 5 5v13h2v-7c0-3 2-5 5-5s5 2 5 5v20c0 10-7 17-17 17H22z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M27 32v10M34 32v10M41 32v10" stroke="#111" stroke-width="3" stroke-linecap="round"/></svg>` },
  };
  function pointer(hand) {
    return h(`<div class="ui-cursor ${hand ? "hand" : ""}"><div class="ui-ripple"></div>${POINTERS[hand ? "hand" : "arrow"].svg}</div>`);
  }
  /** The engine's cursor in a custom shot, appended to `parent`: `click` moves it. */
  function cursor(parent, { hand = false } = {}) {
    const node = pointer(hand);
    parent.appendChild(node);
    return node;
  }
  /**
   * `node` (a `cursor`) travels to `target` and clicks it at `at`, as the
   * ui-frame cursor does: in from `from` px off it (the first click; null
   * travels from where the last left it), press, ripple, release. Measures
   * the page, so call it before any start state on `target`. Returns the
   * press time, for the click's result.
   */
  function click(tl, node, target, at, { from = [180, 140], point = [0.5, 0.5] } = {}) {
    const to = aim(node, target, { at: point, tip: POINTERS[node.classList.contains("hand") ? "hand" : "arrow"].tip });
    if (from) {
      gsap.set(node, { x: to.x + from[0], y: to.y + from[1], opacity: 0 });
      tl.to(node, { opacity: 1, duration: 0.15 }, at);
    }
    tl.to(node, { x: to.x, duration: 0.7, ease: "power2.inOut" }, at);
    tl.to(node, { y: to.y, duration: 0.7, ease: "power3.out" }, at);
    tl.to(node, { scale: 0.82, duration: 0.09, ease: "power2.in" }, at + 0.82);
    tl.fromTo(node.querySelector(".ui-ripple"), { scale: 0, opacity: 1 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: "power2.out" }, at + 0.86);
    tl.to(node, { scale: 1, duration: 0.18, ease: "back.out(2)" }, at + 0.94);
    return at + 0.86;
  }

  /**
   * Where to move `mover` so its tip lands on `target`: the { x, y } to tween
   * it to. A cursor aimed by hand-typed numbers clicks beside its button; this
   * measures both from the laid-out page. Call it in animate() BEFORE setting
   * start states, or a start offset on the target is measured too. `at` is
   * the point on the target ([0.5, 0.5], its centre), `tip` the point of the
   * mover that touches it ([0, 0], a cursor arrow's top-left tip).
   */
  function aim(mover, target, { at = [0.5, 0.5], tip = [0, 0] } = {}) {
    const vp = document.getElementById("viewport");
    const k = vp ? vp.getBoundingClientRect().width / STAGE.w || 1 : 1;
    const m = mover.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    return {
      x: Number(gsap.getProperty(mover, "x")) + (t.left + t.width * at[0] - (m.left + m.width * tip[0])) / k,
      y: Number(gsap.getProperty(mover, "y")) + (t.top + t.height * at[1] - (m.top + m.height * tip[1])) / k,
    };
  }

  // ---- Layout work ----------------------------------------------------------
  // What needs the page laid out with its fonts and assets in runs once the
  // compiler is ready: `run(seek)` gets `seek(t)` in `tl`'s own time, so it
  // measures the page at the moments it animates.
  function afterLayout(tl, run) {
    (window.__LAYOUT_HOOKS = window.__LAYOUT_HOOKS || []).push({ tl, run });
  }
  // Client pixels → stage pixels (the studio may draw the stage scaled).
  function stageRect(el) {
    const vp = document.getElementById("viewport");
    const v = vp ? vp.getBoundingClientRect() : { left: 0, top: 0, width: STAGE.w };
    const k = v.width / STAGE.w || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - v.left) / k, y: (r.top - v.top) / k, w: r.width / k, h: r.height / k };
  }
  // A copy of an element with its computed look inlined on every node, so it
  // renders the same outside its shot, where scoped selectors no longer match.
  const LOOK = ["color", "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "line-height",
    "text-transform", "text-align", "white-space", "text-shadow", "background-color", "background-image", "background-size",
    "background-position", "background-clip", "-webkit-background-clip", "-webkit-text-fill-color", "border-top", "border-right",
    "border-bottom", "border-left", "border-radius", "box-shadow", "padding", "display", "flex-direction", "align-items",
    "justify-content", "gap", "width", "height", "opacity", "fill", "stroke", "object-fit"];
  function frozen(el) {
    const copy = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll("*")];
    [copy, ...copy.querySelectorAll("*")].forEach((d, i) => {
      const cs = getComputedStyle(src[i]);
      for (const p of LOOK) d.style.setProperty(p, cs.getPropertyValue(p));
      d.removeAttribute("id");
    });
    // offsetWidth rounds down, and a line one pixel short wraps.
    const width = Math.ceil(parseFloat(getComputedStyle(el).width) || el.offsetWidth) + 1;
    Object.assign(copy.style, { width: width + "px", height: el.offsetHeight + "px", transform: "none", opacity: "1", visibility: "visible" });
    return copy;
  }
  const clearPaint = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  function snapshot(el) {
    const cs = getComputedStyle(el);
    const box = stageRect(el);
    const k = el.offsetWidth ? box.w / el.offsetWidth : 1;
    const r = cs.borderTopLeftRadius;
    const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && !clearPaint(cs.borderTopColor);
    return {
      ...box, k, copy: frozen(el), text: el.textContent.trim(), color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow,
      radius: (r.endsWith("%") ? (parseFloat(r) / 100) * Math.min(el.offsetWidth, el.offsetHeight) : parseFloat(r) || 0) * k,
      borderWidth: border ? parseFloat(cs.borderTopWidth) * k : 0, borderColor: border ? cs.borderTopColor : "rgba(0, 0, 0, 0)",
      paints: !clearPaint(cs.backgroundColor) || cs.backgroundImage !== "none" || cs.boxShadow !== "none" || border,
    };
  }
  function morphLayer() {
    let layer = document.getElementById("morph-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "morph-layer";
      document.getElementById("camera").appendChild(layer);
    }
    return layer;
  }

  /**
   * One element becomes another: at `at` (in tl's time) `from` becomes `to`.
   * A box travels and reshapes — position, width, height, corner radius,
   * fill, border and shadow each animate — while its contents cross over;
   * two pieces of plain text travel and rescale instead, crossing over when
   * their words differ. Both ends are measured on the laid-out page at the
   * two moments, so the landing is exact. `from` hides at `at`; `to` stays
   * hidden until the morph lands, so keep it out of view before `at`. The
   * `morph` join between shots is this move (and only it may target "ground").
   */
  function morph(tl, from, to, { at = 0, dur = 0.7, ease = "move", ground = null } = {}) {
    if (!from || !to || (to === "ground" && !ground)) { console.warn("[ShotKit.morph] needs two elements", from, to); return; }
    afterLayout(tl, (seek) => {
      seek(at - 0.001);
      const A = snapshot(from);
      let B;
      if (to === "ground") {
        // A disc from `from`'s centre that ends covering the frame.
        const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
        const R = Math.ceil(Math.max(Math.hypot(cx, cy), Math.hypot(STAGE.w - cx, cy), Math.hypot(cx, STAGE.h - cy), Math.hypot(STAGE.w - cx, STAGE.h - cy))) + 4;
        B = { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, radius: R, bg: ground, shadow: "none", borderWidth: 0, borderColor: "rgba(0, 0, 0, 0)", paints: true, copy: null };
        if (!A.paints) A.bg = A.color;
      } else {
        seek(at + dur);
        B = snapshot(to);
      }
      // Build with the playhead before the morph: GSAP first renders a set it
      // finds behind the playhead wrongly when the playhead next goes back.
      seek(at - 0.001);
      buildMorph(tl, from, to, A, B, at, dur, ease);
    });
  }
  function buildMorph(tl, from, to, A, B, at, dur, ease) {
    const end = at + dur;
    const toGround = to === "ground";
    tl.set(from, { visibility: "hidden" }, at);
    if (!toGround) {
      tl.set(to, { visibility: "hidden" }, at);
      tl.set(to, { visibility: "inherit" }, end);
    }
    const ghost = (snap, layer) => {
      const g = snap.copy;
      g.classList.add("morph-ghost");
      Object.assign(g.style, { position: "absolute", left: "0", top: "0", margin: "0", transformOrigin: "0 0", visibility: "hidden", pointerEvents: "none" });
      layer.appendChild(g);
      return g;
    };
    if (!toGround && !A.paints && !B.paints && A.text && B.text) {
      // Text into text: the copies ride one path, rescaling by line height.
      const layer = morphLayer();
      const s = B.h / Math.max(1, A.h);
      const a = ghost(A, layer);
      tl.set(a, { autoAlpha: 1, x: A.x, y: A.y, scale: A.k }, at);
      tl.to(a, { x: B.x, y: B.y, scale: A.k * s, color: B.color, duration: dur, ease }, at);
      tl.set(a, { autoAlpha: 0 }, end);
      if (A.text !== B.text) {
        const b = ghost(B, layer);
        tl.set(b, { autoAlpha: 0, x: A.x, y: A.y, scale: B.k / s }, at);
        tl.to(b, { x: B.x, y: B.y, scale: B.k, duration: dur, ease }, at);
        tl.to(a, { opacity: 0, duration: dur * 0.5, ease: "power1.in" }, at + dur * 0.15);
        tl.to(b, { opacity: 1, duration: dur * 0.55, ease: "power1.out" }, at + dur * 0.3);
        tl.set(b, { autoAlpha: 0 }, end);
      }
      return;
    }
    // A box into a box (or into the ground): one shell reshapes, contents cross.
    const layer = toGround ? document.getElementById("stage") : morphLayer();
    const shell = document.createElement("div");
    shell.className = "morph-shell";
    layer.appendChild(shell);
    const look = (S) => ({ left: S.x, top: S.y, width: S.w, height: S.h, borderRadius: S.radius, backgroundColor: clearPaint(S.bg) ? "rgba(0, 0, 0, 0)" : S.bg, borderWidth: S.borderWidth, borderColor: S.borderColor });
    tl.set(shell, { autoAlpha: 1, borderStyle: "solid", boxShadow: A.shadow, ...look(A) }, at);
    tl.to(shell, { ...look(B), duration: dur, ease }, at);
    if (A.shadow !== B.shadow) tl.set(shell, { boxShadow: B.shadow }, at + dur * 0.5);
    const inside = (S) => {
      const g = S.copy;
      Object.assign(g.style, { background: "transparent", boxShadow: "none", borderColor: "transparent" });
      shell.appendChild(g);
      return g;
    };
    const a = inside(A);
    tl.set(a, { xPercent: -50, yPercent: -50, scale: A.k, opacity: 1, filter: "blur(0px)" }, at);
    tl.to(a, { opacity: 0, filter: "blur(6px)", duration: dur * 0.45, ease: "power1.in" }, at);
    if (B.copy) {
      const b = inside(B);
      tl.set(b, { xPercent: -50, yPercent: -50, scale: B.k * 0.92, opacity: 0, filter: "blur(6px)" }, at);
      tl.to(b, { scale: B.k, opacity: 1, filter: "blur(0px)", duration: dur * 0.6, ease }, at + dur * 0.4);
    }
    if (toGround) tl.set(layer, { backgroundColor: B.bg }, end);
    tl.set(shell, { autoAlpha: 0 }, end);
  }

  /**
   * A line that makes room: `items` (a line's words, in order) arrive at
   * `at[k]`, and the ones already there slide to where they sit once the
   * newcomer is in — "Every day," moves over for "ideas are born", and a word
   * that no longer fits drops to the next line. reflow owns the items' x and
   * y; give each its own entrance with opacity, blur, scale or yPercent.
   */
  function reflow(tl, items, at, { dur = 0.6, ease = "move" } = {}) {
    items = [...items];
    const n = items.length;
    if (!n || !Array.isArray(at) || at.length !== n) { console.warn("[ShotKit.reflow] needs one arrival time per item", items, at); return; }
    const e = gsap.parseEase(ease);
    // where[j][k]: item j's offset from its final place once item k is in.
    const where = items.map(() => []);
    const setX = items.map((el) => gsap.quickSetter(el, "x", "px"));
    const setY = items.map((el) => gsap.quickSetter(el, "y", "px"));
    const place = (t) => {
      if (!where[0].length) return;
      items.forEach((el, j) => {
        // A newcomer starts beside the line as it was and travels with it as
        // it makes room, so it never lands on a word still moving over.
        let from = j ? where[j][j].map((v, d) => v + where[j - 1][j - 1][d] - where[j - 1][j][d]) : where[0][0];
        let [x, y] = from;
        for (let k = Math.max(1, j); k < n; k++) {
          const p = e(Math.min(1, Math.max(0, (t - at[k]) / dur)));
          x += (where[j][k][0] - from[0]) * p;
          y += (where[j][k][1] - from[1]) * p;
          from = where[j][k];
        }
        setX[j](x);
        setY[j](y);
      });
    };
    const clock = { t: 0 };
    const last = Math.max(...at) + dur;
    tl.fromTo(clock, { t: 0 }, { t: last, duration: last, ease: "none", immediateRender: false, onUpdate: () => place(clock.t) }, 0);
    afterLayout(tl, (seek) => {
      seek(at[0]);
      const kept = items.map((el) => [el.style.display, el.style.transform]);
      items.forEach((el) => { el.style.transform = "none"; });
      const parent = items[0].parentElement;
      const k = parent && parent.offsetWidth ? parent.getBoundingClientRect().width / parent.offsetWidth : 1;
      const spots = () => items.map((el) => { const r = el.getBoundingClientRect(); return [r.left / k, r.top / k]; });
      const final = spots();
      for (let step = 0; step < n; step++) {
        items.forEach((el, j) => { el.style.display = j <= step ? kept[j][0] : "none"; });
        const now = spots();
        for (let j = 0; j <= step; j++) where[j][step] = [now[j][0] - final[j][0], now[j][1] - final[j][1]];
      }
      items.forEach((el, j) => { el.style.display = kept[j][0]; el.style.transform = kept[j][1]; });
    });
  }

  // Shared helpers for project-local factories (js/shots.custom.js).
  window.ShotKit = { h, qs, qsa, splitChars, mixedLine, rng, EASE, revealWords, scatterWords, ready, frameHook, three, lottie: lottieStage, rive: riveStage, coverMap, aim, cursor, click, morph, reflow, stage: STAGE, looks: LOOKS };

  window.ShotFactories = {
    "word-build": { mount: wordBuildMount, animate: wordBuildAnimate },
    "pile": { mount: pileMount, animate: pileAnimate },
    "type-field": { mount: typeFieldMount, animate: typeFieldAnimate },
    "overlay-type": { mount: overlayMount, animate: overlayAnimate },
    "logo-sting": { mount: logoMount, animate: logoAnimate },
    "type-wipe": { mount: wipeMount, animate: wipeAnimate },
    "icon-marquee": { mount: marqueeMount, animate: marqueeAnimate },
    "device-notif": { mount: deviceMount, animate: deviceAnimate },
    "word-cut": { mount: wordMount, animate: wordAnimate },
    "color-punch": { mount: punchMount, animate: punchAnimate },
    "logo-cta": { mount: ctaMount, animate: ctaAnimate },
    "stat-counter": { mount: statMount, animate: statAnimate },
    "ui-frame": { mount: uiMount, animate: uiAnimate },
    "line": { mount: lineMount, animate: lineAnimate },
    "cascade": { mount: cascadeMount, animate: cascadeAnimate },
    "lottie": { mount: lottieMount, animate: lottieAnimate },
    "rive": { mount: riveMount, animate: riveAnimate },
    "device-3d": { mount: device3dMount, animate: device3dAnimate },
    "footage": { mount: footageMount, animate: footageAnimate },
    "evidence": { mount: evidenceMount, animate: evidenceAnimate },
    "card": { mount: cardMount, animate: cardAnimate },
  };
})();
