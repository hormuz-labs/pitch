import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stageMusic } from '../apps/api/src/lib/music.ts'
import { MUSIC_DIR, type Workspace } from '../apps/api/src/studio/paths.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('stageMusic', () => {
  it('atomically replaces stale canonical music beds', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stage-music-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'audio'))
    await writeFile(path.join(dir, 'audio', 'music.wav'), 'stale music')
    const ws: Workspace = {
      flow: 'studio',
      userId: 'user',
      name: 'project',
      internal: 'project',
      dir,
    }

    await expect(stageMusic(ws, '01.mp3')).resolves.toBe('music.mp3')
    await expect(readFile(path.join(dir, 'audio', 'music.mp3'))).resolves.toEqual(
      await readFile(path.join(MUSIC_DIR, '01.mp3')),
    )
    await expect(readFile(path.join(dir, 'audio', 'music.wav'))).rejects.toThrow()
    await expect(readFile(path.join(dir, 'audio', '01.mp3'))).rejects.toThrow()
  })

  it('rejects files outside the curated library', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stage-music-'))
    dirs.push(dir)
    const ws: Workspace = {
      flow: 'studio',
      userId: 'user',
      name: 'project',
      internal: 'project',
      dir,
    }

    await expect(stageMusic(ws, '../missing.mp3')).resolves.toBeNull()
  })
})
