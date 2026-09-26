import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../.pi/cli/argv.ts'
import { findCommand } from '../.pi/cli/registry.ts'
import { CaptureEncoder } from '../apps/api/src/render/utils/capture-encoder.js'
import { runVideoEditing } from '../apps/api/src/render/video-editing/index.js'
import { invokeHostAction } from '../apps/api/src/studio/host-actions.js'
import type { Workspace } from '../apps/api/src/studio/paths.js'
import '../apps/api/src/pipelines/video-editing.js'
import { MEDIA_TEST_TIMEOUT_MS } from './media-timeouts.js'

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
}, MEDIA_TEST_TIMEOUT_MS)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('shared pi video editor', () => {
  it('accurately seeks non-keyframe times without changing the decoded screenshot', async () => {
    const times = [0, 0.55, 3.15]
    const result = await call('frames', { source, times, max_width: 320 })
    for (let i = 0; i < times.length; i++) {
      const reference = await exec(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          path.join(root, source),
          '-ss',
          String(times[i]),
          '-map',
          '0:v:0',
          '-vf',
          "scale=round(iw*sar):ih,setsar=1,scale='min(320,iw)':-1",
          '-frames:v',
          '1',
          '-threads',
          '1',
          '-c:v',
          'png',
          '-f',
          'image2pipe',
          'pipe:1',
        ],
        { encoding: 'buffer' },
      )
      expect(await readFile(path.join(root, result.images[i].path))).toEqual(reference.stdout)
    }
  })

  it('exposes commands alongside generation and parses the documented flags', () => {
    expect(findCommand('video', 'generate')).toBeTruthy()
    const frames = findCommand('video', 'frames')!
    expect(
      parseArgs(['--source', source, '--times', '[0,1.5]', '--contact-sheet'], frames.parameters),
    ).toEqual({ source, times: [0, 1.5], contact_sheet: true })
    expect(findCommand('media', 'transcribe')).toBeTruthy()
    expect(findCommand('demo', 'source')).toBeTruthy()
    const author = findCommand('video', 'plan')!
    expect(
      parseArgs(
        ['--operation', 'inspect', '--plan', 'edit.json', '--limit', '2'],
        author.parameters,
      ),
    ).toEqual({ operation: 'inspect', plan: 'edit.json', limit: 2 })
    expect(
      parseArgs(['--plan', 'edit.json', '--details'], findCommand('video', 'validate')!.parameters),
    ).toEqual({ plan: 'edit.json', details: true })
  })

  it('requests compact reports from the CLI unless details are explicitly requested', async () => {
    const host = { call: vi.fn(async () => '{}') }
    vi.stubGlobal('__pitchStudioHost', host)
    try {
      for (const verb of ['validate', 'render', 'analyze', 'preprocess']) {
        const command = findCommand('video', verb)!
        for (const details of [undefined, false, true]) {
          await command.execute('test', { plan: 'edit.json', details }, undefined, undefined, {
            cwd: root,
          } as any)
          expect(host.call).toHaveBeenLastCalledWith(root, `video_edit_${verb}`, {
            plan: 'edit.json',
            compact: details !== true,
          })
        }
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it(
    'runs through the registered host action and returns readable relative images',
    async () => {
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
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it('seeks before opening the input when extracting frames', async () => {
    const engine = await readFile(
      path.join(process.cwd(), 'apps/api/src/render/video-editing/engine.py'),
      'utf8',
    )
    expect(engine).toMatch(/self\.ff\(\["-ss", time, "-i", info\["path"\].*"-frames:v", "1"/)
  })

  it(
    'extracts timestamped contact sheets with usable tile coordinates',
    async ctx => {
      if (!capabilities.filters.drawtext) return ctx.skip()
      const result = await call('frames', { source, times: [0, 1, 2], contact_sheet: true })
      expect(result.images).toHaveLength(1)
      expect(result.images[0].tiles.map((tile: any) => tile.time)).toEqual([0, 1, 2])
      expect(result.images[0].tiles[1].content_box.x).toBe(480)
      expect((await readFile(path.join(root, result.images[0].path))).length).toBeGreaterThan(1000)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'preprocesses silent stillness without deleting tiny screen activity or speech',
    async () => {
      const input = 'uploads/dead-time.mp4'
      // Two-pixel marks are deliberately too small for a whole-frame scene score.
      const marks = Array.from(
        { length: 8 },
        (_, i) =>
          `drawbox=x=${20 + i * 4}:y=90:w=2:h=2:color=white:t=fill:enable='gte(t,${4 + i * 0.5})'`,
      ).join(',')
      await ff([
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:r=10:d=12',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=12',
        '-vf',
        marks,
        '-af',
        "volume=0:enable='lt(t,8)'",
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        path.join(root, input),
      ])
      const result = await call('preprocess', { source: input })
      expect(result.removed_seconds).toBeGreaterThan(1)
      expect(result.removed.every(([a, b]: number[]) => a >= 0 && b < 4)).toBe(true)
      expect(
        (await call('verify', { source: result.source, expected_duration: result.duration }))
          .passed,
      ).toBe(true)
      const starter = JSON.parse(await readFile(path.join(root, result.plan), 'utf8'))
      const mapping = await call('plan', {
        operation: 'inspect',
        plan: result.prepass_plan,
        section: 'timeline',
        limit: 1,
      })
      expect(mapping.total).toBe(result.map.length)
      expect(mapping.items[0].value).toEqual(result.map[0])
      expect(starter.coverage.some((item: any) => item.kind === 'speech')).toBe(true)
      await call('validate', { plan: result.plan })
      starter.clips[0].in = 1
      delete starter.coverage
      await writeFile(path.join(root, result.plan), JSON.stringify(starter))
      await expect(call('validate', { plan: result.plan })).rejects.toThrow(/Coverage activity/)
      const protectedResult = await call('preprocess', {
        source: input,
        protect: [{ start: 0, end: 4 }],
      })
      expect(protectedResult.removed_seconds).toBe(0)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'removes reviewed idle despite incidental animation but preserves speech and scrolling',
    async () => {
      const input = 'uploads/animated-idle.mp4'
      await ff([
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=10:duration=12',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=12',
        '-af',
        "volume=0:enable='lt(t,8)'",
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        path.join(root, input),
      ])
      const baseline = await call('preprocess', { source: input })
      expect(baseline.removed_seconds).toBe(0)
      const reviewed_idle = [
        {
          start: 0,
          end: 12,
          reason: 'Only unrelated thumbnail animation outside the protected task scroll',
        },
      ]
      const result = await call('preprocess', {
        source: input,
        reviewed_idle,
        protect: [{ start: 3, end: 5, kind: 'scroll' }],
      })
      expect(result.removed_seconds).toBeGreaterThan(3)
      expect(result.removed.every(([a, b]: number[]) => b <= 3 || (a >= 5 && b < 8))).toBe(true)
      expect(result.reviewed_idle).toEqual(reviewed_idle)
      const starter = JSON.parse(await readFile(path.join(root, result.plan), 'utf8'))
      const scroll = starter.coverage.find((span: any) => span.kind === 'scroll')
      expect(scroll.end - scroll.start).toBeCloseTo(2)
      expect(scroll.start).toBeLessThan(3) // Mapped through the earlier cut.
      await call('validate', { plan: result.plan })
      // Media-bound protection survives a fresh plan omitting the coverage array.
      const sped = await plan([
        { source: result.source, in: 0, out: scroll.start },
        { source: result.source, in: scroll.start, out: scroll.end, speed: 2 },
        { source: result.source, in: scroll.end, out: result.duration },
      ])
      await expect(call('validate', { plan: sped.plan })).rejects.toThrow(
        'Protected scroll must remain at 1x',
      )
      const cut = await plan([
        { source: result.source, in: 0, out: scroll.start },
        { source: result.source, in: scroll.end, out: result.duration },
      ])
      await expect(call('validate', { plan: cut.plan })).rejects.toThrow('Coverage activity')
      await expect(
        call('preprocess', { source: input, reviewed_idle: [{ start: 0, end: 4 }] }),
      ).rejects.toThrow('requires a reason')
      await expect(
        call('preprocess', { source: input, protect: [{ start: 0, end: 4, kind: 'unknown' }] }),
      ).rejects.toThrow('protect.kind')
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'keeps a single changing chroma pixel even when luminance is completely still',
    async () => {
      const input = 'uploads/chroma-activity.mkv'
      await ff([
        '-f',
        'lavfi',
        '-i',
        'color=c=gray:s=320x180:r=10:d=8',
        '-vf',
        "format=yuv444p,geq=lum=128:cb='if(eq(X,160)*eq(Y,90)*between(N,30,59),128+32*mod(N,2),128)':cr=128",
        '-c:v',
        'ffv1',
        path.join(root, input),
      ])
      const result = await call('preprocess', { source: input })
      expect(result.removed_seconds).toBeGreaterThan(0)
      expect(result.removed.every(([a, b]: number[]) => b <= 3 || a >= 6)).toBe(true)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'enforces continuous camera handoffs instead of accepting abrupt crop resets',
    async () => {
      const a = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }
      const b = { x: 0.4, y: 0.2, width: 0.5, height: 0.5 }
      const output = {
        path: 'renders/continuous.mp4',
        width: 320,
        height: 180,
        fps: 10,
        preset: 'ultrafast',
        continuous_camera: true,
      }
      const clips = [
        { source, in: 0, out: 1, camera: { viewport: a, enter: 0.4 } },
        { source, in: 1, out: 2, camera: { start_viewport: a, viewport: b, enter: 0.4 } },
        { source, in: 2, out: 3, camera: { viewport: b, exit: 0.4 } },
        { source, in: 3, out: 4 },
      ]
      const good = await plan(clips, { output })
      expect((await call('validate', { plan: good.plan })).duration).toBe(4)
      // Native action remains continuous; only framing is interpolated by the renderer.
      const rendered = await call('render', { plan: good.plan })
      expect((await call('verify', { source: rendered.output, expected_duration: 4 })).passed).toBe(
        true,
      )
      const unusedOutput = { ...output, path: 'renders/continuity-invalid.mp4' }
      for (const broken of [
        [clips[0], { source, in: 1, out: 4 }], // Zoom -> full without a return.
        [clips[0], { source, in: 1, out: 4, camera: { viewport: b } }], // Pan jump.
        [{ source, camera: { viewport: a } }], // Cropped opening.
        [clips[0], { source, in: 1, out: 4, camera: { viewport: a, enter: 0.4 } }], // Restarted zoom.
        [
          { source, in: 0, out: 1, camera: { viewport: a, enter: 1 } },
          { source, in: 1, out: 4, camera: { viewport: a } },
        ], // Last rendered frame hasn't settled.
      ]) {
        const p = await plan(broken, { output: unusedOutput })
        await expect(call('validate', { plan: p.plan })).rejects.toThrow('Camera discontinuity')
      }
      const fade = await plan(
        [
          { source, in: 0, out: 2, fade_out: 0.3 },
          { source, in: 2, out: 4 },
        ],
        { output: unusedOutput },
      )
      await expect(call('validate', { plan: fade.plan })).rejects.toThrow('must not hide joins')
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it('allows continuous accelerated typing but rejects dropped, reordered or accelerated speech', async () => {
    const coverage = [
      { source, start: 0, end: 2, kind: 'typing' },
      { source, start: 2, end: 4, kind: 'speech' },
    ]
    const p = await plan(
      [
        { source, in: 0, out: 2, speed: 4 },
        { source, in: 2, out: 4 },
      ],
      { coverage },
    )
    expect((await call('validate', { plan: p.plan })).duration).toBe(2.5)
    for (const clips of [
      [
        { source, in: 0, out: 1 },
        { source, in: 1.5, out: 4 },
      ],
      [
        { source, in: 1, out: 2 },
        { source, in: 0, out: 1 },
        { source, in: 2, out: 4 },
      ],
      [
        { source, in: 0, out: 2 },
        { source, in: 2, out: 4, speed: 2 },
      ],
    ]) {
      const invalid = await plan(clips, { coverage })
      await expect(call('validate', { plan: invalid.plan })).rejects.toThrow(
        /Coverage|Protected speech/,
      )
    }
  })

  it('creates portable plans through the local host action and pages selected sections', async () => {
    const name = `edits/authored-${++serial}.json`
    const ws: Workspace = {
      dir: root,
      internal: 'studio--test--video',
      userId: 'test',
      name: 'video',
      flow: 'studio',
    }
    const created = JSON.parse(
      await invokeHostAction(ws, 'video_edit_plan', {
        operation: 'create',
        plan: name,
        source,
        output: 'renders/authored.mp4',
      }),
    )
    const raw = await readFile(path.join(root, name))
    expect(created.revision).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(JSON.parse(raw.toString())).toMatchObject({
      version: 1,
      output: { width: 320, height: 180, fps: 10 },
      clips: [{ source, in: 0, out: 4 }],
    })
    expect(raw.toString()).not.toContain(root)
    await expect(
      call('plan', { operation: 'create', plan: name, source, output: 'renders/other.mp4' }),
    ).rejects.toThrow(/Plan already exists/)
    expect(await readFile(path.join(root, name))).toEqual(raw)
    const p = await plan(
      Array.from({ length: 12 }, (_, i) => ({ source, in: 0, out: 1, note: `clip ${i}` })),
    )
    const first = await call('plan', { operation: 'inspect', plan: p.plan })
    expect(first).toMatchObject({ total: 12, next_offset: 5, duration: 12, counts: { clips: 12 } })
    expect(first.items.map((item: any) => item.index)).toEqual([0, 1, 2, 3, 4])
    expect(first.timeline).toBeUndefined()
    const last = await call('plan', {
      operation: 'inspect',
      plan: p.plan,
      offset: 10,
      limit: 2,
      section: 'timeline',
    })
    expect(last.items.map((item: any) => item.value.start)).toEqual([10, 11])
    expect(last.next_offset).toBeNull()
    expect(last.revision).toBe(first.revision)
    const output = await call('plan', {
      operation: 'inspect',
      plan: p.plan,
      section: 'output',
      limit: 1,
    })
    expect(output.items[0]).toEqual({ index: 0, path: '/output/path', value: p.output })
    await expect(call('plan', { operation: 'inspect', plan: p.plan, limit: 11 })).rejects.toThrow(
      /limit/,
    )
    const large = await plan([{ source, note: 'x'.repeat(100_000) }])
    const bounded = await call('plan', { operation: 'inspect', plan: large.plan })
    expect(bounded.items[0].value.truncated).toBe(true)
    expect(JSON.stringify(bounded).length).toBeLessThan(4096)
  })

  it('atomically splits and retimes complete coverage, checks revisions and saves exact backups', async () => {
    const p = await plan([{ source, in: 0, out: 4 }], {
      coverage: [
        { source, start: 0, end: 2, kind: 'typing' },
        { source, start: 2, end: 4, kind: 'speech' },
      ],
    })
    const before = await readFile(path.join(root, p.plan))
    const inspected = await call('plan', { operation: 'inspect', plan: p.plan })
    const args = {
      operation: 'patch',
      plan: p.plan,
      revision: inspected.revision,
      ops: [
        { op: 'test', path: '/clips/0/out', value: 4 },
        { op: 'replace', path: '/clips/0', value: { source, in: 0, out: 2, speed: 2 } },
        { op: 'add', path: '/clips/1', value: { source, in: 2, out: 4 } },
      ],
    }
    const results = await Promise.allSettled([call('plan', args), call('plan', args)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const success = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>
    const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason.message).toMatch(/Stale plan revision.*inspect/)
    expect(success.value).toMatchObject({
      duration: 3,
      counts: { clips: 2 },
      changed_paths: ['/clips/0', '/clips/1'],
    })
    expect(await readFile(path.join(root, success.value.backup))).toEqual(before)
    const after = await readFile(path.join(root, p.plan))
    expect(success.value.revision).toBe(createHash('sha256').update(after).digest('hex'))
    expect(success.value.timeline).toBeUndefined()
    const edited = await call('plan', {
      operation: 'patch',
      plan: p.plan,
      revision: success.value.revision,
      ops: [
        {
          op: 'add',
          path: '/clips/1/camera',
          value: { viewport: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
        },
        { op: 'replace', path: '/clips/1/camera/viewport/x', value: 0.1 },
      ],
    })
    expect(edited.duration).toBe(3)
    expect(JSON.stringify(edited).length).toBeLessThan(4096)
  })

  it(
    'rejects malformed, oversized, invalid and coverage-breaking patches without changing bytes',
    async () => {
      const p = await plan([{ source, in: 0, out: 4 }], {
        coverage: [{ source, start: 0, end: 4, kind: 'activity' }],
      })
      const before = await readFile(path.join(root, p.plan))
      const { revision } = await call('plan', { operation: 'inspect', plan: p.plan })
      const badOps = [
        [{ op: 'replace', path: '', value: {} }],
        [{ op: 'replace', path: '/clips', value: [] }],
        [{ op: 'add', path: '/clips', value: [] }],
        [{ op: 'remove', path: '/clips' }],
        [{ op: 'remove', path: '/clips/01' }],
        [{ op: 'remove', path: '/clips/-' }],
        [{ op: 'remove', path: '/clips/9' }],
        [{ op: 'add', path: '/clips/2', value: { source } }],
        [{ op: 'replace', path: '/clips/0/no~2key', value: 1 }],
        [{ op: 'replace', path: '/clips/0/camera/enter', value: 1 }],
        [{ op: 'test', path: '/version', value: true }],
        [{ op: 'copy', path: '/clips/0', value: {} }],
        [{ op: 'add', path: '/clips/0/note', value: 'x'.repeat(12 * 1024) }],
        Array.from({ length: 9 }, () => ({ op: 'test', path: '/version', value: 1 })),
        [{ op: 'replace', path: '/clips/0/in', value: 1 }],
        [
          {
            op: 'add',
            path: '/clips/0/camera',
            value: { viewport: { x: 0, y: 0, width: 0.5, height: 0.8 } },
          },
        ],
        [{ op: 'replace', path: '/clips/0/out', value: 99 }],
        [
          { op: 'remove', path: '/coverage/0' },
          { op: 'replace', path: '/clips/0/in', value: 1 },
        ],
        [{ op: 'remove', path: '/coverage/0' }],
      ]
      for (const ops of badOps) {
        await expect(
          call('plan', { operation: 'patch', plan: p.plan, revision, ops }),
        ).rejects.toThrow()
        expect(await readFile(path.join(root, p.plan))).toEqual(before)
      }
      // JSON pointer escaping and array append/insertion/removal, including a
      // nested legacy note object, follow RFC6902 rather than dot-path semantics.
      const result = await call('plan', {
        operation: 'patch',
        plan: p.plan,
        revision,
        ops: [
          { op: 'add', path: '/clips/0/note', value: { 'a/b': { '~key': 'before' } } },
          { op: 'replace', path: '/clips/0/note/a~1b/~0key', value: 'after' },
          { op: 'test', path: '/clips/0/note/a~1b/~0key', value: 'after' },
          { op: 'add', path: '/captions/-', value: { start: 0, end: 1, text: 'second' } },
          { op: 'add', path: '/captions/0', value: { start: 0, end: 1, text: 'first' } },
          { op: 'remove', path: '/captions/1' },
        ],
      })
      expect(result.counts.captions).toBe(1)
      expect(
        JSON.parse(await readFile(path.join(root, p.plan), 'utf8')).clips[0].note['a/b']['~key'],
      ).toBe('after')
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'retains media-bound protection even when a patch removes the entire prepared source',
    async () => {
      const prepared = await call('preprocess', { source: 'recording/demo.webm' })
      const before = await readFile(path.join(root, prepared.plan))
      const { revision } = await call('plan', { operation: 'inspect', plan: prepared.plan })
      const original = JSON.parse(before.toString())
      const ops = original.coverage.map((_: any) => ({ op: 'remove', path: '/coverage/0' }))
      ops.push({ op: 'replace', path: '/clips/0', value: { source, in: 0, out: 1 } })
      await expect(
        call('plan', { operation: 'patch', plan: prepared.plan, revision, ops }),
      ).rejects.toThrow(/Coverage/)
      expect(await readFile(path.join(root, prepared.plan))).toEqual(before)
      // Even a fresh plan without explicit coverage inherits the media sidecar.
      const fresh = await plan([{ source: prepared.source }])
      const inspected = await call('plan', { operation: 'inspect', plan: fresh.plan })
      await expect(
        call('plan', {
          operation: 'patch',
          plan: fresh.plan,
          revision: inspected.revision,
          ops: [{ op: 'replace', path: '/clips/0', value: { source } }],
        }),
      ).rejects.toThrow(/Coverage/)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'inspects rendered plans but requires a new output for patching and preserves collisions',
    async () => {
      const p = await plan([{ source, in: 0, out: 1 }])
      await call('render', { plan: p.plan })
      const outputBytes = await readFile(path.join(root, p.output))
      const before = await readFile(path.join(root, p.plan))
      const { revision } = await call('plan', { operation: 'inspect', plan: p.plan })
      await expect(call('validate', { plan: p.plan })).rejects.toThrow(/already exists/)
      await expect(call('render', { plan: p.plan })).rejects.toThrow(/already exists/)
      await expect(
        call('plan', {
          operation: 'patch',
          plan: p.plan,
          revision,
          ops: [{ op: 'add', path: '/clips/0/volume', value: 0.5 }],
        }),
      ).rejects.toThrow(/already exists/)
      expect(await readFile(path.join(root, p.plan))).toEqual(before)
      await expect(
        call('plan', {
          operation: 'create',
          plan: 'edits/collision.json',
          source,
          output: p.output,
        }),
      ).rejects.toThrow(/already exists/)
      await expect(readFile(path.join(root, 'edits/collision.json'))).rejects.toThrow()
      const patched = await call('plan', {
        operation: 'patch',
        plan: p.plan,
        revision,
        ops: [
          { op: 'replace', path: '/output/path', value: `renders/revised-${serial}.mp4` },
          { op: 'add', path: '/clips/0/volume', value: 0.5 },
        ],
      })
      expect((await call('render', { plan: p.plan })).output).toBe(patched.output)
      expect(await readFile(path.join(root, p.output))).toEqual(outputBytes)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'writes full portable compact-report artifacts with clip-independent response size',
    async () => {
      const p = await plan(
        Array.from({ length: 80 }, () => ({ source, in: 0, out: 0.1, fit: 'cover' })),
      )
      const full = await call('validate', { plan: p.plan })
      const compact = await call('validate', { plan: p.plan, compact: true })
      expect(compact.counts).toMatchObject({ clips: 80, timeline: 80, warnings: 80 })
      expect(compact.sources).toEqual([source])
      expect(compact.warnings).toHaveLength(3)
      expect(compact.timeline).toBeUndefined()
      expect(JSON.stringify(compact).length).toBeLessThan(4096)
      const artifact = JSON.parse(await readFile(path.join(root, compact.report), 'utf8'))
      expect(artifact.timeline).toEqual(full.timeline)
      expect(artifact.warnings).toHaveLength(80)
      expect(JSON.stringify(artifact)).not.toContain(root)
      const renderPlan = await plan([{ source, in: 0, out: 1 }])
      for (const [action, args] of [
        ['render', { plan: renderPlan.plan }],
        ['analyze', { source }],
        ['preprocess', { source: 'recording/demo.webm' }],
      ] as const) {
        const result = await call(action, { ...args, compact: true })
        expect(result.report).toMatch(/^\.video-work\/reports\//)
        expect(JSON.stringify(result).length).toBeLessThan(4096)
        const report = JSON.parse(await readFile(path.join(root, result.report), 'utf8'))
        expect(JSON.stringify(report)).not.toContain(root)
        if (action === 'render') expect(report.timeline).toHaveLength(1)
        if (action === 'analyze') expect(report.silences).toBeInstanceOf(Array)
        if (action === 'preprocess') {
          expect(report.map.length).toBeGreaterThan(0)
          expect(result.removed_seconds).toBeGreaterThan(0)
          expect(result.prepass_plan).toBeTruthy()
          const mapping = await call('plan', {
            operation: 'inspect',
            plan: result.prepass_plan,
            section: 'timeline',
          })
          expect(mapping.total).toBe(report.map.length)
        }
      }
      await expect(call('render', { plan: renderPlan.plan, compact: true })).rejects.toThrow(
        /already exists/,
      )
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it('contains authoring paths, backups and report files within the workspace', async () => {
    const p = await plan([{ source }])
    await symlink(tmpdir(), path.join(root, 'author-escape'))
    await expect(
      call('plan', {
        operation: 'create',
        plan: 'author-escape/plan.json',
        source,
        output: 'renders/safe.mp4',
      }),
    ).rejects.toThrow(/outside this project/)
    await symlink(path.join(root, p.plan), path.join(root, 'edits/plan-alias.json'))
    await expect(
      call('plan', { operation: 'inspect', plan: 'edits/plan-alias.json' }),
    ).rejects.toThrow(/symlinks/)
    const { revision } = await call('plan', { operation: 'inspect', plan: p.plan })
    const before = await readFile(path.join(root, p.plan))
    await expect(
      call('plan', {
        operation: 'patch',
        plan: p.plan,
        revision,
        ops: [{ op: 'replace', path: '/output/path', value: 'author-escape/out.mp4' }],
      }),
    ).rejects.toThrow(/outside this project/)
    expect(await readFile(path.join(root, p.plan))).toEqual(before)
    for (const artifact of ['plan-locks', 'plan-history', 'reports']) {
      const isolated = await mkdtemp(path.join(root, 'author-symlink-'))
      for (const dir of ['uploads', 'edits', '.video-work']) {
        await mkdir(path.join(isolated, dir))
      }
      await cp(path.join(root, source), path.join(isolated, source))
      await cp(path.join(root, p.plan), path.join(isolated, p.plan))
      await symlink(tmpdir(), path.join(isolated, '.video-work', artifact))
      const action = artifact === 'reports' ? 'validate' : 'plan'
      const args =
        artifact === 'reports'
          ? { plan: p.plan, compact: true }
          : {
              operation: 'patch',
              plan: p.plan,
              revision,
              ops: [{ op: 'add', path: '/clips/0/volume', value: 0.5 }],
            }
      await expect(call(action, args, isolated)).rejects.toThrow(/outside this project/)
      expect(await readFile(path.join(isolated, p.plan))).toEqual(before)
    }
  })

  it(
    'keeps slow visual changes and handles recordings without an audio track',
    async () => {
      const input = 'uploads/slow-fade.mp4'
      await ff([
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=320x180:r=30:d=6',
        '-vf',
        'fade=t=in:st=0:d=6',
        '-c:v',
        'libx264',
        path.join(root, input),
      ])
      // Adjacent changes alone fall below the codec-noise threshold; the longer
      // baseline must keep this entire gradual visual change despite silence.
      const moving = await call('preprocess', { source: input })
      expect(moving.removed_seconds).toBe(0)
      const still = await call('preprocess', { source: 'recording/demo.webm' })
      expect(still.removed_seconds).toBeGreaterThan(1)
      expect(
        (await call('verify', { source: still.source, expected_duration: still.duration })).passed,
      ).toBe(true)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'settles the rendered camera at the speech/action cue after retimed preceding clips',
    async () => {
      const input = 'uploads/camera-cue.mp4'
      await ff([
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=10:d=4',
        '-vf',
        'drawbox=x=0:y=0:w=160:h=180:color=red:t=fill',
        '-c:v',
        'libx264',
        path.join(root, input),
      ])
      const camera = {
        viewport: { x: 0, y: 0.25, width: 0.5, height: 0.5 },
        enter: 0.4,
        cue: { speech: 2, action: 2.2, hold_until: 3.5 },
      }
      const p = await plan([
        { source, in: 0, out: 2, speed: 2 },
        { source: input, camera },
      ])
      const valid = await call('validate', { plan: p.plan })
      expect(valid.timeline[1].camera_timing).toMatchObject({
        move_start: 2.6,
        settled: 3,
        speech: 3,
        action: 3.2,
      })
      const rendered = await call('render', { plan: p.plan })
      const pixel = async (time: number, output = rendered.output) => {
        const result = await exec(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            path.join(root, output),
            '-ss',
            String(time),
            '-vf',
            'crop=2:2:300:90,format=rgb24',
            '-frames:v',
            '1',
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          { encoding: 'buffer' },
        )
        return [...result.stdout.subarray(0, 3)]
      }
      const before = await pixel(2.4)
      const settled = await pixel(3)
      expect(before[2]).toBeGreaterThan(200)
      expect(before[0]).toBeLessThan(30)
      expect(settled[0]).toBeGreaterThan(200)
      expect(settled[2]).toBeLessThan(30)
      const late = await plan([{ source: input, in: 1.8, camera }])
      await expect(call('validate', { plan: late.plan })).rejects.toThrow(/insufficient lead-in/)
      const early = await plan([{ source: input, camera: { ...camera, exit: 1 } }])
      await expect(call('validate', { plan: early.plan })).rejects.toThrow(/departs before/)
      // An action-only reset can be scheduled on a retimed clip without inventing
      // a speech cue. Before the delay it holds the close crop; after it, full view.
      const resetCamera = {
        start_viewport: camera.viewport,
        viewport: { x: 0, y: 0, width: 1, height: 1 },
        delay: 0.8,
        enter: 0.2,
      }
      const reset = await plan([{ source: input, speed: 2, camera: resetCamera }])
      const resetValid = await call('validate', { plan: reset.plan })
      expect(resetValid.timeline[0].camera_timing).toMatchObject({
        move_start: 0.8,
        settled: 1,
        speech: null,
      })
      const resetRender = await call('render', { plan: reset.plan })
      expect((await pixel(0.6, resetRender.output))[0]).toBeGreaterThan(200)
      expect((await pixel(1.1, resetRender.output))[2]).toBeGreaterThan(200)
      const conflict = await plan([{ source: input, camera: { ...camera, delay: 0 } }])
      await expect(call('validate', { plan: conflict.plan })).rejects.toThrow(/not both/)
      const lateReset = await plan([
        { source: input, speed: 2, camera: { ...resetCamera, delay: 1.9 } },
      ])
      await expect(call('validate', { plan: lateReset.plan })).rejects.toThrow(/Camera delay/)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'renders cuts, retiming and linked camera pans with reproducible portable snapshots',
    async () => {
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
      expect((await call('verify', { source: final.output, expected_duration: 3 })).passed).toBe(
        true,
      )
      expect((await call('verify', { source: final.output, expected_duration: 99 })).passed).toBe(
        false,
      )
      const snapshot = await readFile(path.join(root, final.plan_snapshot), 'utf8')
      expect(snapshot).not.toContain(root)
      expect(JSON.parse(snapshot).report.timeline[0].source).toBe(source)
      await expect(call('render', { plan: p.plan })).rejects.toThrow(/already exists/)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'composites transition overlaps, overlays, redactions and a separate music track',
    async () => {
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
      expect(
        (await call('verify', { source: rendered.output, expected_duration: 3.5 })).passed,
      ).toBe(true)
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'assembles a durable fallback with cursor/audio and carries the cursor through edits',
    async () => {
      const master = 'recording/cursor-source.mkv'
      const capture = new CaptureEncoder(path.join(root, master), 320, 180, {
        finishTimeoutMs: 1000,
        maxQueuedBytes: 0,
      })
      const jpeg = await exec(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          path.join(root, 'recording/demo.webm'),
          '-frames:v',
          '1',
          '-c:v',
          'mjpeg',
          '-f',
          'image2pipe',
          'pipe:1',
        ],
        { encoding: 'buffer' },
      )
      await capture.write(jpeg.stdout, 0)
      await capture.stop(4000)
      const event = (
        time: number,
        x: number,
        y: number,
        shape = 'arrow',
        kind = 'move',
        buttons = 0,
        page = 0,
      ) => ({ time, x, y, shape, kind, buttons, page })
      const trace = {
        version: 2,
        complete: true,
        startTime: 1000,
        duration: 4,
        width: 320,
        height: 180,
        events: [
          event(0, 40, 40, 'hidden', 'document'),
          event(0.2, 40, 40),
          event(0.5, 40, 40, 'arrow', 'down', 1),
          event(0.51, 40, 40, 'arrow', 'up'),
          event(1, 40, 40, 'arrow', 'document', 0, 1),
          event(1.1, 160, 60, 'hand', 'move', 0, 1),
          event(2, 240, 100, 'text', 'move', 0, 1),
          event(3, 240, 100, 'hidden', 'hide', 0, 1),
        ],
      }
      await writeFile(path.join(root, 'recording/cursor.json'), JSON.stringify(trace))
      const args = {
        source: master,
        cursor: 'recording/cursor.json',
        capture_start: 1000,
        clips: [{ source: 'recording/voice.wav', start: 1 }],
      }
      const result = await call('assemble_recording', args)
      expect(result.cursor).toMatchObject({ events: 8, sprite_size: 32, fps: 30 })
      expect(result.cursor.position_updates).toBeLessThan(10)
      expect((await call('verify', { source: result.source, expected_duration: 4 })).passed).toBe(
        true,
      )
      const pixels = async (file: string, time: number) =>
        (
          await exec(
            'ffmpeg',
            [
              '-v',
              'error',
              '-ss',
              String(time),
              '-i',
              path.join(root, file),
              '-frames:v',
              '1',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              'pipe:1',
            ],
            { encoding: 'buffer' },
          )
        ).stdout
      const white = (frame: Buffer, x: number, y: number) => {
        let count = 0
        for (let dy = -8; dy < 20; dy++)
          for (let dx = -8; dx < 20; dx++) {
            const at = ((y + dy) * 320 + x + dx) * 3
            if (frame[at]! > 140 && frame[at + 1]! > 140) count++
          }
        return count
      }
      expect(white(await pixels(result.source, 0), 40, 40)).toBe(0)
      expect(white(await pixels(result.source, 0.3), 40, 40)).toBeGreaterThan(10)
      // No invented glide through the idle gap toward the next recorded position.
      expect(white(await pixels(result.source, 0.9), 100, 50)).toBe(0)
      expect(white(await pixels(result.source, 1.3), 160, 60)).toBeGreaterThan(10)
      expect(white(await pixels(result.source, 2.3), 240, 100)).toBeGreaterThan(3)
      expect(white(await pixels(result.source, 3.3), 240, 100)).toBe(0)
      const edited = await plan([
        {
          source: result.source,
          in: 1.1,
          out: 1.9,
          speed: 2,
          camera: { viewport: { x: 0.25, y: 0.1, width: 0.5, height: 0.5 } },
        },
      ])
      const rendered = await call('render', { plan: edited.plan })
      expect(white(await pixels(rendered.output, 0.1), 160, 84)).toBeGreaterThan(10)
      await expect(call('assemble_recording', { ...args, capture_start: 2000 })).rejects.toThrow(
        'different capture clocks',
      )
      await writeFile(
        path.join(root, 'recording/cursor.json'),
        JSON.stringify({ ...trace, complete: false }),
      )
      await expect(call('assemble_recording', args)).rejects.toThrow('incomplete')
      await writeFile(
        path.join(root, 'recording/cursor.json'),
        JSON.stringify({ ...trace, width: 1920 }),
      )
      await expect(call('assemble_recording', args)).rejects.toThrow('viewport')
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'keeps dense 60Hz pointer movement on the correct 30fps output frame',
    async () => {
      const input = 'recording/cursor-motion.webm'
      await ff([
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=30:d=2',
        '-c:v',
        'libvpx',
        path.join(root, input),
      ])
      const events = Array.from({ length: 120 }, (_, i) => ({
        time: i / 60,
        kind: 'move',
        x: 20 + i * 2,
        y: 40,
        shape: 'arrow',
        buttons: 0,
        page: 0,
      }))
      await writeFile(
        path.join(root, 'recording/dense-cursor.json'),
        JSON.stringify({
          version: 2,
          complete: true,
          startTime: 1000,
          duration: 2,
          width: 320,
          height: 180,
          events,
        }),
      )
      const rendered = await call('assemble_recording', {
        source: input,
        cursor: 'recording/dense-cursor.json',
        capture_start: 1000,
      })
      const { stdout } = await exec(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          path.join(root, rendered.source),
          '-map',
          '0:v:0',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
      )
      for (let frame = 0; frame < 60; frame++) {
        let left = 320
        for (let y = 35; y < 60; y++)
          for (let x = 0; x < 320; x++) {
            const at = (frame * 320 * 180 + y * 320 + x) * 3
            if (stdout[at]! > 180 && stdout[at + 1]! > 180) left = Math.min(left, x)
          }
        // White interior begins 1–3px inside the arrow's outlined hotspot.
        expect(left, `cursor at output frame ${frame}`).toBeGreaterThanOrEqual(20 + frame * 4)
        expect(left, `cursor at output frame ${frame}`).toBeLessThanOrEqual(23 + frame * 4)
      }
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'assembles uncut capture with narration at its source-time offset',
    async () => {
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
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'rejects invalid plans, traversal, symlink escapes and playlist media',
    async () => {
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
      await expect(call('validate', { plan: unsafeOut.plan })).rejects.toThrow(
        /outside this project/,
      )
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

  it(
    'keeps a relative plan usable after moving the workspace',
    async () => {
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
    },
    MEDIA_TEST_TIMEOUT_MS,
  )

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
