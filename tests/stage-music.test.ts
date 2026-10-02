import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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
    const [copied, expected] = await Promise.all([
      readFile(path.join(dir, 'audio', 'music.mp3')),
      readFile(path.join(MUSIC_DIR, '01.mp3')),
    ])
    expect(copied.equals(expected)).toBe(true)
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

  it('stages an uploaded soundtrack and replaces the old canonical bed', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stage-music-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'uploads'))
    await mkdir(path.join(dir, 'audio'))
    await writeFile(path.join(dir, 'uploads', 'my-song.wav'), 'personal audio')
    await writeFile(path.join(dir, 'audio', 'music.mp3'), 'old bed')
    const ws = {
      flow: 'studio',
      userId: 'user',
      name: 'project',
      internal: 'project',
      dir,
    } as Workspace

    await expect(stageMusic(ws, 'uploads/my-song.wav')).resolves.toBe('music.wav')
    expect(await readFile(path.join(dir, 'audio', 'music.wav'), 'utf8')).toBe('personal audio')
    await expect(readFile(path.join(dir, 'audio', 'music.mp3'))).rejects.toThrow()
    expect(await readFile(path.join(dir, 'uploads', 'my-song.wav'), 'utf8')).toBe('personal audio')
  })

  it('rejects traversal and symlinks out of project uploads', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stage-music-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'uploads'))
    await writeFile(path.join(dir, 'private.mp3'), 'outside uploads')
    await symlink(path.join(dir, 'private.mp3'), path.join(dir, 'uploads', 'link.mp3'))
    const ws = {
      flow: 'studio',
      userId: 'user',
      name: 'project',
      internal: 'project',
      dir,
    } as Workspace
    await expect(stageMusic(ws, 'uploads/../private.mp3')).resolves.toBeNull()
    await expect(stageMusic(ws, 'uploads/link.mp3')).resolves.toBeNull()
  })
})
