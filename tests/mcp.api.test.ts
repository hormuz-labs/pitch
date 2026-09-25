import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createFromApi: vi.fn(),
  exportFromApi: vi.fn(),
  exportStatusFromApi: vi.fn(),
  getFromApi: vi.fn(),
  listFromApi: vi.fn(),
  pricing: vi.fn(() => ({ model: 'usage' })),
  promptFromApi: vi.fn(),
}))

const authMock = vi.hoisted(() => ({
  resolvedUser: 'user_1' as string | null,
}))

vi.mock('../apps/api/src/lib/public-api.js', async () => {
  const { z } = await import('zod')
  return {
    ...api,
    uploadSchema: z.object({ fileBase64: z.string(), fileName: z.string() }),
    createSchema: z.object({
      flow: z.enum(['launch-video', 'demo-video', 'deck', 'recording-edit']).optional(),
      prompt: z.string().default(''),
      options: z.record(z.string(), z.any()).optional(),
      uploads: z.array(z.object({ fileBase64: z.string(), fileName: z.string() })).optional(),
      name: z.string().optional(),
    }),
  }
})

vi.mock('../apps/api/src/middleware/auth.js', () => ({
  resolveApiKey: vi.fn(async () => authMock.resolvedUser),
  requireApiKey: vi.fn(async (_req, res) => {
    if (!authMock.resolvedUser) {
      res.status(401).json({ error: 'Invalid or revoked API key' })
      return null
    }
    return authMock.resolvedUser
  }),
}))

vi.mock('../apps/api/src/projects/service.js', () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    status = 402
    constructor(public balance: number) {
      super('Insufficient credits')
    }
  },
}))

vi.mock('@saas/db', () => ({ getCreditSummary: vi.fn() }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { router } = await import('../apps/api/src/routes/mcp.js')
const app = express().use('/mcp', router)

describe('MCP endpoint contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.resolvedUser = 'user_1'
  })

  it('handles CORS preflight OPTIONS requests', async () => {
    const res = await request(app)
      .options('/mcp')
      .set('Origin', 'https://modelcontextprotocol.io')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, X-API-Key')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('https://modelcontextprotocol.io')
  })

  it('rejects unauthenticated POST with 401', async () => {
    authMock.resolvedUser = null
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid or revoked API key' })
  })

  it('returns 405 for GET and DELETE', async () => {
    const getRes = await request(app).get('/mcp')
    expect(getRes.status).toBe(405)
    expect(getRes.body).toEqual({ error: 'Method not allowed' })

    const delRes = await request(app).delete('/mcp')
    expect(delRes.status).toBe(405)
    expect(delRes.body).toEqual({ error: 'Method not allowed' })
  })

  it('processes initialize request and lists MCP tools', async () => {
    const initRes = await request(app)
      .post('/mcp')
      .set('X-API-Key', 'pk_test')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })

    const parseSse = (text: string) => {
      const line = text.split('\n').find(l => l.startsWith('data: '))
      return line ? JSON.parse(line.slice('data: '.length)) : null
    }

    expect(initRes.status).toBe(200)
    const initData = parseSse(initRes.text)
    expect(initData.jsonrpc).toBe('2.0')
    expect(initData.result?.serverInfo?.name).toBe('pitch')

    const toolsRes = await request(app)
      .post('/mcp')
      .set('X-API-Key', 'pk_test')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      })

    expect(toolsRes.status).toBe(200)
    const toolsData = parseSse(toolsRes.text)
    expect(toolsData.jsonrpc).toBe('2.0')
    const toolNames = toolsData.result?.tools?.map((t: any) => t.name)
    expect(toolNames).toContain('create_project')
    expect(toolNames).toContain('prompt_project')
    expect(toolNames).toContain('get_project')
    expect(toolNames).toContain('list_projects')
    expect(toolNames).toContain('export_project')
    expect(toolNames).toContain('export_status')
    expect(toolNames).toContain('get_credits')
    expect(toolNames).toContain('get_pricing')
  })

  it('handles malformed JSON with JSON-RPC error', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('X-API-Key', 'pk_test')
      .set('Content-Type', 'application/json')
      .send('{')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    })
  })
})
