import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rows = new Map<string, any>()
const workspaces = new Map<string, { dir: string; internal: string }>()
const getRow = vi.fn(async (_userId: string, id: string) => rows.get(id))
const artifacts = new Map<string, { kind: string; rel: string; at: number } | null>()
const packageCalls: any[] = []
let blockPackages = false

vi.mock('@saas/db', () => ({ getCreditBalance: vi.fn(), deductCredit: vi.fn(), prisma: {} }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  getRow,
  getProject: vi.fn(),
  addOutput: vi.fn(),
  workspaceOf: (p: any) => workspaces.get(p.id),
}))
vi.mock('../apps/api/src/agent/describe.js', () => ({
  artifactKind: vi.fn(async () => null),
  activeArtifact: vi.fn(async (ws: { internal: string }) => artifacts.get(ws.internal) ?? null),
}))
vi.mock('../apps/api/src/projects/editable-package.js', () => ({
  buildEditablePackage: vi.fn(async (input: any) => {
    packageCalls.push(input)
    if (blockPackages)
      await new Promise<void>((_resolve, reject) =>
        input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true }),
      )
    const file = join(input.outputDir, 'package.zip')
    await writeFile(file, 'zip')
    return { file, manifest: {} }
  }),
}))

const { cancelExport, exportProject, getExport, registerExporter } = await import(
  '../apps/api/src/projects/export.js'
)

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'editable-export-'))
  rows.clear()
  workspaces.clear()
  artifacts.clear()
  packageCalls.length = 0
  blockPackages = false
  getRow.mockClear()
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function project(id = 'p1') {
  const dir = join(root, id)
  await mkdir(join(dir, 'renders'), { recursive: true })
  rows.set(id, {
    id,
    userId: 'user_1',
    flow: 'studio',
    name: id,
    title: 'A Project',
    options: {},
    outputs: [],
  })
  workspaces.set(id, { dir, internal: `studio--user_1--${id}` })
  return dir
}

