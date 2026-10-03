/**
 * A checkpoint that keeps failing — storage credentials expired on a laptop,
 * say — must not be packed, sent and logged again on every five-second tick
 * for every held project. Each project backs off on its own, reports the
 * failure once at error (with what to do about a refused login) and its
 * repeats at debug, and is back on the normal schedule after one success.
 * The archives a dead process was uploading are cleared when the loops start.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'studio-backoff-'))
process.env.PROJECTS_DIR = path.join(root, 'projects')
process.env.PI_AGENT_DIR = path.join(root, 'agent')
process.env.STUDIO_WORKER_ID = 'w1'
process.env.STUDIO_WORKSPACE_BUCKET = 'test-workspaces'
process.env.STUDIO_CHECKPOINT_SETTLE_MS = '1000'

type Logger = Record<'info' | 'warn' | 'error' | 'debug', ReturnType<typeof vi.fn>>
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  loggers: new Map<string, Logger>(),
}))

const rows = new Map<string, any>()
vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 1),
    },
    renderJob: { findMany: vi.fn(async () => []) },
    studioWorker: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: (name: string) => {
    if (!mocks.loggers.has(name))
      mocks.loggers.set(name, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
    return mocks.loggers.get(name)
  },
  sendDiscordMessage: vi.fn(),
}))
vi.mock('../apps/api/src/worker/registry.js', () => ({
  currentEpoch: () => 3,
  setDraining: vi.fn(),
}))
vi.mock('../apps/api/src/flows/index.js', () => ({
  getAgent: () => ({
    describe: async () => ({ preview: null, outputs: [] }),
    artifactKind: async () => null,
  }),
}))
vi.mock('../apps/api/src/studio/session.js', () => ({
  AGENT_DIR: path.join(root, 'agent'),
  peekSession: () => undefined,
  onSessionBusy: vi.fn(),
  closeSession: vi.fn(async () => {}),
  closeStudio: vi.fn(async () => {}),
  stopSession: vi.fn(async () => false),
  listStudioModels: vi.fn(async () => []),
}))
vi.mock('../apps/api/src/worker/checkpoint.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../apps/api/src/worker/checkpoint.js')>()),
  uploadCheckpoint: mocks.upload,
  pruneCheckpoints: vi.fn(async () => {}),
}))

const host = await import('../apps/api/src/worker/host.js')
const { Backoff } = await import('../apps/api/src/worker/backoff.js')

function row(id: string) {
  rows.set(id, {
    id,
    userId: 'user_1',
    flow: 'studio',
    name: id,
    title: id,
    prompt: '',
    options: '{}',
    sessionFile: null,
    creditsCharged: 0,
    outputs: '[]',
    thumbnailUrl: null,
    lastError: null,
    isPublic: false,
    shareSlug: null,
    shareViews: 0,
    source: 'app',
    workerId: 'w1',
    workerEpoch: 3,
    lastWorkerId: null,
    workspaceVersion: 0,
    artifactKind: null,
    busyAt: null,
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

const log = () => mocks.loggers.get('studio:host')!
const attempts = (projectId: string) =>
  mocks.upload.mock.calls.filter(([input]) => input.projectId === projectId).length
const refused = () =>
  Object.assign(new Error('invalid_grant'), {
    response: { data: { error: 'invalid_grant', error_description: 'reauth related error' } },
  })
const REFUSED = 'workspace checkpoint failed: storage credentials rejected — refresh them'

/** Run the clock one loop tick at a time, letting each tick's work finish. */
async function run(ms: number) {
  for (let t = 0; t < ms; t += 5000) {
    await vi.advanceTimersByTimeAsync(5000)
    await new Promise(r => setTimeout(r, 0))
  }
}

const leftover = path.join(
  root,
  'projects',
  '.studio--user_1--p1.workspace.tar.upload-musox51pkjsy',
)

