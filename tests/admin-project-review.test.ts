/**
 * Admin project review: an administrator can open ANY project read-only and
 * download its chat and logs; nobody else can reach any of it. Every route is
 * checked for the three callers that matter — signed out, a signed-in user
 * who is not an admin, and an admin — and a refused caller must never reach
 * the project row or the worker at all.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'admin-id' as string | null,
  profiles: new Map<string, { id: string; role: string; email?: string }>(),
  userProfileFindUnique: vi.fn(),
  renderJobFindMany: vi.fn(),
  creditTxFindMany: vi.fn(),
  rowById: vi.fn(),
  projectDetail: vi.fn(),
  getEntries: vi.fn(),
  withOwner: vi.fn(),
  currentOwner: vi.fn(),
  readCover: vi.fn(),
  worker: {
    listAssets: vi.fn(),
    assetThumbnail: vi.fn(),
    thumbnail: vi.fn(),
    exportStatus: vi.fn(),
    events: vi.fn(),
    sessionLog: vi.fn(),
  },
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@saas/shared', () => ({ createLogger: () => mocks.log }))
vi.mock('@saas/email', () => ({ renderNewsletterEmail: vi.fn(), sendNewsletterEmail: vi.fn() }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!mocks.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return mocks.userId
  },
}))
vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: mocks.userProfileFindUnique },
    renderJob: { findMany: mocks.renderJobFindMany },
    creditTransaction: { findMany: mocks.creditTxFindMany },
  },
}))
vi.mock('../apps/api/src/projects/service.js', () => ({
  busyProjects: vi.fn(async () => new Set()),
  deleteProject: vi.fn(),
  failProject: vi.fn(),
  getRow: vi.fn(),
  getEntries: mocks.getEntries,
  projectDetail: mocks.projectDetail,
  rowById: mocks.rowById,
}))
vi.mock('../apps/api/src/worker/client.js', () => ({
  withOwner: mocks.withOwner,
  currentOwner: mocks.currentOwner,
}))
vi.mock('../apps/api/src/worker/checkpoint.js', () => ({ readCover: mocks.readCover }))
vi.mock('../apps/api/src/projects/export.js', () => ({
  IDLE_EXPORT: { running: false, stage: 'idle' },
}))
vi.mock('../apps/api/src/studio/session.js', () => ({}))

const { router } = await import('../apps/api/src/routes/admin.js')
const app = express().use(express.json()).use('/admin', router)

const PROJECT = {
  id: 'proj_1',
  userId: 'owner-id',
  flow: 'studio',
  name: 'launch',
  title: 'Launch film',
  prompt: 'Make a launch film',
  options: {},
  sessionFile: '/home/pi/.pi/agent/sessions/abc.jsonl',
  outputs: [],
  lastError: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
}

const ENTRIES = [
  { id: 'e1', role: 'user', text: 'Make a launch film', at: Date.parse('2026-09-01T10:00:01Z') },
  {
    id: 'e2',
    role: 'tool',
    text: '',
    tool: { name: 'motion_render', status: 'done' },
    at: Date.parse('2026-09-01T10:00:05Z'),
  },
  { id: 'e3', role: 'assistant', text: 'Done — here it is.', at: Date.parse('2026-09-01T10:01Z') },
]

/** Every read the review exposes. None may answer anyone but an admin. */
const REVIEW_ROUTES = [
  '/admin/projects/proj_1/studio',
  '/admin/projects/proj_1/messages',
  '/admin/projects/proj_1/assets',
  '/admin/projects/proj_1/assets/thumb?path=renders/a.mp4',
  '/admin/projects/proj_1/thumbnail',
  '/admin/projects/proj_1/export',
  '/admin/projects/proj_1/events',
  '/admin/projects/proj_1/download/chat',
  '/admin/projects/proj_1/download/chat?format=json',
  '/admin/projects/proj_1/download/logs',
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userId = 'admin-id'
  mocks.profiles = new Map([
    ['admin-id', { id: 'admin-id', role: 'admin', email: 'admin@trypitch.co' }],
    ['user-id', { id: 'user-id', role: 'user', email: 'someone@example.com' }],
  ])
  mocks.userProfileFindUnique.mockImplementation(async ({ where }: any) => {
    if (where.id === 'owner-id')
      return { id: 'owner-id', email: 'owner@example.com', firstName: 'Olive', lastName: 'Owner' }
    return mocks.profiles.get(where.id) ?? null
  })
  mocks.rowById.mockImplementation(async (id: string) => {
    if (id === PROJECT.id) return { ...PROJECT }
    throw Object.assign(new Error('Project not found'), { status: 404 })
  })
  mocks.projectDetail.mockImplementation(async (p: any) => ({
    ...p,
    busy: false,
    status: 'ready',
    description: {
      preview: { kind: 'video', url: '/files/projects/x/renders/a.mp4' },
      outputs: [],
    },
  }))
  mocks.getEntries.mockResolvedValue({ entries: ENTRIES, busy: false, activeModel: null })
  mocks.withOwner.mockImplementation(async (_id: string, run: (w: any) => unknown) =>
    run(mocks.worker),
  )
  mocks.currentOwner.mockResolvedValue(mocks.worker)
  mocks.worker.listAssets.mockResolvedValue([
    {
      path: 'renders/a.mp4',
      url: '/files/projects/studio--owner-id--launch/renders/a.mp4',
      thumbUrl: '/projects/proj_1/assets/thumb?path=renders%2Fa.mp4',
    },
    { path: 'uploads/logo.png', url: '/files/projects/x/uploads/logo.png', thumbUrl: null },
  ])
  mocks.worker.assetThumbnail.mockResolvedValue(Buffer.from('jpeg'))
  mocks.worker.thumbnail.mockResolvedValue(Buffer.from('cover'))
  mocks.worker.exportStatus.mockResolvedValue({ running: true, stage: 'rendering', progress: 40 })
  mocks.worker.events.mockImplementation(async (_id: string, send: (ev: any) => void) => {
    send({ type: 'hello', busy: true })
    send({ type: 'credit_balance', balance: 1234 })
    send({ type: 'credit_exhausted', message: 'Out of credits' })
    send({ type: 'entry', entry: ENTRIES[0] })
  })
  mocks.worker.sessionLog.mockResolvedValue(
    `${JSON.stringify({ type: 'session', id: 's1' })}\n${JSON.stringify({ type: 'message', role: 'user' })}\n{torn`,
  )
  mocks.renderJobFindMany.mockResolvedValue([
    { id: 'rj1', action: 'motion_render', params: '{"res":"1080p"}', result: '{"ok":true}' },
  ])
  mocks.creditTxFindMany.mockResolvedValue([{ id: 'tx1', delta: -12, type: 'usage' }])
})

