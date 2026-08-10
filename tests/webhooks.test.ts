/**
 * Unit & Integration tests for Outbound Webhook notifications, HMAC signing, and retries.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Auth & Clerk Mock ────────────────────────────────────────────────────────

let _userId: string | null = 'user_test'

vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!_userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return _userId
  },
}))

vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: _userId }),
}))

const __setUserId = (u: string | null) => {
  _userId = u
}

// ── DB Mocks ────────────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  return {
    mockDb: {
      listWebhookEndpoints: vi.fn(),
      createWebhookEndpoint: vi.fn(),
      getWebhookEndpoint: vi.fn(),
      updateWebhookEndpoint: vi.fn(),
      deleteWebhookEndpoint: vi.fn(),
      listActiveWebhookEndpointsForUser: vi.fn(),
      createWebhookDelivery: vi.fn(),
      updateWebhookDelivery: vi.fn(),
      listWebhookDeliveries: vi.fn(),
      getWebhookDelivery: vi.fn(),
      prisma: {
        webhookDelivery: {
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          findMany: vi.fn(),
          findUnique: vi.fn(),
        },
        webhookEndpoint: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
    },
  }
})

vi.mock('@saas/db', () => mockDb)
vi.mock('../packages/db/src/index.js', () => mockDb)

// Mock bullmq queue
vi.mock('../apps/api/src/config.js', () => ({
  webhookQueue: {
    add: vi.fn().mockResolvedValue({ id: 'bull_job_1' }),
  },
  CREDIT_PACKS: {},
  TOPUP_PACKS: {},
  DODO_ENV: 'test_mode',
}))

import { router as webhookRoutes } from '../apps/api/src/routes/webhooks.js'
import {
  computeWebhookSignature,
  dispatchJobWebhooks,
  executeWebhookDelivery,
  verifyWebhookSignature,
} from '../packages/db/src/webhook-service.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/webhooks', webhookRoutes)
  return app
}

let app: express.Express

beforeEach(() => {
  vi.clearAllMocks()
  __setUserId('user_test')
  app = buildApp()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Webhook HMAC SHA-256 Signatures', () => {
  it('computes and verifies signatures correctly', () => {
    const payload = JSON.stringify({ event: 'job.completed', jobId: 'job_123' })
    const secret = 'whsec_test_secret_key'
    const timestamp = 1700000000

    const sig = computeWebhookSignature(payload, secret, timestamp)
    expect(sig).toContain(`t=${timestamp},v1=`)

    const isValid = verifyWebhookSignature(payload, sig, secret)
    expect(isValid).toBe(true)

    const isInvalidSecret = verifyWebhookSignature(payload, sig, 'wrong_secret')
    expect(isInvalidSecret).toBe(false)

    const isInvalidBody = verifyWebhookSignature(`${payload}tampered`, sig, secret)
    expect(isInvalidBody).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /webhooks/endpoints', () => {
  it('returns 401 when unauthenticated', async () => {
    __setUserId(null)
    const res = await request(app).get('/webhooks/endpoints')
    expect(res.status).toBe(401)
  })

  it('returns user endpoints when authenticated', async () => {
    const ep = {
      id: 'ep_1',
      userId: 'user_test',
      url: 'https://example.com/webhook',
      secret: 'whsec_123',
      events: ['job.completed'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockDb.listWebhookEndpoints.mockResolvedValue([ep])

    const res = await request(app).get('/webhooks/endpoints')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].url).toBe('https://example.com/webhook')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /webhooks/endpoints', () => {
  it('rejects invalid URL', async () => {
    const res = await request(app).post('/webhooks/endpoints').send({ url: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/valid http\/https url/i)
  })

  it('creates endpoint with valid URL', async () => {
    const mockEp = {
      id: 'ep_new',
      userId: 'user_test',
      url: 'https://my-app.com/webhook',
      secret: 'whsec_abc',
      events: ['job.completed', 'job.failed'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockDb.createWebhookEndpoint.mockResolvedValue(mockEp)

    const res = await request(app)
      .post('/webhooks/endpoints')
      .send({ url: 'https://my-app.com/webhook' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('ep_new')
    expect(mockDb.createWebhookEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_test',
        url: 'https://my-app.com/webhook',
      }),
      { id: 'user_test' },
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /webhooks/endpoints/:id', () => {
  it('deletes endpoint when found', async () => {
    mockDb.deleteWebhookEndpoint.mockResolvedValue(true)

    const res = await request(app).delete('/webhooks/endpoints/ep_1')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 404 when endpoint not found', async () => {
    mockDb.deleteWebhookEndpoint.mockResolvedValue(false)

    const res = await request(app).delete('/webhooks/endpoints/missing')
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('dispatchJobWebhooks', () => {
  it('dispatches webhooks for completed job with active user endpoint', async () => {
    const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'q_1' }) }
    mockDb.listActiveWebhookEndpointsForUser.mockResolvedValue([
      {
        id: 'ep_1',
        userId: 'user_test',
        url: 'https://example.com/hook',
        secret: 'whsec_secret',
        events: ['job.completed', 'job.failed'],
        isActive: true,
      },
    ])
    mockDb.prisma.webhookDelivery.findFirst.mockResolvedValue(null)
    mockDb.createWebhookDelivery.mockResolvedValue({
      id: 'del_1',
      userId: 'user_test',
      jobId: 'job_completed',
      event: 'job.completed',
      payload: {},
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const job = {
      id: 'job_completed',
      userId: 'user_test',
      status: 'COMPLETED',
      videoUrl: 'https://s3.trypitch.co/video.mp4',
      parameters: { jobType: 'demo' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const ids = await dispatchJobWebhooks(job, mockQueue as any)

    expect(ids).toHaveLength(1)
    expect(ids[0]).toBe('del_1')
    expect(mockDb.createWebhookDelivery).toHaveBeenCalled()
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        url: 'https://example.com/hook',
        secret: 'whsec_secret',
      }),
      expect.objectContaining({
        attempts: 5,
      }),
    )
  })

  it('dispatches webhook for per-job webhookUrl parameter', async () => {
    const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'q_1' }) }
    mockDb.listActiveWebhookEndpointsForUser.mockResolvedValue([])
    mockDb.prisma.webhookDelivery.findFirst.mockResolvedValue(null)
    mockDb.createWebhookDelivery.mockResolvedValue({
      id: 'del_param',
      userId: 'user_test',
      jobId: 'job_param',
      event: 'job.completed',
      payload: {},
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const job = {
      id: 'job_param',
      userId: 'user_test',
      status: 'COMPLETED',
      pdfUrl: 'https://s3.trypitch.co/deck.pdf',
      parameters: {
        jobType: 'pdf',
        webhookUrl: 'https://custom-webhook.org/receive',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const ids = await dispatchJobWebhooks(job, mockQueue as any)

    expect(ids).toHaveLength(1)
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        url: 'https://custom-webhook.org/receive',
      }),
      expect.any(Object),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('executeWebhookDelivery and retries', () => {
  it('updates delivery status to SUCCESS on HTTP 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"received":true}'),
    } as any)

    mockDb.updateWebhookDelivery.mockResolvedValue({
      id: 'del_1',
      status: 'SUCCESS',
      attempts: 1,
    })

    const result = await executeWebhookDelivery(
      {
        deliveryId: 'del_1',
        userId: 'user_test',
        url: 'https://example.com/webhook',
        secret: 'whsec_123',
        payload: { event: 'job.completed', data: { jobId: 'job_1' } },
      },
      1,
    )

    expect(result.success).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Pitch-Event': 'job.completed',
          'X-Pitch-Signature': expect.stringMatching(/^t=\d+,v1=/),
        }),
      }),
    )
    expect(mockDb.updateWebhookDelivery).toHaveBeenCalledWith(
      'del_1',
      expect.objectContaining({
        status: 'SUCCESS',
        statusCode: 200,
      }),
    )

    fetchSpy.mockRestore()
  })

  it('updates delivery status and throws on HTTP 500 for BullMQ retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue('Server error'),
    } as any)

    mockDb.updateWebhookDelivery.mockResolvedValue({
      id: 'del_1',
      status: 'PENDING',
      attempts: 1,
    })

    await expect(
      executeWebhookDelivery(
        {
          deliveryId: 'del_1',
          userId: 'user_test',
          url: 'https://example.com/webhook',
          secret: 'whsec_123',
          payload: { event: 'job.completed' },
        },
        1,
      ),
    ).rejects.toThrow(/Webhook delivery failed/i)

    expect(mockDb.updateWebhookDelivery).toHaveBeenCalledWith(
      'del_1',
      expect.objectContaining({
        status: 'PENDING',
        statusCode: 500,
        attempts: 1,
      }),
    )

    fetchSpy.mockRestore()
  })

  it('marks status as FAILED on final max attempt (attempt 5)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network connection timeout'))

    mockDb.updateWebhookDelivery.mockResolvedValue({
      id: 'del_1',
      status: 'FAILED',
      attempts: 5,
    })

    await expect(
      executeWebhookDelivery(
        {
          deliveryId: 'del_1',
          userId: 'user_test',
          url: 'https://example.com/webhook',
          secret: 'whsec_123',
          payload: { event: 'job.completed' },
        },
        5,
      ),
    ).rejects.toThrow(/Webhook delivery failed/i)

    expect(mockDb.updateWebhookDelivery).toHaveBeenCalledWith(
      'del_1',
      expect.objectContaining({
        status: 'FAILED',
        attempts: 5,
        nextRetryAt: null,
      }),
    )

    fetchSpy.mockRestore()
  })
})
