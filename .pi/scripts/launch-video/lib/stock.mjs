/**
 * stock.mjs helpers — Pexels results in one shape, and the file to download.
 * Pure, so the choices are testable without the network (tests/stock.test.ts).
 */

/** One result, the same shape for videos and photos. */
export function shapeVideo(v) {
  return {
    kind: "video", id: v.id, width: v.width, height: v.height, duration: v.duration,
    author: v.user?.name || null, authorUrl: v.user?.url || null, page: v.url, thumb: v.image,
  };
}
export function shapePhoto(p) {
  return {
    kind: "photo", id: p.id, width: p.width, height: p.height, alt: p.alt || "",
    author: p.photographer || null, authorUrl: p.photographer_url || null, page: p.url,
    thumb: p.src?.medium || p.src?.small,
  };
}
/** The mp4 whose short side first reaches 1080 (not the 4K master), else the largest. */
export function bestVideoFile(files) {
  const mp4 = (files || []).filter((f) => /mp4/.test(f.file_type || "") && f.link && f.width && f.height);
  if (!mp4.length) return null;
  const short = (f) => Math.min(f.width, f.height);
  const enough = mp4.filter((f) => short(f) >= 1080).sort((a, b) => short(a) - short(b));
  return enough[0] || mp4.sort((a, b) => short(b) - short(a))[0];
}