beforeAll(async () => {
  await mkdir(path.join(root, 'projects'), { recursive: true })
  await writeFile(leftover, Buffer.alloc(4096))
  row('p1')
  row('p2')
  await host.describe('p1')
  await host.describe('p2')
  // Real setTimeout and I/O; only the loops' interval and the clock are ours.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  host.startHostLoops()
})
afterAll(async () => {
  host.stopHostLoops()
  vi.useRealTimers()
  await rm(root, { recursive: true, force: true })
})

describe('checkpoint loop backoff', () => {
  it('clears the archives a previous process died uploading', async () => {
    for (let i = 0; i < 100 && existsSync(leftover); i++) await new Promise(r => setTimeout(r, 5))
    expect(existsSync(leftover)).toBe(false)
  })

  it('backs off per project, says a refused login once, and starts over after a success', async () => {
    mocks.upload.mockRejectedValue(refused())
    host.noteExternalWrite('p1')
    host.noteExternalWrite('p2')

    // Ticks every 5 s; tries at 5, 15 and 35 s rather than twelve times.
    await run(60_000)
    expect(attempts('p1')).toBe(3)
    expect(attempts('p2')).toBe(3)
    expect(log().error).toHaveBeenCalledTimes(2)
    for (const projectId of ['p1', 'p2'])
      expect(log().error).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, failures: 1, retryInMs: 10_000 }),
        REFUSED,
      )
    expect(log().debug).toHaveBeenCalledTimes(4)
    expect(log().debug).toHaveBeenLastCalledWith(
      expect.objectContaining({ failures: 3, retryInMs: 40_000 }),
      'workspace checkpoint failed again',
    )

    // …then 75, 155, 315 and 615 s: the wait doubles until it holds at five minutes.
    await run(600_000)
    expect(attempts('p1')).toBe(7)
    expect(log().error).toHaveBeenCalledTimes(2)
    expect(log().debug).toHaveBeenLastCalledWith(
      expect.objectContaining({ failures: 7, retryInMs: 300_000 }),
      'workspace checkpoint failed again',
    )
    expect(log().warn).not.toHaveBeenCalled()

    // The credentials are refreshed: the next try lands and the schedule resets.
    mocks.upload.mockResolvedValue({})
    await run(300_000)
    const recovered = () =>
      log().info.mock.calls.filter(([, msg]) => msg === 'workspace checkpoint recovered')
    for (let i = 0; i < 100 && recovered().length < 2; i++) await new Promise(r => setTimeout(r, 5))
    expect(attempts('p1')).toBe(8)
    expect(log().info).toHaveBeenCalledWith(
      { projectId: 'p1', failures: 7 },
      'workspace checkpoint recovered',
    )
    host.noteExternalWrite('p1')
    await run(5000)
    expect(attempts('p1')).toBe(9)
  })
})

describe('Backoff', () => {
  it('doubles the wait up to the cap and starts over after a success', () => {
    const b = new Backoff(10_000, 300_000)
    const delays = Array.from({ length: 7 }, () => b.fail(new Error('invalid_grant'), 0).delayMs)
    expect(delays).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000])
    expect(b.waiting(299_999)).toBe(true)
    expect(b.waiting(300_000)).toBe(false)
    expect(b.succeed()).toBe(7)
    expect(b.waiting(0)).toBe(false)
    expect(b.fail(new Error('invalid_grant'), 0)).toEqual({ repeat: false, delayMs: 10_000 })
  })

  it('calls a failure a repeat only when it says the same thing', () => {
    const b = new Backoff()
    expect(b.fail(new Error('invalid_grant')).repeat).toBe(false)
    expect(b.fail(new Error('invalid_grant')).repeat).toBe(true)
    expect(b.fail(new Error('timed out after 300000ms')).repeat).toBe(false)
    expect(b.fail(new Error('timed out after 299990ms')).repeat).toBe(true)
    expect(b.fail(new Error('invalid_grant')).repeat).toBe(false)
  })
})
