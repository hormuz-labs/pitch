import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { s3Driver } from '../packages/storage/src/s3.ts'

describe('checkpoint upload cancellation', () => {
  it('aborts a stalled multipart request rather than leaving the source handoff waiting', async () => {
    const controller = new AbortController()
    let partStarted = false
    const server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost')
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        req.resume()
        res.setHeader('Content-Type', 'application/xml')
        res.end(
          '<InitiateMultipartUploadResult><Bucket>test</Bucket><Key>capture.tar</Key><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>',
        )
      } else if (req.method === 'PUT') {
        partStarted = true
        req.resume()
        // Deliberately never send a response to the part upload.
        controller.abort(new Error('checkpoint cancelled'))
      } else {
        req.resume()
        res.writeHead(204)
        res.end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    vi.stubEnv('MINIO_ENDPOINT', `http://127.0.0.1:${port}`)
    vi.stubEnv('MINIO_ROOT_USER', 'test')
    vi.stubEnv('MINIO_ROOT_PASSWORD', 'test')
    try {
      await expect(
        s3Driver().put('test', 'capture.tar', Buffer.alloc(6 * 1024 * 1024), {
          contentType: 'application/x-tar',
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/i)
      expect(partStarted).toBe(true)
    } finally {
      controller.abort()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      vi.unstubAllEnvs()
    }
  })
})
