#!/usr/bin/env node
/**
 * image.mjs — generate a brand-locked still with a Gemini image model.
 *
 *   node image.mjs --kind=plate --subject="…" --out=assets/generated/hook-plate.png
 *                  [--aspect=16:9|1:1|9:16|4:3|3:4] [--style="…"] [--ref=a.png,b.jpg]
 *                  [--model=gemini-3.1-flash-image] [--brand=recon/brand-tokens.json]
 *
 * For the site that has no imagery. The kind and the subject are checked
 * (lib/image-prompt.mjs): no UI, no logos, no people, no text. The palette is
 * read from recon/brand-tokens.json and written into the prompt; files from
 * assets/ can be passed as refs for material and mood. Every image gets a
 * sidecar (<out>.json: model, prompt, refs) and a line in recon/generated.json,
 * so a generated file is never mistaken for the product's own.
 *
 * Requires GEMINI_API_KEY (env, or the repo .env — same lookup as tts.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { buildImagePrompt, checkImageRequest, IMAGE_KINDS } from "./lib/image-prompt.mjs";

let key = process.env.GEMINI_API_KEY;
if (!key) {
  let dir = process.cwd();
  for (let i = 0; i < 6 && !key; i++) {
    const p = resolve(dir, ".env");
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
      if (m) key = m[1].trim();
    }
    dir = resolve(dir, "..");
  }
}
if (!key) { console.error("GEMINI_API_KEY not set and no .env found."); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  return i === -1 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const kind = String(args.kind || "");
const subject = String(args.subject || "");
const out = String(args.out || `assets/generated/${kind || "image"}-${Date.now()}.png`);
const aspect = String(args.aspect || "16:9");
const style = args.style ? String(args.style) : "";
const model = String(args.model || "gemini-3.1-flash-image");
const refs = args.ref ? String(args.ref).split(",").map((s) => s.trim()).filter(Boolean) : [];
const brandPath = String(args.brand || "recon/brand-tokens.json");

const check = checkImageRequest({ kind, subject });
if (!check.ok) {
  console.error(`❌ not generated: ${check.reason}\n   kinds: ${Object.entries(IMAGE_KINDS).map(([k, v]) => `${k} — ${v}`).join("\n          ")}`);
  process.exit(2);
}
if (!["16:9", "1:1", "9:16", "4:3", "3:4"].includes(aspect)) { console.error(`--aspect must be 16:9, 1:1, 9:16, 4:3 or 3:4 (got ${aspect})`); process.exit(1); }

let brand = {};
if (existsSync(brandPath)) {
  try {
    const bt = JSON.parse(readFileSync(brandPath, "utf8"));
    const c = bt.colors || {};
    brand = { bg: c.bg || c.background, ink: c.ink || c.text, accent: c.accent, palette: {} };
    for (const s of (c.saturated || []).slice(0, 2)) if (s && s.hex) brand.palette[s.hex] = s.hex;
  } catch { /* an unreadable recon is not a reason to skip the image; the prompt just has no palette */ }
} else {
  console.warn(`⚠ ${brandPath} not found — generating without a palette lock. Run motion_recon first for a file that is already in the brand.`);
}

const parts = [];
for (const r of refs) {
  if (!existsSync(r)) { console.error(`--ref not found: ${r}`); process.exit(1); }
  const ext = extname(r).toLowerCase();
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext];
  if (!mime) { console.error(`--ref must be png/jpg/webp: ${r}`); process.exit(1); }
  parts.push({ inlineData: { mimeType: mime, data: readFileSync(r).toString("base64") } });
}
const prompt = buildImagePrompt({ kind, subject, style, brand, aspect, refs: refs.length });
parts.push({ text: prompt });

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": key },
  body: JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
  }),
});
if (!res.ok) { console.error(`Gemini image HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`); process.exit(1); }
const json = await res.json();
const img = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
if (!img) {
  const why = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || "no image part";
  console.error(`No image in the response (${why}): ${JSON.stringify(json).slice(0, 400)}`);
  process.exit(1);
}
mkdirSync(dirname(resolve(out)), { recursive: true });
const ext = img.mimeType === "image/jpeg" ? ".jpg" : ".png";
const file = extname(out) ? out : out + ext;
writeFileSync(resolve(file), Buffer.from(img.data, "base64"));
const record = { file, kind, subject, style: style || null, aspect, model, refs, prompt, generated: new Date().toISOString() };
writeFileSync(resolve(`${file}.json`), JSON.stringify(record, null, 2));
const ledger = resolve("recon/generated.json");
let list = [];
try { if (existsSync(ledger)) list = JSON.parse(readFileSync(ledger, "utf8")); } catch { list = []; }
list = list.filter((r) => r.file !== file);
list.push(record);
mkdirSync(dirname(ledger), { recursive: true });
writeFileSync(ledger, JSON.stringify(list, null, 2));

console.log(`🖼  ${file}  (${kind}, ${aspect}, ${model}${refs.length ? `, ${refs.length} ref` : ""})`);
console.log(`   palette: ${brand.bg || "?"} / ${brand.ink || "?"} / ${brand.accent || "?"} · sidecar ${basename(file)}.json · ledger recon/generated.json`);
console.log("   Look at it. Off-brand or off-subject: regenerate once with a sharper subject, then move on. It is a plate, an object, a texture — never a screen, a logo or a person.");
