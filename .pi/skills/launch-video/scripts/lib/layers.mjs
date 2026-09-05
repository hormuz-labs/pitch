/**
 * layers.mjs — which parts of a screenshot become parallax layers.
 *
 * `motion_screenshot({ layers })` cuts a product screen into a base plate and
 * a few floating pieces (a modal, a sticky header, a sidebar, a toast) so a
 * `ui-frame` can move them at different depths. This module decides which
 * candidates are worth a layer and how deep they sit; the browser side only
 * measures and captures.
 */

/** Elements that usually float above a page. */
export const AUTO_SELECTOR = [
  '[role="dialog"]', "dialog[open]", '[class*="modal" i]', '[class*="popover" i]',
  '[class*="dropdown" i]', '[class*="toast" i]', '[class*="drawer" i]', '[class*="tooltip" i]',
  "header", "nav", "aside",
].join(", ");

/**
 * Depth by what the thing is: overlays nearest the viewer, chrome one step
 * above the page, everything else one step too (a layer at depth 0 would not
 * move at all, and then it was not worth cutting).
 */
export function guessDepth(c) {
  const hint = `${c.role || ""} ${c.cls || ""} ${c.tag || ""}`.toLowerCase();
  if (/dialog|modal|popover|dropdown|toast|drawer|tooltip/.test(hint)) return 2;
  if (c.position === "fixed" || c.position === "sticky") return 1;
  return 1;
}

/**
 * From the measured candidates (rect in viewport CSS px, `ancestors` = indices
 * of other candidates containing this one) to the layers to cut: big enough,
 * inside the viewport, not nested in another layer, at most `max`, clipped to
 * the viewport, ordered top-left first.
 */
export function planLayers(cands, { viewport, minW = 80, minH = 40, max = 6 } = {}) {
  const W = viewport?.w ?? 1920;
  const H = viewport?.h ?? 1080;
  const kept = [];
  for (const c of cands) {
    const r = c.rect || {};
    if (!(r.w >= minW && r.h >= minH)) continue;
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(W, r.x + r.w);
    const y1 = Math.min(H, r.y + r.h);
    if (x1 - x0 < minW || y1 - y0 < minH) continue;
    // The whole viewport is the base plate, not a layer.
    if (x1 - x0 >= W - 2 && y1 - y0 >= H - 2) continue;
    kept.push({ ...c, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, depth: c.depth ?? guessDepth(c) });
  }
  // A layer inside another layer is already in that layer's pixels; a child
  // whose ancestor was dropped (too small, or the whole viewport) stands alone.
  const survivors = kept.filter((c) => !(c.ancestors || []).some((a) => kept.some((o) => o.i === a)));
  survivors.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return survivors.slice(0, max);
}

/** The shots.js field, ready to paste. */
export function layersSnippet(json) {
  const items = json.items.map((it) =>
    `      { src: ${JSON.stringify(it.src)}, x: ${Math.round(it.x)}, y: ${Math.round(it.y)}, w: ${Math.round(it.w)}, h: ${Math.round(it.h)}, depth: ${it.depth} },  // ${it.hint}`,
  );
  return [
    `  src: ${JSON.stringify(json.base)},`,
    `  layers: {`,
    `    w: ${json.w}, h: ${json.h},`,
    `    items: [`,
    ...items,
    `    ],`,
    `  },`,
  ].join("\n");
}
