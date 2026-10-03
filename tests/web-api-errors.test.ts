import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../apps/web/src/lib/api'

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: string, type: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } })),
  )

describe('api errors', () => {
  it("shows the server's own message when it answers a gateway status itself", async () => {
    answer(502, JSON.stringify({ error: 'Upload failed. Please try again.' }), 'application/json')
    const err = await api.postForm('/uploads', 't', new FormData()).catch(e => e)
    expect(err).toMatchObject({ message: 'Upload failed. Please try again.', status: 502 })
    expect(err.unreachable).toBeUndefined()
  })

  it('calls it unreachable when a proxy answered instead', async () => {
    answer(502, '', 'text/plain')
    await expect(api.get('/projects', 't')).rejects.toMatchObject({
      status: 502,
      unreachable: true,
    })
  })
})
