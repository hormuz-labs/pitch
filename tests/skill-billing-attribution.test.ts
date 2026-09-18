import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isProvidedSkillRead } from '../apps/api/src/studio/session.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'skill-billing-'))
  roots.push(root)
  const workspace = path.join(root, 'workspace')
  const skill = path.join(root, 'skills', 'launch-video', 'SKILL.md')
  await mkdir(workspace, { recursive: true })
  await mkdir(path.dirname(skill), { recursive: true })
  await writeFile(skill, '# Launch video')
  return { workspace, skill, files: new Set([skill]) }
}

describe('provided skill billing attribution', () => {
  it('recognizes only exact registered skill reads', async () => {
    const { workspace, skill, files } = await fixture()
    expect(isProvidedSkillRead('read', { path: skill }, workspace, files)).toBe(true)
    expect(isProvidedSkillRead('read', { file: skill }, workspace, files)).toBe(true)
    expect(isProvidedSkillRead('grep', { path: skill }, workspace, files)).toBe(false)
  })

  it('does not classify ordinary files or lookalike skill paths', async () => {
    const { workspace, files } = await fixture()
    const ordinary = path.join(workspace, 'SKILL.md')
    await writeFile(ordinary, '# Not provided')
    expect(isProvidedSkillRead('read', { path: ordinary }, workspace, files)).toBe(false)
    expect(
      isProvidedSkillRead('read', { path: '../skills/unknown/SKILL.md' }, workspace, files),
    ).toBe(false)
  })

  it('rejects missing paths rather than trusting their spelling', async () => {
    const { workspace, files } = await fixture()
    expect(
      isProvidedSkillRead(
        'read',
        { path: '/fake/.pi/skills/launch-video/SKILL.md' },
        workspace,
        files,
      ),
    ).toBe(false)
  })
})