describe('editable export lifecycle', () => {
  it('rejects an unknown format after enforcing project ownership', async () => {
    await project()

    await expect(exportProject('user_1', 'p1', { format: 'resolve' })).rejects.toMatchObject({
      message: 'unknown export format',
      status: 400,
    })
    expect(getRow).toHaveBeenCalledWith('user_1', 'p1')
  })

  it('keeps an explicit MP4 format on the existing export path', async () => {
    await project('mp4')
    rows.get('mp4').outputs = [
      { kind: 'video', url: '/files/projects/studio--user_1--mp4/renders/final.mp4' },
    ]

    const status = await exportProject('user_1', 'mp4', { format: 'mp4' })

    expect(status).toMatchObject({ stage: 'done', url: expect.stringContaining('final.mp4') })
    expect(packageCalls).toEqual([])
  })

  it('packages the exact active video and exposes stable completed status', async () => {
    const dir = await project()
    await writeFile(join(dir, 'renders', 'chosen.mp4'), 'movie')
    artifacts.set('studio--user_1--p1', { kind: 'video', rel: 'renders/chosen.mp4', at: 1 })

    const started = await exportProject('user_1', 'p1', { format: 'premiere' })
    expect(started).toMatchObject({
      format: 'premiere',
      filename: 'project-premiere.zip',
      stage: 'packaging',
      progress: 15,
      running: true,
      res: null,
    })
    await vi.waitFor(() => expect(getExport('p1').stage).toBe('done'))
    expect(packageCalls[0].videoRel).toBe('renders/chosen.mp4')
    expect(getExport('p1')).toMatchObject({
      progress: 100,
      url: '/files/projects/studio--user_1--p1/renders/editable-premiere-source.zip',
      filename: 'project-premiere.zip',
    })
    expect((await stat(join(dir, 'renders', 'editable-premiere-source.zip'))).size).toBeGreaterThan(
      0,
    )
  })

  it('requires a fresh nonempty launch render at a valid resolution', async () => {
    const dir = await project('launch')
    const internal = 'studio--user_1--launch'
    artifacts.set(internal, { kind: 'launch', rel: 'index.html', at: 1 })
    await writeFile(join(dir, 'index.html'), 'source')
    await writeFile(join(dir, 'shots.js'), 'source')

    await expect(
      exportProject('user_1', 'launch', { format: 'blender', res: 'cinema' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(exportProject('user_1', 'launch', { format: 'blender' })).rejects.toMatchObject({
      message: 'Render a current 1080p MP4 first, then export the editable package.',
      status: 409,
    })

    const render = join(dir, 'renders', 'launch-1080p.mp4')
    await writeFile(render, 'movie')
    const old = new Date(Date.now() - 10_000)
    await utimes(render, old, old)
    await expect(exportProject('user_1', 'launch', { format: 'blender' })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('uses only marks whose sidecar identity matches a launch render', async () => {
    const dir = await project('marks')
    const internal = 'studio--user_1--marks'
    artifacts.set(internal, { kind: 'launch', rel: 'index.html', at: 1 })
    await writeFile(join(dir, 'index.html'), 'source')
    await writeFile(join(dir, 'shots.js'), 'source')
    const video = join(dir, 'renders', 'launch-1080p.mp4')
    await writeFile(video, 'movie')
    const source = await stat(video)
    await writeFile(
      join(dir, 'renders', 'launch-1080p.timeline.json'),
      JSON.stringify({
        durationSec: 1,
        sourceBytes: source.size,
        sourceMtimeMs: source.mtimeMs + 0.005,
        beats: [{ start: 0.25, dur: 0.5, text: 'Beat' }],
      }),
    )

    await exportProject('user_1', 'marks', { format: 'after-effects' })
    await vi.waitFor(() => expect(getExport('marks').stage).toBe('done'))
    expect(packageCalls[0].marks).toEqual([{ start: 0.25, label: 'Beat' }])
  })

  it('omits unbound legacy marks and mismatched identified marks', async () => {
    for (const [id, timeline] of [
      ['legacy', { durationSec: 1, beats: [{ start: 0.2, dur: 0.5, text: 'Legacy' }] }],
      [
        'mismatch',
        {
          durationSec: 1,
          sourceBytes: 999,
          sourceMtimeMs: 1,
          beats: [{ start: 0.3, dur: 0.5, text: 'Wrong source' }],
        },
      ],
    ] as const) {
      const dir = await project(id)
      await writeFile(join(dir, 'renders', 'video.mp4'), 'movie')
      await writeFile(join(dir, 'renders', 'video.timeline.json'), JSON.stringify(timeline))
      artifacts.set(`studio--user_1--${id}`, { kind: 'video', rel: 'renders/video.mp4', at: 1 })
      await exportProject('user_1', id, { format: 'premiere' })
      await vi.waitFor(() => expect(getExport(id).stage).toBe('done'))
    }

    expect(packageCalls[0].marks).toBeUndefined()
    expect(packageCalls[1].marks).toBeUndefined()
  })

  it.each(['browser', 'deck', 'pdf', null])('rejects a %s artifact with 409', async kind => {
    await project(`reject-${kind}`)
    const id = `reject-${kind}`
    artifacts.set(
      `studio--user_1--${id}`,
      kind ? { kind, rel: kind === 'browser' ? 'recording/live.json' : 'deck.html', at: 1 } : null,
    )

    await expect(exportProject('user_1', id, { format: 'premiere' })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('reserves a project before awaited inspection and returns one job to concurrent callers', async () => {
    await project('cancel')
    const internal = 'studio--user_1--cancel'
    const video = join(root, 'cancel', 'renders', 'video.mp4')
    await writeFile(video, 'movie')
    artifacts.set(internal, { kind: 'video', rel: 'renders/video.mp4', at: 1 })
    blockPackages = true

    const [first, collision] = await Promise.all([
      exportProject('user_1', 'cancel', { format: 'premiere' }),
      exportProject('user_1', 'cancel', { format: 'blender' }),
    ])
    expect(collision).toEqual(first)
    await vi.waitFor(() => expect(packageCalls).toHaveLength(1))
    expect(cancelExport('cancel')).toBe(true)
    await vi.waitFor(() =>
      expect(getExport('cancel')).toMatchObject({ stage: 'failed', error: 'cancelled' }),
    )
    await vi.waitFor(async () =>
      expect(
        (await readdir(join(root, 'cancel', 'renders'))).some(name =>
          name.startsWith('.editable-'),
        ),
      ).toBe(false),
    )
  })

  it('shows a newer normal MP4 result instead of an old editable completion', async () => {
    const dir = await project('new-normal')
    await writeFile(join(dir, 'renders', 'chosen.mp4'), 'movie')
    artifacts.set('studio--user_1--new-normal', {
      kind: 'video',
      rel: 'renders/chosen.mp4',
      at: 1,
    })

    await exportProject('user_1', 'new-normal', { format: 'premiere' })
    await vi.waitFor(() => expect(getExport('new-normal').stage).toBe('done'))
    rows.get('new-normal').outputs = [
      { kind: 'video', url: '/files/projects/studio--user_1--new-normal/renders/final.mp4' },
    ]

    const normal = await exportProject('user_1', 'new-normal', { format: 'mp4' })
    expect(normal).toMatchObject({
      stage: 'done',
      progress: 100,
      url: expect.stringContaining('final.mp4'),
    })
    expect(getExport('new-normal')).toEqual(normal)
  })

  it('caps editable packaging at one memory-intensive project', async () => {
    for (const id of ['cap-a', 'cap-b', 'cap-c']) {
      await project(id)
      await writeFile(join(root, id, 'renders', 'video.mp4'), 'movie')
      artifacts.set(`studio--user_1--${id}`, { kind: 'video', rel: 'renders/video.mp4', at: 1 })
    }
    blockPackages = true
    await exportProject('user_1', 'cap-a', { format: 'premiere' })
    await expect(exportProject('user_1', 'cap-b', { format: 'premiere' })).rejects.toMatchObject({
      status: 429,
      message: expect.stringMatching(/wait.*finish/i),
    })
    cancelExport('cap-a')
    await vi.waitFor(() => expect(getExport('cap-a').running).toBe(false))
  })

  it('does not start editable work while a normal exporter is running', async () => {
    await project('normal')
    artifacts.set('studio--user_1--normal', { kind: 'video', rel: 'renders/video.mp4', at: 1 })
    registerExporter('busy-test', {
      start: vi.fn(),
      status: id =>
        id === 'normal'
          ? ({ running: true, stage: 'encoding', progress: 50 } as never)
          : ({ stage: 'idle' } as never),
      cancel: () => false,
    })

    const status = await exportProject('user_1', 'normal', { format: 'premiere' })
    expect(status).toMatchObject({ running: true, stage: 'encoding' })
    expect(packageCalls).toEqual([])
  })
})
