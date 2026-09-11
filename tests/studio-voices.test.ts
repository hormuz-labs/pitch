import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ allowed: true }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: unknown, res: any) => {
    if (!auth.allowed) res.status(401).json({ error: 'Unauthorized' })
    return auth.allowed
  },
}))

import { listElevenLabsVoices } from '../apps/api/src/lib/elevenlabs.js'
import { router } from '../apps/api/src/routes/voices.js'

const app = express().use('/voices', router)
const fetchMock = vi.fn<typeof fetch>()
const catalog = {
  voices: [
    {
      voice_id: 'voice_123',
      name: 'Ada',
      description: 'Warm narrator',
      labels: { accent: 'British', gender: 'female', unsupported: 42 },
      preview_url: 'https://example.com/ada.mp3',
      private_metadata: 'not-for-the-browser',
    },
  ],
  has_more: true,
  next_page_token: 'page-two',
}
let keySequence = 0

beforeEach(() => {
  auth.allowed = true
  vi.stubEnv('ELEVEN_LABS_KEY', `test-key-${++keySequence}`)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the studio voice catalog', () => {
  it('requires authentication before making an upstream request', async () => {
    auth.allowed = false
    expect((await request(app).get('/voices')).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps credentials and private voice metadata server-side and preserves pagination', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(catalog))
    const response = await request(app).get('/voices?search=British&cursor=page-one')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      source: 'account',
      nextCursor: 'page-two',
      voices: [
        {
          id: 'voice_123',
          name: 'Ada',
          description: 'Warm narrator',
          labels: { accent: 'British', gender: 'female' },
          previewUrl: 'https://example.com/ada.mp3',
        },
      ],
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('next_page_token=page-one')
    expect(response.text).not.toContain('test-key-')
    expect(response.text).not.toContain('private_metadata')
  })

  it('uses the unauthenticated stock catalog when an otherwise valid key cannot read account voices', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ detail: { status: 'missing_permissions' } }, { status: 401 }),
    )
    fetchMock.mockResolvedValueOnce(Response.json({ voices: catalog.voices }))
    const page = await listElevenLabsVoices('british')
    expect(page.source).toBe('default')
    expect(page.voices.map(voice => voice.name)).toEqual(['Ada'])
    expect(page.nextCursor).toBeNull()
    expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined()
  })

  it('reports provider failures locally and retries instead of caching a rejection', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ detail: { status: 'invalid_api_key' } }, { status: 401 }),
    )
    expect((await request(app).get('/voices')).status).toBe(424)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce(Response.json(catalog))
    expect((await request(app).get('/voices')).status).toBe(200)
  })

  it('coalesces catalog requests and rejects oversized searches before reaching ElevenLabs', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(catalog))
    await Promise.all([listElevenLabsVoices(), listElevenLabsVoices()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      (
        await request(app)
          .get('/voices')
          .query({ search: 'x'.repeat(121) })
      ).status,
    ).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
