/**
 * host.sessionLog: the raw pi transcript an admin downloads for review. It
 * reads only the `.jsonl` file the project row names, only while this worker
 * holds the project, and refuses anything that is not a regular file — a bad
 * row must not turn it into a read of an arbitrary path.
 */
import { mkdir, mkdtemp, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'session-log-'))
process.env.PROJECTS_DIR = path.join(root, 'projects')
process.env.PI_AGENT_DIR = path.join(root, 'agent')
process.env.STUDIO_WORKER_ID = 'w1'
process.env.STUDIO_WORKSPACE_BUCKET = ''

const rows = new Map<string, any>()
vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    studioWorker: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}))
vi.mock('@saas/shared', async () => {
  const actual = await vi.importActual<any>('../packages/shared/src/index.js')
  return {
    ...actual,
    sendDiscordMessage: vi.fn(),
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }
})
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
  listStudioModels: vi.fn(async () => []),
}))

const host = await import('../apps/api/src/worker/host.js')
const sessions = path.join(root, 'agent', 'sessions')

function row(id: string, over: Record<string, unknown> = {}) {
  rows.set(id, {
    id,
    userId: 'owner',
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
    workerId: 'w1',
    workerEpoch: 3,
    lastWorkerId: null,
    workspaceVersion: 0,
    artifactKind: null,
    busyAt: null,
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  })
}

beforeEach(async () => {
  rows.clear()
  await mkdir(sessions, { recursive: true })
})

describe('host.sessionLog', () => {
  it('returns the transcript the row names', async () => {
    const file = path.join(sessions, 'a.jsonl')
    await writeFile(file, '{"type":"session"}\n{"type":"message"}\n')
    row('p-read', { sessionFile: file })
    expect(await host.sessionLog('p-read')).toBe('{"type":"session"}\n{"type":"message"}\n')
  })

  it('is null for a project that never had a session', async () => {
    row('p-none')
    expect(await host.sessionLog('p-none')).toBeNull()
  })

  it('is null when the file has gone', async () => {
    row('p-gone', { sessionFile: path.join(sessions, 'missing.jsonl') })
    expect(await host.sessionLog('p-gone')).toBeNull()
  })

  it('never reads a file that is not a .jsonl transcript', async () => {
    const secret = path.join(root, 'secret.env')
    await writeFile(secret, 'STRIPE_KEY=sk_live_nope')
    row('p-secret', { sessionFile: secret })
    expect(await host.sessionLog('p-secret')).toBeNull()

    row('p-passwd', { sessionFile: '/etc/passwd' })
    expect(await host.sessionLog('p-passwd')).toBeNull()
  })

  it('never reads a directory dressed as a transcript', async () => {
    const dir = path.join(sessions, 'dir.jsonl')
    await mkdir(dir, { recursive: true })
    row('p-dir', { sessionFile: dir })
    expect(await host.sessionLog('p-dir')).toBeNull()
  })

  it('refuses a transcript too large to send', async () => {
    const file = path.join(sessions, 'huge.jsonl')
    await writeFile(file, '')
    await truncate(file, 65 * 1024 * 1024) // sparse: no real disk used
    row('p-huge', { sessionFile: file })
    await expect(host.sessionLog('p-huge')).rejects.toMatchObject({ status: 413 })
  })

  it('answers only while this worker holds the project', async () => {
    const file = path.join(sessions, 'b.jsonl')
    await writeFile(file, '{}\n')
    row('p-elsewhere', { sessionFile: file, workerId: 'w2' })
    await expect(host.sessionLog('p-elsewhere')).rejects.toMatchObject({
      status: 409,
      code: 'NOT_OWNER',
    })
  })
})
