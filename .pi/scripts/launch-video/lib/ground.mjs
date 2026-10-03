/**
 * ground.mjs — what colour a film is set on, measured from its frames.
 *
 * Films kept landing on the same dark grey-blue whatever the product: the
 * model's idea of "cinematic tech", not the brand's. The audit measures each
 * sampled frame's ground (the dominant colour of its outer band, where the
 * set shows and the subject usually doesn't) and notes a film that sits
 * mostly on that blue when the product's measured colours (recon) don't.
 * A note, never a failure: a dark-mode product is set on its own dark.
 */
import { decodePng } from "./png.mjs";

/** Dominant colour of a decoded frame's outer band (8% of the short side). */
export function groundOf({ width, height, channels, data }) {
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.08));
  const bins = new Map();
  const step = 4;
  for (let y = 0; y < height; y += step) {
    const edgeRow = y < band || y >= height - band;
    for (let x = 0; x < width; x += step) {
      if (!edgeRow && x >= band && x < width - band) continue;
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++; bin.r += r; bin.g += g; bin.b += b;
      bins.set(key, bin);
    }
  }
  let best = null, total = 0;
  for (const bin of bins.values()) {
    total += bin.n;
    if (!best || bin.n > best.n) best = bin;
  }
  if (!best) return null;
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n), share: best.n / total };
}

function hsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** The stock "tech" ground: dark, tinted blue, neither black nor a real colour. */
export function isStockNavy(c) {
  const { h, s, l } = hsl(c);
  return l < 0.2 && l > 0.02 && s > 0.12 && h >= 195 && h <= 255;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const c = m[1].length === 3 ? m[1].split("").map(ch => ch + ch).join("") : m[1];
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
}

const near = (a, b, tol) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) <= tol;
const hex = ({ r, g, b }) => `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** The colours recon measured on the product's own site: background and surfaces. */
export function measuredBrandColours(recon) {
  const c = recon?.colors ?? {};
  return [c.bg, ...(c.surfaces ?? []).map(s => s?.hex)].map(hexToRgb).filter(Boolean);
}

/**
 * A ⚠ note when most sampled frames sit on the stock navy and recon did not
 * measure it on the product. `frames` are PNG buffers; `recon` is
 * recon/brand-tokens.json (or null when recon never ran).
 */
export function stockGroundNote(frames, recon, { share = 0.5, tolerance = 28 } = {}) {
  const grounds = [];
  for (const buf of frames) {
    try {
      const g = groundOf(decodePng(buf));
      if (g) grounds.push(g);
    } catch {}
  }
  if (!grounds.length) return null;
  const brand = measuredBrandColours(recon);
  const navy = grounds.filter(g => isStockNavy(g) && !brand.some(b => near(g, b, tolerance)));
  if (navy.length / grounds.length < share) return null;
  const pct = Math.round((navy.length / grounds.length) * 100);
  const typical = hex(navy[Math.floor(navy.length / 2)]);
  const source = recon
    ? "the product's measured colours (recon/brand-tokens.json) don't include it"
    : "recon never ran, so nothing says the product uses it";
  return `Ground: ${pct}% of sampled frames sit on a dark grey-blue (≈${typical}), and ${source}. That is the stock "tech film" look, not a brand. Set the film on the product's own background and surfaces, or keep this dark and give the reason in direction.md (the product lives in dark mode, the idea needs night).`;
}
