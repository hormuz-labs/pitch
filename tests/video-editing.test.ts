import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseArgs } from '../.pi/cli/argv.ts'
import { findCommand } from '../.pi/cli/registry.ts'
import { runVideoEditing } from '../apps/api/src/render/video-editing/index.js'
import { invokeHostAction } from '../apps/api/src/studio/host-actions.js'
import type { Workspace } from '../apps/api/src/studio/paths.js'
import '../apps/api/src/pipelines/video-editing.js'

const exec = promisify(execFile)
let root: string
let capabilities: any
let serial = 0
const call = async (action: string, args: Record<string, unknown> = {}, cwd = root) =>
  JSON.parse(await runVideoEditing(cwd, action, args))
const ff = (args: string[]) => exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
const source = 'uploads/source with spaces.mp4'

async function plan(clips: any[], extra: Record<string, unknown> = {}) {
  const name = `edits/plan-${++serial}.json`
  const output = `renders/edit-${serial}.mp4`
  await writeFile(
    path.join(root, name),
    JSON.stringify({
      version: 1,
      output: { path: output, width: 320, height: 180, fps: 10, preset: 'ultrafast' },
      clips,
      ...extra,
    }),
  )
  return { plan: name, output }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "pitch-video-editor's-"))
  for (const dir of ['uploads', 'renders', 'edits', 'recording']) await mkdir(path.join(root, dir))
  capabilities = await call('capabilities')
  await ff([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=10:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    path.join(root, source),
  ])
  await ff([
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=320x180:r=10:d=4',
    '-c:v',
    'libvpx',
    path.join(root, 'recording/demo.webm'),
  ])
  await ff([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=48000:duration=1',
    path.join(root, 'recording/voice.wav'),
  ])
}, 30_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('shared pi video editor', () => {
  it('exposes commands alongside generation and parses the documented flags', () => {
    expect(findCommand('video', 'generate')).toBeTruthy()
    const frames = findCommand('video', 'frames')!
    expect(
      parseArgs(['--source', source, '--times', '[0,1.5]', '--contact-sheet'], frames.parameters),
    ).toEqual({ source, times: [0, 1.5], contact_sheet: true })
    expect(findCommand('media', 'transcribe')).toBeTruthy()
    expect(findCommand('demo', 'source')).toBeTruthy()
  })

  it('runs through the registered host action and returns readable relative images', async () => {
    const ws: Workspace = {
      dir: root,
      internal: 'studio--test--video',
      userId: 'test',
      name: 'video',
      flow: 'studio',
    }
    const info = JSON.parse(await invokeHostAction(ws, 'video_edit_probe', { source }))
    expect(info.path).toBe(source)
    expect(info.video).toMatchObject({ display_width: 320, display_height: 180, hdr: false })
    const result = await call('frames', { source, times: [0, 1] })
    expect(result.images).toHaveLength(2)
    for (const image of result.images) {
      expect(path.isAbsolute(image.path)).toBe(false)
      expect((await readFile(path.join(root, image.path))).subarray(1, 4).toString()).toBe('PNG')
    }
    const focus = await call('focus', {
      source,
      time: 1,
      target: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      width: 320,
      height: 180,
      margin: 0,
    })
    expect(focus.viewport).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(focus.images).toHaveLength(2)
    const analysis = await call('analyze', { source, start: 1, end: 3 })
    expect(analysis.range).toEqual([1, 3])
    expect(analysis.time_basis).toBe('source seconds')
  }, 30_000)

  it('extracts timestamped contact sheets with usable tile coordinates', async ctx => {
    if (!capabilities.filters.drawtext) return ctx.skip()
    const result = await call('frames', { source, times: [0, 1, 2], contact_sheet: true })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].tiles.map((tile: any) => tile.time)).toEqual([0, 1, 2])
    expect(result.images[0].tiles[1].content_box.x).toBe(480)
    expect((await readFile(path.join(root, result.images[0].path))).length).toBeGreaterThan(1000)
  }, 30_000)

  it('renders cuts, retiming and linked camera pans with reproducible portable snapshots', async () => {
    const viewport = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }
    const p = await plan([
      { source, in: 0, out: 1, camera: { viewport } },
      {
        source,
        in: 1,
        out: 2,
        camera: { start_viewport: viewport, viewport: { ...viewport, x: 0.4 }, enter: 0.5 },
      },
      { source, in: 2, out: 4, speed: 2 },
    ])
    const valid = await call('validate', { plan: p.plan })
    expect(valid.duration).toBe(3)
    expect(valid.timeline.map((item: any) => item.start)).toEqual([0, 1, 2])
    const preview = await call('render', { plan: p.plan, preview: true })
    expect(preview.output).toMatch(/^\.video-work\//)
    expect((await call('verify', { source: preview.output, expected_duration: 3 })).passed).toBe(
      true,
    )
    const final = await call('render', { plan: p.plan })
    expect(final.output).toBe(p.output)
    expect((await call('verify', { source: final.output, expected_duration: 3 })).passed).toBe(true)
    expect((await call('verify', { source: final.output, expected_duration: 99 })).passed).toBe(
      false,
    )
    const snapshot = await readFile(path.join(root, final.plan_snapshot), 'utf8')
    expect(snapshot).not.toContain(root)
    expect(JSON.parse(snapshot).report.timeline[0].source).toBe(source)
    await expect(call('render', { plan: p.plan })).rejects.toThrow(/already exists/)
  }, 30_000)

  it('composites transition overlaps, overlays, redactions and a separate music track', async () => {
    const p = await plan(
      [
        { source, in: 0, out: 2, volume: 0.3, denoise: true },
        { source, in: 2, out: 4, transition: { type: 'fade', duration: 0.5 } },
      ],
      {
        overlays: [
          { source, start: 0.2, end: 1, box: { x: 0.7, y: 0.1, width: 0.25, height: 0.25 } },
        ],
        redactions: [{ start: 1, end: 2, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
        music: { source: 'recording/voice.wav', start: 0, end: 3.5, volume: 0.1, fade_out: 0.2 },
        ...(capabilities.filters.subtitles
          ? { captions: [{ start: 0.2, end: 1, text: 'A real caption' }] }
          : {}),
      },
    )
    const valid = await call('validate', { plan: p.plan })
    expect(valid.duration).toBe(3.5)
    const rendered = await call('render', { plan: p.plan })
    expect((await call('verify', { source: rendered.output, expected_duration: 3.5 })).passed).toBe(
      true,
    )
  }, 30_000)

  it('assembles uncut capture with narration at its source-time offset', async () => {
    const result = await call('assemble_recording', {
      source: 'recording/demo.webm',
      clips: [
        { source: 'recording/voice.wav', start: 1, text: 'Narration starts after one second.' },
      ],
    })
    expect(result.duration).toBe(4)
    const timeline = JSON.parse(await readFile(path.join(root, result.timeline), 'utf8'))
    expect(timeline.beats[0]).toMatchObject({ start: 1, dur: 1 })
    const decoded = await exec(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        path.join(root, result.source),
        '-map',
        '0:a:0',
        '-f',
        'f32le',
        '-ac',
        '1',
        '-ar',
        '48000',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 },
    )
    const rms = (start: number, end: number) => {
      let sum = 0
      const first = Math.round(start * 48000)
      const last = Math.round(end * 48000)
      for (let i = first; i < last; i++) sum += decoded.stdout.readFloatLE(i * 4) ** 2
      return Math.sqrt(sum / (last - first))
    }
    expect(rms(0.2, 0.8)).toBeLessThan(0.001)
    expect(rms(1.2, 1.8)).toBeGreaterThan(0.01)
    expect(rms(2.2, 2.8)).toBeLessThan(0.001)
    await expect(
      call('assemble_recording', {
        source: 'recording/demo.webm',
        clips: [{ source: 'recording/voice.wav', start: 4 }],
      }),
    ).rejects.toThrow(/ends before/)
  }, 30_000)

  it('rejects invalid plans, traversal, symlink escapes and playlist media', async () => {
    await expect(call('probe', { source: '../outside.mp4' })).rejects.toThrow(
      /outside this project/,
    )
    await symlink(tmpdir(), path.join(root, 'escape'))
    await expect(call('frames', { source: 'escape/outside.mp4' })).rejects.toThrow(
      /outside this project/,
    )
    await writeFile(
      path.join(root, 'uploads/playlist.mp4'),
      '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttps://example.com/video.ts\n#EXT-X-ENDLIST\n',
    )
    await expect(call('probe', { source: 'uploads/playlist.mp4' })).rejects.toThrow(/failed/)
    const unknown = await plan([{ source, tracking: true }])
    await expect(call('validate', { plan: unknown.plan })).rejects.toThrow(/Unknown clip/)
    const wrongAspect = await plan([
      { source, camera: { viewport: { x: 0, y: 0, width: 0.5, height: 0.8 } } },
    ])
    await expect(call('validate', { plan: wrongAspect.plan })).rejects.toThrow(/aspect ratio/)
    await expect(call('frames', { source, times: [4] })).rejects.toThrow(
      /before the source duration/,
    )
    const unsafeOut = await plan([{ source }], { output: { path: '../outside.mp4' } })
    await expect(call('validate', { plan: unsafeOut.plan })).rejects.toThrow(/outside this project/)
  }, 30_000)

  it('keeps a relative plan usable after moving the workspace', async () => {
    const p = await plan([{ source, in: 0, out: 1 }])
    const moved = await mkdtemp(path.join(tmpdir(), 'pitch-video-relocated-'))
    try {
      await cp(path.join(root, 'uploads'), path.join(moved, 'uploads'), { recursive: true })
      await mkdir(path.join(moved, 'edits'))
      await cp(path.join(root, p.plan), path.join(moved, p.plan))
      const result = await call('render', { plan: p.plan }, moved)
      expect(result.output).toBe(p.output)
      expect(JSON.stringify(result)).not.toContain(moved)
    } finally {
      await rm(moved, { recursive: true, force: true })
    }
  }, 30_000)

  it('cancels an in-flight encode and rejects an already-aborted call', async () => {
    const p = await plan([{ source, speed: 0.125 }], {
      output: { path: 'renders/cancelled.mp4', width: 1920, height: 1080, fps: 60 },
    })
    const controller = new AbortController()
    const pending = runVideoEditing(root, 'render', { plan: p.plan }, controller.signal)
    const timer = setTimeout(() => controller.abort(), 200)
    try {
      await expect(pending).rejects.toThrow(/cancelled/)
      expect(() => runVideoEditing(root, 'probe', { source }, controller.signal)).toThrow()
    } finally {
      clearTimeout(timer)
    }
  }, 10_000)
})
