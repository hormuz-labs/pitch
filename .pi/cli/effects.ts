/**
 * The effects library — `pitch effects families|search|show`. Every effect
 * is a page (`effects/<family>/<slug>/index.html`) with its study notes
 * (`meta.json`: the move, how it is built, how to port it) and a frame strip.
 * The directories are the index: an effect dropped in is found on the next
 * call. Search returns a shortlist with one contact sheet of the results'
 * frame strips, so choosing between six candidates is one image read; show
 * returns one effect's notes and its page, read only to port it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Type } from '@sinclair/typebox'
import { EFFECTS_DIR, workspaceOf } from '../lib/paths.ts'
import { text } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

const FAMILIES: Record<string, string> = {
  ads: 'promotional sequences',
  backgrounds: 'ambient fields and textures behind a subject',
  'before-and-after': 'comparisons and state changes',
  'blend-modes': 'colour, imagery and type compositing',
  blur: 'defocus, speed and blurred reveals',
  brand: 'brand-film studies: type, objects and transitions together',
  buttons: 'control feedback and button states',
  charts: 'data drawing and chart assembly',
  counters: 'numbers, countdowns and metric changes',
  devices: 'product screens in devices and perspective',
  effects: 'graphic treatments',
  gradients: 'colour-field motion',
  icons: 'icon animation and state changes',
  launch: 'choreography, springs, scale, wipes and generative fields',
  'launch-primitives': 'launch mechanisms to combine',
  'launch-studies': 'multi-beat product films: UI cameras, journeys, handoffs',
  logos: 'mark reveals and logo choreography',
  morph: 'shapes and paths becoming other shapes',
  showreels: 'montage structures',
  'social-media': 'social-format announcements',
  text: 'typography: masks, rhythm, splits and transformations',
  'the-click': 'controls, glass, menus and search reveals',
  'the-edit': 'nested-image compositions',
  'the-prompt': 'generative-AI feature presentation',
  'the-route': 'maps, carousels and travel reveals',
  'the-stack': 'releases, partnerships, testimonials, events',
  'the-track': 'metrics, records and app promos',
  'the-vault': 'animated cards',
  'ui-elements': 'interface components and product states',
  uncategorised: 'mixed studies',
  'video-titles': 'title sequences',
  websites: 'website presentation',
}

export interface Effect {
  id: string
  family: string
  name: string
  description: string
  move: string
  moves: string[]
  meta: Record<string, unknown>
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const subdirs = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !/^[_.]/.test(e.name))
    .map(e => e.name)
    .sort()

/** Every effect on disk; catalog.json only adds names and descriptions. */
export function loadEffects(root = EFFECTS_DIR): Effect[] {
  if (!existsSync(root)) return []
  const catalog = new Map<string, any>(
    (readJson(join(root, 'catalog.json')) ?? []).map((c: any) => [`${c.familySlug}/${c.slug}`, c]),
  )
  return subdirs(root).flatMap(family =>
    subdirs(join(root, family))
      .filter(slug => existsSync(join(root, family, slug, 'index.html')))
      .map(slug => {
        const id = `${family}/${slug}`
        const meta = readJson(join(root, family, slug, 'meta.json')) ?? {}
        const cat = catalog.get(id)
        return {
          id,
          family,
          name: cat?.name ?? slug.replace(/-/g, ' '),
          description: cat?.description ?? '',
          move: meta.move ?? '',
          moves: Array.isArray(meta.moves) ? meta.moves : [],
          meta,
        }
      }),
  )
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? []

// Words that say nothing about a move. As prefixes they matched nearly every
// note ("a" matched "and", "across", "at"), so they decided the ranking.
const STOP = new Set(
  'a an and as at be by for from in into is it its of on onto or over that the then this to up with while out off one two three each its their them when where which'.split(
    ' ',
  ),
)

/** One stem for rise/rises/rising, card/cards, mask/masked, becomes/becoming. */
export function stem(w: string): string {
  let s = w
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`
  else if (s.length > 4 && /(ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 4 && s.endsWith('ly')) s = s.slice(0, -2)
  if (s.length > 3 && /([^aeiouls])\1$/.test(s)) s = s.slice(0, -1)
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}
const terms = (s: string) =>
  words(s)
    .filter(w => !STOP.has(w))
    .map(stem)

// Words the agent and the notes use for the same thing; a synonym counts half.
const SYNONYMS = [
  ['morph', 'becom', 'transform', 'turn'],
  ['click', 'tap', 'press'],
  ['phon', 'mobil', 'iphon', 'smartphon'],
  ['reveal', 'appear', 'emerg', 'enter'],
  ['zoom', 'push', 'dolly'],
  ['counter', 'count', 'number', 'metric'],
  ['chart', 'graph'],
  ['pill', 'capsul', 'chip'],
  ['logo', 'mark', 'wordmark'],
  ['check', 'tick', 'checkmark'],
  ['notification', 'alert', 'toast', 'banner'],
  ['typewriter', 'typ', 'caret'],
  ['text', 'typ', 'word', 'letter', 'headlin', 'titl'],
].map(g => g.map(stem))

interface Doc {
  e: Effect
  fields: { terms: Map<string, number>; len: number; weight: number }[]
  all: Set<string>
}
// name and tags, the one-line move, the catalogue blurb, the build notes
const WEIGHTS = [3, 2, 1.5, 1]

function index(effects: Effect[]) {
  const docs: Doc[] = effects.map(e => {
    const fields = [
      `${e.name} ${e.moves.join(' ')}`,
      e.move,
      e.description,
      `${e.meta.how ?? ''} ${e.family}`,
    ].map((t, i) => {
      const counts = new Map<string, number>()
      const ts = terms(t)
      for (const w of ts) counts.set(w, (counts.get(w) ?? 0) + 1)
      return { terms: counts, len: ts.length, weight: WEIGHTS[i] }
    })
    return { e, fields, all: new Set(fields.flatMap(f => [...f.terms.keys()])) }
  })
  const avg = WEIGHTS.map(
    (_, i) => docs.reduce((n, d) => n + d.fields[i].len, 0) / Math.max(1, docs.length),
  )
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.all) df.set(t, (df.get(t) ?? 0) + 1)
  return { docs, avg, df }
}

/**
 * Effects ranked for a query: BM25 over the notes' fields, so a rare word
 * ("morph") outweighs a common one ("card") and a long note does not win by
 * length. Without a family, each further result from a family already shown
 * counts for less, so a page of six spans the library instead of one corner.
 */
export function searchEffects(effects: Effect[], query: string, family?: string): Effect[] {
  const pool = family ? effects.filter(e => e.family === family) : effects
  const wanted = new Map<string, number>()
  for (const q of terms(query)) {
    wanted.set(q, 1)
    for (const group of SYNONYMS)
      if (group.includes(q)) for (const syn of group) if (!wanted.has(syn)) wanted.set(syn, 0.5)
  }
  if (!wanted.size) return pool
  const { docs, avg, df } = index(effects)
  const N = docs.length
  const inPool = new Set(pool.map(e => e.id))
  const scored = docs
    .filter(d => inPool.has(d.e.id))
    .map(d => {
      let score = 0
      for (const [q, boost] of wanted) {
        // the term itself, or a longer word it begins ("anim" → "animate")
        const hit = (t: string) => t === q || (q.length >= 5 && t.startsWith(q))
        const matches = [...d.all].filter(hit)
        if (!matches.length) continue
        const n = Math.max(...matches.map(t => df.get(t) ?? 0))
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        d.fields.forEach((f, i) => {
          const tf = matches.reduce((c, t) => c + (f.terms.get(t) ?? 0), 0)
          if (tf)
            score +=
              boost * idf * f.weight * ((tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * f.len) / avg[i])))
        })
      }
      return { e: d.e, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
  if (family) return scored.map(x => x.e)
  const shown = new Map<string, number>()
  const out: Effect[] = []
  const left = [...scored]
  while (left.length) {
    let best = 0
    const value = (x: (typeof left)[number]) => x.score * 0.8 ** (shown.get(x.e.family) ?? 0)
    for (let i = 1; i < left.length; i++) if (value(left[i]) > value(left[best])) best = i
    const [pick] = left.splice(best, 1)
    shown.set(pick.e.family, (shown.get(pick.e.family) ?? 0) + 1)
    out.push(pick.e)
  }
  return out
}

/**
 * The results' frame strips stacked top to bottom, 1600px wide, in the
 * workspace where the agent can read it. Null when ffmpeg or the strips are
 * missing: the list still stands on its own.
 */
function contactSheet(ws: string, effects: Effect[], name: string): string | null {
  const strips = effects.map(e => join(EFFECTS_DIR, e.id, 'strip.jpg')).filter(f => existsSync(f))
  if (strips.length !== effects.length) return null
  const rel = `.studio/effects/${name}.jpg`
  mkdirSync(join(ws, '.studio/effects'), { recursive: true })
  const scaled = strips.map((_, i) => `[${i}]scale=1600:-2[s${i}]`).join(';')
  const stack =
    strips.length > 1
      ? `;${strips.map((_, i) => `[s${i}]`).join('')}vstack=inputs=${strips.length}`
      : ''
  try {
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        ...strips.flatMap(f => ['-i', f]),
        '-filter_complex',
        scaled + stack,
        '-frames:v',
        '1',
        '-q:v',
        '4',
        join(ws, rel),
      ],
      { stdio: 'ignore' },
    )
    return rel
  } catch {
    return null
  }
}

/** Rank by how many query words the effect's name, move, tags and notes contain. */
export default function effectCommands(): CommandSpec[] {
  return [
    {
      verb: 'families',
      description:
        'The families of the effects library, with what each holds and how many effects.',
      parameters: Type.Object({}),
      async execute() {
        const counts = new Map<string, number>()
        for (const e of loadEffects()) counts.set(e.family, (counts.get(e.family) ?? 0) + 1)
        return text(
          [...counts].map(([f, n]) => `${f} (${n}) — ${FAMILIES[f] ?? 'effects'}`).join('\n'),
        )
      },
    },
    {
      verb: 'search',
      description:
        'Find effects by the move you need ("mask reveal", "word stagger", "counter", "logo morph", "cursor click"): a numbered shortlist of ids with each one\'s move, and one contact sheet of their frame strips, top to bottom in the same order: read it to choose. Narrow with family. Then pitch effects show <id> for the one you port.',
      parameters: Type.Object({
        query: Type.String({ description: 'What should happen on screen' }),
        family: Type.Optional(
          Type.String({ description: 'Only this family (pitch effects families)' }),
        ),
        limit: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 12, description: 'Max results (default 6)' }),
        ),
        offset: Type.Optional(Type.Integer({ minimum: 0, description: 'Skip this many (paging)' })),
      }),
      async execute(_id, p: any, _signal, _onUpdate, ctx) {
        const hits = searchEffects(loadEffects(), p.query ?? '', p.family)
        const offset = p.offset ?? 0
        const page = hits.slice(offset, offset + (p.limit ?? 6))
        if (!page.length)
          return text(
            `No effects match${p.family ? ` in ${p.family}` : ''}. Try other words for the move, or pitch effects families.`,
          )
        const name =
          [p.family, ...words(p.query ?? ''), offset || '']
            .filter(Boolean)
            .join('-')
            .slice(0, 60) || 'all'
        const sheet = contactSheet(workspaceOf(ctx), page, name)
        return text(
          `${hits.length} match${hits.length === 1 ? '' : 'es'}:\n` +
            page
              .map((e, i) => `${i + 1}. ${e.id} — ${e.move || e.description || e.name}`)
              .join('\n') +
            (sheet ? `\nFrames, one strip per result in this order: ${sheet}` : ''),
        )
      },
    },
    {
      verb: 'show',
      description:
        "One effect's notes — the move, how it is built, how to port it into a shot type, what to adapt, caveats — plus its frame strip (read it to see the motion) and its page (read it to port it).",
      parameters: Type.Object({
        id: Type.String({ description: 'family/slug from search' }),
      }),
      async execute(_id, p: any) {
        const effect = loadEffects().find(e => e.id === p.id)
        if (!effect) throw new Error(`No effect ${p.id}. Find one with pitch effects search.`)
        const dir = join(EFFECTS_DIR, effect.id)
        const { move: _m, moves: _ms, render: _r, ...notes } = effect.meta as any
        return text(
          JSON.stringify(
            {
              id: effect.id,
              name: effect.name,
              move: effect.move || effect.description,
              tags: effect.moves,
              ...notes,
              strip: existsSync(join(dir, 'strip.jpg')) ? join(dir, 'strip.jpg') : null,
              page: join(dir, 'index.html'),
            },
            null,
            2,
          ),
        )
      },
    },
  ]
}
