/**
 * Does the studio recognise what the agent just built?
 *
 * hasResult() decides whether a finished turn produced anything; when it says
 * no, the project is marked failed and the credits refunded. It asked for the
 * shot list under js/, where no project has ever kept it, so every completed
 * launch film was reported as "The agent finished without producing anything"
 * while sitting complete on disk.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hasArtifact } from '../apps/api/src/agent/describe'

const dirs: string[] = []

function workspace(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'describe-'))
  dirs.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return { dir, internal: path.basename(dir), userId: 'u', name: 'n', flow: 'studio' } as never
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

const FILM = {
  'index.html': '<!doctype html><script src="shots.js"></script>',
  'shots.js': 'window.SHOTS = { shots: [{ id: "a", type: "word-cut", dur: 1.5 }] }',
}

describe('a finished launch film counts as a result', () => {
  it('finds shots.js at the workspace root, where index.html loads it from', async () => {
    await expect(hasArtifact(workspace(FILM))).resolves.toBe(true)
  })

  it('still accepts the legacy js/shots.js layout', async () => {
    const ws = workspace({
      'index.html': '<!doctype html>',
      'js/shots.js': 'window.SHOTS = { shots: [] }',
    })
    await expect(hasArtifact(ws)).resolves.toBe(true)
  })

  it('is not fooled by js/shots.custom.js, which is a different file', async () => {
    const ws = workspace({
      'index.html': '<!doctype html>',
      'js/shots.custom.js': 'window.SHOT_TYPES = {}',
    })
    await expect(hasArtifact(ws)).resolves.toBe(false)
  })

  it('needs both halves — a page with no shot list is not a film', async () => {
    await expect(hasArtifact(workspace({ 'index.html': '<!doctype html>' }))).resolves.toBe(false)
    await expect(hasArtifact(workspace({ 'shots.js': 'window.SHOTS = {}' }))).resolves.toBe(false)
  })

  it('says no for an empty workspace', async () => {
    await expect(hasArtifact(workspace({ 'project.json': '{}' }))).resolves.toBe(false)
  })
})
