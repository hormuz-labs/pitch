/* fx.js — the one contract between an effect and the renderer.
 *
 *   const tl = fx.timeline({ duration: 4 });   // paused GSAP timeline, registered
 *   tl.to(...)                                  // build it; everything on tl
 *
 * or, for canvas / three.js / anything not on a GSAP timeline:
 *
 *   fx.register({ duration: 4, seek(t) { draw(t) } });
 *
 * The renderer opens the page with ?render, waits for window.__fx.ready,
 * calls __fx.seek(t) once per frame and screenshots. Without ?render the
 * effect plays on a loop for a human. Any CSS / WAAPI animations found on
 * the page are seeked too, but keep motion on the timeline where you can.
 *
 * Determinism: no Date.now / performance.now / Math.random / requestAnimationFrame
 * driving motion. Use fx.rng(seed) for randomness. */
(function () {
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render');
  const fx = (window.fx = Object.assign(window.fx || {}, window.anim || {}));

  /* `move`, the ease the film engine gives every tween by default: it starts
     from rest, peaks a third of the way through and settles long
     (cubic-bezier(0.5, 0, 0.15, 1)), so an effect previews the way it will
     move once ported into a film. */
  if (window.gsap) {
    const B = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    gsap.registerEase('move', (x) => {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (B(0.5, 0.15, m) < x) lo = m; else hi = m; }
      return B(0, 1, (lo + hi) / 2);
    });
    gsap.defaults({ ease: 'move' });
  }
  const readyPromises = [];

  fx.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* Register something the renderer must wait for (font load, image decode,
     three.js asset load) before the first frame. */
  fx.wait = function (p) { readyPromises.push(Promise.resolve(p)); };

  function seekDom(t) {
    try {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (t * 1000) % (a.effect && a.effect.getTiming ? (a.effect.getComputedTiming().activeDuration || 1e9) : 1e9);
      }
    } catch (e) {}
  }

  /* Sound: cues in the film cue-sheet format ({ t, event, dur?, label?, clip? },
     see .pi/scripts/launch-video/sfx.mjs). The renderer builds them into the
     render and writes sfx.m4a beside the page; a preview plays that file in
     sync with the loop once the viewer clicks (browsers block autoplay sound). */
  let sfxCues = [];
  fx.sfx = function (cues) {
    sfxCues = cues || [];
    if (window.__fx) window.__fx.sfx = sfxCues;
  };

  function previewSound(api) {
    if (RENDER || !sfxCues.length) return null;
    const audio = new Audio('sfx.m4a');
    audio.preload = 'auto';
    // Sound is on by default, standalone or embedded (the review app's preview).
    // Only the gallery grid (?grid) starts silent: there a card plays while the
    // pointer is over it, so a screen of live cards is never a wall of noise.
    let on = !params.has('grid'), blocked = false;
    // Shown only while the browser is blocking sound on a standalone page.
    const chip = document.createElement('div');
    chip.textContent = '\u{1F50A} click for sound';
    chip.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;font:500 12px/1 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:7px 10px;border-radius:999px;pointer-events:none';
    const start = () => {
      if (!on) return;
      blocked = false;
      audio.currentTime = api.now;
      // Browsers refuse audible autoplay until the page has been interacted
      // with; if refused, the first gesture below starts it.
      audio.play().then(() => chip.remove()).catch(() => {
        blocked = true;
        if (!chip.isConnected) document.body.append(chip);
      });
    };
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (on && (audio.paused || blocked)) start(); });
    addEventListener('message', (e) => {
      if (!e.data || typeof e.data.fxSound !== 'boolean') return;
      on = e.data.fxSound;
      if (!on) audio.pause();
      else if (audio.paused || blocked) start();   // already playing: leave it in sync
    });
    // Read-only state, for checking sound in a browser (and in tests).
    api.sound = () => ({ on, blocked, paused: audio.paused, time: audio.currentTime });
    return {
      // Re-lock to the picture whenever the loop wraps or playback drifts.
      sync(t, wrapped) {
        if (!on || blocked) return;
        if (wrapped || audio.paused || Math.abs(audio.currentTime - t) > 0.12) start();
      },
    };
  }

  fx.register = function ({ duration, seek, fps = 30, loop = true }) {
    const api = {
      duration,
      fps,
      sfx: sfxCues,
      now: 0,
      ready: false,
      seek(t) {
        seek(t);
        seekDom(t);
      },
    };
    window.__fx = api;
    Promise.all([document.fonts ? document.fonts.ready : null, ...readyPromises]).then(() => {
      api.ready = true;
      if (!RENDER) {
        api.seek(0);
        const sound = previewSound(api);
        let t0 = performance.now(), last = 0;
        (function tick(now) {
          let t = (now - t0) / 1000;
          const total = api.duration;
          if (loop) t = t % total; else t = Math.min(t, total);
          api.now = t;
          api.seek(t);
          if (sound) sound.sync(t, t < last);
          last = t;
          requestAnimationFrame(tick);
        })(t0);
      }
    });
    return api;
  };

  fx.timeline = function ({ duration, fps, loop, ...tlOpts } = {}) {
    if (!window.gsap) throw new Error('fx.timeline needs gsap loaded first');
    const tl = gsap.timeline({ paused: true, ...tlOpts });
    fx.register({
      duration: duration,
      fps,
      loop,
      seek(t) { tl.seek(Math.min(t, tl.duration()), false); },
    });
    // duration is read lazily: the effect builds tl after this call.
    Object.defineProperty(window.__fx, 'duration', { get: () => duration || tl.duration() });
    return tl;
  };
})();
