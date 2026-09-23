/**
 * The render tier's seams, without a database or a bucket:
 *
 *   - the registry sends a heavy action to the dispatcher and a light one
 *     nowhere, meters the outermost call once, and hands progress and the
 *     abort signal through;
 *   - the worker's wait relays progress, honours a cancel, and returns the
 *     job's final row;
 *   - the output walk ships only what the action wrote;
 */
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobs = new Map<string, any>()
const withdrawn: string[] = []
const transfer = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  tarToFile: vi.fn(),
  tarExtract: vi.fn(),
}))
vi.mock('@saas/db', () => ({
  prisma: {
    renderJob: {
      findUnique: vi.fn(async ({ where }: any) => jobs.get(where.id) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const j = jobs.get(where.id)
        if (!j || (where.status && j.status !== where.status)) return { count: 0 }
        if (data.cancelRequested) withdrawn.push(where.id)
        Object.assign(j, data)
        return { count: 1 }
      }),
    },
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../apps/api/src/worker/host.js', () => ({
  checkpointForRender: vi.fn(async () => ({ projectId: 'p1', version: 7 })),
  noteExternalWrite: vi.fn(),
}))
// The bucket side of a transfer is tar plus object storage; only the walk is under test.
vi.mock('../apps/api/src/worker/checkpoint.js', () => ({
  bucket: () => ({
    get: transfer.get,
    head: transfer.head,
    put: transfer.put,
    remove: transfer.remove,
  }),
  tarToFile: transfer.tarToFile,
  tarExtract: transfer.tarExtract,
}))
process.env.STUDIO_RENDER_POLL_MS = '10'

const {
  invokeHostAction,
  registerHostAction,
  setRemoteDispatcher,
  takeComputeSeconds,
  isRemoteAction,
} = await import('../apps/api/src/studio/host-actions.js')
const { awaitJob } = await import('../apps/api/src/worker/remote.js')
const { changedSince, downloadOutput, uploadOutput } = await import(
  '../apps/api/src/renderer/transfer.js'
)
const { decide } = await import('../apps/api/src/renderer/autoscale.js')

const ws = { flow: 'studio', userId: 'u', name: 'n', internal: 'studio--u--n', dir: '/x' } as any

beforeEach(() => {
  setRemoteDispatcher(null)
  jobs.clear()
  withdrawn.length = 0
  vi.clearAllMocks()
  transfer.put.mockResolvedValue(undefined)
  transfer.head.mockResolvedValue({ size: 12 })
  transfer.remove.mockResolvedValue(undefined)
  transfer.tarExtract.mockResolvedValue(undefined)
  takeComputeSeconds(ws.internal)
})

describe('host action registry', () => {
  it('sends a heavy action to the dispatcher and runs a light one here', async () => {
    const heavy = vi.fn(async () => 'ran here')
    const light = vi.fn(async () => 'light')
    registerHostAction('t_heavy', heavy, { remote: true })
    registerHostAction('t_light', light)
    expect(isRemoteAction('t_heavy')).toBe(true)
    expect(isRemoteAction('t_light')).toBe(false)
    const dispatcher = vi.fn(async (_ws: any, name: string) => `ran elsewhere: ${name}`)
    setRemoteDispatcher(dispatcher)
    expect(await invokeHostAction(ws, 't_heavy', { a: 1 })).toBe('ran elsewhere: t_heavy')
    expect(heavy).not.toHaveBeenCalled()
    expect(await invokeHostAction(ws, 't_light', {})).toBe('light')
    expect(dispatcher).toHaveBeenCalledTimes(1)
  })

  it('dispatches a heavy action reached from inside a light one', async () => {
    registerHostAction('t_inner', async () => 'inner here', { remote: true })
    registerHostAction('t_outer', async w => `outer → ${await invokeHostAction(w, 't_inner', {})}`)
    setRemoteDispatcher(async () => 'inner elsewhere')
    expect(await invokeHostAction(ws, 't_outer', {})).toBe('outer → inner elsewhere')
  })

  it('runs everything here when there is no dispatcher and meters the outer call once', async () => {
    registerHostAction(
      't_slow',
      async () => {
        await new Promise(r => setTimeout(r, 30))
        return 'ok'
      },
      { remote: true },
    )
    registerHostAction('t_wrap', async w => invokeHostAction(w, 't_slow', {}))
    expect(await invokeHostAction(ws, 't_wrap', {})).toBe('ok')
    const seconds = takeComputeSeconds(ws.internal)
    expect(seconds).toBeGreaterThan(0.02)
    expect(seconds).toBeLessThan(0.5)
  })

  it('passes progress and the signal through', async () => {
    registerHostAction('t_ctx', async (_w, _p, ctx) => {
      ctx.progress?.('half', 50)
      return ctx.signal?.aborted ? 'aborted' : 'live'
    })
    const progress = vi.fn()
    const c = new AbortController()
    expect(await invokeHostAction(ws, 't_ctx', {}, { progress, signal: c.signal })).toBe('live')
    expect(progress).toHaveBeenCalledWith('half', 50)
  })
})

