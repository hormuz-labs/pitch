import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The lab is read off disk, so these tests build a lab on disk. The point
 * they defend is the one that broke before: an effect added to effects/ has
 * to appear without anyone re-running an index builder.
 */
let lab: string

vi.mock('../.pi/lib/paths.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../.pi/lib/paths.ts')>()
  return {
    ...actual,
    get EFFECTS_DIR() {
      return lab
    },
  }
})

const write = (dir: string, name: string, body: unknown) =>
  writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))

function addEffect(family: string, slug: string, meta: Record<string, unknown> = {}) {
  const dir = join(lab, family, slug)
  mkdirSync(dir, { recursive: true })
  write(dir, 'index.html', '<html><body>hi</body></html>')
  write(dir, 'meta.json', meta)
  return dir
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), 'effects-lab-'))
  vi.resetModules()
})
afterEach(() => rmSync(lab, { recursive: true, force: true }))

const load = async () => (await import('../.pi/cli/effects.ts')).loadEffects()

describe('the lab is the directory', () => {
  it('lists an effect that has only an index.html and a meta.json', async () => {
    addEffect('text', 'bold-snap', { move: 'a word snaps in', libs: ['gsap'] })
    const effects = await load()
    expect(effects.map(e => e.id)).toEqual(['text/bold-snap'])
    expect(effects[0].move).toBe('a word snaps in')
    // No catalog entry: the name comes from the directory.
    expect(effects[0].name).toBe('Bold Snap')
  })

  it('picks up an effect added after the first read, with no index rebuilt', async () => {
    addEffect('text', 'one')
    const { loadEffects } = await import('../.pi/cli/effects.ts')
    expect(loadEffects()).toHaveLength(1)

    addEffect('text', 'two')
    expect(
      loadEffects()
        .map(e => e.id)
        .sort(),
    ).toEqual(['text/one', 'text/two'])
  })

  it('picks up a whole new family', async () => {
    addEffect('text', 'one')
    const { loadEffects } = await import('../.pi/cli/effects.ts')
    loadEffects()
    addEffect('gizmos', 'spinner')
    expect(loadEffects().some(e => e.family === 'gizmos')).toBe(true)
  })

  it('skips a directory with no page — there is nothing to port', async () => {
    mkdirSync(join(lab, 'text', 'notes'), { recursive: true })
    write(join(lab, 'text', 'notes'), 'meta.json', { move: 'nothing' })
    expect(await load()).toHaveLength(0)
  })

  it("skips the lab's own _lib and _batches", async () => {
    mkdirSync(join(lab, '_lib', 'fx'), { recursive: true })
    write(join(lab, '_lib', 'fx'), 'index.html', '<html></html>')
    addEffect('text', 'real')
    expect((await load()).map(e => e.id)).toEqual(['text/real'])
  })

  it('takes name, blurb and length from catalog.json when the effect is in it', async () => {
    addEffect('text', 'bold-snap', { move: 'a word snaps in' })
    write(lab, 'catalog.json', [
      {
        familySlug: 'text',
        slug: 'bold-snap',
        name: 'Bold Text Snap',
        seconds: 4,
        description: 'From Jitter.',
      },
    ])
    const [e] = await load()
    expect(e.name).toBe('Bold Text Snap')
    expect(e.seconds).toBe(4)
    expect(e.description).toBe('From Jitter.')
  })
})

describe('search', () => {
  it('ranks by the words of the move, best first', async () => {
    addEffect('text', 'card-flip', { move: 'a card flips to reveal a price', moves: ['flip-3d'] })
    addEffect('text', 'fade', { move: 'a title fades up' })
    const { loadEffects, score } = await import('../.pi/cli/effects.ts')
    const hits = score(loadEffects(), 'card flipping to reveal a price')
    expect(hits[0].effect.id).toBe('text/card-flip')
  })

  it('finds nothing rather than everything when no word matches', async () => {
    addEffect('text', 'fade', { move: 'a title fades up' })
    const { loadEffects, score } = await import('../.pi/cli/effects.ts')
    expect(score(loadEffects(), 'quantum tunnelling')).toHaveLength(0)
  })

  it('needs no network and no key', async () => {
    // The old search embedded the query with Gemini and quietly degraded when
    // the call failed. Nothing here can fail that way.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    addEffect('text', 'card-flip', { move: 'a card flips' })
    const { loadEffects, score } = await import('../.pi/cli/effects.ts')
    score(loadEffects(), 'a card flips')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('the commands', () => {
  const ctx = { cwd: process.cwd() }
  const run = async (line: string, c = ctx) =>
    (await import('../.pi/cli/run.ts')).run(line, c).then(r => r.text)

  it('lists every effect with its move', async () => {
    addEffect('text', 'bold-snap', { move: 'a word snaps in', libs: ['gsap'] })
    const out = await run('effects list', ctx)
    expect(out).toContain('text/bold-snap')
    expect(out).toContain('a word snaps in')
    expect(out).toContain('[gsap]')
  })

  it('narrows by family, moves and libs', async () => {
    addEffect('text', 'a', { moves: ['flip-3d'], libs: ['three'] })
    addEffect('text', 'b', { moves: ['stagger'] })
    addEffect('logos', 'c', {})
    expect(await run('effects list --family logos', ctx)).toContain('logos/c')
    expect(await run('effects list --family logos', ctx)).not.toContain('text/a')
    expect(await run('effects list --moves flip-3d', ctx)).toContain('text/a')
    expect(await run('effects list --libs three', ctx)).not.toContain('text/b')
  })

  it('returns one effect whole, with its source and the path to its frames', async () => {
    addEffect('text', 'bold-snap', { move: 'a word snaps in', port: 'mount() then animate()' })
    const out = await run('effects show text/bold-snap', ctx)
    expect(out).toContain('<body>hi</body>')
    expect(out).toContain('mount() then animate()')
    expect(out).toContain('strip.jpg')
    expect(out).toContain('lab: "text/bold-snap"')
  })

  it('makes every family a subcommand, with a bare slug inside it', async () => {
    addEffect('text', 'a', {})
    addEffect('logos', 'c', {})
    expect(await run('effects logos list')).toContain('logos/c')
    expect(await run('effects logos list')).not.toContain('text/a')
    expect(await run('effects text show a')).toContain('lab: "text/a"')
    expect(await run('effects logos')).toContain('pitch effects logos list')
    expect(await run('effects --help')).toContain('logos, text')
  })

  it('takes a bare slug as well as a full id', async () => {
    addEffect('text', 'bold-snap', {})
    expect(await run('effects show bold-snap', ctx)).toContain('text/bold-snap')
  })

  it('says how to find ids when given one that does not exist', async () => {
    addEffect('text', 'bold-snap', {})
    expect(await run('effects show nope', ctx)).toContain('pitch effects list')
  })

  it('counts the families', async () => {
    addEffect('text', 'a', {})
    addEffect('text', 'b', {})
    addEffect('logos', 'c', {})
    const out = await run('effects families', ctx)
    expect(out).toContain('3 effects')
    expect(out).toContain('text (2)')
  })
})
