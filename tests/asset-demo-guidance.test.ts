import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findCommand } from '../.pi/cli/registry.ts'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

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
      'render',
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
