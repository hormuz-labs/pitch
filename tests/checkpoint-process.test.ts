/**
 * tarToFile: tar writes the archive itself — no pipe between tar and us,
 * since under Bun on Linux a child's pipes drop data.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tarToFile } from '../apps/api/src/worker/checkpoint.ts'

describe('tarToFile', () => {
  let root: string
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'tar-to-file-'))
    await mkdir(path.join(root, 'ws', 'renders'), { recursive: true })
    await mkdir(path.join(root, 'ws', '.thumbs'), { recursive: true })
    await writeFile(path.join(root, 'ws', 'renders', 'a.mp4'), Buffer.alloc(3 * 1024 * 1024, 1))
    await writeFile(path.join(root, 'ws', '.thumbs', 'cache.jpg'), 'cache')
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const list = (file: string) =>
    spawnSync('tar', ['-tf', file], { encoding: 'utf8' }).stdout.trim().split('\n')

  it('archives a workspace without its caches and returns the size', async () => {
    const file = path.join(root, 'ws.tar')
    const size = await tarToFile(root, 'ws', file)
    expect(size).toBeGreaterThan(3 * 1024 * 1024)
    expect(list(file)).toContain('ws/renders/a.mp4')
    expect(list(file).some(f => f.includes('.thumbs'))).toBe(false)
  })

  it('archives explicit members', async () => {
    const file = path.join(root, 'members.tar')
    await tarToFile(path.join(root, 'ws'), ['renders/a.mp4'], file)
    expect(list(file)).toEqual(['renders/a.mp4'])
  })

  it('fails when tar fails', async () => {
    await expect(tarToFile(root, 'missing', path.join(root, 'missing.tar'))).rejects.toThrow(
      /tar exited/,
    )
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      tarToFile(root, 'ws', path.join(root, 'cancelled.tar'), controller.signal),
    ).rejects.toThrow('cancelled')
  })
})
