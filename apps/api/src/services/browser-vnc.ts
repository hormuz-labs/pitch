import { type ChildProcess, spawn } from 'node:child_process'
import { createServer, Socket } from 'node:net'
import { createLogger } from '@saas/shared'
import type { WebSocket } from 'ws'

const logger = createLogger('studio:browser-vnc')
const START_TIMEOUT_MS = Math.max(1_000, Number(process.env.VNC_START_TIMEOUT_MS || 20_000))
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

interface VncEndpoint {
  port: number
  clients: Set<WebSocket>
}

const endpoints = new Map<string, VncEndpoint>()

function rawBuffer(data: WebSocket.RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (Buffer.isBuffer(data)) return data
  return Buffer.from(data)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(done, ms)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('Browser display startup aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (!port) throw new Error('Could not allocate a loopback port')
  return port
}

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'], detached: true })
  captureProcessStderr(child, command)
  return child
}

function captureProcessStderr(child: ChildProcess, command: string): void {
  let stderr = ''
  child.stderr?.on('data', chunk => {
    stderr = `${stderr}${chunk}`.slice(-4096)
  })
  child.once('error', error => {
    logger.warn({ error, command }, 'browser display process failed to start')
  })
  Object.assign(child, { pitchStderr: () => stderr })
}

/**
 * Xvfb's `-displayfd` protocol writes the allocated display number only after
 * its listening sockets are ready. This is more reliable than checking
 * `/tmp/.X11-unix`: Linux may use an abstract X11 socket with no filesystem
 * entry, and a manual display-number lock cannot see other X servers.
 */
export function waitForXvfbDisplay(
  child: ChildProcess,
  output: NodeJS.ReadableStream,
  signal?: AbortSignal,
  timeoutMs = START_TIMEOUT_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false
    const stderr = () =>
      (child as ChildProcess & { pitchStderr?: () => string }).pitchStderr?.().trim() ?? ''
    const cleanup = () => {
      clearTimeout(timer)
      output.removeListener('data', onData)
      output.removeListener('end', onEnd)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      signal?.removeEventListener('abort', onAbort)
    }
    const succeed = (number: number) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(number)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const parse = () => {
      const value = buffer.trim()
      const number = Number(value)
      if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < 0) {
        fail(new Error(`Xvfb returned an invalid display number: ${value || '(empty)'}`))
        return
      }
      succeed(number)
    }
    const onData = (chunk: string | Buffer) => {
      buffer = `${buffer}${chunk.toString()}`.slice(-128)
      if (buffer.includes('\n')) parse()
    }
    const onEnd = () => parse()
    const onError = (error: Error) =>
      fail(new Error(`Xvfb failed to start: ${error.message}${stderr() ? `: ${stderr()}` : ''}`))
    const onExit = (code: number | null, childSignal: NodeJS.Signals | null) =>
      fail(
        new Error(
          `Xvfb exited before becoming ready (${code ?? childSignal ?? 'unknown'})${stderr() ? `: ${stderr()}` : ''}`,
        ),
      )
    const onAbort = () => fail(new DOMException('Xvfb startup aborted', 'AbortError'))
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            `Xvfb did not report a ready display within ${timeoutMs}ms${stderr() ? `: ${stderr()}` : ''}`,
          ),
        ),
      timeoutMs,
    )

    output.on('data', onData)
    output.once('end', onEnd)
    child.once('error', onError)
    child.once('exit', onExit)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    else if (child.exitCode !== null || child.signalCode !== null) {
      onExit(child.exitCode, child.signalCode)
    }
  })
}

async function waitFor(
  label: string,
  ready: () => Promise<boolean>,
  children: ChildProcess[],
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException(`${label} aborted`, 'AbortError')
    const dead = children.find(child => child.exitCode !== null || child.signalCode !== null)
    if (dead) {
      const stderr = (dead as ChildProcess & { pitchStderr?: () => string }).pitchStderr?.()
      throw new Error(`${label} exited before becoming ready${stderr ? `: ${stderr}` : ''}`)
    }
    if (await ready()) return
    await delay(100, signal)
  }
  throw new Error(`${label} did not become ready within ${START_TIMEOUT_MS}ms`)
}

