/**
 * The effects lab as commands — `pitch effects list|search|show|families`,
 * and every family as a subcommand of its own: `pitch effects text list`,
 * `pitch effects logos show <slug>`. The families are the directories, so a
 * new one is a new subcommand the moment it exists (see registry.ts Groups).
 *
 * Discovery returns shortlists, show returns study notes, and --source gives
 * implementation only after selection. Shared porting guidance lives once in
 * the launch skill's references rather than repeating with every effect.
 *
 * The filesystem is the index: no network or prebuilt embeddings. Drop an
 * effect in with index.html and meta.json and the next list/search sees it.
 * Families let an agent browse beyond keyword matches without loading every
 * demo page. The complete shelf is still available with --limit 0.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Script } from 'node:vm'
import { EFFECTS_DIR, SKILLS_DIR } from '../lib/paths.ts'
import { FAMILY_GUIDE } from './effect-families.ts'
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
  let sig = mtime(EFFECTS_DIR) + mtime(join(EFFECTS_DIR, 'catalog.json'))
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
        moves: [
          ...new Set([
            ...(Array.isArray(meta.moves) ? meta.moves : []),
            ...(Array.isArray(cat?.tags) ? cat.tags : []),
          ]),
        ].filter((tag): tag is string => typeof tag === 'string'),
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
    add(r.adapt, 1)
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

/** A compact discovery row; implementation is fetched only after choosing. */
export function line(e: Effect): string {
  const secs = e.seconds ? ` ${e.seconds}s` : ''
  const libs = e.libs.length ? ` [${e.libs.join(' ')}]` : ''
  return `${e.id}${secs}${libs}\n  ${e.move ?? e.description}`
}

const PORTING_GUIDE = join(SKILLS_DIR, 'launch-video', 'references', 'effects.md')
const SOURCE_RECEIPT = join('.studio', 'effect-sources.json')

function recordSourceInspection(cwd: string, id: string): void {
  const file = join(cwd, SOURCE_RECEIPT)
  const current = readJson(file)
  const effects = new Set<string>(Array.isArray(current?.effects) ? current.effects : [])
  effects.add(id)
  mkdirSync(join(cwd, '.studio'), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ version: 1, effects: [...effects].sort() }, null, 2)}\n`)
}

/** Study the mechanism without loading a demo's placeholder HTML/CSS/JS. */
export function study(e: Effect): string {
  const dir = join(EFFECTS_DIR, e.id)
  return [
    `# ${e.name}  —  ${e.id}`,
    `${e.seconds ?? '?'}s; ${e.size ?? '1280x720'}; loop: ${e.loop ?? '?'}; fidelity: ${e.fidelity ?? '?'}`,
    `The move: ${e.move || e.description || '(no notes yet — inspect the source)'}`,
    e.how ? `\nHow: ${e.how}` : '',
    e.moves.length ? `\nMoves: ${e.moves.join(', ')}` : '',
    e.libs.length ? `Libs: ${e.libs.join(', ')}` : '',
    e.adapt ? `\nAdaptation notes (original study): ${e.adapt}` : '',
    e.port ? `\nImplementation notes: ${e.port}` : '',
    e.caveats.length ? `\nCaveats: ${e.caveats.join('; ')}` : '',
    `\nFrames: ${join(dir, 'strip.jpg')} — read to judge the movement and composition.`,
    `Source when implementing: pitch effects show ${e.id} --source`,
    `Shared integration guide (read once): ${PORTING_GUIDE}`,
    'Do not add a lab citation from this code-free card; inspect the source first.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** This authored bundle keeps one complete preset on each line. Keep its
 * shared setup and registration, omitting other presets. If its structure
 * changes, return the original source rather than a guessed implementation.
 */
