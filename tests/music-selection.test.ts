import { randomInt } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../.pi/cli/run.ts'

vi.mock('node:crypto', async importOriginal => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt: vi.fn(),
}))

const dirs: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), 'music-selection-'))
  dirs.push(cwd)
  await mkdir(join(cwd, 'library', 'nested'), { recursive: true })
  await writeFile(join(cwd, 'library', '01.mp3'), 'first track')
  await writeFile(join(cwd, 'library', '02.mp3'), 'second track')
  await writeFile(join(cwd, 'library', 'nested', '03.wav'), 'third track')
  return { cwd }
}

describe('music selection', () => {
  it('randomly imports from the entire pool regardless of the listing limit', async () => {
    const ctx = await workspace()
    vi.mocked(randomInt).mockReturnValue(2)
    const result = await run('motion find-audio --dir library --random --max 1', ctx)
    expect(randomInt).toHaveBeenCalledWith(3)
    expect(result.text).toContain('Randomly selected 03.wav from 3 tracks -> audio/music.wav')
    expect(await readFile(join(ctx.cwd, 'audio/music.wav'), 'utf8')).toBe('third track')
  })

  it('uses fresh draws and honours a custom destination', async () => {
    const ctx = await workspace()
    vi.mocked(randomInt).mockReturnValueOnce(0).mockReturnValueOnce(1)
    await run('motion find-audio --dir library --random --copy_to audio/bed.mp3', ctx)
    expect(await readFile(join(ctx.cwd, 'audio/bed.mp3'), 'utf8')).toBe('first track')
    await run('motion find-audio --dir library --random --copy_to audio/bed.mp3', ctx)
    expect(await readFile(join(ctx.cwd, 'audio/bed.mp3'), 'utf8')).toBe('second track')
  })

  it('shuffles before limiting the list and does not import while listing', async () => {
    const ctx = await workspace()
    vi.mocked(randomInt).mockReturnValueOnce(0).mockReturnValueOnce(1)
    const result = await run('motion find-audio --dir library --max 1', ctx)
    expect(result.text).toContain('03.wav')
    expect(result.text).not.toContain('01.mp3')
    expect(result.text).not.toContain('02.mp3')
    await expect(readFile(join(ctx.cwd, 'audio/music.wav'))).rejects.toThrow()
  })

  it('imports an explicit choice without randomizing it', async () => {
    const ctx = await workspace()
    await run('motion find-audio --src library/02.mp3 --copy_to audio/music.mp3', ctx)
    expect(await readFile(join(ctx.cwd, 'audio/music.mp3'), 'utf8')).toBe('second track')
    expect(randomInt).not.toHaveBeenCalled()
  })
})
