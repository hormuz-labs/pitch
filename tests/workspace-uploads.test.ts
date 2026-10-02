import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '../apps/api/src/studio/paths.js'

const driver = vi.hoisted(() => ({ name: 's3', get: vi.fn() }))
vi.mock('../packages/storage/src/s3.js', () => ({ s3Driver: () => driver }))
vi.stubEnv('STORAGE_DRIVER', 's3')
vi.stubEnv('STORAGE_BUCKET', 'trypitch')
vi.stubEnv('STORAGE_PUBLIC_URL', 'http://localhost:9002')

const { downloadFile } = await import('../packages/storage/src/index.js')
const { prepareWorkspace, buildContext } = await import('../apps/api/src/agent/index.js')
const { addAssets } = await import('../apps/api/src/projects/assets.js')

const upload = {
  url: 'http://localhost:9002/trypitch/pitch/user_1/uploads/123/test.webm',
  name: 'test.webm',
  type: 'video/webm',
  size: 5,
}
let ws: Workspace
const http = vi.fn()

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', http)
  driver.get.mockImplementation(async () => Readable.from([Buffer.from('video')]))
  ws = {
    flow: 'studio',
    userId: 'user_1',
    name: 'demo',
    internal: 'studio--user_1--demo',
    dir: await mkdtemp(path.join(tmpdir(), 'workspace-uploads-')),
  }
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(ws.dir, { recursive: true, force: true })
})

describe('workspace uploads', () => {
  it('stages a browser-facing MinIO URL through storage before exposing it to pi', async () => {
    await prepareWorkspace(ws, {}, [upload])

    expect(driver.get).toHaveBeenCalledExactlyOnceWith(
      'trypitch',
      'pitch/user_1/uploads/123/test.webm',
    )
    expect(http).not.toHaveBeenCalled()
    expect(await readFile(path.join(ws.dir, 'uploads/test.webm'), 'utf8')).toBe('video')
    expect(await readFile(path.join(ws.dir, 'recording/upload.webm'), 'utf8')).toBe('video')
    expect(await buildContext(ws, { first: true })).toContain('uploads/test.webm (video/webm)')
  })

  it('rejects failed staging instead of starting work with a missing attachment', async () => {
    driver.get.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(prepareWorkspace(ws, {}, [upload])).rejects.toMatchObject({
      status: 502,
      message: 'Could not attach "test.webm". Please try uploading it again.',
    })
    expect(existsSync(path.join(ws.dir, 'uploads/test.webm'))).toBe(false)
    expect(await buildContext(ws, { first: true })).not.toContain('uploads/test.webm')
  })

  it('propagates asset-shelf staging failures to the caller', async () => {
    driver.get.mockResolvedValueOnce(null)
    await expect(addAssets(ws, 'project_1', [upload])).rejects.toMatchObject({ status: 502 })
    expect(http).not.toHaveBeenCalled()
  })

  it('uses a personal soundtrack added through the shelf when it is applied in the next turn', async () => {
    driver.get.mockImplementation(async () => Readable.from([Buffer.from('personal soundtrack')]))
    const added = await addAssets(ws, 'project_1', [
      { ...upload, name: 'my song.mp3', type: 'audio/mpeg' },
    ])
    expect(added[0]).toMatchObject({ path: 'uploads/my_song.mp3', kind: 'audio', origin: 'upload' })
    await prepareWorkspace(ws, { music: added[0].path }, [])
    expect(await readFile(path.join(ws.dir, 'audio/music.mp3'), 'utf8')).toBe('personal soundtrack')
    expect(await buildContext(ws, { first: false })).toContain('music: uploads/my_song.mp3')
  })

  it('keeps normalized filenames and replaces the previous recording input', async () => {
    await prepareWorkspace(ws, {}, [{ ...upload, name: 'old.mp4' }])
    await writeFile(path.join(ws.dir, 'recording/demo-state.json'), '{}')
    await prepareWorkspace(ws, {}, [{ ...upload, name: 'my video.webm' }])

    expect(await readFile(path.join(ws.dir, 'uploads/my_video.webm'), 'utf8')).toBe('video')
    expect(await readdir(path.join(ws.dir, 'recording'))).toEqual(['upload.webm'])
    expect(await buildContext(ws, { first: false })).toContain('uploads/my_video.webm')
  })
})

describe('storage downloads', () => {
  it('continues to support external attachment URLs', async () => {
    http.mockResolvedValueOnce(new Response('external video'))
    const dest = path.join(ws.dir, 'external.webm')
    await downloadFile('https://example.com/clip.webm', dest)

    expect(driver.get).not.toHaveBeenCalled()
    expect(await readFile(dest, 'utf8')).toBe('external video')
  })

  it('rejects an HTTP failure without leaving a file behind', async () => {
    http.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    await expect(
      downloadFile('https://example.com/missing', path.join(ws.dir, 'clip')),
    ).rejects.toThrow('HTTP 404')
    expect(await readdir(ws.dir)).toEqual([])
  })

  it('does not overwrite a valid upload with a truncated stream', async () => {
    const dest = path.join(ws.dir, 'test.webm')
    await writeFile(dest, 'previous video')
    driver.get.mockResolvedValueOnce(
      Readable.from(
        (async function* () {
          yield Buffer.from('partial')
          throw new Error('connection lost')
        })(),
      ),
    )

    await expect(downloadFile(upload.url, dest)).rejects.toThrow('connection lost')
    expect(await readFile(dest, 'utf8')).toBe('previous video')
    expect(await readdir(ws.dir)).toEqual(['test.webm'])
  })
})
