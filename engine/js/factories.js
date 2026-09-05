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
      screen.appendChild(h(`<div class="ui-cursor"><div class="ui-ripple"></div><svg viewBox="0 0 24 24" width="48" height="48"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`));
    }
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
      if (cur.leave !== false) tl.to(node, { opacity: 0, duration: 0.25 }, at + 1.5);
      if (cur.then) {
        // Post-click state: swap the screenshot (e.g. the resulting screen).
        tl.set(qs(el, ".ui-img"), { attr: { src: cur.then } }, at + 1.0);
      }
    }
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
    const texture = (src) => {
      let done;
      ready(new Promise((resolve) => { done = resolve; }));
      const tex = new THREE.TextureLoader().load(src, () => done(), undefined, (e) => { console.warn("[three] texture failed", src, e); done(); });
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
    const cap = h(`<div class="ui-caption ${shot.captionPos === "top" ? "top" : "bottom"} type-center"></div>`);
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
    "lottie": { mount: lottieMount, animate: lottieAnimate },
    "rive": { mount: riveMount, animate: riveAnimate },
  };
})();
