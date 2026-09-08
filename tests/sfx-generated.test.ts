import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const SCRIPT = path.resolve('.pi/scripts/launch-video/sfx.mjs')
let workspace = ''

afterAll(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true })
})

describe('generated SFX cue', () => {
  it('measures a workspace clip and renders it into the bus', async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'pitch-generated-sfx-'))
    await mkdir(path.join(workspace, 'audio/generated-sfx'), { recursive: true })
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=0.6',
      '-y',
      path.join(workspace, 'audio/generated-sfx/click.mp3'),
    ])
    await writeFile(
      path.join(workspace, 'audio/sfx-cues.json'),
      JSON.stringify({
        duration: 2,
        cues: [
          {
            label: 'generated click',
            t: 1,
            event: 'click',
            file: 'audio/generated-sfx/click.mp3',
          },
        ],
      }),
    )

    await execFileAsync('node', [SCRIPT, 'build', '--cues=audio/sfx-cues.json', '--duration=2'], {
      cwd: workspace,
    })
    expect((await stat(path.join(workspace, 'audio/sfx_bus.wav'))).size).toBeGreaterThan(1000)
  })
})
