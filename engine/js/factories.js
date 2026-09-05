/* Shot factories: mount(el, shot, ctx) + animate(el, shot, D, ctx) */
(function () {
  const EASE = {
    slam: "expo.out",
    land: "power4.out",
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
      yPercent: 130, duration: 0.55, ease: EASE.slam, stagger: 0.012,
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
      tl.from(chars, { yPercent: 110, duration: 0.38, ease: EASE.slam, stagger: 0.01 }, t0);
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
      if (tag) gsap.set(tag, { opacity: 0 });
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
      tl.from(label.querySelectorAll(".char"), { yPercent: 110, duration: 0.4, ease: EASE.land, stagger: 0.008 }, 0.35);
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
    const wrap = h(`<div class="ui-frame ${kind}" style="width:${w}px;height:${hgt}px;left:${(1920 - w) / 2 + (shot.offsetX || 0)}px;top:${(1080 - hgt) / 2 + (shot.offsetY || 0)}px"></div>`);
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
    if (shot.cursor) {
      // The pointer, or (`hand: true`) the big cartoon hand the reference
      // films use at hero scale.
      const hand = shot.cursor.hand
        ? `<svg viewBox="0 0 64 64" width="64" height="64"><path d="M22 58c-6 0-9-4-11-9L5 34c-1-3 1-6 4-6 2 0 3 1 4 3l4 7V14c0-3 2-5 5-5s5 2 5 5v14h2V11c0-3 2-5 5-5s5 2 5 5v17h2V15c0-3 2-5 5-5s5 2 5 5v13h2v-7c0-3 2-5 5-5s5 2 5 5v20c0 10-7 17-17 17H22z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M27 32v10M34 32v10M41 32v10" stroke="#111" stroke-width="3" stroke-linecap="round"/></svg>`
        : `<svg viewBox="0 0 24 24" width="48" height="48"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      screen.appendChild(h(`<div class="ui-cursor ${shot.cursor.hand ? "hand" : ""}"><div class="ui-ripple"></div>${hand}</div>`));
    }
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
      tl.from(caption.querySelectorAll(".char"), { yPercent: 110, duration: 0.45, ease: EASE.slam, stagger: 0.01 }, 0.12);
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
    const width = opts.width || 1920;
    const height = opts.height || 1080;
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
    holder.style.cssText = `position:absolute;left:${opts.x ?? 0}px;top:${opts.y ?? 0}px;width:${opts.width || 1920}px;height:${opts.height || 1080}px;pointer-events:none;`;
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
    const width = opts.width || 1920;
    const height = opts.height || 1080;
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
    return { w, h: hgt, x: shot.x ?? (1920 - w) / 2, y: shot.y ?? (1080 - hgt) / 2 };
  }
  function captionMount(el, shot) {
    if (!shot.caption) return;
    const cap = h(`<div class="ui-caption ${shot.captionPos === "top" ? "top" : shot.captionPos === "center" ? "center" : "bottom"} type-center"></div>`);
    mixedLine(cap, shot.caption);
    el.appendChild(cap);
  }
  function captionIn(tl, el) {
    const cap = el.querySelector(".ui-caption");
    if (cap) tl.from(cap.querySelectorAll(".char"), { yPercent: 110, duration: 0.45, ease: EASE.slam, stagger: 0.01 }, 0.12);
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

  // Shared helpers for project-local factories (js/shots.custom.js).
  window.ShotKit = { h, qs, splitChars, mixedLine, rng, EASE, revealWords, scatterWords, ready, frameHook, three, lottie: lottieStage, rive: riveStage, coverMap };

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
  };
})();
