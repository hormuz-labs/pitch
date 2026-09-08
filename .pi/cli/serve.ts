/**
 * The socket the sandboxed shell's `pitch` talks to.
 *
 * The agent runs `pitch` like any program, from a shell that has no network
 * and none of the host. The program it runs is a client (.pi/guest/pitch);
 * this is the other end: one unix socket per workspace, listening in the
 * studio's process, running each request through the same dispatcher a
 * developer's `bin/pitch` uses.
 *
 * The workspace is decided HERE, when the socket is created, and is what the
 * sandbox is bound to. Nothing the client sends can point a command at
 * another project: it sends argv and gets text and an exit status back.
 *
 * Wire format, both ways, is one JSON object per line. In: `{argv}`. Out:
 * `{out}` frames as text arrives, then `{exit}`.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run } from './run.ts'

export interface PitchSocket {
  /** The socket file, at its real path (the seatbelt matches real paths). */
  path: string
  close: () => Promise<void>
}

const sockets = new Map<string, Promise<PitchSocket>>()

/**
 * A unix socket path has about a hundred characters to live in, and a
 * workspace path can spend most of that on its own — so the name is a hash
 * of the workspace, in the host's temp directory.
 */
export function socketPathFor(workspace: string, base = tmpdir()): string {
  const key = createHash('sha256').update(path.resolve(workspace)).digest('hex').slice(0, 16)
  return path.join(base, `pitch-${key}`, 'sock')
}

function listen(workspace: string): Promise<PitchSocket> {
  const file = socketPathFor(workspace, realpathSync(tmpdir()))
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  rmSync(file, { force: true })

  const server: Server = createServer(conn => {
    let head = ''
    let started = false
    conn.setEncoding('utf8')
    conn.on('error', () => {})
    conn.on('data', async (chunk: string) => {
      if (started) return
      head += chunk
      const nl = head.indexOf('\n')
      if (nl === -1) return
      started = true
      let argv: string[] = []
      try {
        const req = JSON.parse(head.slice(0, nl))
        argv = Array.isArray(req?.argv) ? req.argv.map(String) : []
      } catch {
        conn.end(`${JSON.stringify({ err: 'pitch: bad request\n', exit: 2 })}\n`)
        return
      }
      const result = await run(argv, { cwd: workspace })
      const text = result.text.endsWith('\n') ? result.text : `${result.text}\n`
      conn.write(`${JSON.stringify({ out: text })}\n`)
      conn.end(`${JSON.stringify({ exit: result.ok ? 0 : 1 })}\n`)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(file, () => {
      server.off('error', reject)
      resolve({
        path: file,
        close: () =>
          new Promise<void>(done => {
            server.close(() => {
              rmSync(path.dirname(file), { recursive: true, force: true })
              done()
            })
          }),
      })
    })
  })
}

/** The socket for a workspace, started on first use and kept for the process. */
export function pitchSocket(workspace: string): Promise<PitchSocket> {
  const key = path.resolve(workspace)
  let pending = sockets.get(key)
  if (!pending) {
    pending = listen(key).catch(err => {
      sockets.delete(key)
      throw err
    })
    sockets.set(key, pending)
  }
  return pending
}

/** Stop listening for a workspace — when its session is closed. */
export async function closePitchSocket(workspace: string): Promise<void> {
  const key = path.resolve(workspace)
  const pending = sockets.get(key)
  if (!pending) return
  sockets.delete(key)
  await (await pending).close().catch(() => {})
}
