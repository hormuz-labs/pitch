/** Maintain the complete effect inventory embedded in the launch skill. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Effect, loadEffects } from '../.pi/cli/effects.ts'
import { SKILLS_DIR } from '../.pi/lib/paths.ts'

export const START = '<!-- effects-index:start -->'
export const END = '<!-- effects-index:end -->'
type Entry = Pick<Effect, 'id' | 'family'>

export function effectInventory(effects: Entry[]): string {
  if (!effects.length) throw new Error('Refusing to generate an empty effects inventory')
  if (new Set(effects.map(e => e.id)).size !== effects.length)
    throw new Error('Duplicate effect IDs in inventory')
  const families = [...new Set(effects.map(e => e.family))].sort()
  const sections = families.map(family => {
    const ids = effects
      .filter(e => e.family === family)
      .map(e => e.id)
      .sort()
    return `### ${family}\n\n${ids.map(id => `- ${id}`).join('\n')}`
  })
  return `${START}\n## Available effects\n\n${effects.length} effects across ${families.length} families. IDs below work directly with \`pitch effects show <id>\`.\n\n${sections.join('\n\n')}\n${END}`
}

export function updateSkillInventory(skill: string, effects: Entry[]): string {
  const start = skill.indexOf(START)
  const end = skill.indexOf(END)
  if (
    start < 0 ||
    end <= start ||
    skill.indexOf(START, start + START.length) !== -1 ||
    skill.indexOf(END, end + END.length) !== -1
  )
    throw new Error('Expected exactly one effects-index marker pair in launch-video/SKILL.md')
  return skill.slice(0, start) + effectInventory(effects) + skill.slice(end + END.length)
}

if (import.meta.main) {
  const flags = process.argv.slice(2)
  if (flags.length > 1 || flags.some(flag => !['--check', '--print'].includes(flag)))
    throw new Error('Usage: bun scripts/sync-effects-skill.ts [--check|--print]')
  const effects = loadEffects()
  if (flags.includes('--print')) {
    console.log(effectInventory(effects))
  } else {
    const file = join(SKILLS_DIR, 'launch-video', 'SKILL.md')
    const current = readFileSync(file, 'utf8')
    const updated = updateSkillInventory(current, effects)
    if (flags.includes('--check')) {
      if (current !== updated)
        throw new Error('Effects inventory is stale. Run bun run effects:sync')
      console.log(`Effects inventory is current (${effects.length} effects).`)
    } else {
      if (current !== updated) writeFileSync(file, updated)
      console.log(`Synced ${effects.length} effects into launch-video/SKILL.md.`)
    }
  }
}