describe('waiting on a render job', () => {
  it('relays progress and resolves with the finished row', async () => {
    jobs.set('j1', { id: 'j1', status: 'running', stage: 'capturing', progress: 10 })
    setTimeout(() => Object.assign(jobs.get('j1'), { stage: 'capturing', progress: 60 }), 15)
    setTimeout(
      () =>
        Object.assign(jobs.get('j1'), {
          status: 'done',
          stage: 'done',
          progress: 100,
          result: 'ok',
        }),
      40,
    )
    const progress = vi.fn()
    const row = await awaitJob('j1', { progress })
    expect(row.status).toBe('done')
    expect(row.result).toBe('ok')
    const seen = progress.mock.calls.map(c => c.join(':'))
    expect(seen[0]).toBe('capturing:10')
    expect(seen).toContain('capturing:60')
    expect(seen[seen.length - 1]).toBe('done:100')
  })

  it('withdraws the job when the caller aborts', async () => {
    jobs.set('j2', { id: 'j2', status: 'running', stage: 'running', progress: 0 })
    const c = new AbortController()
    const wait = awaitJob('j2', { signal: c.signal })
    setTimeout(() => c.abort(), 15)
    setTimeout(() => Object.assign(jobs.get('j2'), { status: 'cancelled' }), 40)
    const row = await wait
    expect(row.status).toBe('cancelled')
    expect(withdrawn).toEqual(['j2'])
  })

  it('gives up after the timeout and withdraws', async () => {
    jobs.set('j3', { id: 'j3', status: 'queued', stage: null, progress: 0 })
    await expect(awaitJob('j3', {}, { timeoutMs: 30 })).rejects.toThrow(/did not finish/)
    expect(jobs.get('j3').status).toBe('cancelled')
  })
})

describe('output walk', () => {
  it('ships only files written after the mark, never scratch or the marker', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'render-out-'))
    const old = new Date(Date.now() - 60_000)
    await mkdir(path.join(dir, 'renders'), { recursive: true })
    await mkdir(path.join(dir, '.thumbs'), { recursive: true })
    await writeFile(path.join(dir, 'index.html'), 'x')
    await utimes(path.join(dir, 'index.html'), old, old)
    await writeFile(path.join(dir, '.studio-checkpoint'), '{}')
    await new Promise(r => setTimeout(r, 20))
    const since = Date.now()
    await new Promise(r => setTimeout(r, 20))
    await writeFile(path.join(dir, 'renders/launch-1080p.mp4'), 'mp4')
    await writeFile(path.join(dir, 'renders/launch-1080p.mp4.timeline.json'), '{}')
    await writeFile(path.join(dir, '.thumbs/html_0_50.jpg'), 'jpg')
    expect(await changedSince(dir, since)).toEqual([
      'renders/launch-1080p.mp4',
      'renders/launch-1080p.mp4.timeline.json',
    ])
  })

  it('uploads the finished tar with its exact size', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'render-upload-'))
    transfer.tarToFile.mockImplementation(async (_dir: string, _files: string[], file: string) => {
      await writeFile(file, 'complete tar')
      return 12
    })
    transfer.put.mockImplementation(async (_key, body, _type, size) => {
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(Buffer.from(chunk))
      expect(Buffer.concat(chunks).toString()).toBe('complete tar')
      expect(size).toBe(12)
    })

    await expect(uploadOutput('j1', dir, ['renders/video.mp4'])).resolves.toBe(1)
  })

  it('rejects an incomplete output upload before completing the render job', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'render-upload-'))
    transfer.tarToFile.mockImplementation(async (_dir: string, _files: string[], file: string) => {
      await writeFile(file, 'complete tar')
      return 12
    })
    transfer.head.mockResolvedValue({ size: 3 })

    await expect(uploadOutput('j1', dir, ['renders/video.mp4'])).rejects.toThrow(
      'expected 12 bytes, got 3',
    )
  })

  it('rejects a corrupt output archive instead of reporting an empty merge', async () => {
    transfer.get.mockResolvedValue(Readable.from([Buffer.from('broken')]))
    transfer.tarExtract.mockRejectedValue(new Error('not a tar archive'))

    await expect(downloadOutput('j1', '/workspace')).rejects.toThrow('not a tar archive')
  })
})

describe('render autoscaler decision', () => {
  const base = { min: 0, max: 8, idleMs: 600_000 }
  it('scales up at once', () => {
    expect(decide({ ...base, current: 0, demand: 3, idleFor: 0 })).toBe(3)
    expect(decide({ ...base, current: 2, demand: 20, idleFor: 0 })).toBe(8)
  })
  it('holds until the idle window has passed, then scales down', () => {
    expect(decide({ ...base, current: 3, demand: 1, idleFor: 60_000 })).toBeNull()
    expect(decide({ ...base, current: 3, demand: 1, idleFor: 600_000 })).toBe(1)
    expect(decide({ ...base, current: 1, demand: 0, idleFor: 700_000 })).toBe(0)
  })
  it('respects the floor and leaves a matching count alone', () => {
    expect(decide({ ...base, min: 1, current: 1, demand: 0, idleFor: 900_000 })).toBeNull()
    expect(decide({ ...base, current: 2, demand: 2, idleFor: 900_000 })).toBeNull()
  })
})