/** An SSE response never ends on its own; read what arrived, then hang up. */
async function readStream(path: string): Promise<{ status: number; headers: any; body: string }> {
  const server = app.listen(0)
  const { port } = server.address() as AddressInfo
  try {
    return await new Promise((resolve, reject) => {
      const req = http.get({ port, path }, res => {
        let body = ''
        res.on('data', chunk => {
          body += chunk.toString()
        })
        setTimeout(() => {
          req.destroy()
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        }, 100)
      })
      req.on('error', err => {
        if ((err as any).code !== 'ECONNRESET') reject(err)
      })
    })
  } finally {
    server.close()
  }
}

describe('admin project review: access control', () => {
  it.each(REVIEW_ROUTES)('refuses a signed-out caller: %s', async path => {
    mocks.userId = null
    const res = await request(app).get(path)
    expect(res.status).toBe(401)
    expect(mocks.rowById).not.toHaveBeenCalled()
    expect(mocks.withOwner).not.toHaveBeenCalled()
    expect(mocks.getEntries).not.toHaveBeenCalled()
  })

  it.each(REVIEW_ROUTES)('refuses a signed-in user who is not an admin: %s', async path => {
    mocks.userId = 'user-id'
    const res = await request(app).get(path)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Not authorized as admin' })
    expect(mocks.rowById).not.toHaveBeenCalled()
    expect(mocks.withOwner).not.toHaveBeenCalled()
    expect(mocks.currentOwner).not.toHaveBeenCalled()
    expect(mocks.getEntries).not.toHaveBeenCalled()
    expect(mocks.renderJobFindMany).not.toHaveBeenCalled()
  })

  it.each(REVIEW_ROUTES)('refuses the project OWNER too — review is for admins: %s', async path => {
    mocks.userId = 'owner-id'
    mocks.profiles.set('owner-id', { id: 'owner-id', role: 'user' })
    const res = await request(app).get(path)
    expect(res.status).toBe(403)
    expect(mocks.rowById).not.toHaveBeenCalled()
  })

  it.each(REVIEW_ROUTES)('refuses a caller with no profile: %s', async path => {
    mocks.userId = 'ghost-id'
    const res = await request(app).get(path)
    expect(res.status).toBe(403)
    expect(mocks.rowById).not.toHaveBeenCalled()
  })

  it('reads the role from the database on every request, not from a cached grant', async () => {
    expect((await request(app).get('/admin/projects/proj_1/messages')).status).toBe(200)
    mocks.profiles.set('admin-id', { id: 'admin-id', role: 'user' })
    expect((await request(app).get('/admin/projects/proj_1/messages')).status).toBe(403)
  })

  it('fails closed when the role lookup errors', async () => {
    mocks.userProfileFindUnique.mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).get('/admin/projects/proj_1/studio')
    expect(res.status).toBe(500)
    expect(mocks.rowById).not.toHaveBeenCalled()
  })

  it.each(REVIEW_ROUTES)('answers 404 for an unknown project: %s', async path => {
    const res = await request(app).get(path.replace('proj_1', 'nope'))
    expect(res.status).toBe(404)
    expect(mocks.withOwner).not.toHaveBeenCalled()
  })

  it.each([
    ['post', '/admin/projects/proj_1/prompt'],
    ['post', '/admin/projects/proj_1/export'],
    ['post', '/admin/projects/proj_1/share'],
    ['post', '/admin/projects/proj_1/assets'],
    ['delete', '/admin/projects/proj_1/assets'],
    ['post', '/admin/projects/proj_1/deck'],
    ['post', '/admin/projects/proj_1/storyboard'],
    ['post', '/admin/projects/proj_1/stop'],
    ['post', '/admin/projects/proj_1/rollback'],
    ['patch', '/admin/projects/proj_1/studio'],
  ] as const)('exposes no write: %s %s', async (method, path) => {
    const res = await request(app)[method](path).send({ text: 'hi', html: '<div class="slide">' })
    expect(res.status).toBe(404)
    expect(mocks.withOwner).not.toHaveBeenCalled()
    expect(mocks.rowById).not.toHaveBeenCalled()
  })

  it('never lets a response be cached', async () => {
    for (const path of REVIEW_ROUTES.filter(p => !p.endsWith('/events'))) {
      const res = await request(app).get(path)
      expect(res.headers['cache-control'], path).toContain('no-store')
    }
  })

  it('writes an audit line naming the admin, the project and its owner', async () => {
    await request(app).get('/admin/projects/proj_1/download/logs')
    expect(mocks.log.info).toHaveBeenCalledWith(
      { adminId: 'admin-id', projectId: 'proj_1', ownerId: 'owner-id', action: 'download logs' },
      'admin project review',
    )
  })
})

