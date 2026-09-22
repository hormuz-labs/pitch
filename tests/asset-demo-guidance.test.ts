import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findCommand } from '../.pi/cli/registry.ts'

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

describe('asset-demo skill tool contract', () => {
  const skill = read('.pi/skills/asset-demo/SKILL.md')
  const demoSkill = read('.pi/skills/demo-video/SKILL.md')
  const agentPrompt = read('.pi/AGENT.md')
  const referencedVerbs = [
    ...new Set([...skill.matchAll(/`pitch demo ([a-z-]+)/g)].map(match => match[1])),
  ]

  it('references only demo commands that are registered', () => {
    expect(referencedVerbs.length).toBeGreaterThan(0)
    for (const verb of referencedVerbs) expect(findCommand('demo', verb), verb).toBeTruthy()
  })

  it('orders the stateful gates before recording and rendering', () => {
    const first = (verb: string) => skill.indexOf(`pitch demo ${verb}`)
    const ordered = [
      'prepare-assets',
      'storyboard-plan',
      'storyboard-save',
      'record-start',
      'list-assets',
      'build-slideshow',
      'analyze-slide',
      'record-stop',
      'source',
    ].map(first)

    expect(ordered.every(index => index >= 0)).toBe(true)
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
  })

  it('routes from the requested outcome rather than attachment presence', () => {
    const normalized = [skill, demoSkill, agentPrompt].map(text => text.replace(/\s+/g, ' '))

    expect(normalized[0]).toContain('Route from what the user asked to make')
    expect(normalized[0]).toContain('reference does not make the project an asset demo')
    expect(normalized[1]).toContain("Choose from the requested video's subject")
    expect(normalized[1]).toContain('uploaded PDF or image may still supply facts')
    expect(normalized[2]).toContain('Route by the requested outcome')
    expect(normalized[2]).toContain('used only as reference material does not select `asset-demo`')
  })
})
