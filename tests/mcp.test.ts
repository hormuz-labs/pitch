/**
 * Unit tests for the stateless MCP endpoint (apps/api/src/routes/mcp.ts +
 * apps/api/src/mcp/server.ts), mounted exactly like apps/api/src/index.ts does.
 *
 * Mocks-only: @saas/db (API-key lookup + job/credit helpers), the job-service
 * module (credit checks, queueing), the launch-video helpers, and @clerk/express
 * (imported by the auth middleware, unused on this path). No bullmq/ioredis
 * mocking is needed — the mocked job-service is the only module that imports the
 * queue config.
 *
 * NOTE: the auth middleware imports '@saas/db', which vitest resolves through
 * tsconfig paths to packages/db/src/index.ts. We therefore mock the resolved
 * path (../packages/db/src/index.js) rather than the bare specifier so the
 * middleware sees the same mocked module as the test.
 *
 * The SDK (v1.29) answers POSTs with a `text/event-stream` body, so a small
 * helper parses either SSE `data:` lines or a plain JSON body.
 */

import { createHash } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── vi.mock factories must be self-contained (hoisting rule) ──────────────────

vi.mock('../packages/db/src/index.js', () => ({
  findApiKeyByHash: vi.fn(),
  touchApiKey: vi.fn(),
  getJob: vi.fn(),
  listJobs: vi.fn(),
  getCreditSummary: vi.fn(),
}))

// server.ts does `error instanceof InsufficientCreditsError`, so the mock must
// export a REAL class with stable identity; job factories reject with it below.
vi.mock('../apps/api/src/lib/job-service.js', () => {
  class InsufficientCreditsError extends Error {
    balance: number
    constructor(balance: number) {
      super(`Insufficient credits (balance: ${balance})`)
      this.name = 'InsufficientCreditsError'
      this.balance = balance
    }
  }
  return {
    InsufficientCreditsError,
    createDemoVideoJob: vi.fn(),
    createPdfJob: vi.fn(),
    createEnhanceJob: vi.fn(),
    createEditJob: vi.fn(),
  }
})

vi.mock('../apps/api/src/lib/launch-video/opencode.js', () => ({
  getSessionForProject: vi.fn(),
  getMessages: vi.fn(),
  prompt: vi.fn(),
}))

vi.mock('../apps/api/src/lib/launch-video/projects.js', () => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: null }),
}))

import * as jobService from '../apps/api/src/lib/job-service.js'
import { InsufficientCreditsError } from '../apps/api/src/lib/job-service.js'
import * as opencode from '../apps/api/src/lib/launch-video/opencode.js'
import * as projects from '../apps/api/src/lib/launch-video/projects.js'
import { router as mcpRoutes } from '../apps/api/src/routes/mcp.js'
import * as db from '../packages/db/src/index.js'

const findApiKeyByHash = db.findApiKeyByHash as ReturnType<typeof vi.fn>
const touchApiKey = db.touchApiKey as ReturnType<typeof vi.fn>
const getCreditSummary = db.getCreditSummary as ReturnType<typeof vi.fn>
const createDemoVideoJob = jobService.createDemoVideoJob as ReturnType<typeof vi.fn>
const getSessionForProject = opencode.getSessionForProject as ReturnType<typeof vi.fn>
const getMessages = opencode.getMessages as ReturnType<typeof vi.fn>
const prompt = opencode.prompt as ReturnType<typeof vi.fn>
const getProject = projects.getProject as ReturnType<typeof vi.fn>
const listProjects = projects.listProjects as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────────────
const VALID_KEY = 'pk_test-key'
const VALID_KEY_HASH = createHash('sha256').update(VALID_KEY).digest('hex')
const VALID_ROW = { id: 'k1', userId: 'user_mcp', revokedAt: null }

// ── Build the Express app (mirrors apps/api/src/index.ts) ────────────────────
function buildApp() {
  const app = express()
  app.use('/mcp', express.json({ limit: '750mb' }), mcpRoutes)
  return app
}

