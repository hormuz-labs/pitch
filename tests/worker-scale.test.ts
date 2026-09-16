/**
 * /internal/scale is the number the autoscaler follows: workers enough to
 * hold every leased project and keep the headroom free. A draining worker
 * still counts its projects but not its slots, so its replacement is asked
 * for before it is gone.
 */
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

process.env.STUDIO_WORKER_TOKEN = 'secret-token'
process.env.STUDIO_WORKER_SLOTS = '4'
process.env.STUDIO_SCALE_HEADROOM = '2'

let workers: any[] = []
let held = 0
let queued = 0
let running = 0
vi.mock('@saas/db', () => ({
  prisma: {
    studioWorker: { findMany: vi.fn(async () => workers) },
    renderJob: {
      count: vi.fn(async ({ where }: any) => (where.status === 'queued' ? queued : running)),
    },
    $queryRaw: vi.fn(async () => [{ n: BigInt(held) }]),
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { router } = await import('../apps/api/src/worker/scale.js')
const { fleetStatus } = await import('../apps/api/src/worker/lease.js')
const app = express().use('/internal/scale', router)
const worker = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  url: `http://${id}:3000`,
  slots: 4,
  epoch: 1,
  draining: false,
  heartbeatAt: new Date(),
  ...over,
})

describe('fleet status', () => {
  it('asks for one worker when nothing is held', async () => {
    workers = []
    held = 0
    expect(await fleetStatus()).toEqual({
      workers: 0,
      slots: 0,
      held: 0,
      wanted: 1,
      render: { queued: 0, running: 0, wanted: 0 },
    })
  })

  it('keeps the headroom free and rounds up to whole workers', async () => {
    workers = [worker('pitch-worker-0'), worker('pitch-worker-1')]
    held = 3
    expect(await fleetStatus()).toMatchObject({ workers: 2, slots: 8, held: 3, wanted: 2 })
    held = 7
    expect((await fleetStatus()).wanted).toBe(3)
  })

  it('counts a draining worker’s projects but not its slots', async () => {
    workers = [worker('pitch-worker-0'), worker('pitch-worker-1', { draining: true })]
    held = 6
    expect(await fleetStatus()).toMatchObject({ workers: 1, slots: 4, held: 6, wanted: 2 })
  })

  it('uses a fixed worker outside the group before asking for elastic ones', async () => {
    // A GPU box that joined over Tailscale: its four slots absorb the demand.
    workers = [worker('pitch-worker-0'), worker('node-gpu-1')]
    held = 3
    expect((await fleetStatus()).wanted).toBe(1)
    held = 5
    expect((await fleetStatus()).wanted).toBe(1)
    held = 7
    expect((await fleetStatus()).wanted).toBe(2)
  })

  it('serves the number behind the worker token', async () => {
    workers = [worker('pitch-worker-0', { slots: 8 })]
    held = 1
    expect((await request(app).get('/internal/scale')).status).toBe(401)
    const res = await request(app)
      .get('/internal/scale')
      .set('Authorization', 'Bearer secret-token')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      workers: 1,
      slots: 8,
      held: 1,
      wanted: 1,
      render: { queued: 0, running: 0, wanted: 0 },
    })
  })

  it('asks for one render pod per job in flight, none idle, eight at most', async () => {
    workers = [worker('pitch-worker-0')]
    held = 0
    queued = 0
    running = 0
    expect((await fleetStatus()).render.wanted).toBe(0)
    queued = 2
    running = 3
    expect((await fleetStatus()).render).toEqual({ queued: 2, running: 3, wanted: 5 })
    queued = 20
    expect((await fleetStatus()).render.wanted).toBe(8)
    queued = 0
    running = 0
  })
})