describe('admin project review: what an admin sees', () => {
  it('opens any user’s project with its owner', async () => {
    const res = await request(app).get('/admin/projects/proj_1/studio')
    expect(res.status).toBe(200)
    expect(mocks.rowById).toHaveBeenCalledWith('proj_1')
    expect(res.body).toMatchObject({
      id: 'proj_1',
      userId: 'owner-id',
      status: 'ready',
      description: { preview: { kind: 'video' } },
      owner: { id: 'owner-id', email: 'owner@example.com', firstName: 'Olive' },
    })
    // Only the fields the header needs: no role, no billing, no survey.
    expect(Object.keys(res.body.owner).sort()).toEqual(['email', 'firstName', 'id', 'lastName'])
  })

  it('returns the conversation', async () => {
    const res = await request(app).get('/admin/projects/proj_1/messages')
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(3)
    expect(mocks.getEntries).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_1' }))
  })

  it('points asset thumbnails at the admin route', async () => {
    const res = await request(app).get('/admin/projects/proj_1/assets')
    expect(res.status).toBe(200)
    expect(res.body[0].thumbUrl).toBe('/admin/projects/proj_1/assets/thumb?path=renders%2Fa.mp4')
    expect(res.body[0].url).toBe('/files/projects/studio--owner-id--launch/renders/a.mp4')
    expect(res.body[1].thumbUrl).toBeNull()
  })

  it('serves an asset thumbnail', async () => {
    const res = await request(app).get(
      '/admin/projects/proj_1/assets/thumb?path=renders/a.mp4&at=2',
    )
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(mocks.worker.assetThumbnail).toHaveBeenCalledWith('proj_1', {
      path: 'renders/a.mp4',
      at: 2,
    })
  })

  it('answers 404 for a missing asset thumbnail', async () => {
    mocks.worker.assetThumbnail.mockResolvedValueOnce(null)
    const res = await request(app).get('/admin/projects/proj_1/assets/thumb?path=nope')
    expect(res.status).toBe(404)
  })

  it('serves the project thumbnail, from the checkpoint cover when nobody holds it', async () => {
    const held = await request(app).get('/admin/projects/proj_1/thumbnail?t=3')
    expect(held.status).toBe(200)
    expect(mocks.worker.thumbnail).toHaveBeenCalledWith('proj_1', 3)

    mocks.currentOwner.mockResolvedValueOnce(null)
    mocks.readCover.mockResolvedValueOnce(Buffer.from('cover'))
    const idle = await request(app).get('/admin/projects/proj_1/thumbnail')
    expect(idle.status).toBe(200)
    expect(mocks.readCover).toHaveBeenCalledWith('proj_1')
  })

  it('reports export status without starting one', async () => {
    const res = await request(app).get('/admin/projects/proj_1/export')
    expect(res.body).toMatchObject({ running: true, progress: 40 })
    mocks.currentOwner.mockResolvedValueOnce(null)
    const idle = await request(app).get('/admin/projects/proj_1/export')
    expect(idle.body).toEqual({ running: false, stage: 'idle' })
  })

  it('streams live events but never the owner’s credit balance', async () => {
    const res = await readStream('/admin/projects/proj_1/events')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toContain('"type":"hello"')
    expect(res.body).toContain('"type":"entry"')
    expect(res.body).not.toContain('credit_balance')
    expect(res.body).not.toContain('1234')
    expect(res.body).not.toContain('credit_exhausted')
  })

  it('downloads the chat as Markdown', async () => {
    const res = await request(app).get('/admin/projects/proj_1/download/chat')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/markdown')
    expect(res.headers['content-disposition']).toBe('attachment; filename="pitch-proj_1-chat.md"')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.text).toContain('# Launch film')
    expect(res.text).toContain('Owner: Olive Owner <owner@example.com> (owner-id)')
    expect(res.text).toContain('## User — 2026-09-01T10:00:01.000Z')
    expect(res.text).toContain('## Tool · motion_render · done')
    expect(res.text).toContain('Done — here it is.')
  })

  it('downloads the chat as JSON', async () => {
    const res = await request(app).get('/admin/projects/proj_1/download/chat?format=json')
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="pitch-proj_1-chat.json"')
    const body = JSON.parse(res.text)
    expect(body.project).toEqual({
      id: 'proj_1',
      title: 'Launch film',
      createdAt: PROJECT.createdAt,
      prompt: 'Make a launch film',
    })
    expect(body.owner.email).toBe('owner@example.com')
    expect(body.entries).toHaveLength(3)
  })

  it('downloads the full logs: row, raw transcript, render jobs, credits', async () => {
    const res = await request(app).get('/admin/projects/proj_1/download/logs')
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="pitch-proj_1-logs.json"')
    const body = JSON.parse(res.text)
    expect(body.exportedBy).toEqual({ id: 'admin-id', email: 'admin@trypitch.co' })
    expect(body.project.id).toBe('proj_1')
    expect(body.owner.id).toBe('owner-id')
    expect(body.chat.entries).toHaveLength(3)
    expect(body.session).toEqual({
      available: true,
      error: null,
      lines: [
        { type: 'session', id: 's1' },
        { type: 'message', role: 'user' },
        { unparsed: '{torn' },
      ],
    })
    expect(body.renderJobs[0]).toMatchObject({ params: { res: '1080p' }, result: { ok: true } })
    expect(body.creditTransactions).toEqual([{ id: 'tx1', delta: -12, type: 'usage' }])
    expect(mocks.renderJobFindMany).toHaveBeenCalledWith({
      where: { projectId: 'proj_1' },
      orderBy: { createdAt: 'asc' },
    })
    expect(mocks.creditTxFindMany).toHaveBeenCalledWith({
      where: { projectId: 'proj_1' },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('still downloads the database history when the worker cannot be reached', async () => {
    mocks.withOwner.mockRejectedValue(new Error('Worker w1 is unreachable'))
    mocks.getEntries.mockRejectedValueOnce(new Error('Worker w1 is unreachable'))
    const res = await request(app).get('/admin/projects/proj_1/download/logs')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.text)
    expect(body.session).toEqual({ available: false, error: 'Worker w1 is unreachable', lines: [] })
    expect(body.chat).toEqual({ entries: [], error: 'Worker w1 is unreachable' })
    expect(body.renderJobs).toHaveLength(1)
  })

  it('surfaces a worker failure on the chat download instead of an empty file', async () => {
    mocks.getEntries.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 409 }))
    const res = await request(app).get('/admin/projects/proj_1/download/chat')
    expect(res.status).toBe(409)
    expect(res.headers['content-disposition']).toBeUndefined()
  })
})