let app: express.Express

beforeEach(() => {
  vi.clearAllMocks()
  findApiKeyByHash.mockImplementation(async (hash: string) =>
    hash === VALID_KEY_HASH ? { ...VALID_ROW } : null,
  )
  touchApiKey.mockResolvedValue(undefined)
  getMessages.mockResolvedValue([])
  prompt.mockResolvedValue(undefined)
  app = buildApp()
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const rpcHeaders = (auth = true) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  ...(auth ? { Authorization: `Bearer ${VALID_KEY}` } : {}),
})

const postRpc = (body: Record<string, any>, auth = true) =>
  request(app)
    .post('/mcp')
    .set(rpcHeaders(auth))
    .send({ jsonrpc: '2.0', ...body })

/** The transport answers with SSE in this SDK version; tolerate plain JSON too. */
const parseRpcResponse = (res: request.Response): any => {
  const contentType = res.headers['content-type'] || ''
  if (contentType.includes('text/event-stream')) {
    const dataLine = res.text.split('\n').find(line => line.startsWith('data:'))
    if (!dataLine) throw new Error(`No data: line in SSE body: ${res.text}`)
    return JSON.parse(dataLine.slice('data:'.length).trim())
  }
  return res.body
}

const callTool = (name: string, args: Record<string, any> = {}) =>
  postRpc({ id: 1, method: 'tools/call', params: { name, arguments: args } })

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /mcp auth', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await postRpc({ id: 1, method: 'tools/list', params: {} }, false)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid or revoked API key/i)
    expect(findApiKeyByHash).not.toHaveBeenCalled()
  })

  it('returns 401 when the key hash is unknown', async () => {
    findApiKeyByHash.mockResolvedValue(null)
    const res = await postRpc({ id: 1, method: 'tools/list', params: {} })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid or revoked API key/i)
  })

  it('returns 401 when the key is revoked', async () => {
    findApiKeyByHash.mockResolvedValue({ ...VALID_ROW, revokedAt: new Date() })
    const res = await postRpc({ id: 1, method: 'tools/list', params: {} })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid or revoked API key/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /mcp protocol', () => {
  it('initialize succeeds with a valid key', async () => {
    const res = await postRpc({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
      },
    })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.serverInfo).toBeDefined()
    expect(rpc.result.serverInfo.name).toBe('pitch-hormuz')

    // Auth looked up by the sha256 of the presented key, and lastUsedAt bumped
    expect(findApiKeyByHash).toHaveBeenCalledWith(VALID_KEY_HASH)
    expect(touchApiKey).toHaveBeenCalledWith('k1')
  })

  it('tools/list returns the 10 registered tools', async () => {
    const res = await postRpc({ id: 1, method: 'tools/list', params: {} })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    const names = rpc.result.tools.map((t: any) => t.name).sort()
    expect(names).toEqual(
      [
        'create_demo_video',
        'create_launch_video',
        'create_pdf',
        'edit_recording',
        'enhance_presentation',
        'get_credits',
        'get_job',
        'get_launch_video',
        'list_jobs',
        'list_launch_videos',
      ].sort(),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /mcp tools/call', () => {
  it('get_credits returns the credit summary as text JSON', async () => {
    const summary = {
      balance: 7,
      activeSubscription: null,
      subscriptions: [],
      topUps: [],
      transactions: [],
    }
    getCreditSummary.mockResolvedValue(summary)

    const res = await callTool('get_credits')

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    expect(JSON.parse(rpc.result.content[0].text)).toEqual(summary)
    expect(getCreditSummary).toHaveBeenCalledWith('user_mcp')
  })

  it('create_demo_video returns the created job', async () => {
    createDemoVideoJob.mockResolvedValue({ id: 'job1', status: 'PENDING' })

    const res = await callTool('create_demo_video', { url: 'https://example.com' })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    expect(rpc.result.content[0].text).toContain('job1')
    expect(JSON.parse(rpc.result.content[0].text)).toEqual({ jobId: 'job1', status: 'PENDING' })
    expect(createDemoVideoJob).toHaveBeenCalledWith(
      'user_mcp',
      expect.objectContaining({ url: 'https://example.com' }),
    )
  })

  it('create_demo_video reports insufficient credits with the balance', async () => {
    createDemoVideoJob.mockRejectedValue(new InsufficientCreditsError(1))

    const res = await callTool('create_demo_video', { url: 'https://example.com' })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBe(true)
    expect(rpc.result.content[0].text).toContain('balance is 1')
  })

  it('create_launch_video creates a new project and sends the first prompt', async () => {
    getProject.mockResolvedValue(null)
    getSessionForProject.mockResolvedValue({ id: 'session-launch-1', created: true })

    const res = await callTool('create_launch_video', {
      name: 'summer-drop',
      prompt: 'A 45-second launch video for our new sunglasses brand.',
    })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    expect(JSON.parse(rpc.result.content[0].text)).toMatchObject({
      projectName: 'summer-drop',
      sessionId: 'session-launch-1',
      created: true,
    })
    expect(getSessionForProject).toHaveBeenCalledWith('user_mcp', 'summer-drop')
    expect(prompt).toHaveBeenCalledWith(
      'session-launch-1',
      'A 45-second launch video for our new sunglasses brand.',
      expect.stringContaining('html-motion-video'),
    )
  })

  it('create_launch_video supports an optional music track', async () => {
    getProject.mockResolvedValue(null)
    getSessionForProject.mockResolvedValue({ id: 'session-launch-2', created: true })

    const res = await callTool('create_launch_video', {
      name: 'winter-drop',
      prompt: 'Epic winter gear launch.',
      music: 'epic-orchard.wav',
    })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    const systemArg = prompt.mock.calls[0][2] as string
    expect(systemArg).toContain('assets/music/epic-orchard.wav')
  })

  it('create_launch_video rejects invalid project names', async () => {
    const res = await callTool('create_launch_video', { name: '../etc', prompt: 'bad name' })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBe(true)
    expect(rpc.result.content[0].text).toContain('Invalid project name')
    expect(getSessionForProject).not.toHaveBeenCalled()
  })

  it('get_launch_video returns project details', async () => {
    const project = {
      name: 'summer-drop',
      hasVideo: true,
      videoUrl: '/launch-video/files/videos/user_mcp--summer-drop-launch.mp4',
      sceneCount: 5,
      scenes: [],
      duration: 42.5,
    }
    getProject.mockResolvedValue(project)

    const res = await callTool('get_launch_video', { name: 'summer-drop' })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    expect(JSON.parse(rpc.result.content[0].text)).toEqual(project)
    expect(getProject).toHaveBeenCalledWith('user_mcp', 'summer-drop')
  })

  it('get_launch_video returns an error when the project is not found', async () => {
    getProject.mockResolvedValue(null)

    const res = await callTool('get_launch_video', { name: 'missing' })

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBe(true)
    expect(rpc.result.content[0].text).toContain('Project not found: missing')
  })

  it('list_launch_videos returns the user’s projects', async () => {
    const projects = [
      { name: 'alpha', hasVideo: false, videoUrl: null, sceneCount: 0 },
      { name: 'beta', hasVideo: true, videoUrl: '/some/url', sceneCount: 4 },
    ]
    listProjects.mockResolvedValue(projects)

    const res = await callTool('list_launch_videos')

    expect(res.status).toBe(200)
    const rpc = parseRpcResponse(res)
    expect(rpc.result.isError).toBeUndefined()
    expect(JSON.parse(rpc.result.content[0].text)).toEqual(projects)
    expect(listProjects).toHaveBeenCalledWith('user_mcp')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /mcp', () => {
  it('returns 405 (stateless server has no SSE stream to read)', async () => {
    const res = await request(app).get('/mcp')
    expect(res.status).toBe(405)
  })
})
