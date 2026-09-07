/**
 * image-prompt.mjs — what a generated image may be, and the prompt that keeps
 * it in the brand.
 *
 * Generated imagery exists for the site that has none: a plate behind a type
 * beat, an object for the hook, a texture for the stage, an illustration of
 * the mechanism. It is never the product — a generated "screenshot" is a
 * fabrication the viewer will take as real, a generated logo is a redrawn
 * mark, a generated person is a testimonial nobody gave. The palette is
 * locked from recon so the file arrives already in the film's colours.
 */

export const IMAGE_KINDS = {
  plate: "a full-frame background plate for a type beat — abstract, quiet, nothing to read",
  object: "one physical object on a plain ground — the thing the product is about, or a metaphor for it",
  illustration: "a flat illustration of the mechanism or the before/after — shapes and arrows, not UI",
  texture: "a surface for the stage — paper, grain, fabric, metal, glass — edge to edge, no subject",
  icons: "a set of 6–12 matching icons on a plain ground, one concept each, for a marquee or a pile",
};

const FORBIDDEN = [
  { re: /\b(ui|user interface|screenshot|dashboard|app screen|mockup|mock-up|interface|web ?page|landing page|browser window)\b/i, why: "a generated screen is a fabricated product — use a motion_screenshot of the real product, or a native html rebuild" },
  { re: /\b(logo|wordmark|logotype|brand mark|icon of the brand)\b/i, why: "the logo is the product's own file (motion_recon saves it to assets/logo/, or ask the user); a generated one is a redrawn mark" },
  { re: /\b(person|people|man|woman|face|portrait|customer|user smiling|testimonial|founder|team)\b/i, why: "a generated person is a testimonial nobody gave — use the site's own footage or none" },
  { re: /\b(text|headline|caption|words|typography|lettering|slogan)\b/i, why: "type belongs to the engine (the brand's real font); image models misspell — leave text out of the picture" },
];

/** Refuse what must not be generated; say why in the tool's own terms. */
export function checkImageRequest({ kind, subject }) {
  if (!IMAGE_KINDS[kind]) return { ok: false, reason: `kind must be one of ${Object.keys(IMAGE_KINDS).join(", ")}` };
  const s = String(subject || "").trim();
  if (s.length < 8) return { ok: false, reason: "subject is too short to picture — say what is in the frame and what it is made of" };
  for (const f of FORBIDDEN) {
    if (f.re.test(s)) return { ok: false, reason: f.why };
  }
  return { ok: true };
}

/** A palette line the model can follow: named hexes, nothing else allowed. */
export function paletteLine(brand = {}) {
  const parts = [];
  if (brand.bg) parts.push(`background ${brand.bg}`);
  if (brand.ink) parts.push(`darkest tone ${brand.ink}`);
  if (brand.accent) parts.push(`one accent ${brand.accent}`);
  const extra = Object.entries(brand.palette || {}).filter(([, v]) => typeof v === "string").slice(0, 3).map(([k, v]) => `${k} ${v}`);
  parts.push(...extra);
  return parts.length ? `Use only these colours: ${parts.join(", ")}. No other hues.` : "";
}

/**
 * The prompt. Subject and style come from the agent (direction.md's
 * language); the kind's framing, the palette lock and the standing rules are
 * added here so every generated file starts inside the film.
 */
export function buildImagePrompt({ kind, subject, style, brand, aspect = "16:9", refs = 0 }) {
  const lines = [
    `${IMAGE_KINDS[kind]}.`,
    `Subject: ${String(subject).trim()}.`,
  ];
  if (style) lines.push(`Style: ${String(style).trim()}.`);
  const pal = paletteLine(brand || {});
  if (pal) lines.push(pal);
  lines.push(
    `Composition: ${aspect} frame, clean edges, generous negative space, nothing cropped at the border.`,
    "No text, letters, numbers, logos, watermarks, user interfaces, screens or people.",
    kind === "texture" || kind === "plate" ? "Even lighting, seamless, no focal point." : "Studio lighting, one clear focal point.",
  );
  if (refs > 0) lines.push(`Match the colour, material and mood of the ${refs} reference image${refs === 1 ? "" : "s"} attached; do not copy their content.`);
  return lines.join("\n");
}
