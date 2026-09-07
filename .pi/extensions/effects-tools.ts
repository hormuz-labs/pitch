/**
 * The effects lab, as one tool — pi extension.
 *
 * effects/ holds 408 motion effects (every Jitter template, rebuilt in
 * HTML/CSS/JS on GSAP, three.js, lottie, SVG filters) with a strip of frames
 * and a meta.json each. That is far too much to read, so the agent asks:
 * `motion_effects({ query })` finds the effects nearest to what a beat needs
 * (Gemini embeddings over the lab's descriptions, plus keyword scoring), and
 * `motion_effects({ slug })` returns one effect whole — its meta, its source
 * and where its frames are — to adapt into the film.
 *
 * The index is built offline by `node effects/build-search.mjs` (search.json
 * and embeddings.json); the query vector is computed here, on the host, which
 * has the key and the network the sandbox does not.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { EFFECTS_DIR } from '../lib/paths.ts'

const MODEL = 'gemini-embedding-2'
const DIMS = 768

interface Record_ {
  id: string
  name: string
  family: string
  seconds: number
  tags: string[]
  description: string
  jitterUrl: string | null
  move: string | null
  how: string | null
  moves: string[]
  libs: string[]
  adapt: string | null
  port: string | null
  caveats: string[]
  fidelity: string | null
  loop: boolean | null
  size: string | null
  built: boolean
  rendered: boolean
  duration: number | null
}

interface Index {
  records: Record_[]
  vectors: Map<string, Float32Array>
}

let cached: { mtime: number; index: Index } | null = null

/** search.json + embeddings.json, re-read when search.json changes on disk. */
function loadIndex(): Index {
  const searchPath = join(EFFECTS_DIR, 'search.json')
  const embPath = join(EFFECTS_DIR, 'embeddings.json')
  if (!existsSync(searchPath)) {
    throw new Error(
      `The effects index is missing (${searchPath}). Run: node effects/build-search.mjs`,
    )
  }
  const mtime = statMtime(searchPath) + statMtime(embPath)
  if (cached && cached.mtime === mtime) return cached.index
  const records: Record_[] = JSON.parse(readFileSync(searchPath, 'utf8')).records
  const vectors = new Map<string, Float32Array>()
  if (existsSync(embPath)) {
    const emb = JSON.parse(readFileSync(embPath, 'utf8'))
    if (emb.model === MODEL && emb.dims === DIMS) {
      for (const [id, b64] of Object.entries(emb.vectors as Record<string, string>)) {
        const buf = Buffer.from(b64, 'base64')
        vectors.set(id, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
      }
    }
  }
  cached = { mtime, index: { records, vectors } }
  return cached.index
}

function statMtime(p: string): number {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}

// ── keyword scoring ──────────────────────────────────────────────────────────

const tokens = (s: string | null | undefined): string[] =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 1)

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '')

/** Weighted term-frequency × idf over the fields that carry the move. */
function keywordScores(records: Record_[], query: string): Map<string, number> {
  const q = [...new Set(tokens(query).map(stem))]
  const out = new Map<string, number>()
  if (!q.length) return out
  const docs = records.map(r => {
    const bag = new Map<string, number>()
    const add = (text: string | null | undefined, w: number) => {
      for (const t of tokens(text)) bag.set(stem(t), (bag.get(stem(t)) ?? 0) + w)
    }
    add(r.name, 3)
    add(r.family, 2)
    add(r.move, 3)
    add(r.moves.join(' '), 2)
    add(r.tags.join(' '), 2)
    add(r.libs.join(' '), 1)
    add(r.how, 1)
    add(r.description, 1)
    return bag
  })
  const df = new Map<string, number>()
  for (const bag of docs) for (const t of bag.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const n = records.length
  records.forEach((r, i) => {
    let s = 0
    for (const t of q) {
      const tf = docs[i].get(t)
      if (!tf) continue
      s += Math.log1p(tf) * Math.log(1 + n / (df.get(t) ?? 1))
    }
    if (s > 0) out.set(r.id, s)
  })
  return out
}

// ── semantic scoring ─────────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<Float32Array | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: query }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: DIMS,
        }),
        signal: ctl.signal,
      },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { embedding?: { values?: number[] } }
    const v = json.embedding?.values
    if (!v || v.length !== DIMS) return null
    const norm = Math.hypot(...v) || 1
    return new Float32Array(v.map(x => x / norm))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// ── formatting ───────────────────────────────────────────────────────────────

