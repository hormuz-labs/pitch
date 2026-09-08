/* Deterministic camera + interpolation helpers for seekable launch-film effects.
 * No clock or RAF lives here: callers provide seconds through fx.register(). */
(function () {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => a === b ? 1 : clamp((v - a) / (b - a));

  const eases = {
    linear: t => t,
    smooth: t => t * t * (3 - 2 * t),
    smoother: t => t * t * t * (t * (t * 6 - 15) + 10),
    expoIn: t => t === 0 ? 0 : 2 ** (10 * t - 10),
    expoOut: t => t === 1 ? 1 : 1 - 2 ** (-10 * t),
    expoInOut: t => t === 0 || t === 1 ? t : t < .5
      ? 2 ** (20 * t - 10) / 2
      : (2 - 2 ** (-20 * t + 10)) / 2,
    cubicOut: t => 1 - (1 - t) ** 3,
    quartOut: t => 1 - (1 - t) ** 4,
    backOut: t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    },
  };

  function phase(t, start, end, ease = 'smooth') {
    const p = invLerp(start, end, t);
    return (typeof ease === 'function' ? ease : eases[ease] || eases.smooth)(p);
  }

  function between(t, start, end, from, to, ease = 'smooth') {
    return lerp(from, to, phase(t, start, end, ease));
  }

  function envelope(t, enterStart, enterEnd, exitStart, exitEnd, ease = 'smooth') {
    return phase(t, enterStart, enterEnd, ease) * (1 - phase(t, exitStart, exitEnd, ease));
  }

  function spring(t, damping = 7.2, frequency = 11.5) {
    t = clamp(t);
    const raw = 1 - Math.exp(-damping * t) * Math.cos(frequency * t);
    const end = 1 - Math.exp(-damping) * Math.cos(frequency);
    return raw / end;
  }

  function set(el, props) {
    if (!el) return;
    const x = props.x || 0, y = props.y || 0;
    const scale = props.scale == null ? 1 : props.scale;
    const rotate = props.rotate || 0;
    el.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale}) rotate(${rotate}deg)`;
    if (props.opacity != null) el.style.opacity = props.opacity;
    if (props.blur != null) el.style.filter = `blur(${Math.max(0, props.blur)}px)`;
  }

  /* Camera state is expressed in world coordinates. x/y is the point that
     should sit at viewport centre; zoom is optical scale. */
  function camera(el, state, viewport = { width: 1920, height: 1080 }) {
    const zoom = state.zoom == null ? 1 : state.zoom;
    const x = viewport.width / 2 - (state.x || 0) * zoom;
    const y = viewport.height / 2 - (state.y || 0) * zoom;
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate3d(${x}px,${y}px,0) scale(${zoom}) rotate(${state.rotate || 0}deg)`;
    if (state.blur != null) el.style.filter = `blur(${Math.max(0, state.blur)}px)`;
  }

  function typeText(el, text, progress) {
    if (!el) return;
    const chars = Array.from(text);
    el.textContent = chars.slice(0, Math.round(clamp(progress) * chars.length)).join('');
  }

  window.Motion = { clamp, lerp, invLerp, eases, phase, between, envelope, spring, set, camera, typeText };
})();
