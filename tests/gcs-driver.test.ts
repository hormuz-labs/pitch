/**
 * The Cloud Storage driver against a fake Cloud Storage that speaks the
 * resumable upload protocol — and, like the real one did during a workspace
 * checkpoint, sometimes never answers a request.
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ObjectDriver } from '../packages/storage/src/driver.ts'

const MiB = 1024 * 1024

interface Session {
  name: string
  bytes: Buffer[]
  received: number
  /** Running CRC state over the bytes accepted so far. */
  crc: number
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const CRC_START = 0xffffffff
/**
 * Castagnoli CRC, fed a chunk at a time the way Cloud Storage accumulates it.
 * Keeping it incremental matters: the driver's request timeout is 1 s here,
 * and a whole-object pass at the final chunk (1.6 s for 20 MiB with a
 * byte-iterator loop) made every completion time out and retry forever.
 */
const crc32cUpdate = (c: number, data: Buffer) => {
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return c
}
/** Finished CRC, base64 big-endian — what Cloud Storage reports as `crc32c`. */
const crc32cDigest = (c: number) => {
  const out = Buffer.alloc(4)
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0)
  return out.toString('base64')
}
const crc32c = (data: Buffer) => crc32cDigest(crc32cUpdate(CRC_START, data))

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

describe('gcs driver', () => {
  let server: Server
  let driver: ObjectDriver
  const objects = new Map<string, Buffer>()
  const sessions = new Map<string, Session>()
  /** Chunk start offsets whose first request is swallowed without a reply. */
  const stallAt = new Set<number>()
  const stalled: number[] = []
  let origin = ''

  const metadata = (bucket: string, name: string, data: Buffer, crc = crc32c(data)) => ({
    kind: 'storage#object',
    bucket,
    name,
    size: String(data.length),
    md5Hash: createHash('md5').update(data).digest('base64'),
    crc32c: crc,
  })

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://x')
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers })
        res.end(JSON.stringify(body))
      }
      // Bucket metadata: the runtime identity only has objectAdmin.
      if (req.method === 'GET' && /\/b\/[^/]+$/.test(url.pathname)) {
        await readBody(req)
        return json(403, { error: { code: 403, message: 'no storage.buckets.get' } })
      }
      const start = url.pathname.match(/\/upload\/storage\/v1\/b\/([^/]+)\/o$/)
      if (req.method === 'POST' && start && url.searchParams.get('uploadType') === 'resumable') {
        const meta = JSON.parse((await readBody(req)).toString() || '{}')
        const id = String(sessions.size + 1)
        sessions.set(id, {
          name: `${start[1]}/${meta.name ?? url.searchParams.get('name')}`,
          bytes: [],
          received: 0,
          crc: CRC_START,
        })
        res.writeHead(200, { location: `${origin}/session/${id}` })
        return res.end()
      }
      if (req.method === 'POST' && start && url.searchParams.get('uploadType') === 'multipart') {
        const body = await readBody(req)
        const boundary = String(req.headers['content-type']).match(/boundary=(.+)$/)![1]
        const parts = body.toString('latin1').split(`--${boundary}`)
        const meta = JSON.parse(parts[1].split('\r\n\r\n')[1])
        const data = Buffer.from(
          parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''),
          'latin1',
        )
        const name = meta.name ?? url.searchParams.get('name')
        objects.set(`${start[1]}/${name}`, data)
        return json(200, metadata(start[1], name, data))
      }
      const session = url.pathname.match(/^\/session\/(\d+)$/)
      if (req.method === 'PUT' && session) {
        const s = sessions.get(session[1])!
        const range = String(req.headers['content-range'] ?? '')
        const body = await readBody(req)
        const committed = () =>
          s.received ? { range: `bytes=0-${s.received - 1}` } : ({} as Record<string, string>)
        // A status query: how much did you get?
        const query = range.match(/^bytes \*\/(\*|\d+)$/)
        if (query) return json(308, {}, committed())
        const m = range.match(/^bytes (\d+)-(\d+)\/(\*|\d+)$/)
        if (!m) return json(400, { error: { code: 400, message: `bad range ${range}` } })
        const from = Number(m[1])
        if (stallAt.has(from)) {
          stallAt.delete(from)
          stalled.push(from)
          return // never answer this one
        }
        if (from !== s.received)
          return json(400, { error: { code: 400, message: `expected ${s.received}` } })
        s.bytes.push(body)
        s.received += body.length
        s.crc = crc32cUpdate(s.crc, body)
        if (m[3] !== '*' && s.received === Number(m[3])) {
          const data = Buffer.concat(s.bytes)
          objects.set(s.name, data)
          const [bucket, ...name] = s.name.split('/')
          return json(200, metadata(bucket, name.join('/'), data, crc32cDigest(s.crc)))
        }
        return json(308, {}, committed())
      }
      await readBody(req)
      json(404, { error: { code: 404, message: `${req.method} ${url.pathname}` } })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    vi.stubEnv('STORAGE_EMULATOR_HOST', origin)
    vi.stubEnv('GCS_REQUEST_TIMEOUT_MS', '1000')
    vi.stubEnv('GCS_PROJECT', 'test')
    vi.resetModules()
    const { gcsDriver } = await import('../packages/storage/src/gcs.ts')
    driver = gcsDriver()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('resends only the chunk Cloud Storage never answered', async () => {
    const data = Buffer.alloc(20 * MiB)
    for (let i = 0; i < data.length; i += 4096) data.writeUInt32LE(i, i)
    stallAt.add(8 * MiB)
    const progress: number[] = []
    const started = Date.now()
    await driver.put(
      'workspaces',
      'p/1/workspace.tar',
      Readable.from([data.subarray(0, 12 * MiB), data.subarray(12 * MiB)]),
      {
        contentType: 'application/x-tar',
        onProgress: loaded => progress.push(loaded),
      },
    )
    expect(stalled).toEqual([8 * MiB])
    expect(objects.get('workspaces/p/1/workspace.tar')?.equals(data)).toBe(true)
    expect(progress.at(-1)).toBe(20 * MiB)
    expect(Date.now() - started).toBeLessThan(15_000)
  }, 30_000)

  it('uploads a small buffer', async () => {
    await driver.put('media', 'a/cover.jpg', Buffer.from('jpeg bytes'), {
      contentType: 'image/jpeg',
    })
    expect(objects.get('media/a/cover.jpg')?.toString()).toBe('jpeg bytes')
  })

  it('treats a bucket it may not inspect as provisioned', async () => {
    await expect(driver.ensureBucket('media', true)).resolves.toBeUndefined()
  })
})
