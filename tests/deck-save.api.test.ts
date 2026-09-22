/**
 * The deck editor's save chain: POST /projects/:id/deck on the API, the
 * worker host's saveDeck (validate, write deck.html, queue a PDF refresh),
 * and the `?edit=1` script injection that turns a previewed deck into an
 * editable one. The browser render is faked; everything else is real, with
 * the workspace in a tmp dir.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'deck-save-'))
process.env.PROJECTS_DIR = path.join(root, 'projects')
process.env.PI_AGENT_DIR = path.join(root, 'agent')
process.env.STUDIO_WORKER_ID = 'w1'
process.env.STUDIO_WORKSPACE_BUCKET = ''

const mocks = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  renderDeckPdf: vi.fn(async (_wsDir: string) => {}),
}))

const rows = new Map<string, any>()
vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: vi.fn(
        async ({ where }: any) =>
          [...rows.values()].find(r => r.id === where.id && r.userId === where.userId) ?? null,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
    studioWorker: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
  getCreditBalance: vi.fn(),
  deductCredit: vi.fn(),
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
    prepare: vi.fn(),
    hasResult: vi.fn(),
    artifactKind: async () => 'deck',
  }),
}))
vi.mock('../apps/api/src/flows/deck/index.js', async () => {
  const actual = await vi.importActual<any>('../apps/api/src/flows/deck/index.js')
  return { ...actual, renderDeckPdf: mocks.renderDeckPdf }
})
vi.mock('../apps/api/src/studio/session.js', () => ({
  AGENT_DIR: path.join(root, 'agent'),
  peekSession: () => undefined,
  onSessionBusy: vi.fn(),
  closeSession: vi.fn(async () => {}),
  closeStudio: vi.fn(async () => {}),
  stopSession: vi.fn(async () => false),
  listStudioModels: vi.fn(async () => []),
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
vi.mock('../apps/api/src/projects/service.js', () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  addOutput: vi.fn(async () => {}),
  getRow: vi.fn(async (userId: string, id: string) => {
    const r = [...rows.values()].find(x => x.id === id && x.userId === userId)
    if (!r) throw Object.assign(new Error('Project not found'), { status: 404 })
    return r
  }),
}))
vi.mock('../apps/api/src/projects/export.js', () => ({ IDLE_EXPORT: { status: 'idle' } }))
vi.mock('../apps/api/src/worker/client.js', async () => ({
  currentOwner: async () => null,
  withOwner: async (_id: string, run: (worker: any) => unknown) =>
    run(await import('../apps/api/src/worker/host.js')),
}))

const host = await import('../apps/api/src/worker/host.js')
const { workspaceFor } = await import('../apps/api/src/studio/paths.js')
const { router } = await import('../apps/api/src/routes/projects.js')
const { serveWorkspaceFile, studioTags } = await import('../apps/api/src/worker/files.js')

const app = express()
app.use(express.json({ limit: '50mb' }))
app.use('/projects', router)

function row(id: string, over: Record<string, unknown> = {}) {
  const r = {
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
    ...over,
  }
  rows.set(id, r)
  return r
}

const DECK = `<html><body>
<section class="slide"><h1>One</h1></section>
<section class="slide"><h2>Two</h2></section>
</body></html>`

const STORYBOARD = {
  revision: 3,
  status: 'draft',
  transition: 'fade',
  titleCards: {
    intro: { enabled: false, title: '', subtitle: '' },
    outro: { enabled: false, title: '', subtitle: '' },
  },
  scenes: [
    {
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: 'https://example.test/page-1.png',
      enabled: true,
      title: 'Result',
      screenText: ['Revenue increased by 24%'],
      narration: 'Revenue increased by 24% in the first quarter.',
      emphasis: [
        {
          phrase: 'Revenue increased by 24%',
          rect: { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 12 },
          coordinateSpace: 'page',
          style: 'highlighter',
          zoom: 1.7,
        },
      ],
      overlays: [],
      estimatedDurationSec: 3.2,
    },
  ],
} as const

async function seedStoryboard(id: string, over: Record<string, unknown> = {}) {
  row(id, over)
  const ws = workspaceFor('studio', String(over.userId ?? 'user_1'), id)
  await mkdir(ws.dir, { recursive: true })
  await writeFile(path.join(ws.dir, 'storyboard.json'), `${JSON.stringify(STORYBOARD, null, 2)}\n`)
  return ws
}

beforeEach(async () => {
  rows.clear()
  mocks.userId = 'user_1'
  mocks.renderDeckPdf.mockClear()
  await rm(path.join(root, 'projects'), { recursive: true, force: true })
})

describe('POST /projects/:id/deck', () => {
  it('answers 401 without a session', async () => {
    mocks.userId = null
    const res = await request(app).post('/projects/p1/deck').send({ html: DECK })
    expect(res.status).toBe(401)
  })

  it('answers 400 when html is missing or not a string', async () => {
    row('p1')
    expect((await request(app).post('/projects/p1/deck').send({})).status).toBe(400)
    expect((await request(app).post('/projects/p1/deck').send({ html: 42 })).status).toBe(400)
  })

  it('answers 400 when html exceeds the 8 MB cap', async () => {
    row('p1')
    const res = await request(app)
      .post('/projects/p1/deck')
      .send({ html: `<div class="slide">${'x'.repeat(8 * 1024 * 1024)}</div>` })
    expect(res.status).toBe(400)
  })

  it('saves the deck through the worker and reports the slide count', async () => {
    row('p1')
    const res = await request(app).post('/projects/p1/deck').send({ html: DECK })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, slides: 2 })
    const ws = workspaceFor('studio', 'user_1', 'p1')
    expect(await readFile(path.join(ws.dir, 'deck.html'), 'utf8')).toBe(DECK)
  })

  it("answers 404 for someone else's project", async () => {
    row('p1', { userId: 'user_2' })
    const res = await request(app).post('/projects/p1/deck').send({ html: DECK })
    expect(res.status).toBe(404)
  })
})

describe('POST /projects/:id/deck/render', () => {
  it('answers 401 without a session', async () => {
    mocks.userId = null
    const res = await request(app).post('/projects/p1/deck/render')
    expect(res.status).toBe(401)
  })

  it("answers 404 for someone else's project", async () => {
    row('p2', { userId: 'user_2' })
    const res = await request(app).post('/projects/p2/deck/render')
    expect(res.status).toBe(404)
  })

  it('renders the saved deck synchronously before answering', async () => {
    row('p2')
    const saved = await request(app).post('/projects/p2/deck').send({ html: DECK })
    expect(saved.status).toBe(200)
    mocks.renderDeckPdf.mockClear()
    const res = await request(app).post('/projects/p2/deck/render')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const ws = workspaceFor('studio', 'user_1', 'p2')
    expect(mocks.renderDeckPdf).toHaveBeenCalledTimes(1)
    expect(mocks.renderDeckPdf).toHaveBeenCalledWith(ws.dir)
  })
})

describe('host.saveDeck', () => {
  it('writes deck.html and returns the slide count', async () => {
    row('deck-host')
    const out = await host.saveDeck('deck-host', DECK)
    expect(out).toEqual({ ok: true, slides: 2 })
    const ws = workspaceFor('studio', 'user_1', 'deck-host')
    expect(await readFile(path.join(ws.dir, 'deck.html'), 'utf8')).toBe(DECK)
  })

  it('rejects a document without any .slide', async () => {
    row('no-slides')
    await expect(host.saveDeck('no-slides', '<html><body>nope</body></html>')).rejects.toThrow(
      'at least one .slide',
    )
  })

  it('overwrites deck.html on the next save', async () => {
    row('deck-twice')
    await host.saveDeck('deck-twice', DECK)
    const shorter = '<html><body><section class="slide"><h1>Only</h1></section></body></html>'
    const out = await host.saveDeck('deck-twice', shorter)
    expect(out).toEqual({ ok: true, slides: 1 })
    const ws = workspaceFor('studio', 'user_1', 'deck-twice')
    expect(await readFile(path.join(ws.dir, 'deck.html'), 'utf8')).toBe(shorter)
  })

  it('acknowledges a durable HTML save without waiting for PDF rendering', async () => {
    row('deck-pdf')
    await host.saveDeck('deck-pdf', DECK)
    expect(mocks.renderDeckPdf).not.toHaveBeenCalled()
  })
})

describe('POST /projects/:id/storyboard', () => {
  it('answers 401 without a session', async () => {
    mocks.userId = null
    const res = await request(app).post('/projects/p1/storyboard').send(STORYBOARD)
    expect(res.status).toBe(401)
  })

  it('answers 400 when the optimistic revision or scenes are missing', async () => {
    row('p1')
    expect((await request(app).post('/projects/p1/storyboard').send({ scenes: [] })).status).toBe(
      400,
    )
    expect((await request(app).post('/projects/p1/storyboard').send({ revision: 1 })).status).toBe(
      400,
    )
  })

  it("answers 404 without touching another user's storyboard", async () => {
    const ws = await seedStoryboard('owned-elsewhere', { userId: 'user_2' })
    const before = await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')

    const res = await request(app).post('/projects/owned-elsewhere/storyboard').send(STORYBOARD)

    expect(res.status).toBe(404)
    expect(await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')).toBe(before)
  })

  it('saves one validated revision and preserves stable scene identity', async () => {
    const ws = await seedStoryboard('storyboard-save')
    const update = {
      ...STORYBOARD,
      transition: 'slide',
      scenes: [{ ...STORYBOARD.scenes[0], title: 'Sharper result' }],
    }

    const res = await request(app).post('/projects/storyboard-save/storyboard').send(update)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      revision: 4,
      status: 'draft',
      transition: 'slide',
      scenes: [{ id: 'scene-1', pageIndex: 0, title: 'Sharper result' }],
    })
    expect(JSON.parse(await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8'))).toEqual(
      res.body,
    )
  })

  it('answers 400 and preserves the file when storyboard content is invalid', async () => {
    const ws = await seedStoryboard('invalid-storyboard')
    const before = await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')
    const invalid = {
      ...STORYBOARD,
      scenes: [{ ...STORYBOARD.scenes[0], narration: '' }],
    }

    const res = await request(app).post('/projects/invalid-storyboard/storyboard').send(invalid)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/needs narration/i)
    expect(await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')).toBe(before)
  })

  it('answers 409 and preserves the newer file on an optimistic revision conflict', async () => {
    const ws = await seedStoryboard('storyboard-conflict')
    const before = await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')

    const res = await request(app)
      .post('/projects/storyboard-conflict/storyboard')
      .send({ ...STORYBOARD, revision: 2 })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/revision conflict/i)
    expect(await readFile(path.join(ws.dir, 'storyboard.json'), 'utf8')).toBe(before)
  })
})

describe('host.renderDeck', () => {
  it('renders the deck on disk synchronously', async () => {
    row('deck-render')
    await host.saveDeck('deck-render', DECK)
    mocks.renderDeckPdf.mockClear()
    const out = await host.renderDeck('deck-render')
    expect(out).toEqual({ ok: true })
    const ws = workspaceFor('studio', 'user_1', 'deck-render')
    expect(mocks.renderDeckPdf).toHaveBeenCalledTimes(1)
    expect(mocks.renderDeckPdf).toHaveBeenCalledWith(ws.dir)
  })

  it('fails clearly when there is no deck.html yet', async () => {
    row('deck-empty')
    // Open the workspace without writing a deck.
    await host.busy('deck-empty')
    await expect(host.renderDeck('deck-empty')).rejects.toThrow('deck.html does not exist')
    expect(mocks.renderDeckPdf).not.toHaveBeenCalled()
  })

  it('fails clearly when deck.html has no slides', async () => {
    row('deck-blank')
    await host.busy('deck-blank')
    const ws = workspaceFor('studio', 'user_1', 'deck-blank')
    await writeFile(path.join(ws.dir, 'deck.html'), '<html><body>nope</body></html>', 'utf8')
    await expect(host.renderDeck('deck-blank')).rejects.toThrow('no .slide')
    expect(mocks.renderDeckPdf).not.toHaveBeenCalled()
  })

  it('renders exactly once after a save, from the HTML now on disk', async () => {
    row('deck-fresh')
    await host.saveDeck('deck-fresh', DECK)
    await host.renderDeck('deck-fresh')
    expect(mocks.renderDeckPdf).toHaveBeenCalledTimes(1)
  })
})

describe('deck editor injection', () => {
  it('appends deck-editor.js after the inspector when editing', () => {
    const tags = studioTags('/deck.html', { container: '.slide', edit: true })
    expect(tags).toContain('src="../../engine/js/inspector.js"')
    expect(tags).toContain('src="../../engine/js/deck-editor.js"')
    expect(tags.indexOf('inspector.js')).toBeLessThan(tags.indexOf('deck-editor.js'))
  })

  it('keeps the relative depth for nested pages', () => {
    const tags = studioTags('/build/output.html', { container: '.slide', edit: true })
    expect(tags).toContain('src="../../../engine/js/deck-editor.js"')
    expect(studioTags('/deck.html', { container: '.slide' })).not.toContain('deck-editor.js')
  })

  async function serve(dir: string, query: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        end: vi.fn(),
        send: (html: string) => resolve(html),
      }
      serveWorkspaceFile(dir, { path: '/deck.html', query } as any, res as any, reject)
    })
  }

  it('injects both scripts into a served page when studio=1&edit=1', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'deck-serve-'))
    await writeFile(path.join(dir, 'deck.html'), DECK, 'utf8')
    const out = await serve(dir, { studio: '1', edit: '1', token: 'short-lived-page-token' })
    expect(out).toContain('engine/js/inspector.js')
    expect(out).toContain('engine/js/deck-editor.js')
    expect(out).not.toContain('short-lived-page-token')
    expect(out.indexOf('inspector.js')).toBeLessThan(out.indexOf('</body>'))
  })

  it('injects only the inspector without edit=1', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'deck-serve-'))
    await writeFile(path.join(dir, 'deck.html'), DECK, 'utf8')
    const out = await serve(dir, { studio: '1' })
    expect(out).toContain('engine/js/inspector.js')
    expect(out).not.toContain('deck-editor.js')
  })
})
