/**
 * anim.js — Deterministic property animation toolkit for motion & video.
 *
 * Provides property interpolation, physics-based springs, color transitions,
 * cubic bezier curves, perceptual scaling, and transform composition.
 *
 * All motion is a pure mathematical function of time or frame.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const anim = factory();
    root.anim = anim;
    if (root.fx) {
      Object.assign(root.fx, anim);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // --- Easing functions ---
  const Easing = {
    step0(t) {
      return t > 0 ? 1 : 0;
    },
    step1(t) {
      return t >= 1 ? 1 : 0;
    },
    linear(t) {
      return t;
    },
    ease(t) {
      return Easing.bezier(0.25, 0.1, 0.25, 1)(t);
    },
    quad(t) {
      return t * t;
    },
    cubic(t) {
      return t * t * t;
    },
    poly(n) {
      return function (t) {
        return Math.pow(t, n);
      };
    },
    sin(t) {
      return 1 - Math.cos((t * Math.PI) / 2);
    },
    circle(t) {
      return 1 - Math.sqrt(Math.max(0, 1 - t * t));
    },
    exp(t) {
      return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
    },
    elastic(bounciness = 1) {
      const p = 1 - Math.max(0, Math.min(1, bounciness));
      return function (t) {
        if (t === 0 || t === 1) return t;
        const s = 0.3 * (p + 0.001);
        return -Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - s / 4) * (2 * Math.PI)) / s);
      };
    },
    back(s = 1.70158) {
      return function (t) {
        return t * t * ((s + 1) * t - s);
      };
    },
    bounce(t) {
      const n1 = 7.5625;
      const d1 = 2.75;
      const x = 1 - t;
      let val;
      if (x < 1 / d1) {
        val = n1 * x * x;
      } else if (x < 2 / d1) {
        const x2 = x - 1.5 / d1;
        val = n1 * x2 * x2 + 0.75;
      } else if (x < 2.5 / d1) {
        const x2 = x - 2.25 / d1;
        val = n1 * x2 * x2 + 0.9375;
      } else {
        const x2 = x - 2.625 / d1;
        val = n1 * x2 * x2 + 0.984375;
      }
      return 1 - val;
    },
    bezier(x1, y1, x2, y2) {
      return function (t) {
        if (x1 === y1 && x2 === y2) return t;
        let low = 0;
        let high = 1;
        let current = t;
        for (let i = 0; i < 16; i++) {
          const x = 3 * (1 - current) * (1 - current) * current * x1 +
                    3 * (1 - current) * current * current * x2 +
                    current * current * current;
          if (Math.abs(x - t) < 1e-6) break;
          if (x < t) low = current;
          else high = current;
          current = (low + high) / 2;
        }
        return 3 * (1 - current) * (1 - current) * current * y1 +
               3 * (1 - current) * current * current * y2 +
               current * current * current;
      };
    },
    in(fn) {
      return fn;
    },
    out(fn) {
      return function (t) {
        return 1 - fn(1 - t);
      };
    },
    inOut(fn) {
      return function (t) {
        return t < 0.5 ? 0.5 * fn(t * 2) : 0.5 * (2 - fn((1 - t) * 2));
      };
    },
    spring(config = {}) {
      const damping = config.damping ?? 10;
      const mass = config.mass ?? 1;
      const stiffness = config.stiffness ?? 100;
      const overshootClamping = config.overshootClamping ?? false;

      return function (t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const val = springRaw(t * 1.5, { mass, damping, stiffness, overshootClamping });
        return val;
      };
    },
  };

  // --- Spring physics engine ---
  function springRaw(timeInSeconds, { mass = 1, damping = 10, stiffness = 100, overshootClamping = false } = {}) {
    if (timeInSeconds <= 0) return 0;
    const m = Math.max(0.001, mass);
    const k = Math.max(0.001, stiffness);
    const c = Math.max(0, damping);

    const w0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(m * k));

    let val = 1;
    if (zeta < 1) {
      // Underdamped
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const env = Math.exp(-zeta * w0 * timeInSeconds);
      val = 1 - env * (Math.cos(wd * timeInSeconds) + (zeta * w0 / wd) * Math.sin(wd * timeInSeconds));
    } else if (zeta === 1) {
      // Critically damped
      const env = Math.exp(-w0 * timeInSeconds);
      val = 1 - env * (1 + w0 * timeInSeconds);
    } else {
      // Overdamped
      const wp = w0 * Math.sqrt(zeta * zeta - 1);
      const env = Math.exp(-zeta * w0 * timeInSeconds);
      val = 1 - env * (Math.cosh(wp * timeInSeconds) + (zeta * w0 / wp) * Math.sinh(wp * timeInSeconds));
    }

    if (overshootClamping && val > 1) {
      return 1;
    }
    return val;
  }

  function measureSpring({ fps = 30, config = {}, threshold = 0.001 } = {}) {
    let frame = 0;
    const maxFrames = fps * 15;
    while (frame < maxFrames) {
      const t = frame / fps;
      const v = springRaw(t, config);
      const nextV = springRaw((frame + 1) / fps, config);
      if (Math.abs(v - 1) < threshold && Math.abs(nextV - v) < threshold / 10) {
        return Math.max(1, frame);
      }
      frame++;
    }
    return maxFrames;
  }

  function spring(options = {}) {
    const frame = options.frame ?? 0;
    const fps = options.fps ?? 30;
    const from = options.from ?? 0;
    const to = options.to ?? 1;
    const delay = options.delay ?? 0;
    const reverse = options.reverse ?? false;
    const config = options.config ?? {};
    const durationInFrames = options.durationInFrames;
    const threshold = options.durationRestThreshold ?? 0.001;

    let currentFrame = frame;

    if (durationInFrames != null && durationInFrames > 0) {
      const naturalDuration = measureSpring({ fps, config, threshold });
      currentFrame = (currentFrame / durationInFrames) * naturalDuration;
    }

    if (reverse) {
      const activeDuration = durationInFrames ?? measureSpring({ fps, config, threshold });
      currentFrame = activeDuration - currentFrame;
    }

    currentFrame = currentFrame - delay;
    if (currentFrame <= 0) {
      return from;
    }

    const t = currentFrame / fps;
    const progress = springRaw(t, config);
    return from + (to - from) * progress;
  }

  // --- String & Unit Tokenizer for CSS Transforms ---
  function interpolateString(progress, str1, str2) {
    const numRegex = /[-+]?(?:\d*\.\d+|\d+)/g;
    const matches1 = str1.match(numRegex);
    const matches2 = str2.match(numRegex);

    if (!matches1 || !matches2 || matches1.length !== matches2.length) {
      return progress < 0.5 ? str1 : str2;
    }

    let i = 0;
    return str1.replace(numRegex, () => {
      const n1 = parseFloat(matches1[i]);
      const n2 = parseFloat(matches2[i]);
      const current = n1 + (n2 - n1) * progress;
      i++;
      return Number(current.toFixed(4)).toString();
    });
  }

  // --- Color Interpolation ---
  const COLOR_NAMES = {
    black: [0, 0, 0, 1],
    white: [255, 255, 255, 1],
    red: [255, 0, 0, 1],
    green: [0, 128, 0, 1],
    blue: [0, 0, 255, 1],
    yellow: [255, 255, 0, 1],
    cyan: [0, 255, 255, 1],
    magenta: [255, 0, 255, 1],
    purple: [128, 0, 128, 1],
    pink: [255, 192, 203, 1],
    orange: [255, 165, 0, 1],
    gray: [128, 128, 128, 1],
    grey: [128, 128, 128, 1],
    transparent: [0, 0, 0, 0],
  };

  function parseColor(c) {
    if (typeof c !== 'string') return [0, 0, 0, 1];
    c = c.trim().toLowerCase();

    if (COLOR_NAMES[c]) return [...COLOR_NAMES[c]];

    if (c.startsWith('#')) {
      const hex = c.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
          1,
        ];
      }
      if (hex.length === 4) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
          parseInt(hex[3] + hex[3], 16) / 255,
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          1,
        ];
      }
      if (hex.length === 8) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          parseInt(hex.slice(6, 8), 16) / 255,
        ];
      }
    }

    const rgbMatch = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbMatch) {
      return [
        parseFloat(rgbMatch[1]),
        parseFloat(rgbMatch[2]),
        parseFloat(rgbMatch[3]),
        rgbMatch[4] != null ? parseFloat(rgbMatch[4]) : 1,
      ];
    }

    const hslMatch = c.match(/hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]) / 360;
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      const a = hslMatch[4] != null ? parseFloat(hslMatch[4]) : 1;

      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          let tt = t;
          if (tt < 0) tt += 1;
          if (tt > 1) tt -= 1;
          if (tt < 1 / 6) return p + (q - p) * 6 * tt;
          if (tt < 1 / 2) return q;
          if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a];
    }

    return [0, 0, 0, 1];
  }

  function interpolateColors(value, inputRange, colorRange, options = {}) {
    if (!inputRange || !colorRange || inputRange.length === 0 || colorRange.length === 0) {
      return 'rgba(0, 0, 0, 1)';
    }
    if (inputRange.length === 1 || colorRange.length === 1) {
      const c = parseColor(colorRange[0]);
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    }

    let val = value;
    if (options.posterize && options.posterize > 0) {
      val = Math.floor(val / options.posterize) * options.posterize;
    }

    const n = inputRange.length;
    let seg = 0;
    if (val <= inputRange[0]) {
      seg = 0;
      val = inputRange[0];
    } else if (val >= inputRange[n - 1]) {
      seg = n - 2;
      val = inputRange[n - 1];
    } else {
      while (seg < n - 2 && val > inputRange[seg + 1]) {
        seg++;
      }
    }

    const inStart = inputRange[seg];
    const inEnd = inputRange[seg + 1];
    const rawProgress = inEnd === inStart ? 0 : (val - inStart) / (inEnd - inStart);

    let easingFn = options.easing ?? Easing.linear;
    if (Array.isArray(easingFn)) {
      easingFn = easingFn[seg] ?? Easing.linear;
    }
    const p = Math.max(0, Math.min(1, easingFn(rawProgress)));

    const c1 = parseColor(colorRange[seg]);
    const c2 = parseColor(colorRange[seg + 1]);

    const r = Math.round(c1[0] + (c2[0] - c1[0]) * p);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * p);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * p);
    const a = Number((c1[3] + (c2[3] - c1[3]) * p).toFixed(4));

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // --- Interpolate Property Core ---
  function interpolate(input, inputRange, outputRange, options = {}) {
    if (!inputRange || !outputRange || inputRange.length === 0 || outputRange.length === 0) {
      return outputRange?.[0] ?? input;
    }
    if (inputRange.length === 1 || outputRange.length === 1) {
      return outputRange[0];
    }

    const extrapolateLeft = options.extrapolateLeft ?? 'extend';
    const extrapolateRight = options.extrapolateRight ?? 'extend';
    const outputType = options.output ?? 'linear';

    let val = input;
    if (options.posterize && options.posterize > 0) {
      val = Math.floor(val / options.posterize) * options.posterize;
    }

    const minIn = inputRange[0];
    const maxIn = inputRange[inputRange.length - 1];

    if (val < minIn) {
      if (extrapolateLeft === 'clamp') val = minIn;
      else if (extrapolateLeft === 'identity') return input;
      else if (extrapolateLeft === 'wrap') {
        const span = maxIn - minIn;
        val = span === 0 ? minIn : minIn + ((((val - minIn) % span) + span) % span);
      }
    } else if (val > maxIn) {
      if (extrapolateRight === 'clamp') val = maxIn;
      else if (extrapolateRight === 'identity') return input;
      else if (extrapolateRight === 'wrap') {
        const span = maxIn - minIn;
        val = span === 0 ? maxIn : minIn + ((((val - minIn) % span) + span) % span);
      }
    }

    const n = inputRange.length;
    let seg = 0;
    if (val <= minIn) {
      seg = 0;
    } else if (val >= maxIn) {
      seg = n - 2;
    } else {
      while (seg < n - 2 && val > inputRange[seg + 1]) {
        seg++;
      }
    }

    const inStart = inputRange[seg];
    const inEnd = inputRange[seg + 1];
    const outStart = outputRange[seg];
    const outEnd = outputRange[seg + 1];

    const rawProgress = inEnd === inStart ? 0 : (val - inStart) / (inEnd - inStart);

    let easingFn = options.easing ?? Easing.linear;
    if (Array.isArray(easingFn)) {
      easingFn = easingFn[seg] ?? Easing.linear;
    }

    const progress = (val >= inStart && val <= inEnd) ? easingFn(rawProgress) : rawProgress;

    // Array / tuple outputs:
    if (Array.isArray(outStart) && Array.isArray(outEnd)) {
      return outStart.map((startVal, idx) => {
        const endVal = outEnd[idx] ?? startVal;
        return startVal + (endVal - startVal) * progress;
      });
    }

    // String outputs:
    if (typeof outStart === 'string' && typeof outEnd === 'string') {
      return interpolateString(progress, outStart, outEnd);
    }

    // Perceptual scale:
    if (outputType === 'perceptual-scale' && typeof outStart === 'number' && typeof outEnd === 'number') {
      const area1 = Math.sign(outStart) * (outStart * outStart);
      const area2 = Math.sign(outEnd) * (outEnd * outEnd);
      const interpolatedArea = area1 + progress * (area2 - area1);
      return Math.sign(interpolatedArea) * Math.sqrt(Math.abs(interpolatedArea));
    }

    // Number output:
    return outStart + progress * (outEnd - outStart);
  }

  // --- Transform Helper ---
  function makeTransform(transforms = []) {
    return transforms.filter(Boolean).join(' ');
  }

  return {
    Easing,
    interpolate,
    interpolateColors,
    spring,
    measureSpring,
    makeTransform,
  };
});