async function canConnect(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new Socket()
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 2_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
}

export interface VncDisplay {
  display: string
  port: number
  close: () => Promise<void>
  onFailure: (handler: (error: Error) => void) => void
}

export async function startVncDisplay(id: string, signal?: AbortSignal): Promise<VncDisplay> {
  if (process.platform !== 'linux')
    throw new Error('Interactive browser sessions require Linux/Xvfb')
  const port = await freePort()
  const children: ChildProcess[] = []
  const failureHandlers = new Set<(error: Error) => void>()
  let closing = false
  let closePromise: Promise<void> | null = null

  const close = () => {
    if (!closePromise) {
      closing = true
      closePromise = (async () => {
        unregisterVncEndpoint(id)
        await Promise.all(children.reverse().map(stopProcess))
      })()
    }
    return closePromise
  }

  try {
    const xvfb = spawn(
      'Xvfb',
      // Leave room for browser chrome around the 1920x1080 content viewport.
      ['-displayfd', '3', '-screen', '0', '1960x1240x24', '-nolisten', 'tcp', '-ac'],
      {
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
        detached: true,
      },
    )
    captureProcessStderr(xvfb, 'Xvfb')
    children.push(xvfb)
    const displayOutput = xvfb.stdio[3]
    if (!displayOutput || typeof displayOutput === 'number')
      throw new Error('Xvfb displayfd pipe was not created')
    const displayNumber = await waitForXvfbDisplay(
      xvfb,
      displayOutput as NodeJS.ReadableStream,
      signal,
    )
    const display = `:${displayNumber}`
    const env = { ...process.env, DISPLAY: display }

    children.push(startProcess('openbox', [], env))
    const x11vnc = startProcess(
      'x11vnc',
      [
        '-display',
        display,
        '-rfbport',
        String(port),
        '-listen',
        '127.0.0.1',
        '-forever',
        '-shared',
        '-nopw',
        '-noxdamage',
      ],
      env,
    )
    children.push(x11vnc)
    await waitFor('x11vnc', () => canConnect(port), children, signal)
    registerVncEndpoint(id, port)

    for (const child of children) {
      child.once('exit', (code, childSignal) => {
        if (closing) return
        const error = new Error(
          `Interactive display process exited unexpectedly (${code ?? childSignal ?? 'unknown'})`,
        )
        void close()
        for (const handler of failureHandlers) handler(error)
      })
    }
    return {
      display,
      port,
      close,
      onFailure: handler => failureHandlers.add(handler),
    }
  } catch (error) {
    await close()
    throw error
  }
}

export function registerVncEndpoint(id: string, port: number): void {
  if (endpoints.has(id)) throw new Error(`VNC endpoint ${id} is already registered`)
  endpoints.set(id, { port, clients: new Set() })
}

export function hasVncEndpoint(id: string): boolean {
  return endpoints.has(id)
}

export function unregisterVncEndpoint(id: string): void {
  const endpoint = endpoints.get(id)
  endpoints.delete(id)
  for (const client of endpoint?.clients ?? []) client.close(1001, 'Browser closed')
}

export function serveVnc(socket: WebSocket, id: string): void {
  const endpoint = endpoints.get(id)
  if (!endpoint) {
    socket.close(1008, 'Browser display not found')
    return
  }
  endpoint.clients.add(socket)
  const tcp = new Socket()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    endpoint.clients.delete(socket)
    tcp.destroy()
    if (socket.readyState < 2) socket.close()
  }

  tcp.connect(endpoint.port, '127.0.0.1')
  tcp.on('data', data => {
    if (socket.readyState !== 1) return close()
    socket.send(data, { binary: true }, error => error && close())
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      tcp.pause()
      const resume = setInterval(() => {
        if (closed) return clearInterval(resume)
        if (socket.bufferedAmount <= MAX_BUFFERED_BYTES / 2) {
          clearInterval(resume)
          tcp.resume()
        }
      }, 25)
      resume.unref()
    }
  })
  socket.on('message', data => {
    if (!tcp.write(rawBuffer(data))) socket.pause()
  })
  tcp.on('drain', () => socket.resume())
  tcp.on('error', close)
  tcp.on('close', close)
  socket.on('error', close)
  socket.on('close', close)
}
