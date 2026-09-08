/**
 * motion_effects — the effects lab as a tool. Keyword search runs offline
 * against effects/search.json; the embedding half needs GEMINI_API_KEY and is
 * skipped here (the tool says so in its result when it falls back).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import effectsTools from '../.pi/extensions/effects-tools.ts'
import { EFFECTS_DIR } from '../.pi/lib/paths.ts'

type Tool = {
  name: string
  execute: (id: string, p: any, s?: any, u?: any, ctx?: any) => Promise<any>
}

function load(): Tool {
  const tools: Tool[] = []
  effectsTools({ registerTool: (t: Tool) => tools.push(t) } as never)
  const tool = tools.find(t => t.name === 'motion_effects')
  if (!tool) throw new Error('motion_effects not registered')
  return tool
}

const call = async (p: Record<string, unknown>) =>
  (await load().execute('t', p)).content[0].text as string

const built = existsSync(path.join(EFFECTS_DIR, 'search.json'))

describe.skipIf(!built)('motion_effects', () => {
  it('lists the families with no arguments', async () => {
    const out = await call({})
    expect(out).toContain('409 effects')
    expect(out).toMatch(/text \(\d+\)/)
  })

  it('finds an effect by what it does, without the network', async () => {
    delete process.env.GEMINI_API_KEY
    const out = await call({ query: 'bold text snap collide', limit: 5 })
    expect(out).toContain('text/bold-text-snap')
  })

  it('filters by family and honours the limit', async () => {
    const out = await call({ family: 'counters', limit: 3 })
    expect(out.match(/^\d+\. counters\//gm)?.length).toBe(3)
  })

  it('returns one effect whole, with its source and its frames', async () => {
    const out = await call({ slug: 'text/bold-text-snap' })
    expect(out).toContain('fx.timeline')
    expect(out).toContain(path.join(EFFECTS_DIR, 'text/bold-text-snap/strip.jpg'))
  })

  it('accepts a bare slug and reports an unknown one', async () => {
    expect(await call({ slug: 'bold-text-snap' })).toContain('# Bold Text Snap')
    expect(await call({ slug: 'no-such-effect' })).toMatch(/No effect/)
  })
})
