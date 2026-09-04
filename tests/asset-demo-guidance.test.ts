import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

describe('prepared-asset narration guidance', () => {
  it('requires atomic emphasis while the matching statistic is spoken', () => {
    const agent = read('.pi/skills/demo-video/SKILL.md')
    const skill = read('.pi/skills/asset-demo/SKILL.md')

    for (const guidance of [agent, skill]) {
      expect(guidance).toContain('emphasis')
      expect(guidance).toContain('coordinateSpace: "page"')
      expect(guidance).toContain('coordinateSpace: "viewport"')
      expect(guidance).toMatch(/statistic.*start/i)
    }
    expect(agent).not.toContain('narrate → zoom/focus → one annotation')
    expect(skill).not.toContain('narrate -> zoom -> annotate')
  })

  it('uses Gemini on rendered slide pixels as the primary PDF targeting source', () => {
    const agent = read('.pi/skills/demo-video/SKILL.md')
    const skill = read('.pi/skills/asset-demo/SKILL.md')

    for (const guidance of [agent, skill]) {
      expect(guidance).toMatch(/Gemini[- ]first/i)
      expect(guidance).toMatch(/rendered (slide )?pixels/i)
      expect(guidance).toMatch(/OCR.*fallback|fallback.*OCR/is)
      expect(guidance).toMatch(/found=true/i)
      expect(guidance).toContain('coordinateSpace: "viewport"')
      expect(guidance).toMatch(/automatically (consumed|consume)/i)
    }
  })

  it('requires rendered-pixel page understanding before narrating every slide', () => {
    const agent = read('.pi/skills/demo-video/SKILL.md')
    const skill = read('.pi/skills/asset-demo/SKILL.md')

    for (const guidance of [agent, skill]) {
      expect(guidance).toContain('demo_analyze_slide')
      expect(guidance).toMatch(/every (?:prepared )?(?:page|slide).*before narrat/is)
      expect(guidance).toMatch(/empty|no machine-readable text/i)
    }
  })
})
