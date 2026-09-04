import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resumeOrCreate } from '../apps/api/src/studio/session.js'

/**
 * The pi transcript lives OUTSIDE the workspace, under ~/.pi/agent/sessions,
 * so it can disappear on its own: a cleared volume, a pruned container, a
 * project deleted from under it. When it does, the project must start a fresh
 * conversation rather than throwing ENOENT on every turn forever.
 */
describe('resumeOrCreate', () => {
  let dir: string
  let deps: Parameters<typeof resumeOrCreate>[3]

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'studio-session-'))
    deps = {
      open: vi.fn(() => ({ kind: 'resumed' })),
      create: vi.fn(() => ({ kind: 'fresh' })),
      exists: vi.fn(() => true),
      forget: vi.fn(async () => {}),
    }
  })

  it('reopens the transcript when it is still there', async () => {
    const file = path.join(dir, 'session.jsonl')
    writeFileSync(file, '{}')

    expect(await resumeOrCreate('p1', file, dir, deps)).toEqual({ kind: 'resumed' })
    expect(deps.create).not.toHaveBeenCalled()
    expect(deps.forget).not.toHaveBeenCalled()
  })

  it('starts fresh, and forgets the path, when the transcript is gone', async () => {
    const file = path.join(dir, 'deleted.jsonl')
    writeFileSync(file, '{}')
    rmSync(file)
    deps.exists = vi.fn(() => false)

    expect(await resumeOrCreate('p1', file, dir, deps)).toEqual({ kind: 'fresh' })
    expect(deps.open).not.toHaveBeenCalled()
    // The row must stop naming a file that is not there, or every later open
    // pays the same failed lookup.
    expect(deps.forget).toHaveBeenCalledWith('p1')
  })

  it('starts fresh when the file is present but unreadable', async () => {
    const file = path.join(dir, 'corrupt.jsonl')
    writeFileSync(file, 'not json')
    deps.open = vi.fn(() => {
      throw new Error('unexpected end of JSON input')
    })

    expect(await resumeOrCreate('p1', file, dir, deps)).toEqual({ kind: 'fresh' })
    expect(deps.forget).toHaveBeenCalledWith('p1')
  })

  it('just creates one when the project has never spoken', async () => {
    expect(await resumeOrCreate('p1', null, dir, deps)).toEqual({ kind: 'fresh' })
    expect(deps.exists).not.toHaveBeenCalled()
    expect(deps.forget).not.toHaveBeenCalled()
  })
})
