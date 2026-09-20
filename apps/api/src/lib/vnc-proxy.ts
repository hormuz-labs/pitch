import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { verifyToken } from '@clerk/backend'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { WebSocket, WebSocketServer } from 'ws'
import { browserHostUrl, parseDemoStreamId } from '../services/browser-routing.js'
import { hasVncEndpoint, serveVnc } from '../services/browser-vnc.js'

const logger = createLogger('api:vnc-proxy')
const PUBLIC_PATH = /^\/browser\/streams\/([^/]+)$/
const INTERNAL_PATH = /^\/internal\/browser\/streams\/([^/]+)$/
const MAX_PENDING_BYTES = 1024 * 1024
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

function rawSize(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((size, part) => size + part.byteLength, 0)
  return data.byteLength
}

function abort(socket: Duplex, code: number, message: string): void {
  try {
    socket.end(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`)
  } catch {
    socket.destroy()
  }
}

async function userIdFor(token: string | null): Promise<string | null> {
  if (!token || !process.env.CLERK_SECRET_KEY) return null
  try {
    return (await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })).sub ?? null
  } catch {
    return null
  }
}

/** Resolve the host recorded when this stream started. Never acquires or re-places a project. */
export async function streamHost(streamId: string, userId: string): Promise<string | null> {
  const session = await db.prisma.browserSession.findFirst({
    where: { streamId, userId, status: 'READY' },
    select: { hostUrl: true },
  })
  if (session?.hostUrl) return session.hostUrl

  const demo = parseDemoStreamId(streamId)
  if (!demo) return null
  const project = await db.prisma.project.findFirst({
    where: {
      id: demo.projectId,
      userId,
      workerId: demo.workerId,
      workerEpoch: demo.workerEpoch,
    },
    select: { workerId: true },
  })
  if (!project?.workerId) return null
  const worker = await db.prisma.studioWorker.findFirst({
    where: { id: demo.workerId, epoch: demo.workerEpoch },
    select: { url: true },
  })
  return worker?.url ?? null
}

function bridge(client: WebSocket, target: string, onUnavailable: () => void): void {
  const upstream = new WebSocket(target, ['binary'], {
    headers: { authorization: `Bearer ${process.env.STUDIO_WORKER_TOKEN || ''}` },
    handshakeTimeout: 10_000,
    maxPayload: 1024 * 1024,
  })
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = []
  let pendingBytes = 0
  let closed = false
  let opened = false
  const close = () => {
    if (closed) return
    closed = true
    if (client.readyState < WebSocket.CLOSING) client.close()
    if (upstream.readyState < WebSocket.CLOSING) upstream.close()
  }
  const forward = (
    destination: WebSocket,
    source: WebSocket,
    data: WebSocket.RawData,
    binary: boolean,
  ) => {
    if (destination.readyState !== WebSocket.OPEN) return close()
    destination.send(data, { binary }, error => error && close())
    if (destination.bufferedAmount > MAX_BUFFERED_BYTES) {
      source.pause()
      const resume = setInterval(() => {
        if (closed) return clearInterval(resume)
        if (destination.bufferedAmount <= MAX_BUFFERED_BYTES / 2) {
          clearInterval(resume)
          source.resume()
        }
      }, 25)
      resume.unref()
    }
  }

  client.on('message', (data, binary) => {
    if (upstream.readyState === WebSocket.OPEN) return forward(upstream, client, data, binary)
    const size = rawSize(data)
    if (pendingBytes + size > MAX_PENDING_BYTES) return close()
    pending.push({ data, binary })
    pendingBytes += size
  })
  upstream.on('open', () => {
    opened = true
    for (const item of pending) forward(upstream, client, item.data, item.binary)
    pending.length = 0
    pendingBytes = 0
  })
  upstream.on('message', (data, binary) => forward(client, upstream, data, binary))
  client.on('close', close)
  client.on('error', close)
  upstream.on('close', () => {
    if (!opened) onUnavailable()
    close()
  })
  upstream.on('error', error => {
    logger.warn({ error, target }, 'VNC worker bridge failed')
    close()
  })
}

export function attachVncProxy(server: Server): void {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    handleProtocols: protocols => (protocols.has('binary') ? 'binary' : false),
  })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const internal = url.pathname.match(INTERNAL_PATH)
    if (internal) {
      if (
        !process.env.STUDIO_WORKER_TOKEN ||
        req.headers.authorization !== `Bearer ${process.env.STUDIO_WORKER_TOKEN}`
      )
        return abort(socket, 403, 'Forbidden')
      const id = decodeURIComponent(internal[1]!)
      if (!hasVncEndpoint(id)) return abort(socket, 404, 'Not Found')
      return wss.handleUpgrade(req, socket, head, ws => serveVnc(ws, id))
    }

    const match = url.pathname.match(PUBLIC_PATH)
    if (!match) return abort(socket, 404, 'Not Found')
    const id = decodeURIComponent(match[1]!)
    void userIdFor(url.searchParams.get('token'))
      .then(async userId => {
        if (!userId) return abort(socket, 403, 'Forbidden')
        const host = await streamHost(id, userId)
        if (!host) return abort(socket, 404, 'Not Found')
        wss.handleUpgrade(req, socket, head, ws => {
          if (host === browserHostUrl() && hasVncEndpoint(id)) return serveVnc(ws, id)
          bridge(
            ws,
            `${host.replace(/^http/, 'ws')}/internal/browser/streams/${encodeURIComponent(id)}`,
            () => {
              void db.prisma.browserSession
                .updateMany({
                  where: { streamId: id, status: 'READY' },
                  data: {
                    status: 'ERROR',
                    error: 'The worker hosting this browser is unavailable',
                    closedAt: new Date(),
                  },
                })
                .catch(() => {})
            },
          )
        })
      })
      .catch(error => {
        logger.error({ error, id }, 'VNC upgrade failed')
        abort(socket, 500, 'Internal Server Error')
      })
  })
}
