/**
 * @saas/storage is one contract over two stores. The public URL shape and
 * the key derivation are the package's, not the driver's, so a URL written
 * under MinIO is still taken apart correctly under GCS.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

process.env.STORAGE_DRIVER = 'gcs'
process.env.STORAGE_BUCKET = 'pitch-media'
delete process.env.STORAGE_PUBLIC_URL
delete process.env.MINIO_PUBLIC_URL

const calls: any[] = []
const fake = {
  name: 'gcs',
  ensureBucket: vi.fn(async (...a: any[]) => void calls.push(['ensureBucket', ...a])),
  put: vi.fn(
    async (...a: any[]) => void calls.push(['put', a[0], a[1], a[3].contentType, a[3].size]),
  ),
  get: vi.fn(async () => null),
  head: vi.fn(async () => null),
  remove: vi.fn(async (...a: any[]) => void calls.push(['remove', ...a])),
  list: vi.fn(async () => []),
}
vi.mock('../packages/storage/src/gcs.js', () => ({ gcsDriver: () => fake }))
vi.mock('../packages/storage/src/s3.js', () => ({
  s3Driver: () => {
    throw new Error('the s3 driver must not be built when STORAGE_DRIVER=gcs')
  },
}))

const storage = await import('../packages/storage/src/index.js')

describe('storage drivers', () => {
  it('picks the driver from STORAGE_DRIVER and defaults the GCS public origin', async () => {
    expect(storage.STORAGE_DRIVER).toBe('gcs')
    const url = await storage.uploadBuffer(Buffer.from('x'), 'a.png', 'image/png', undefined, 'p')
    expect(url).toMatch(
      /^https:\/\/storage\.googleapis\.com\/pitch-media\/p\/\d+-[a-z0-9]+\/a\.png$/,
    )
    expect(calls[0]).toEqual(['ensureBucket', 'pitch-media', true])
    expect(calls[1].slice(0, 2)).toEqual(['put', 'pitch-media'])
    expect(calls[1].slice(3)).toEqual(['image/png', 1])
  })

  it('streams a file with its size and sniffs the content type', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'storage-'))
    const file = path.join(dir, 'clip.mp4')
    await writeFile(file, Buffer.alloc(10))
    calls.length = 0
    await storage.uploadFile(file, 'other')
    expect(calls[1]).toEqual(['put', 'other', expect.stringMatching(/clip\.mp4$/), 'video/mp4', 10])
  })

  it('takes a public URL apart into bucket and key, and ignores foreign URLs', async () => {
    calls.length = 0
    await storage.deleteFile('https://storage.googleapis.com/pitch-media/p/1-abc/a.png')
    expect(calls).toEqual([['remove', 'pitch-media', 'p/1-abc/a.png']])
    calls.length = 0
    await storage.deleteFile('https://cdn.example.com/a.png')
    expect(calls).toEqual([])
  })

  it('keeps checkpoints in a private bucket ensured once', async () => {
    calls.length = 0
    const store = storage.privateBucket('pitch-workspaces')
    await store.put('w/1/a', Buffer.from('a'))
    await store.put('w/1/b', Buffer.from('b'))
    expect(calls.filter(c => c[0] === 'ensureBucket')).toEqual([
      ['ensureBucket', 'pitch-workspaces', false],
    ])
    expect(await store.get('w/1/a')).toBeNull()
  })
})
