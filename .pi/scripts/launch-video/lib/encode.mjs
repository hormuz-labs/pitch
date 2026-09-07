/**
 * encode.mjs — the ffmpeg side of a render, as pure functions.
 *
 * A render is a stack of still screenshots of a seeked page. Everything the
 * encoder can add on top of that is decided here from two blocks the film
 * carries in shots.js, so the studio's Export button and motion_render agree:
 *
 *   window.SHOTS.render = { shutter, samples, depth, codec }
 *   window.SHOTS.grade  = { lut, temperature, curves, vibrance, contrast,
 *                           brightness, gamma, saturation, vignette, grain }
 *
 * Motion blur is real, not faked: the page is captured `samples` times per
 * output frame across a `shutter` fraction of the frame interval and the
 * sub-frames are averaged (ffmpeg `tmix`), which is what a camera shutter
 * does. Frame blending is the same mechanism with the shutter left open
 * (shutter 1). The grade is applied once, in RGB, before the film is
 * converted to BT.709 video — the conversion is explicit because swscale's
 * default matrix for RGB→YUV is BT.601, which shifts every colour a little
 * when a player assumes 709 for HD, and 10-bit output exists so soft glows
 * and gradients stop banding.
 */

export const CURVE_PRESETS = new Set([
  "vintage", "cross_process", "darker", "increase_contrast", "lighter",
  "linear_contrast", "medium_contrast", "negative", "strong_contrast", "color_negative",
]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

/**
 * The film's render block merged with CLI overrides, validated.
 * `samples` is only meaningful with a shutter; a shutter with one sample
 * is a plain capture, and neither is ever negative or absurd.
 */
export function normalizeRender(fromPage = {}, overrides = {}) {
  const r = fromPage || {};
  const pick = (k) => {
    const o = num(overrides[k]);
    return Number.isFinite(o) ? o : num(r[k]);
  };
  let samples = Math.round(clamp(Number.isFinite(pick("samples")) ? pick("samples") : 1, 1, 16));
  const shutterRaw = pick("shutter");
  let shutter = clamp(Number.isFinite(shutterRaw) ? shutterRaw : samples > 1 ? 0.5 : 0, 0, 1);
  if (shutter === 0) samples = 1;
  if (samples === 1) shutter = 0;
  const depth = pick("depth") === 10 ? 10 : 8;
  const codecRaw = String(overrides.codec ?? r.codec ?? "h264").toLowerCase();
  const codec = codecRaw === "hevc" || codecRaw === "h265" ? "hevc" : "h264";
  const crfRaw = pick("crf");
  const crf = Number.isFinite(crfRaw) ? Math.round(clamp(crfRaw, 0, 40)) : codec === "hevc" ? 18 : 16;
  return { samples, shutter, depth, codec, crf };
}

/**
 * The page times captured for output frame `t`. With a shutter the window
 * opens at the frame time and stays open for `shutter` of a frame interval,
 * sampled `samples` times.
 */
export function sampleTimes(t, fps, { samples = 1, shutter = 0 } = {}) {
  if (samples <= 1 || shutter <= 0) return [t];
  const span = shutter / fps;
  return Array.from({ length: samples }, (_, k) => t + (k / samples) * span);
}

/** ffmpeg filter-option escaping for a filesystem path. */
export function escapeFilterPath(p) {
  return String(p).replace(/\\/g, "/").replace(/'/g, "'\\''").replace(/:/g, "\\:");
}

/**
 * Validate a grade block. Returns { grade, warnings }: unknown keys and
 * out-of-range values are dropped with a warning, never silently applied.
 */
export function normalizeGrade(g, { lutExists = () => true } = {}) {
  const warnings = [];
  if (!g || typeof g !== "object") return { grade: null, warnings };
  const out = {};
  const range = (k, lo, hi) => {
    if (g[k] === undefined) return;
    const v = Number(g[k]);
    if (!Number.isFinite(v)) { warnings.push(`grade.${k} is not a number`); return; }
    if (v < lo || v > hi) { warnings.push(`grade.${k}=${v} is outside ${lo}–${hi}; ignored`); return; }
    out[k] = v;
  };
  if (g.lut !== undefined) {
    if (typeof g.lut !== "string" || !/\.(cube|3dl|dat|m3d|csp)$/i.test(g.lut)) warnings.push("grade.lut must be a .cube/.3dl/.dat/.m3d/.csp file");
    else if (!lutExists(g.lut)) warnings.push(`grade.lut ${g.lut} not found; ignored`);
    else out.lut = g.lut;
  }
  range("temperature", 1000, 40000);
  if (g.curves !== undefined) {
    if (typeof g.curves === "string" && CURVE_PRESETS.has(g.curves)) out.curves = g.curves;
    else if (g.curves && typeof g.curves === "object") {
      const pts = {};
      for (const ch of ["master", "r", "g", "b"]) {
        if (g.curves[ch] === undefined) continue;
        if (typeof g.curves[ch] === "string" && /^[\d.\s/]+$/.test(g.curves[ch])) pts[ch] = g.curves[ch].trim();
        else warnings.push(`grade.curves.${ch} must be points like "0/0 0.5/0.58 1/1"`);
      }
      if (Object.keys(pts).length) out.curves = pts;
    } else warnings.push(`grade.curves must be one of ${[...CURVE_PRESETS].join(", ")} or {master,r,g,b} point strings`);
  }
  range("vibrance", -2, 2);
  range("contrast", 0, 3);
  range("brightness", -1, 1);
  range("gamma", 0.1, 10);
  range("saturation", 0, 3);
  range("vignette", 0, 1);
  range("grain", 0, 100);
  for (const k of Object.keys(g)) {
    if (!["lut", "temperature", "curves", "vibrance", "contrast", "brightness", "gamma", "saturation", "vignette", "grain"].includes(k)) warnings.push(`grade.${k} is not a grade field`);
  }
  return { grade: Object.keys(out).length ? out : null, warnings };
}

/** The grade's RGB-domain filters (before the video conversion). */
export function gradeRgbFilters(grade) {
  if (!grade) return [];
  const f = [];
  if (grade.temperature !== undefined) f.push(`colortemperature=temperature=${grade.temperature}`);
  if (typeof grade.curves === "string") f.push(`curves=preset=${grade.curves}`);
  else if (grade.curves && typeof grade.curves === "object") {
    f.push("curves=" + Object.entries(grade.curves).map(([ch, pts]) => `${ch}='${pts}'`).join(":"));
  }
  if (grade.lut) f.push(`lut3d=file='${escapeFilterPath(grade.lut)}':interp=tetrahedral`);
  if (grade.vibrance !== undefined) f.push(`vibrance=intensity=${grade.vibrance}`);
  return f;
}

/**
 * The grade's filters that run on the finished video (YUV). `vignette` is an
 * 8-bit filter, so ffmpeg drops to 8-bit for it; the chain restores the
 * output depth afterwards (pixelFormat) — the falloff itself is smooth
 * enough that this costs nothing visible.
 */
export function gradeYuvFilters(grade) {
  if (!grade) return [];
  const f = [];
  const eq = [];
  if (grade.contrast !== undefined) eq.push(`contrast=${grade.contrast}`);
  if (grade.brightness !== undefined) eq.push(`brightness=${grade.brightness}`);
  if (grade.gamma !== undefined) eq.push(`gamma=${grade.gamma}`);
  if (grade.saturation !== undefined) eq.push(`saturation=${grade.saturation}`);
  if (eq.length) f.push(`eq=${eq.join(":")}`);
  if (grade.vignette) f.push(`vignette=angle=${(grade.vignette * Math.PI / 4).toFixed(4)}`);
  return f;
}

export const pixelFormat = (depth) => (depth === 10 ? "yuv420p10le" : "yuv420p");

/**
 * The end of every chain: the output depth (whatever an 8-bit filter did in
 * between) and the frames tagged BT.709 limited, so the encoder and the
 * container say what the pixels are.
 */
export function tailFilters(depth = 8) {
  return [`format=${pixelFormat(depth)}`, "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"];
}

/** Film grain: temporal, added last in RGB so the shutter does not average it away. */
export function grainFilter(grade) {
  if (!grade || !grade.grain) return [];
  return [`noise=alls=${Math.round(grade.grain)}:allf=t+u`];
}

/** RGB → BT.709 limited-range video at the requested depth, stated explicitly. */
export function toVideoFilters(depth = 8) {
  return [
    "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int",
    `format=${pixelFormat(depth)}`,
  ];
}

/**
 * The whole -vf chain for a render.
 *   fps        output frame rate
 *   render     normalizeRender()
 *   grade      normalizeGrade().grade
 *   downscale  e.g. "scale=-2:720" or null
 *   watermark  drawtext chain or null
 */
export function renderFilter({ fps, render, grade = null, downscale = null, watermark = null }) {
  const { samples, depth } = render;
  const f = [];
  // Work in planar RGB from the first filter: the captures decode into it
  // correctly whatever their container (JPEG's 601 full-range, PNG's RGB),
  // and 10-bit output keeps the shutter average's extra precision.
  f.push(`format=${depth === 10 ? "gbrp10le" : "gbrp"}`);
  f.push(...gradeRgbFilters(grade));
  if (samples > 1) {
    // Every `samples` captures make one frame: average the window, keep its
    // last member, and renumber so the stream is exactly `fps`.
    f.push(`tmix=frames=${samples}`);
    f.push(`select='eq(mod(n\\,${samples})\\,${samples - 1})'`);
    f.push(`setpts=N/(${fps}*TB)`);
  }
  if (downscale) f.push(downscale);
  f.push(...grainFilter(grade));
  if (watermark) f.push(watermark);
  f.push(...toVideoFilters(depth));
  f.push(...gradeYuvFilters(grade));
  f.push(...tailFilters(depth));
  return f.join(",");
}

/** The grade as the review sheets see it, ending in `tile`. */
export function reviewFilter({ grade = null, tile }) {
  const f = ["format=gbrp", ...gradeRgbFilters(grade), ...grainFilter(grade), ...toVideoFilters(8), ...gradeYuvFilters(grade), tile];
  return f.join(",");
}

/**
 * Encoder arguments. The BT.709 signalling goes through the encoders' own
 * parameters: ffmpeg's -color_primaries/-color_trc output options do not
 * reach the x264/x265 VUI in the studio's ffmpeg 7.1 build (verified —
 * ffprobe reads them back as unknown), colorprim/transfer/colormatrix do.
 */
export function codecArgs(render) {
  const { codec, depth, crf } = render;
  const vui = "colorprim=bt709:transfer=bt709:colormatrix=bt709";
  if (codec === "hevc") {
    return ["-c:v", "libx265", "-preset", "medium", "-crf", String(crf), "-tag:v", "hvc1", "-x265-params", `log-level=error:${vui}:range=limited`, "-movflags", "+faststart"];
  }
  return ["-c:v", "libx264", "-preset", "fast", "-crf", String(crf), "-profile:v", depth === 10 ? "high10" : "high", "-x264-params", vui, "-movflags", "+faststart"];
}

/** One line for the render log. */
export function describeRender(render, grade) {
  const bits = [];
  bits.push(render.samples > 1 ? `shutter ${render.shutter} × ${render.samples} samples` : "no shutter");
  bits.push(`${render.depth}-bit ${render.codec === "hevc" ? "HEVC" : "H.264"} crf ${render.crf}`);
  if (grade) bits.push(`grade: ${Object.keys(grade).join(", ")}`);
  return bits.join(" · ");
}
