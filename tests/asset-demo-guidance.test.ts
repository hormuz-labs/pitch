import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

function documentGuidance() {
  const directory = '.pi/skills/demo-video'
  const reference = 'references/documents-storyboards.md'
  // Document capture policy is loaded through the scenario router.
  expect(read(`${directory}/SKILL.md`)).toContain(`](${reference})`)
  return read(`${directory}/${reference}`)
}

describe('prepared-asset narration guidance', () => {
  it('requires atomic emphasis while the matching statistic is spoken', () => {
    const agent = documentGuidance()

    for (const guidance of [agent]) {
      expect(guidance).toContain('emphasis')
      expect(guidance).toContain('coordinateSpace: "page"')
      expect(guidance).toContain('coordinateSpace: "viewport"')
      expect(guidance).toMatch(/statistic.*start/i)
    }
    expect(agent).not.toContain('narrate → zoom/focus → one annotation')
  })

  it('uses Gemini on rendered slide pixels as the primary PDF targeting source', () => {
    const agent = documentGuidance()

    for (const guidance of [agent]) {
      expect(guidance).toMatch(/Gemini[- ]first/i)
      expect(guidance).toMatch(/rendered (slide )?pixels/i)
      expect(guidance).toMatch(/OCR.*fallback|fallback.*OCR/is)
      expect(guidance).toMatch(/found=true/i)
      expect(guidance).toContain('coordinateSpace: "viewport"')
      expect(guidance).toMatch(/automatically (consumed|consume)/i)
    }
  })

  it('requires rendered-pixel page understanding before narrating every slide', () => {
    const agent = documentGuidance()

    for (const guidance of [agent]) {
      expect(guidance).toContain('pitch demo analyze-slide')
      expect(guidance).toMatch(/every (?:prepared )?(?:page|slide).*before narrat/is)
      expect(guidance).toMatch(/empty|no machine-readable text/i)
    }
  })
})