function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

function dir(r: Record_) {
  return join(EFFECTS_DIR, r.id)
}

function hitLine(i: number, r: Record_): string {
  const libs = r.libs.length ? ` [${r.libs.join(', ')}]` : ''
  const fid = r.fidelity && r.fidelity !== 'faithful' ? ` (${r.fidelity})` : ''
  const head = `${i + 1}. ${r.id}  ${r.seconds}s${fid}${libs}`
  const move = r.move ? `\n   ${r.move}` : `\n   ${r.description}`
  const moves = r.moves.length ? `\n   moves: ${r.moves.join(', ')}` : ''
  return head + move + moves
}

function whole(r: Record_): string {
  const d = dir(r)
  let src = ''
  try {
    src = readFileSync(join(d, 'index.html'), 'utf8')
  } catch {
    src = '(no index.html)'
  }
  const lines = [
    `# ${r.name}  —  ${r.id}`,
    `${r.seconds}s target${r.duration ? `, renders at ${r.duration}s` : ''}; ${r.size ?? '1280x720'}; loop: ${r.loop ?? '?'}; fidelity to the Jitter original: ${r.fidelity ?? '?'}`,
    '',
    `Jitter's description: ${r.description}`,
    r.move ? `\nThe move: ${r.move}` : '',
    r.how ? `\nHow: ${r.how}` : '',
    r.moves.length ? `\nMoves: ${r.moves.join(', ')}` : '',
    r.libs.length ? `Libs: ${r.libs.join(', ')}` : '',
    r.adapt ? `\nTo make it the product's: ${r.adapt}` : '',
    r.port ? `\nTo port into js/shots.custom.js: ${r.port}` : '',
    r.caveats.length ? `\nCaveats: ${r.caveats.join('; ')}` : '',
    '',
    `Frames: ${join(d, 'strip.jpg')} (8 frames across the loop — look at it before you port)`,
    `Poster: ${join(d, 'poster.jpg')}`,
    '',
    `## ${join(d, 'index.html')}`,
    '```html',
    src.trim(),
    '```',
    '',
    'The page loads GSAP from ../../../assets/gsap/ and its own ../../_lib/fx.js; in the film the same plugins are already registered by the scaffold, fx.timeline({duration}) becomes the gsap.timeline() your factory returns, and every time is a fraction of D. Rebuild the placeholder content with the product\'s own — and put `lab: "' +
      r.id +
      '"` on the shot that uses it.',
    "Masks: any `overflow: hidden` reveal here sits at line-height ≤ 1 and cuts descenders and accents at hero size. In the port give the mask `padding: .16em .08em .24em; margin: -.16em -.08em -.24em` and start the hidden text at yPercent 140, not 110. Keep the lab's composition: its count of elements, their sizes and their arrangement are the effect — three forms stay three forms. The lab's 1280×720 stage scales to 1920×1080 by 1.5.",
  ]
  return lines.filter(l => l !== '').join('\n')
}

function families(records: Record_[]): string {
  const counts = new Map<string, number>()
  for (const r of records) counts.set(r.family, (counts.get(r.family) ?? 0) + 1)
  return [...counts.entries()].map(([f, n]) => `${f} (${n})`).join(', ')
}

