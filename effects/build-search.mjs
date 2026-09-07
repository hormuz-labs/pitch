#!/usr/bin/env node
/* Build the search index the studio's motion_effects tool reads.

   effects/search.json      one compact record per effect: catalog + meta.json + render status
   effects/embeddings.json  one vector per effect (gemini-embedding-2, 768 dims, base64 float32),
                            keyed by id, with the hash of the text it embeds — re-run after
                            editing a meta.json and only the changed ones are re-embedded.

   node effects/build-search.mjs            rebuild search.json, embed what changed
   node effects/build-search.mjs --no-embed rebuild search.json only
   GEMINI_API_KEY comes from the environment or the repo's .env.                          */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(ROOT, '..');
const MODEL = 'gemini-embedding-2';
const DIMS = 768;
const args = new Set(process.argv.slice(2));

function loadEnv() {
  if (process.env.GEMINI_API_KEY) return;
  try {
    for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\s#]+)/);
      if (m) { process.env.GEMINI_API_KEY = m[1]; return; }
    }
  } catch {}
}

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** The text one effect is found by. Name and move first: they carry the most signal per token. */
export function embedText(r) {
  return [
    `${r.name} (${r.family}).`,
    r.move ? `Move: ${r.move}.` : '',
    r.how || '',
    r.moves?.length ? `Motion: ${r.moves.join(', ')}.` : '',
    r.libs?.length ? `Built with ${r.libs.join(', ')}.` : '',
    r.description || '',
    r.tags?.length ? `Tags: ${r.tags.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

const cat = readJson(path.join(ROOT, 'catalog.json'));
const records = cat.map(c => {
  const id = `${c.familySlug}/${c.slug}`;
  const dir = path.join(ROOT, id);
  const meta = readJson(path.join(dir, 'meta.json')) || {};
  const rj = readJson(path.join(dir, 'render.json'));
  const r = {
    id, name: c.name, family: c.familySlug, seconds: c.seconds, tags: c.tags || [],
    description: c.description, jitterUrl: c.jitterUrl || null,
    move: meta.move || null, how: meta.how || null, moves: meta.moves || [], libs: meta.libs || [],
    adapt: meta.adapt || null, port: meta.port || null, caveats: meta.caveats || [],
    fidelity: meta.fidelity || null, loop: meta.loop ?? null, size: meta.size || null,
    built: fs.existsSync(path.join(dir, 'index.html')),
    rendered: fs.existsSync(path.join(dir, 'render.mp4')) && !(rj && rj.error),
    duration: rj && rj.duration ? +rj.duration.toFixed(2) : null,
  };
  r.hash = crypto.createHash('sha1').update(embedText(r)).digest('hex').slice(0, 12);
  return r;
});
fs.writeFileSync(path.join(ROOT, 'search.json'), JSON.stringify({ builtAt: new Date().toISOString(), records }, null, 1));
const withMeta = records.filter(r => r.move).length;
console.log(`search.json: ${records.length} effects, ${withMeta} with meta.json, ${records.filter(r => r.rendered).length} rendered`);

if (args.has('--no-embed')) process.exit(0);
loadEnv();
if (!process.env.GEMINI_API_KEY) { console.error('no GEMINI_API_KEY: skipping embeddings'); process.exit(1); }

const embPath = path.join(ROOT, 'embeddings.json');
const emb = readJson(embPath) || { model: MODEL, dims: DIMS, vectors: {}, hashes: {} };
if (emb.model !== MODEL || emb.dims !== DIMS) { emb.model = MODEL; emb.dims = DIMS; emb.vectors = {}; emb.hashes = {}; }
const todo = records.filter(r => emb.hashes[r.id] !== r.hash);
console.log(`embedding ${todo.length} changed / ${records.length}`);

const toB64 = vec => Buffer.from(new Float32Array(vec).buffer).toString('base64');
for (let i = 0; i < todo.length; i += 50) {
  const chunk = todo.slice(i, i + 50);
  const body = {
    requests: chunk.map(r => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text: embedText(r) }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      title: r.name,
      outputDimensionality: DIMS,
    })),
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.embeddings) { console.error('embed failed:', JSON.stringify(json).slice(0, 400)); process.exit(1); }
  json.embeddings.forEach((e, k) => {
    // normalise so the tool's dot product is a cosine
    const v = e.values; const n = Math.hypot(...v) || 1;
    emb.vectors[chunk[k].id] = toB64(v.map(x => x / n));
    emb.hashes[chunk[k].id] = chunk[k].hash;
  });
  fs.writeFileSync(embPath, JSON.stringify(emb));
  console.log(`  ${Math.min(i + 50, todo.length)}/${todo.length}`);
}
console.log(`embeddings.json: ${Object.keys(emb.vectors).length} vectors, ${MODEL} × ${DIMS}`);
