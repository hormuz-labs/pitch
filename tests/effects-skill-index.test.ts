import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadEffects } from '../.pi/cli/effects.ts'
import { SKILLS_DIR } from '../.pi/lib/paths.ts'
import { END, effectInventory, START, updateSkillInventory } from '../scripts/sync-effects-skill.ts'

describe('the complete effects inventory in the launch skill', () => {
  it('matches every live effect exactly once and stays current with the library', () => {
    const skill = readFileSync(join(SKILLS_DIR, 'launch-video', 'SKILL.md'), 'utf8')
    const effects = loadEffects()
    const section = skill.slice(skill.indexOf(START), skill.indexOf(END))
    const ids = [...section.matchAll(/^- (\S+)$/gm)].map(match => match[1])
    expect(ids.sort()).toEqual(effects.map(effect => effect.id).sort())
    expect(updateSkillInventory(skill, effects), 'Run bun run effects:sync').toBe(skill)
  })

  it('replaces stale entries and families while preserving authored instructions', () => {
    const prefix = '---\nname: launch-video\n---\n\nAuthored direction.\n'
    const suffix = '\nAuthored closing notes.\n'
    const old = [{ family: 'old', id: 'old/removed' }]
    const skill = prefix + effectInventory(old) + suffix
    const effects = [
      { family: 'text', id: 'text/zebra' },
      { family: 'new-family', id: 'new-family/added' },
      { family: 'text', id: 'text/alpha' },
    ]
    const updated = updateSkillInventory(skill, effects)
    expect(updated.startsWith(prefix)).toBe(true)
    expect(updated.endsWith(suffix)).toBe(true)
    expect(updated).not.toContain('old/removed')
    expect(updated).not.toContain('### old')
    expect(updated).toContain('### new-family\n\n- new-family/added')
    expect(updated).toContain('- text/alpha\n- text/zebra')
    expect(updateSkillInventory(updated, [...effects].reverse())).toBe(updated)
  })

  it('refuses ambiguous markers or an empty/duplicated source inventory', () => {
    const effects = [{ family: 'text', id: 'text/one' }]
    for (const skill of [
      'no markers',
      `${END}${START}`,
      `${START}${START}${END}`,
      `${START}${END}${END}`,
    ]) {
      expect(() => updateSkillInventory(skill, effects)).toThrow('marker pair')
    }
    expect(() => effectInventory([])).toThrow('empty')
    expect(() => effectInventory([...effects, ...effects])).toThrow('Duplicate')
  })
})