export function selectPrimitive(source: string, preset: string): string {
  const lines = source.split('\n')
  const key = (line: string) => /^if\(P===['"]([^'"]+)['"]\)\{/.exec(line.trim())?.[1]
  const branches = lines.filter(line => key(line))
  if (
    !branches.some(line => key(line) === preset) ||
    branches.some(line => !line.trim().endsWith('}'))
  )
    return source
  const selected = lines.filter(line => !key(line) || key(line) === preset).join('\n')
  try {
    new Script(selected) // Parse only; never execute the effect on the host.
    return selected
  } catch {
    return source
  }
}

/** Exact source on demand, without repeating the study or integration guide. */
export function effectSource(e: Effect): string {
  const file = join(EFFECTS_DIR, e.id, 'index.html')
  const src = readFileSync(file, 'utf8').trim()
  const blocks = [
    `# ${e.id} — source (${e.size ?? '1280x720'})`,
    `## ${file}`,
    '```html',
    src,
    '```',
  ]
  // These pages are only launchers. Returning the launcher alone hides the
  // actual movement; returning the whole bundle loads every unrelated preset.
  const preset = /data-preset=["']([^"']+)["']/.exec(src)?.[1]
  if (preset && /src=["']\.\.\/\.\.\/_lib\/launch-primitives\.js["']/.test(src)) {
    const shared = join(EFFECTS_DIR, '_lib', 'launch-primitives.js')
    const bundle = readFileSync(shared, 'utf8')
    const selected = selectPrimitive(bundle, preset)
    blocks.push(
      `## ${shared} — ${selected === bundle ? 'full bundle (could not isolate preset)' : `preset ${preset} + shared setup`}`,
      '```js',
      selected,
      '```',
    )
  }
  blocks.push(
    `Shared integration guide (read once): ${PORTING_GUIDE}`,
    `If derived from this implementation: lab: "${e.id}"`,
  )
  return blocks.join('\n')
}

function familyCounts(effects: Effect[]): string {
  const counts = new Map<string, number>()
  for (const e of effects) counts.set(e.family, (counts.get(e.family) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f} (${n})`)
    .join(', ')
}

/** Cover families round-robin, then different tagged mechanisms within each family.
 * This is an exploration order, not a ranking of quality or complexity. Every
 * effect remains reachable with pagination, including ones with sparse metadata.
 */
export function explorationOrder(effects: Effect[]): Effect[] {
  const groups = new Map<string, Effect[]>()
  for (const effect of effects) {
    const rows = groups.get(effect.family) ?? []
    rows.push(effect)
    groups.set(effect.family, rows)
  }
  const seen = new Map<string, Set<string>>()
  const result: Effect[] = []
  while (result.length < effects.length) {
    for (const [family, remaining] of groups) {
      if (!remaining.length) continue
      const tags = seen.get(family) ?? new Set<string>()
      const novelty = (effect: Effect) => new Set(effect.moves.filter(tag => !tags.has(tag))).size
      let best = 0
      for (let i = 1; i < remaining.length; i++) {
        if (novelty(remaining[i]) > novelty(remaining[best])) best = i
      }
      const [chosen] = remaining.splice(best, 1)
      for (const tag of chosen.moves) tags.add(tag)
      seen.set(family, tags)
      result.push(chosen)
    }
  }
  return result
}

/** A live, descriptive table of contents. New families need no registration. */
export function familyIndex(effects: Effect[]): string {
  const names = [...new Set(effects.map(e => e.family))].sort()
  const rows = names.map(family => {
    const members = effects.filter(e => e.family === family)
    const tags = new Map<string, number>()
    for (const member of members) {
      for (const tag of new Set(member.moves)) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
    const topTags = [...tags]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag)
    const examples = explorationOrder(members)
      .slice(0, 2)
      .map(e => e.id)
    return (
      `${family} (${members.length}) — ${FAMILY_GUIDE[family] ?? 'New collection; use the examples and tags to explore its mechanisms.'}\n` +
      (topTags.length ? `  Moves/tags: ${topTags.join(', ')}\n` : '') +
      `  Examples: ${examples.join(', ')}`
    )
  })
  return (
    `${effects.length} effects across ${names.length} families. Live discovery index; examples are entry points, not recommendations.\n\n${rows.join('\n\n')}\n\n` +
    'Explore: pitch effects browse (cross-family), pitch effects <family> browse (different mechanisms), or pitch effects <family> list --limit 0 (complete family).\n' +
    'Search words from these moves/tags; show <id> returns study notes and a strip to read. Fetch --source only after choosing.'
  )
}

function pageRows(
  rows: Effect[],
  p: Record<string, any>,
): { shown: Effect[]; range: string; next: string } {
  const offset = p.offset === undefined ? 0 : Number(p.offset)
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error('offset must be a non-negative integer')
  const limit = rowLimit(p.limit, rows.length)
  const shown = rows.slice(offset, offset + limit)
  const end = offset + shown.length
  return {
    shown,
    range: shown.length
      ? `${offset + 1}–${end} of ${rows.length}`
      : `0 of ${rows.length} (offset ${offset})`,
    next:
      end < rows.length
        ? `More available: repeat this command with --offset ${end} --limit ${limit}, or --offset 0 --limit 0 for all matches.`
        : 'End of matches. Explore another family or query as useful.',
  }
}

const out = (text: string) => ({ content: [{ type: 'text' as const, text }], details: {} })

function rowLimit(value: unknown, total: number): number {
  const limit = value === undefined ? 12 : Number(value)
  if (!Number.isInteger(limit) || limit < 0) throw new Error('limit must be a non-negative integer')
  return limit === 0 ? total : limit
}

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
      limit: { type: 'integer', minimum: 0, description: 'Max rows (default 12; 0 = all).' },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Skip this many rows to continue exploring (default 0).',
      },
    },
  }

  return [
    {
      verb: 'browse',
      description:
        'Explore different motion possibilities before choosing a mechanism. Rotates across families ' +
        'and prioritizes unseen move tags within each family. This is coverage, not a quality ranking. ' +
        'Use --offset to continue, --family to explore a collection, or --limit 0 for the complete shelf.',
      parameters,
      async execute(_id, p: any) {
        const rows = explorationOrder(filtered(p))
        const { shown, range, next } = pageRows(rows, p)
        return out(
          `Exploration: ${range} effects.\n\n${shown.map(line).join('\n')}\n\n${next}\n` +
            'Use pitch effects families for the full map. Study candidates with show and read their frame strips before choosing.',
        )
      },
    },
    {
      verb: 'list',
      description:
        'Browse the effects knowledge base: id, length, libraries and the move each makes. ' +
        'Use when you need more detail than the inventory in the launch skill; filter with --family, --moves or --libs. ' +
        'Returns 12 rows by default; --limit 0 lists all. Study selected effects with show, then fetch source only when implementing.',
      parameters,
      async execute(_id, p: any) {
        const all = loadEffects()
        const rows = filtered(p)
        const { shown, range, next } = pageRows(rows, p)
        if (!shown.length) {
          return out(
            `${range}. ${all.length} effects; families: ${familyCounts(all)}. Try --offset 0 or different filters.`,
          )
        }
        const head =
          shown.length === all.length
            ? `${all.length} effects in the lab.`
            : `${rows.length} of ${all.length} effects; showing ${range}.`
        return out(
          `${head}\n\n${shown.map(line).join('\n')}\n\n` +
            '`pitch effects show <id>` returns study notes and a frame-strip path; --source returns the implementation.' +
            `\n${next}`,
        )
      },
    },
    {
      verb: 'search',
      description:
        'Effects matching words, best first. Describe the MOVE a beat needs — "a card flipping ' +
        'to reveal a price", "lines colliding then snapping out" — not a template name. ' +
        'Keyword scoring over the move, tags and notes. Start with a focused query, study a few matches, then adapt the useful mechanisms to the product.',
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
        const ranked = score(filtered(p), query)
        const { shown, range, next } = pageRows(
          ranked.map(hit => hit.effect),
          p,
        )
        if (!ranked.length) {
          return out(
            `Nothing matches "${query}". This is keyword search, not semantic matching. Try related move words, pitch effects families, or pitch effects browse.`,
          )
        }
        return out(
          `Effects for "${query}" (${range}):\n\n${shown.map(line).join('\n')}\n\n${next}\n` +
            '`pitch effects show <id>` returns study notes; add --source only for an implementation you will adapt.',
        )
      },
    },
    {
      verb: 'show',
      description:
        'Study one effect: its visual mechanism, timing, adaptation notes, caveats and frame-strip path. ' +
        'Default output has no source code or repeated runtime instructions. Read the strip to judge the effect. ' +
        'Use --source for the actual implementation after choosing what to adapt; this returns source instead of repeating the notes.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'A listed family/slug id — or just the slug after `pitch effects <family>`. Positional.',
          },
          family: { type: 'string', description: 'The family a bare slug belongs to.' },
          source: {
            type: 'boolean',
            description: 'Return implementation source instead of study notes.',
          },
        },
        required: ['id'],
      },
      async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
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
        if (!p.source) return out(study(hit))
        const source = effectSource(hit)
        recordSourceInspection(ctx.cwd, hit.id)
        return out(`${source}\n\nSource inspection recorded for ${hit.id}.`)
      },
    },
    {
      verb: 'families',
      description:
        'Optional live family guide: descriptions, counts, move tags and example IDs. The launch skill already contains the complete effect inventory.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        const all = loadEffects()
        return out(familyIndex(all))
      },
    },
  ]
}
