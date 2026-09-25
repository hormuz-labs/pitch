/**
 * The raw transcript crosses the worker contract when the project is held by
 * another node: the API's remote client asks the worker's
 * /projects/:id/session-log over HTTP, behind the shared worker token.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.STUDIO_WORKER_TOKEN = 'secret-token'
process.env.STUDIO_WORKER_ID = 'api-node'

const mocks = vi.hoisted(() => ({
  sessionLog: vi.fn(),
  workerUrl: '',
}))

vi.mock('@saas/db', () => ({ prisma: {} }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../apps/api/src/worker/host.js', () => {
  // worker/client.ts wires every host export into its local client at import.
  const names =
    'prepare prompt stop steer rollback entries describe busy thumbnail listAssets addAssets saveDeck renderDeck saveStoryboard deleteAsset assetThumbnail startExport exportStatus stopExport publishArtifact subscribe emit release remove workspaceDir'
  return {
    ...Object.fromEntries(names.split(' ').map(name => [name, vi.fn()])),
    heldProjects: () => [],
    sessionLog: mocks.sessionLog,
  }
})
vi.mock('../apps/api/src/worker/registry.js', () => ({ currentEpoch: () => 1 }))
vi.mock('../apps/api/src/worker/lease.js', () => ({
  acquire: vi.fn(),
  ownerOf: vi.fn(),
  workerById: vi.fn(async (id: string) =>
    id === 'w2' ? { id: 'w2', url: mocks.workerUrl, epoch: 1 } : null,
  ),
}))

const { router } = await import('../apps/api/src/worker/routes.js')
const { clientForWorker } = await import('../apps/api/src/worker/client.js')
const app = express().use('/internal/worker', router)
let server: Server

beforeAll(async () => {
  server = app.listen(0)
  mocks.workerUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.close()
})

describe('session log over the worker contract', () => {
  it('refuses a caller without the worker token', async () => {
    mocks.sessionLog.mockResolvedValue('{"secret":true}\n')
    const none = await request(app).get('/internal/worker/projects/p1/session-log')
    expect(none.status).toBe(401)
    const wrong = await request(app)
      .get('/internal/worker/projects/p1/session-log')
      .set('Authorization', 'Bearer not-it')
    expect(wrong.status).toBe(401)
    expect(mocks.sessionLog).not.toHaveBeenCalled()
  })

  it('returns the transcript to the API through the remote client', async () => {
    mocks.sessionLog.mockResolvedValue('{"type":"session"}\n')
    const worker = await clientForWorker('w2')
    expect(worker?.local).toBe(false)
    expect(await worker!.sessionLog('p1')).toBe('{"type":"session"}\n')
    expect(mocks.sessionLog).toHaveBeenCalledWith('p1')
  })

  it('carries "no transcript" through as null', async () => {
    mocks.sessionLog.mockResolvedValue(null)
    const worker = await clientForWorker('w2')
    expect(await worker!.sessionLog('p1')).toBeNull()
  })

  it('carries the worker’s refusal through with its status', async () => {
    mocks.sessionLog.mockRejectedValue(
      Object.assign(new Error('The session log is too large to download'), { status: 413 }),
    )
    const worker = await clientForWorker('w2')
    await expect(worker!.sessionLog('p1')).rejects.toMatchObject({
      status: 413,
      message: 'The session log is too large to download',
    })
  })
})
