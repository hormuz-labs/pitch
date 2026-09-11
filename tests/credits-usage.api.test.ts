/**
 * Daily credit usage, the series behind the settings chart.
 *
 * The chart draws one bar per day, so the endpoint owns the calendar: every day
 * in the range comes back, including the ones nothing was spent on.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn().mockResolvedValue([]),
  getCreditSummary: vi.fn(),
}))

vi.mock('@saas/db', () => ({
  getCreditSummary: mocks.getCreditSummary,
  prisma: { $queryRaw: mocks.queryRaw, project: { findMany: vi.fn() } },
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/credits.js'

const app = express()
app.use('/credits', router)

const daily = (query: string) => request(app).get(`/credits/usage/daily${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryRaw.mockResolvedValue([])
})

describe('GET /credits/usage/daily', () => {
  it('returns a bar for every day in the range, including empty ones', async () => {
    const response = await daily('?from=2026-09-01&to=2026-09-03')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { date: '2026-09-01', studio: 0, api: 0 },
      { date: '2026-09-02', studio: 0, api: 0 },
      { date: '2026-09-03', studio: 0, api: 0 },
    ])
  })

  it('splits a day between the app and the public API', async () => {
    mocks.queryRaw.mockResolvedValue([
      { day: new Date('2026-09-02T00:00:00Z'), studio: 120n, api: 360n },
    ])

    const response = await daily('?from=2026-09-01&to=2026-09-03')

    expect(response.body[1]).toEqual({ date: '2026-09-02', studio: 120, api: 360 })
    expect(response.body[0]).toEqual({ date: '2026-09-01', studio: 0, api: 0 })
  })

  it('reports spend as a positive number of credits', async () => {
    mocks.queryRaw.mockResolvedValue([
      { day: new Date('2026-09-01T00:00:00Z'), studio: 40n, api: 0n },
    ])

    const response = await daily('?from=2026-09-01&to=2026-09-01')

    expect(response.body).toEqual([{ date: '2026-09-01', studio: 40, api: 0 }])
  })

  it('rejects a request with no range', async () => {
    expect((await daily('')).status).toBe(400)
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('rejects a range that is not a date', async () => {
    expect((await daily('?from=yesterday&to=today')).status).toBe(400)
  })

  it('rejects a range that runs backwards', async () => {
    expect((await daily('?from=2026-09-10&to=2026-09-01')).status).toBe(400)
  })

  it('refuses a range too long to draw', async () => {
    expect((await daily('?from=2020-01-01&to=2026-09-01')).status).toBe(400)
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})
