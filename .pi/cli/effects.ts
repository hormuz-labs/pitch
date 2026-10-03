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
export function searchEffects(effects: Effect[], query: string, family?: string): Effect[] {
  const q = words(query)
  const pool = family ? effects.filter(e => e.family === family) : effects
  if (!q.length) return pool
  const scored = pool.map(e => {
    const fields: [string, number][] = [
      [`${e.name} ${e.moves.join(' ')}`, 3],
      [e.move, 2],
      [`${e.description} ${e.meta.how ?? ''} ${e.family}`, 1],
    ]
    const score = q.reduce(
      (s, w) =>
        s + fields.reduce((f, [t, wt]) => f + (words(t).some(x => x.startsWith(w)) ? wt : 0), 0),
      0,
    )
    return { e, score }
  })
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
    .map(x => x.e)
}

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
