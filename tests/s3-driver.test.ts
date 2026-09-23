import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { byteExactBody } from '../packages/storage/src/s3.js'

describe('S3 uploads', () => {
  it('buffers a small stream into a byte-exact request body', async () => {
    const bytes = Buffer.from('small image bytes')

    const body = await byteExactBody(Readable.from(bytes), bytes.length)

    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body).toEqual(bytes)
  })

  it('rejects a stream when its actual bytes do not match the declared size', async () => {
    await expect(byteExactBody(Readable.from(Buffer.from('short')), 100)).rejects.toThrow(
      /expected 100 bytes but received 5/i,
    )
  })
})

describe('S3 multipart stalls', () => {
  it('resends a part the server never answered instead of hanging', async () => {
    const { createServer } = await import('node:http')
    const { vi } = await import('vitest')
    const parts = new Map<number, Buffer>()
    const stalled: number[] = []
    let completed = false
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost')
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        res.setHeader('Content-Type', 'application/xml')
        return res.end(
          '<InitiateMultipartUploadResult><Bucket>test</Bucket><Key>w.tar</Key><UploadId>u1</UploadId></InitiateMultipartUploadResult>',
        )
      }
      const part = Number(url.searchParams.get('partNumber'))
      if (req.method === 'PUT' && part) {
        if (part === 2 && !stalled.includes(2)) {
          stalled.push(2)
          return // never answer: the stall seen on a workspace checkpoint
        }
        parts.set(part, Buffer.concat(chunks))
        res.setHeader('ETag', `"etag-${part}"`)
        return res.end()
      }
      if (req.method === 'POST' && url.searchParams.has('uploadId')) {
        completed = true
        res.setHeader('Content-Type', 'application/xml')
        return res.end(
          '<CompleteMultipartUploadResult><Bucket>test</Bucket><Key>w.tar</Key><ETag>"x"</ETag></CompleteMultipartUploadResult>',
        )
      }
      res.writeHead(204)
      res.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    vi.stubEnv('MINIO_ENDPOINT', `http://127.0.0.1:${port}`)
    vi.stubEnv('MINIO_ROOT_USER', 'test')
    vi.stubEnv('MINIO_ROOT_PASSWORD', 'test')
    vi.stubEnv('S3_UPLOAD_REQUEST_TIMEOUT_MS', '1000')
    vi.resetModules()
    try {
      const { s3Driver } = await import('../packages/storage/src/s3.ts')
      const data = Buffer.alloc(12 * 1024 * 1024, 7)
      await s3Driver().put('test', 'w.tar', Readable.from([data]), {
        contentType: 'application/x-tar',
      })
      expect(stalled).toEqual([2])
      expect(completed).toBe(true)
      expect(Buffer.concat([1, 2, 3].map(n => parts.get(n)!)).equals(data)).toBe(true)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      vi.unstubAllEnvs()
    }
  }, 30_000)
})