export default function effectsTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'motion_effects',
    label: 'Effects lab',
    description:
      "The effects lab: 408 motion effects (every Jitter template rebuilt in HTML/CSS/JS on GSAP, three.js, lottie, SVG filters) with frames and notes. `query` finds the effects nearest to what a beat needs — describe the move and what it is for, in words ('a card flipping to reveal a price', 'lines colliding then snapping out', 'a counter rolling up to a number'), not a Jitter name. `slug` returns one effect whole: its meta, its source and its frame strip, to adapt into a project type in js/shots.custom.js. No arguments lists the families. Filter with `family`, `moves`, `libs`.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: 'What the beat needs, as a sentence. Semantic + keyword search.',
        }),
      ),
      slug: Type.Optional(
        Type.String({
          description:
            'One effect id from a result, e.g. "text/bold-text-snap" — returns it whole.',
        }),
      ),
      family: Type.Optional(
        Type.String({
          description:
            'Restrict to one family: text, logos, buttons, charts, counters, devices, icons, morph, backgrounds, gradients, blur, blend-modes, brand, ads, social-media, video-titles, websites, ui-elements, showreels, before-and-after, effects, the-click, the-edit, the-prompt, the-route, the-stack, the-track, the-vault, uncategorised.',
        }),
      ),
      moves: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Only effects tagged with every one of these motion primitives, e.g. ["flip-3d"].',
        }),
      ),
      libs: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Only effects built with every one of these, e.g. ["three"] or ["SplitText"].',
        }),
      ),
      limit: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 40, description: 'Results to return (default 8).' }),
      ),
    }),
    async execute(_id, p: any) {
      const index = loadIndex()
      let records = index.records.filter(r => r.built)

      if (p.slug) {
        const want = String(p.slug)
          .trim()
          .replace(/^\/+|\/+$/g, '')
        const hit =
          records.find(r => r.id === want) ??
          records.find(r => r.id.endsWith(`/${want}`)) ??
          records.find(r => r.name.toLowerCase() === want.toLowerCase())
        if (!hit) {
          return text(
            `No effect "${p.slug}". Ids look like text/bold-text-snap; search with { query } first.`,
          )
        }
        return text(whole(hit))
      }

      if (p.family) {
        const fam = String(p.family).toLowerCase().trim()
        records = records.filter(r => r.family === fam)
        if (!records.length)
          return text(`No family "${p.family}". Families: ${families(index.records)}`)
      }
      if (p.moves?.length) {
        const want = p.moves.map((m: string) => m.toLowerCase())
        records = records.filter(r => want.every((m: string) => r.moves.includes(m)))
      }
      if (p.libs?.length) {
        const want = p.libs.map((m: string) => m.toLowerCase())
        records = records.filter(r =>
          want.every((m: string) => r.libs.some(l => l.toLowerCase() === m)),
        )
      }

      const limit = p.limit ?? 8
      if (!p.query) {
        if (!p.family && !p.moves?.length && !p.libs?.length) {
          return text(
            `${index.records.length} effects in ${EFFECTS_DIR}. Families: ${families(index.records)}.\n\n` +
              'Search with { query: "<what the beat needs>" }; read one with { slug }.',
          )
        }
        const rows = records
          .slice(0, limit)
          .map((r, i) => hitLine(i, r))
          .join('\n')
        return text(
          `${records.length} effects match${records.length > limit ? `, first ${limit}` : ''}:\n${rows}\n\nmotion_effects({ slug }) returns one whole.`,
        )
      }

      const query = String(p.query)
      const kw = keywordScores(records, query)
      const qv = index.vectors.size ? await embedQuery(query) : null
      const sem = new Map<string, number>()
      if (qv) {
        for (const r of records) {
          const v = index.vectors.get(r.id)
          if (v) sem.set(r.id, dot(qv, v))
        }
      }
      const kwMax = Math.max(1e-9, ...kw.values())
      const semVals = [...sem.values()]
      const semMax = semVals.length ? Math.max(...semVals) : 0
      const semMin = semVals.length ? Math.min(...semVals) : 0
      const scored = records
        .map(r => {
          const k = (kw.get(r.id) ?? 0) / kwMax
          const s =
            sem.has(r.id) && semMax > semMin ? (sem.get(r.id)! - semMin) / (semMax - semMin) : 0
          const score = qv ? 0.65 * s + 0.35 * k : k
          return { r, score }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      if (!scored.length)
        return text(`Nothing in the lab matches "${query}". Try other words, or a family listing.`)
      const note = qv
        ? ''
        : index.vectors.size
          ? '\n(keyword match only: the embedding call failed)'
          : '\n(keyword match only: embeddings.json not built)'
      return text(
        `Effects for "${query}":${note}\n` +
          scored.map((x, i) => hitLine(i, x.r)).join('\n') +
          `\n\nmotion_effects({ slug }) returns one whole — meta, source, and the strip of frames to look at.`,
      )
    },
  })
}
