import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import effectCommands, { loadEffects, searchEffects } from '../.pi/cli/effects.ts'
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

  it('finds a move by what happens on screen', () => {
    const hits = searchEffects(loadEffects(), 'checkmark strokes', 'icons')
    expect(hits[0].id).toBe('icons/check-icon')
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
})
