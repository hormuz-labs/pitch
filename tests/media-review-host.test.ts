import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '../apps/api/src/studio/paths.js'

const mocks = vi.hoisted(() => ({ review: vi.fn(), probe: vi.fn() }))
vi.mock('../.pi/lib/media-review.ts', async original => ({
  ...(await original<typeof import('../.pi/lib/media-review.ts')>()),
  reviewMedia: mocks.review,
}))
vi.mock('node:child_process', async original => {
  const { promisify } = await import('node:util')
  return {
    ...(await original<typeof import('node:child_process')>()),
    execFile: Object.assign(() => {}, { [promisify.custom]: mocks.probe }),
  }
})
vi.mock('@saas/shared', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }))
vi.mock('@saas/storage', () => ({ uploadFile: vi.fn() }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  addOutput: vi.fn(),
  projectRowFor: vi.fn(),
}))

await import('../apps/api/src/pipelines/media.js')
const { invokeHostAction } = await import('../apps/api/src/studio/host-actions.js')

const dirs: string[] = []
const params = {
  file: 'audio/candidate.mp3',
  purpose: 'music',
  brief: 'A restrained bed with room for narration.',
}
async function workspace(): Promise<Workspace> {
  const dir = await mkdtemp(path.join(tmpdir(), 'media-review-'))
  dirs.push(dir)
  await mkdir(path.join(dir, 'audio'))
  await writeFile(path.join(dir, params.file), 'first audio')
  return {
    dir,
    name: 'review',
    flow: 'studio',
    userId: 'test',
    internal: `studio--test--${path.basename(dir)}`,
  }
}
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('GEMINI_REVIEW_MODEL', 'test-model')
  mocks.probe.mockResolvedValue({ stdout: '{"format":{"duration":"15"}}' })
  mocks.review.mockResolvedValue({
    summary: 'Suitable bed.',
    strengths: ['Restrained.'],
    findings: [],
    limitations: [],
  })
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('media_review host action', () => {
  it('caches only identical content, brief, purpose and model and saves an inspectable report', async () => {
    const ws = await workspace()
    const first = JSON.parse(await invokeHostAction(ws, 'media_review', params))
    expect(first.cached).toBe(false)
    expect(JSON.parse(await readFile(path.join(ws.dir, first.report), 'utf8')).duration).toBe(15)
    expect(JSON.parse(await invokeHostAction(ws, 'media_review', params)).cached).toBe(true)
    expect(mocks.review).toHaveBeenCalledTimes(1)
    await writeFile(path.join(ws.dir, params.file), 'changed audio')
    await invokeHostAction(ws, 'media_review', params)
    await invokeHostAction(ws, 'media_review', { ...params, brief: 'An energetic reveal.' })
    vi.stubEnv('GEMINI_REVIEW_MODEL', 'other-model')
    await invokeHostAction(ws, 'media_review', params)
    expect(mocks.review).toHaveBeenCalledTimes(4)
  })

  it('passes the real bytes, measured duration and abort signal to the reviewer', async () => {
    const ws = await workspace()
    await invokeHostAction(ws, 'media_review', params)
    expect(mocks.review.mock.calls[0][0]).toMatchObject({
      data: Buffer.from('first audio'),
      duration: 15,
      purpose: 'music',
      model: 'test-model',
    })
    expect(mocks.review.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects traversal and symlink escapes before probing or uploading', async () => {
    const ws = await workspace()
    const other = await workspace()
    await symlink(path.join(other.dir, params.file), path.join(ws.dir, 'escape.mp3'))
    for (const file of ['../outside.mp3', '/etc/passwd', 'escape.mp3']) {
      await expect(invokeHostAction(ws, 'media_review', { ...params, file })).rejects.toThrow(
        /workspace/,
      )
    }
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it('does not accept audio-only input as a film review', async () => {
    await expect(
      invokeHostAction(await workspace(), 'media_review', { ...params, purpose: 'film' }),
    ).rejects.toThrow('needs a video')
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it('does not cache a failed review', async () => {
    const ws = await workspace()
    mocks.review.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(invokeHostAction(ws, 'media_review', params)).rejects.toThrow(
      'provider unavailable',
    )
    expect(JSON.parse(await invokeHostAction(ws, 'media_review', params)).cached).toBe(false)
    expect(mocks.review).toHaveBeenCalledTimes(2)
  })
})
