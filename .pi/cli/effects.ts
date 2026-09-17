/**
 * The effects lab as commands — `pitch effects list|search|show|families`,
 * and every family as a subcommand of its own: `pitch effects text list`,
 * `pitch effects logos show <slug>`. The families are the directories, so a
 * new one is a new subcommand the moment it exists (see registry.ts Groups).
 *
 * What changed, and why. The lab used to be searched by Gemini embeddings
 * over a prebuilt index: `effects/build-search.mjs` wrote search.json and
 * embeddings.json, the host embedded the query, and the agent got the eight
 * nearest. Three problems, all measured on one 30-second film:
 *
 *   - It cost more than it saved. Ten `motion_effects` calls returned 9.5k
 *     tokens of results — five top-k probes and five whole effects — because
 *     eight blind guesses per query is not enough to choose from, so the
 *     agent queried again with other words. The whole lab as one line each is
 *     about the same number of tokens, read once, and then it has SEEN the
 *     shelf instead of guessing at it.
 *   - It was a network call inside a tool that must not need one. When the
 *     key was missing or the request timed out the tool apologised in its own
 *     output — "(keyword match only: the embedding call failed)" — and the
 *     agent silently got worse results.
 *   - It went stale. An effect added to effects/ did not exist until someone
 *     remembered to re-run build-search.mjs. The lab is a directory; the
 *     directory should be the index.
 *
 * So the index is the filesystem, re-read whenever a family directory
 * changes. Drop a new effect in with an index.html and a meta.json and the
 * next `pitch effects list` has it. Search is the keyword scoring that was
 * always there, now on its own.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EFFECTS_DIR } from '../lib/paths.ts'
import type { CommandSpec } from './registry.ts'

export interface Effect {
  /** `family/slug`, selected for the current treatment. */
  id: string
  family: string
  slug: string
  name: string
  seconds: number | null
  description: string
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
  jitterUrl: string | null
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const mtime = (file: string): number => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

const titleize = (slug: string) =>
  slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

/** The families — the directories: everything but `_lib`, `_batches` and the build scripts. */
export function families(): string[] {
  if (!existsSync(EFFECTS_DIR)) return []
  return readdirSync(EFFECTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort()
}

/**
 * A number that changes when an effect is added, removed or edited. A new
 * family bumps the lab root; a new slug bumps its family; but editing an
 * effect's meta.json or page bumps neither, so those two files are stat'd
 * too. About a thousand stats, a few milliseconds, once per call — and the
 * alternative was a note telling people to restart the API after editing a
 * note.
 */
function signature(): number {
  let sig = mtime(EFFECTS_DIR)
  for (const family of families()) {
    const famDir = join(EFFECTS_DIR, family)
    sig += mtime(famDir)
    let slugs: string[] = []
    try {
      slugs = readdirSync(famDir)
    } catch {
      continue
    }
    for (const slug of slugs) {
      sig += mtime(join(famDir, slug, 'meta.json')) + mtime(join(famDir, slug, 'index.html'))
    }
  }
  return sig
}

let cached: { sig: number; effects: Effect[] } | null = null

/** Every built effect on disk. Re-scanned only when the lab has changed. */
export function loadEffects(): Effect[] {
  const sig = signature()
  if (cached && cached.sig === sig) return cached.effects

  // catalog.json carries the Jitter metadata (name, blurb, target length) for
  // the templates that came from there. It is enrichment, never the index:
  // an effect written by hand is not in it and must still be listed.
  const catalog: any[] = readJson(join(EFFECTS_DIR, 'catalog.json')) ?? []
  const byId = new Map<string, any>()
  for (const c of catalog) {
    if (c?.familySlug && c?.slug) byId.set(`${c.familySlug}/${c.slug}`, c)
  }

  const effects: Effect[] = []
  for (const family of families()) {
    const famDir = join(EFFECTS_DIR, family)
    let slugs: string[] = []
    try {
      slugs = readdirSync(famDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
    } catch {
      continue
    }
    for (const slug of slugs) {
      const dir = join(famDir, slug)
      // An effect is a page. Without one there is nothing to port.
      if (!existsSync(join(dir, 'index.html'))) continue
      const meta = readJson(join(dir, 'meta.json')) ?? {}
      const cat = byId.get(`${family}/${slug}`)
      const render = readJson(join(dir, 'render.json'))
      effects.push({
        id: `${family}/${slug}`,
        family,
        slug,
        name: cat?.name ?? titleize(slug),
        seconds: cat?.seconds ?? render?.duration ?? null,
        description: cat?.description ?? meta.move ?? '',
        move: meta.move ?? null,
        how: meta.how ?? null,
        moves: Array.isArray(meta.moves) ? meta.moves : [],
        libs: Array.isArray(meta.libs) ? meta.libs : [],
        adapt: meta.adapt ?? null,
        port: meta.port ?? null,
        caveats: Array.isArray(meta.caveats) ? meta.caveats : [],
        fidelity: meta.fidelity ?? null,
        loop: meta.loop ?? null,
        size: meta.size ?? null,
        jitterUrl: cat?.jitterUrl ?? null,
      })
    }
  }
  cached = { sig, effects }
  return effects
}

// ── search ───────────────────────────────────────────────────────────────────

const tokens = (s: string | null | undefined): string[] =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 1)

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '')

