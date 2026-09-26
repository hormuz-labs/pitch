/**
 * GET /pricing/models is what the public pricing page renders. It must quote
 * each model at the token price the runtime bills it at, so the page cannot
 * advertise a price the studio does not charge.
 */
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../apps/api/src/studio/session.js', () => ({
  studioModelPrices: vi.fn(async () => ({
    'google/gemini-3.8-flash': { input: 0.75, output: 3.75 },
    'google/gemma-4-31b-it': { input: 0, output: 0 },
    'azure-apim/gpt-5.6-terra': { input: 2, output: 12 },
    'azure-apim/gpt-5.6-sol': { input: 4, output: 20 },
    'azure-apim/gpt-6-astra': { input: 10, output: 50 },
  })),
}))

const { router } = await import('../apps/api/src/routes/pricing.js')
const app = express().use('/pricing', router)

describe('GET /pricing/models', () => {
  it('quotes every model at its real token price', async () => {
    const res = await request(app).get('/pricing/models').expect(200)
    const credits = Object.fromEntries(
      res.body.models.map((m: { name: string; credits: number }) => [m.name, m.credits]),
    )
    expect(credits).toMatchObject({
      'Gemini 3.8 Flash': 73,
      'Gemma 4 31B': 30,
      Terra: 155,
      Sol: 255,
      Astra: 1155,
    })
    expect(res.body.models.every((m: { unit: string }) => m.unit === 'typical generation')).toBe(
      true,
    )
  })

  it('is cacheable by the browser and CDN', async () => {
    const res = await request(app).get('/pricing/models')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
  })
})
