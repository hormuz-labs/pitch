import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The lab is read off disk, so these tests build a lab on disk. The point
 * they defend is the one that broke before: an effect added to effects/ has
 * to appear without anyone re-running an index builder.
 */
let lab: string
let workspace: string

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
  workspace = mkdtempSync(join(tmpdir(), 'effects-workspace-'))
  vi.resetModules()
})
afterEach(() => {
  rmSync(lab, { recursive: true, force: true })
  rmSync(workspace, { recursive: true, force: true })
})

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

  it('refreshes catalog-only edits and indexes tags alongside authored moves', async () => {
    addEffect('text', 'one', { moves: ['mask'] })
    write(lab, 'catalog.json', [{ familySlug: 'text', slug: 'one', tags: ['mask', 'unfold'] }])
    const { loadEffects, score } = await import('../.pi/cli/effects.ts')
    expect(loadEffects()[0].moves).toEqual(['mask', 'unfold'])
    write(lab, 'catalog.json', [{ familySlug: 'text', slug: 'one', tags: ['accordion'] }])
    const future = new Date(Date.now() + 2000)
    utimesSync(join(lab, 'catalog.json'), future, future)
    expect(score(loadEffects(), 'accordion')[0].effect.id).toBe('text/one')
    expect(loadEffects()[0].moves).not.toContain('unfold')
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

  it('finds a mechanism through its product adaptation notes', async () => {
    addEffect('icons', 'gather', { adapt: 'Turn fragmented tasks into a coordinated workflow.' })
    const { loadEffects, score } = await import('../.pi/cli/effects.ts')
    expect(score(loadEffects(), 'coordinated workflow')[0].effect.id).toBe('icons/gather')
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
  const ctx = {
    get cwd() {
      return workspace
    },
  }
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

  it('studies an effect without loading source or repeating common porting instructions', async () => {
    addEffect('text', 'bold-snap', { move: 'a word snaps in', port: 'mount() then animate()' })
    const out = await run('effects show text/bold-snap', ctx)
    expect(out).not.toContain('<body>hi</body>')
    expect(out).not.toContain('```html')
    expect(out).toContain('mount() then animate()')
    expect(out).toContain('strip.jpg')
    expect(out).not.toContain('lab: "text/bold-snap"')
    expect(out).toContain('inspect the source first')
    expect(out).toContain('references/effects.md')
    expect(out).toContain('pitch effects show text/bold-snap --source')
    expect(out).not.toContain('yPercent 140')
  })

  it('returns exact source on demand without repeating the study notes', async () => {
    const dir = addEffect('text', 'bold-snap', { how: 'A detailed study of the collision.' })
    const html =
      '<style>.word{clip-path:inset(0)}</style><div class="word">Hi</div>' +
      '<script>const tl = fx.timeline({duration:2}); tl.to(".word", {x:20});</script>'
    write(dir, 'index.html', html)
    const out = await run('effects show text/bold-snap --source')
    expect(out).toContain(html)
    expect(out).toContain('lab: "text/bold-snap"')
    expect(out).toContain('Source inspection recorded')
    expect(out).not.toContain('A detailed study of the collision.')
    expect(
      JSON.parse(readFileSync(join(workspace, '.studio', 'effect-sources.json'), 'utf8')),
    ).toEqual({
      version: 1,
      effects: ['text/bold-snap'],
    })
    expect(await run('effects show text/bold-snap --source false')).not.toContain(html)
  })

  it('keeps discovery bounded while allowing the whole shelf explicitly', async () => {
    for (let i = 0; i < 15; i++)
      addEffect('text', `item-${String(i).padStart(2, '0')}`, { move: 'colliding words' })
    const shortlist = await run('effects list')
    expect(shortlist).toContain('1–12 of 15')
    expect(shortlist).not.toContain('text/item-14')
    expect(await run('effects list --limit 0')).toContain('text/item-14')
    expect(await run('effects search colliding --limit 2')).not.toContain('text/item-02')
    expect(await run('effects search colliding --limit 0')).toContain('text/item-14')
  })

  it('lets exploration continue without repeating earlier list or search results', async () => {
    for (let i = 0; i < 5; i++) addEffect('text', `item-${i}`, { move: 'colliding words' })
    for (const command of ['list', 'search colliding', 'browse']) {
      const out = await run(`effects ${command} --offset 2 --limit 2`)
      expect(out).toContain('3–4 of 5')
      expect(out).toContain('--offset 4 --limit 2')
      expect(out).toContain('text/item-2')
      expect(out).not.toContain('text/item-0')
      const end = await run(`effects ${command} --offset 4 --limit 0`)
      expect(end).toContain('text/item-4')
      expect(end).toContain('End of matches')
      expect(await run(`effects ${command} --offset 99`)).toContain('0 of 5')
    }
  })

  it('browses across families and different mechanisms before repeating a move', async () => {
    addEffect('ads', 'a', { moves: ['slide'] })
    addEffect('ads', 'b', { moves: ['slide'] })
    addEffect('ads', 'c', { moves: ['morph'] })
    addEffect('text', 'a', { moves: ['mask'] })
    const out = await run('effects browse --limit 3')
    expect(out).toContain('ads/a')
    expect(out).toContain('text/a')
    expect(out).toContain('ads/c')
    expect(out).not.toContain('ads/b')
    expect(await run('effects browse --offset 3')).toContain('ads/b')
    const family = await run('effects ads browse --limit 2')
    expect(family).toContain('ads/c')
    expect(family).not.toContain('text/a')
    const { explorationOrder, loadEffects } = await import('../.pi/cli/effects.ts')
    const all = loadEffects()
    expect(new Set(explorationOrder(all).map(e => e.id)).size).toBe(all.length)
    expect(all.map(e => e.id)).toEqual(['ads/a', 'ads/b', 'ads/c', 'text/a'])
  })

  it('explains known families and surfaces new ones with live examples and tags', async () => {
    addEffect('launch-studies', 'camera', { moves: ['spatial-camera'] })
    const first = await run('effects families')
    expect(first).toContain('Multi-beat product-film studies')
    expect(first).toContain('launch-studies/camera')
    addEffect('new-worlds', 'assembly', { moves: ['converge'] })
    const updated = await run('effects families')
    expect(updated).toContain('new-worlds (1)')
    expect(updated).toContain('Moves/tags: converge')
    expect(updated).toContain('new-worlds/assembly')
    expect(updated).toContain('pitch effects browse')
  })

  it('returns the chosen primitive implementation, not just its launcher or every preset', async () => {
    const dir = addEffect('launch-primitives', 'one')
    write(
      dir,
      'index.html',
      '<div data-preset="one"></div><script src="../../_lib/launch-primitives.js"></script>',
    )
    mkdirSync(join(lab, '_lib'))
    const common = "const P = 'one'; let value = 0;"
    const chosen = "if(P==='one'){value=10;}"
    const other = "if(P==='two'){value=20;}"
    const register = 'globalThis.result = value;'
    const bundle = [common, chosen, other, register].join('\n')
    write(join(lab, '_lib'), 'launch-primitives.js', bundle)
    const out = await run('effects show launch-primitives/one --source')
    expect(out).toContain(chosen)
    expect(out).toContain(common)
    expect(out).toContain(register)
    expect(out).not.toContain(other)
    const { selectPrimitive } = await import('../.pi/cli/effects.ts')
    const context: Record<string, unknown> = {}
    new Script(selectPrimitive(bundle, 'one')).runInNewContext(context)
    expect(context.result).toBe(10)
    expect(selectPrimitive(bundle, 'missing')).toBe(bundle)
    const multiline = bundle.replace(chosen, "if(P==='one'){\nvalue=10;\n}")
    expect(selectPrimitive(multiline, 'one')).toBe(multiline)
  })

  it('makes every family a subcommand, with a bare slug inside it', async () => {
    addEffect('text', 'a', {})
    addEffect('logos', 'c', {})
    expect(await run('effects logos list')).toContain('logos/c')
    expect(await run('effects logos list')).not.toContain('text/a')
    expect(await run('effects text show a')).toContain('inspect the source first')
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