/**
 * Weighted term frequency × inverse document frequency over the fields that
 * carry the move. This is what the hybrid scorer fell back to whenever the
 * embedding call failed, which on a keyless host was every time.
 */
export function score(effects: Effect[], query: string): { effect: Effect; score: number }[] {
  const q = [...new Set(tokens(query).map(stem))]
  if (!q.length) return []
  const docs = effects.map(r => {
    const bag = new Map<string, number>()
    const add = (text: string | null | undefined, w: number) => {
      for (const t of tokens(text)) {
        const s = stem(t)
        bag.set(s, (bag.get(s) ?? 0) + w)
      }
    }
    add(r.name, 3)
    add(r.family, 2)
    add(r.move, 3)
    add(r.moves.join(' '), 2)
    add(r.libs.join(' '), 1)
    add(r.how, 1)
    add(r.description, 1)
    return bag
  })
  const df = new Map<string, number>()
  for (const bag of docs) for (const t of bag.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const n = effects.length || 1
  return effects
    .map((effect, i) => {
      let s = 0
      for (const t of q) {
        const tf = docs[i].get(t)
        if (tf) s += Math.log1p(tf) * Math.log(1 + n / (df.get(t) ?? 1))
      }
      return { effect, score: s }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
}

// ── rendering ────────────────────────────────────────────────────────────────

/** One line: enough to choose from, short enough to print all 409. */
export function line(e: Effect): string {
  const secs = e.seconds ? ` ${e.seconds}s` : ''
  const libs = e.libs.length ? ` [${e.libs.join(' ')}]` : ''
  return `${e.id}${secs}${libs}\n  ${e.move ?? e.description}`
}

/** One effect whole: its notes, its source, and where its frames are. */
export function whole(e: Effect): string {
  const dir = join(EFFECTS_DIR, e.id)
  let src = ''
  try {
    src = readFileSync(join(dir, 'index.html'), 'utf8').trim()
  } catch {
    src = '(no index.html)'
  }
  return [
    `# ${e.name}  —  ${e.id}`,
    `${e.seconds ?? '?'}s; ${e.size ?? '1280x720'}; loop: ${e.loop ?? '?'}; fidelity: ${e.fidelity ?? '?'}`,
    'Source study: the notes below describe the original effect. Adapt its composition, material and timing to direction.md; preserve it faithfully only when the treatment or user calls for that.',
    e.description ? `\n${e.description}` : '',
    e.move ? `\nThe move: ${e.move}` : '',
    e.how ? `\nHow: ${e.how}` : '',
    e.moves.length ? `\nMoves: ${e.moves.join(', ')}` : '',
    e.libs.length ? `Libs: ${e.libs.join(', ')}` : '',
    e.adapt ? `\nTo make it the product's: ${e.adapt}` : '',
    e.port ? `\nTo port into js/shots.custom.js: ${e.port}` : '',
    e.caveats.length ? `\nCaveats: ${e.caveats.join('; ')}` : '',
    '',
    `Frames: ${join(dir, 'strip.jpg')} — 8 frames across the loop, look at it before you port.`,
    `Poster: ${join(dir, 'poster.jpg')}`,
    '',
    `## ${join(dir, 'index.html')}`,
    '```html',
    src,
    '```',
    '',
    `The page loads GSAP from ../../../assets/gsap/ and its own ../../_lib/fx.js; in the film those plugins are already registered by the scaffold, fx.timeline({duration}) becomes the gsap.timeline() your factory returns, and every time is a fraction of D. Rebuild the placeholder content with the product's own — and put \`lab: "${e.id}"\` on the shot that uses it.`,
    'Masks: an `overflow: hidden` reveal at line-height ≤ 1 can cut descenders and accents at hero size. Give the mask `padding: .16em .08em .24em; margin: -.16em -.08em -.24em` and start hidden text at yPercent 140 when needed. Check the adapted layout at delivery size. A 1280×720 source scales to 1920×1080 by 1.5; element count, arrangement, type and timing may change to serve the treatment. Record substantial adaptations alongside the lab citation.',
  ]
    .filter(l => l !== '')
    .join('\n')
}

function familyCounts(effects: Effect[]): string {
  const counts = new Map<string, number>()
  for (const e of effects) counts.set(e.family, (counts.get(e.family) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f} (${n})`)
    .join(', ')
}

const out = (text: string) => ({ content: [{ type: 'text' as const, text }], details: {} })

/** Filter by family / moves / libs, in that order. */
function filtered(p: Record<string, any>): Effect[] {
  let effects = loadEffects()
  if (p.family) {
    const fam = String(p.family).toLowerCase().trim()
    effects = effects.filter(e => e.family === fam)
  }
  for (const key of ['moves', 'libs'] as const) {
    const want = (p[key] as string[] | undefined)?.map(m => m.toLowerCase())
    if (!want?.length) continue
    effects = effects.filter(e => want.every(m => e[key].some(v => v.toLowerCase() === m)))
  }
  return effects
}

/** The lab's commands. Their descriptions are help text a reader asks for, not schema shipped on every request. */
export default function effectsCommands(): CommandSpec[] {
  const parameters = {
    type: 'object',
    properties: {
      family: { type: 'string', description: 'Only this family, e.g. text, logos, backgrounds.' },
      moves: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only effects tagged with every one of these, e.g. flip-3d.',
      },
      libs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only effects built with every one of these, e.g. three, SplitText.',
      },
      limit: { type: 'integer', description: 'Cap the rows printed.' },
    },
  }

  return [
    {
      verb: 'list',
      description:
        'Every effect in the lab, one line each: id, length, libraries and the move it makes. ' +
        'Browse after choosing a visual treatment when you need implementation ideas. ' +
        'Narrow with --family, --moves, --libs; built-ins and bespoke animation are equally valid.',
      parameters,
      async execute(_id, p: any) {
        const all = loadEffects()
        const rows = filtered(p)
        const limit = Number(p.limit) || rows.length
        const shown = rows.slice(0, limit)
        if (!shown.length) {
          return out(`Nothing matches. ${all.length} effects; families: ${familyCounts(all)}`)
        }
        const head =
          shown.length === all.length
            ? `${all.length} effects in the lab.`
            : `${rows.length} of ${all.length} effects${shown.length < rows.length ? `, first ${shown.length}` : ''}.`
        return out(
          `${head}\n\n${shown.map(line).join('\n')}\n\n` +
            '`pitch effects show <id>` returns one whole — notes, source and its frame strip.',
        )
      },
    },
    {
      verb: 'search',
      description:
        'Effects matching words, best first. Describe the MOVE a beat needs — "a card flipping ' +
        'to reveal a price", "lines colliding then snapping out" — not a template name. ' +
        'Keyword scoring over the move, the tags and the notes; `list` is often better.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What the beat needs, as words. Positional: `pitch effects search <…>`.',
          },
          ...parameters.properties,
        },
        required: ['query'],
      },
      async execute(_id, p: any) {
        const query = String(p.query ?? '')
        const hits = score(filtered(p), query).slice(0, Number(p.limit) || 12)
        if (!hits.length) {
          return out(
            `Nothing matches "${query}". Try other words, or read the shelf: pitch effects list --family <one>`,
          )
        }
        return out(
          `Effects for "${query}":\n\n${hits.map(h => line(h.effect)).join('\n')}\n\n` +
            '`pitch effects show <id>` returns one whole.',
        )
      },
    },
    {
      verb: 'show',
      description:
        'One effect whole: its notes, how it is built, how to adapt it, its full source and the ' +
        'path to its frame strip. Look at the strip before you port it.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'A listed family/slug id — or just the slug after `pitch effects <family>`. Positional.',
          },
          family: { type: 'string', description: 'The family a bare slug belongs to.' },
        },
        required: ['id'],
      },
      async execute(_id, p: any) {
        let want = String(p.id ?? '')
          .trim()
          .replace(/^\/+|\/+$/g, '')
        if (p.family && !want.includes('/'))
          want = `${String(p.family).toLowerCase().trim()}/${want}`
        const effects = loadEffects()
        const hit =
          effects.find(e => e.id === want) ??
          effects.find(e => e.slug === want) ??
          effects.find(e => e.name.toLowerCase() === want.toLowerCase())
        if (!hit) {
          return out(
            `No effect "${want}". Ids are family/slug — list them with: pitch effects list`,
          )
        }
        return out(whole(hit))
      },
    },
    {
      verb: 'families',
      description: 'The families and how many effects are in each.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        const all = loadEffects()
        return out(`${all.length} effects.\nFamilies: ${familyCounts(all)}`)
      },
    },
  ]
}
