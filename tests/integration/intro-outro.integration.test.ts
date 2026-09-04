import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { addIntroOutro } from '../../apps/api/src/render/utils/intro-outro'

const run = promisify(execFile)
const temporaryDirectories: string[] = []

async function createContent(directory: string): Promise<string> {
  const input = path.join(directory, 'content.mp4')
  await run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=white:s=320x180:r=10:d=1',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=mono:sample_rate=24000',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    input,
  ])
  return input
}

async function mediaDuration(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ])
  return Number(stdout.trim())
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('optional title-card assembly', () => {
  it('exports only the content duration when both PDF cards are disabled', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'title-cards-'))
    temporaryDirectories.push(directory)
    const input = await createContent(directory)
    const output = path.join(directory, 'final.mp4')

    await addIntroOutro(input, output, {
      productName: 'Demo',
      duration: 2.5,
      fps: 10,
      width: 320,
      height: 180,
      outputPath: output,
      titleCards: {
        intro: { enabled: false, title: '', subtitle: '' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
    })

    expect(await mediaDuration(output)).toBeGreaterThan(0.8)
    expect(await mediaDuration(output)).toBeLessThan(1.3)
  }, 30_000)

  it('adds only an enabled custom intro card', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'title-cards-'))
    temporaryDirectories.push(directory)
    const input = await createContent(directory)
    const output = path.join(directory, 'final.mp4')

    await addIntroOutro(input, output, {
      productName: 'Demo',
      duration: 2.5,
      fps: 10,
      width: 320,
      height: 180,
      outputPath: output,
      titleCards: {
        intro: { enabled: true, title: 'Quarterly Review', subtitle: 'April 2026' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
    })

    expect(await mediaDuration(output)).toBeGreaterThan(3.3)
    expect(await mediaDuration(output)).toBeLessThan(3.8)
  }, 30_000)
})
