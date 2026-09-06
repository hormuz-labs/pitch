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
  const fx = (window.fx = {});
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

  fx.register = function ({ duration, seek, fps = 30, loop = true }) {
    const api = {
      duration,
      fps,
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
        let t0 = performance.now();
        (function tick(now) {
          let t = (now - t0) / 1000;
          if (loop) t = t % duration; else t = Math.min(t, duration);
          api.seek(t);
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
