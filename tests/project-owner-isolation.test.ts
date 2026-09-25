/**
 * Owner isolation on the studio's own routes. Admin review lives on
 * /admin/projects/*; the owner routes must keep answering ONLY the owner —
 * not another user, and not an administrator either (an admin acting through
 * them would be acting as the user and spending their credits).
 *
 * The router, the project service and getRow are all real here; only the
 * database and the worker are fakes. The database fake honours whatever
 * `where` it is given, so a query that forgot to scope by userId would find
 * someone else's project and these tests would fail.
 */
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'alice' as string | null,
  rows: new Map<string, any>(),
  withOwner: vi.fn(),
  currentOwner: vi.fn(),
  clientForWorker: vi.fn(async () => null),
  worker: {} as Record<string, any>,
}))

function matches(row: any, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

vi.mock('@saas/shared', async () => {
  const actual = await vi.importActual<any>('../packages/shared/src/index.js')
  return {
    ...actual,
    sendDiscordMessage: vi.fn(),
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }
})
vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(
        async ({ where }: any) => [...mocks.rows.values()].find(r => matches(r, where)) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: any) => mocks.rows.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: any) =>
        [...mocks.rows.values()].filter(r => matches(r, where)),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const next = { ...mocks.rows.get(where.id), ...data }
        mocks.rows.set(where.id, next)
        return next
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    studioWorker: { findMany: vi.fn(async () => []) },
    creditTransaction: { findFirst: vi.fn(async () => null) },
    // deleteRow: DELETE … WHERE "id" = ${id} AND "userId" = ${userId}
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, id: string, userId: string) => {
      const row = mocks.rows.get(id)
      if (!row || row.userId !== userId) return []
      mocks.rows.delete(id)
      return [row]
    }),
  },
  getAvailableCreditBalance: vi.fn(async () => 1000),
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!mocks.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return mocks.userId
  },
}))
vi.mock('../apps/api/src/worker/client.js', () => ({
  withOwner: mocks.withOwner,
  currentOwner: mocks.currentOwner,
  clientForWorker: mocks.clientForWorker,
  forgetOwner: vi.fn(),
}))
vi.mock('../apps/api/src/worker/host.js', () => ({ followFirstTurn: vi.fn() }))
vi.mock('../apps/api/src/worker/checkpoint.js', () => ({
  deleteCheckpoints: vi.fn(async () => {}),
  readCover: vi.fn(async () => Buffer.from('cover')),
}))
vi.mock('../apps/api/src/worker/lease.js', () => ({ isLive: () => true }))
vi.mock('../apps/api/src/studio/session.js', () => ({
  listStudioModels: vi.fn(async () => []),
}))
vi.mock('../apps/api/src/projects/export.js', () => ({ IDLE_EXPORT: { running: false } }))
vi.mock('../apps/api/src/projects/notifications.js', () => ({
  notifyProjectStarted: vi.fn(async () => {}),
  notifyProjectCompleted: vi.fn(async () => {}),
  notifyVideoRenderReady: vi.fn(async () => {}),
}))

const { router } = await import('../apps/api/src/routes/projects.js')
const app = express().use(express.json()).use('/projects', router)

