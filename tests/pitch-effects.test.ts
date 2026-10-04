import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import effectCommands, {
  loadEffects,
  searchEffects,
  stem,
  storyboardNote,
  unsourcedRows,
} from '../.pi/cli/effects.ts'
import { EFFECTS_DIR, resolveIn, SHARED_ROOTS } from '../.pi/lib/paths.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

const tools = collectCommands(effectCommands)

describe('pitch effects', () => {
  it('lists every effect page on disk, and only pages', () => {
    const effects = loadEffects()
    expect(effects.length).toBeGreaterThan(400)
    for (const e of effects)
      expect(fs.existsSync(path.join(EFFECTS_DIR, e.id, 'index.html'))).toBe(true)
    expect(effects.some(e => e.id.startsWith('_'))).toBe(false)
  })

  it("finds the SaaS showcase and headline sets by their authored names (0xAdnan's improv-launch)", async () => {
    const effects = loadEffects()
    const families = await tools.families.run({}, os.tmpdir())
    for (const [family, count] of Object.entries({ 'saas-showcase': 15, 'saas-text': 21 })) {
      expect(effects.filter(e => e.family === family)).toHaveLength(count)
      expect(families).toContain(`${family} (${count})`)
    }
    expect(searchEffects(effects, 'command palette')[0].id).toBe('saas-showcase/command-palette')
    expect(searchEffects(effects, 'pill opens inside a headline')[0].id).toBe(
      'saas-text/inline-media-pill',
    )
  })

  it('finds a move by what happens on screen', () => {
    const hits = searchEffects(loadEffects(), 'checkmark strokes', 'icons')
    expect(hits[0].id).toBe('icons/check-icon')
  })

  it('ranks by the words that describe the move, not the filler around them', () => {
    const effects = loadEffects()
    const ids = (q: string) =>
      searchEffects(effects, q)
        .slice(0, 6)
        .map(e => e.id)
    expect(ids('the title rises through a mask')).toEqual(ids('title rises through mask'))
    expect(['rise', 'rises', 'rising'].map(stem)).toEqual(['ris', 'ris', 'ris'])
    expect(stem('becomes')).toBe(stem('becoming'))
    expect(ids('pill becomes a card').some(id => id.startsWith('morph/'))).toBe(true)
  })

  it('spreads an unfiltered page across families, keeps a filtered one whole', () => {
    const effects = loadEffects()
    const page = searchEffects(effects, 'cards stack').slice(0, 6)
    expect(new Set(page.map(e => e.family)).size).toBeGreaterThan(2)
    expect(
      searchEffects(effects, 'cards stack', 'devices').every(e => e.family === 'devices'),
    ).toBe(true)
  })

  it('returns one contact sheet of the shortlist', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-sheet-'))
    const out = await tools.search.run({ query: 'title rises through mask', family: 'text' }, ws)
    expect(out.split('\n').filter(l => /^\d\. text\//.test(l))).toHaveLength(6)
    const sheet = out.match(/in this order: (\S+)/)?.[1]
    if (sheet) expect(fs.existsSync(path.join(ws, sheet))).toBe(true)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('shows the notes and the paths to read', async () => {
    const out = JSON.parse(await tools.show.run({ id: 'text/text-scramble' }, os.tmpdir()))
    expect(out.port).toMatch(/animate/)
    expect(out.strip).toBe(path.join(EFFECTS_DIR, 'text/text-scramble/strip.jpg'))
    expect(out.page).toBe(path.join(EFFECTS_DIR, 'text/text-scramble/index.html'))
  })

  it('is readable from the sandbox, its lab helpers are not', () => {
    expect(SHARED_ROOTS).toContain(EFFECTS_DIR)
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-ws-'))
    expect(resolveIn(ws, path.join(EFFECTS_DIR, 'text/text-scramble/index.html'))).toBeTruthy()
    expect(() => resolveIn(ws, path.join(EFFECTS_DIR, '_lib/fx.js'))).toThrow(/library code/)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('names the storyboard rows that were planned from nothing', () => {
    const direction = `# Direction

| Brand | value |
|---|---|
| ground | light |

| t | on screen | effect | for |
|---|---|---|---|
| "Every day" | the line builds | \`launch-primitives/spoken-line-recentre\` + text/text-scramble | hook |
| "Start" | a prompt pill | kinetic prompt input | the input |
| bar 5 | the logo | | payoff |
`
    const known = new Set(['launch-primitives/spoken-line-recentre', 'text/text-scramble'])
    expect(unsourcedRows(direction, known)).toEqual([
      { t: '"Start"', effect: 'kinetic prompt input' },
      { t: 'bar 5', effect: '' },
    ])

    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboard-'))
    expect(storyboardNote(ws)).toBe('')
    fs.writeFileSync(path.join(ws, 'direction.md'), direction)
    const note = storyboardNote(
      ws,
      [...known].map(id => ({ id }) as any),
    )
    expect(note).toContain('2 storyboard rows in direction.md name no effect from the library')
    expect(note).toContain('"Start" → kinetic prompt input; bar 5 → nothing')
    fs.rmSync(ws, { recursive: true, force: true })
  })
})
