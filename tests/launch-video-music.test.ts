import { beforeEach, describe, expect, it, vi } from 'vitest'

const readdir = vi.fn(async (directory: string) => {
  if (directory === '/curated/music') {
    return [{ name: 'safe-bed.mp3', isFile: () => true }]
  }
  return []
})
const stat = vi.fn(async () => ({ size: 2_000_000 }))
const copyFile = vi.fn(async () => undefined)

vi.mock('node:fs', () => ({ existsSync: () => true }))
vi.mock('node:fs/promises', () => ({ copyFile, readdir, stat }))
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _file: string,
      _args: string[],
      callback: (error: null, result: { stdout: string; stderr: string }) => void,
    ) => callback(null, { stdout: '30\n', stderr: '' }),
  ),
}))
vi.mock('../apps/api/src/lib/launch-video/paths.js', () => ({
  MUSIC_DIR: '/curated/music',
  SFX_DIR: '/curated/sfx',
}))

describe('launch-video music library', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists only explicitly curated music and never scans personal directories', async () => {
    const { listMusic } = await import('../apps/api/src/lib/launch-video/music.js')

    await expect(listMusic()).resolves.toEqual([
      {
        name: 'safe-bed',
        file: 'safe-bed.mp3',
        url: '/launch-video/files/music/safe-bed.mp3',
        duration: 30,
      },
    ])
    expect(readdir).toHaveBeenCalledTimes(1)
    expect(readdir).toHaveBeenCalledWith('/curated/music', { withFileTypes: true })
    expect(copyFile).not.toHaveBeenCalled()
  })
})
