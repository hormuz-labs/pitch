/**
 * harvest-plan.mjs — the decisions behind harvesting, as pure functions.
 *
 * A site's own demo footage is usually its richest material and the poster
 * frame is its poorest: it is the first frame, a black or a title. So the
 * harvest mines every downloaded clip for the moments that matter (scene
 * changes, spread across the clip) and lays them on sheets the agent can
 * look at. And when the site is thin, the harvest says so in terms of what
 * to ask the user for, instead of leaving the film to be built from grey.
 */

/**
 * Which moments of a clip to keep. Scene-change times win; if they are
 * few, even samples fill in; close pairs collapse; the result is capped by
 * keeping an even spread.
 */
export function planFrameTimes(sceneTimes, duration, { max = 12, min = 6, minGap = 1.0, edge = 0.06 } = {}) {
  const D = Number(duration) || 0;
  if (D <= 0) return [];
  const lo = D * edge;
  const hi = D * (1 - edge);
  const keep = [];
  const push = (t) => {
    if (!Number.isFinite(t) || t < lo || t > hi) return;
    if (keep.some((k) => Math.abs(k - t) < minGap)) return;
    keep.push(t);
  };
  [...(sceneTimes || [])].sort((a, b) => a - b).forEach(push);
  if (keep.length < min) {
    const n = Math.max(min, Math.min(max, Math.round(D / 5)));
    for (let i = 0; i < n; i++) push(lo + ((hi - lo) * (i + 0.5)) / n);
  }
  keep.sort((a, b) => a - b);
  if (keep.length <= max) return keep.map((t) => +t.toFixed(2));
  const out = [];
  for (let i = 0; i < max; i++) out.push(keep[Math.round((i * (keep.length - 1)) / (max - 1))]);
  return [...new Set(out)].map((t) => +t.toFixed(2));
}

/**
 * What the harvest could not find, as the files to ask the user for. Each
 * entry says what, why it matters for the film, and what it unlocks.
 */
export function assetGaps(manifest, recon = {}) {
  const media = manifest?.media || [];
  const svg = manifest?.svg || [];
  const gaps = [];
  const images = media.filter((m) => ["image", "poster", "frame"].includes(m.kind));
  const videos = media.filter((m) => m.kind === "video");
  const hasLogo = svg.some((s) => s.logoish) || images.some((m) => /logo|wordmark|brand/i.test(`${m.alt || ""} ${m.source || ""}`));
  const bigImages = images.filter((m) => (m.width || 0) >= 1200);
  const screens = images.filter((m) => (m.width || 0) >= 900 && /screen|app|dashboard|product|ui|demo/i.test(`${m.alt || ""} ${m.section || ""} ${m.source || ""}`));
  const maxVideoW = Math.max(0, ...videos.map((v) => v.width || 0));
  const vector = media.some((m) => m.kind === "lottie" || m.kind === "rive");

  if (!hasLogo) gaps.push({ need: "the logo as an SVG (mark and wordmark)", why: "nothing harvested reads as the logo; a retyped or redrawn mark is banned", unlocks: "logo-sting, logo-cta, a carry match cut, an extruded mark" });
  if (!videos.length) gaps.push({ need: "a screen recording of the product doing its main thing (1080p or better, 20–60s, no cursor tricks)", why: "the site has no footage, so every product beat would be a still", unlocks: "ui-frame focus moves from real moments, device-3d screens, cursor.then state swaps" });
  else if (maxVideoW < 960) gaps.push({ need: `the site's own clips at 1080p (the largest here is ${maxVideoW}px wide)`, why: "frames from them will be soft when they fill the stage", unlocks: "full-width ui-frame and device-3d shots that stay sharp" });
  if (!bigImages.length && !screens.length) gaps.push({ need: "2–4 product screenshots at 1440px or wider (the key screens, real data)", why: "no large product image was on the page", unlocks: "ui-frame with layers (parallax), device-3d, a native rebuild with the real labels" });
  if (!vector && hasLogo) gaps.push({ need: "a Lottie or Rive of the mark, if one exists", why: "optional — the mark's own motion beats anything invented for it", unlocks: "a lottie/rive shot of the brand's own animation" });
  if (recon && recon.fontsSaved === 0 && recon.fontFamily) gaps.push({ need: `the ${recon.fontFamily} font files (woff2)`, why: "recon found no downloadable @font-face, so the render would substitute", unlocks: "the brand's real type, self-hosted and deterministic" });
  return gaps;
}

/** The lines the harvest prints for the agent to relay. */
export function gapsReport(gaps) {
  if (!gaps.length) return "";
  const lines = ["\n🙋 Ask the user for (keep building meanwhile; fold these in when they arrive):"];
  for (const g of gaps) lines.push(`   • ${g.need}\n       why: ${g.why}\n       unlocks: ${g.unlocks}`);
  return lines.join("\n");
}