function project(id: string, userId: string) {
  return {
    id,
    userId,
    flow: 'studio',
    name: id,
    title: `${userId}'s project`,
    prompt: 'secret brief',
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
    workerId: null,
    workerEpoch: null,
    lastWorkerId: null,
    workspaceVersion: 0,
    artifactKind: null,
    busyAt: null,
    pinnedAt: null,
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Every owner route that names a project, with a body that would otherwise be valid. */
const OWNER_ROUTES: Array<[string, string, Record<string, unknown>?]> = [
  ['get', '/projects/alice-p'],
  ['patch', '/projects/alice-p', { title: 'Renamed by someone else' }],
  ['delete', '/projects/alice-p'],
  ['get', '/projects/alice-p/assets'],
  ['post', '/projects/alice-p/assets', { uploads: [{ key: 'k', name: 'n' }] }],
  ['delete', '/projects/alice-p/assets?path=uploads/a.png'],
  ['get', '/projects/alice-p/assets/thumb?path=uploads/a.png'],
  ['post', '/projects/alice-p/deck', { html: '<div class="slide"></div>' }],
  ['post', '/projects/alice-p/deck/render'],
  ['post', '/projects/alice-p/storyboard', { revision: 1, scenes: [] }],
  ['post', '/projects/alice-p/prompt', { text: 'spend their credits' }],
  ['post', '/projects/alice-p/rollback', { entryId: 'e1' }],
  ['post', '/projects/alice-p/queue/e1/steer'],
  ['post', '/projects/alice-p/stop'],
  ['get', '/projects/alice-p/messages'],
  ['get', '/projects/alice-p/events'],
  ['get', '/projects/alice-p/thumbnail'],
  ['post', '/projects/alice-p/export', { res: '1080p' }],
  ['get', '/projects/alice-p/export'],
  ['post', '/projects/alice-p/export/cancel'],
  ['post', '/projects/alice-p/share'],
  ['delete', '/projects/alice-p/share'],
]

function call(method: string, path: string, body?: Record<string, unknown>) {
  const r = (request(app) as any)[method](path)
  return body ? r.send(body) : r
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userId = 'alice'
  mocks.rows = new Map([
    ['alice-p', project('alice-p', 'alice')],
    ['bob-p', project('bob-p', 'bob')],
  ])
  const answer = async () => ({ ok: true })
  mocks.worker = new Proxy(
    {
      describe: async () => ({ preview: null, outputs: [] }),
      busy: async () => false,
      entries: async () => ({ entries: [], busy: false, activeModel: null }),
      listAssets: async () => [],
      addAssets: async () => [],
      deleteAsset: async () => true,
      assetThumbnail: async () => Buffer.from('thumb'),
      thumbnail: async () => Buffer.from('thumb'),
      exportStatus: async () => ({ running: false }),
      startExport: async () => ({ running: true }),
      cancelExport: async () => true,
      prompt: async () => ({ delivery: 'started', turn: 1, entryId: 'e2' }),
      rollback: async () => ({ text: '', entries: [] }),
      stop: async () => true,
      steer: async () => true,
      publishArtifact: async () => {},
      events: async () => {},
    },
    // Not a thenable: currentOwner() resolves to this object.
    { get: (target: any, key) => (key === 'then' ? undefined : (target[key] ?? answer)) },
  )
  mocks.withOwner.mockImplementation(async (_id: string, run: (w: any) => unknown) =>
    run(mocks.worker),
  )
  mocks.currentOwner.mockResolvedValue(mocks.worker)
})

describe('owner routes answer only the owner', () => {
  it.each(OWNER_ROUTES)('another user gets 404: %s %s', async (method, path, body) => {
    mocks.userId = 'bob'
    const res = await call(method, path, body)
    expect(res.status).toBe(404)
    expect(mocks.withOwner).not.toHaveBeenCalled()
    expect(mocks.currentOwner).not.toHaveBeenCalled()
    expect(mocks.rows.get('alice-p')).toMatchObject({ userId: 'alice', title: "alice's project" })
  })

  it.each(OWNER_ROUTES)(
    'an admin gets 404 too — review goes through /admin: %s %s',
    async (method, path, body) => {
      mocks.userId = 'admin'
      const res = await call(method, path, body)
      expect(res.status).toBe(404)
      expect(mocks.withOwner).not.toHaveBeenCalled()
    },
  )

  it.each(OWNER_ROUTES)('a signed-out caller gets 401: %s %s', async (method, path, body) => {
    mocks.userId = null
    const res = await call(method, path, body)
    expect(res.status).toBe(401)
    expect(mocks.withOwner).not.toHaveBeenCalled()
  })

  it.each(OWNER_ROUTES)('the owner is let through: %s %s', async (method, path, body) => {
    // Proves the refusals above are the ownership check, not a broken harness.
    if (path.endsWith('/events')) return // an open stream; covered by the 404s above
    const res = await call(method, path, body)
    expect(res.status).not.toBe(404)
    expect(res.status).toBeLessThan(500)
  })

  it('a user’s project list contains only their own projects', async () => {
    mocks.userId = 'bob'
    const res = await request(app).get('/projects')
    expect(res.status).toBe(200)
    expect(res.body.map((p: any) => p.id)).toEqual(['bob-p'])
    expect(JSON.stringify(res.body)).not.toContain('alice')
  })

  it('a deleted-by-someone-else project survives', async () => {
    mocks.userId = 'bob'
    await request(app).delete('/projects/alice-p')
    expect(mocks.rows.has('alice-p')).toBe(true)
  })
})
