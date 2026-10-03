/**
 * A workspace checkpoint is what survives a node: the directory, its turn
 * history and the pi transcript, streamed to a private bucket and restored
 * by whichever worker takes the lease next. The bucket here is a Map.
 */
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'studio-checkpoint-'))
const projectsDir = path.join(root, 'projects')
const agentDir = path.join(root, 'agent')
process.env.PROJECTS_DIR = projectsDir
process.env.PI_AGENT_DIR = agentDir
process.env.STUDIO_WORKSPACE_BUCKET = 'test-workspaces'

const objects = new Map<string, Buffer>()
let stallUpload = false
let uploadAborted = false
let truncateUpload = false
/** The archive (`workspace.tar`, `history.tar`) refused the way an expired login is. */
let refuseUpload: string | null = null
vi.mock('@saas/storage', () => ({
  privateBucket: () => ({
    async put(
      key: string,
      body: any,
      _type?: string,
      _size?: number,
      options?: { signal?: AbortSignal },
    ) {
      if (Buffer.isBuffer(body)) {
        objects.set(key, body)
        return
      }
      if (refuseUpload && key.endsWith(`/${refuseUpload}`))
        throw Object.assign(new Error('invalid_grant'), {
          response: { data: { error: 'invalid_grant', error_description: 'reauth related error' } },
        })
      const chunks: Buffer[] = []
      for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
      const whole = Buffer.concat(chunks)
      objects.set(key, truncateUpload ? whole.subarray(0, 1000) : whole)
      if (stallUpload) {
        await new Promise((_, reject) => {
          const abort = () => {
            uploadAborted = true
            reject(options?.signal?.reason)
          }
          if (options?.signal?.aborted) abort()
          else options?.signal?.addEventListener('abort', abort, { once: true })
        })
      }
    },
    async get(key: string) {
      const b = objects.get(key)
      return b ? Readable.from([b]) : null
    },
    async head(key: string) {
      const b = objects.get(key)
      return b ? { size: b.length } : null
    },
    async remove(key: string) {
      objects.delete(key)
    },
    async list(prefix: string) {
      return [...objects.keys()].filter(k => k.startsWith(prefix))
    },
  }),
}))
vi.mock('@saas/db', () => ({ prisma: {} }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const checkpoint = await import('../apps/api/src/worker/checkpoint.js')
const { historyDir } = await import('../apps/api/src/studio/history.js')
const { workspaceFor } = await import('../apps/api/src/studio/paths.js')

const ws = workspaceFor('studio', 'user_1', 'film')
const projectId = 'proj_1'

beforeAll(async () => {
  await mkdir(projectsDir, { recursive: true })
  await mkdir(agentDir, { recursive: true })
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  objects.clear()
  stallUpload = false
  uploadAborted = false
  truncateUpload = false
  refuseUpload = null
  await rm(ws.dir, { recursive: true, force: true })
  await rm(historyDir(ws.dir), { recursive: true, force: true })
})

const historyRoot = () => path.dirname(historyDir(ws.dir))
async function uploadArchives(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const names = async (dir: string) =>
    (await readdir(dir).catch(() => [] as string[])).filter(f => f.includes('.upload-'))
  return [...(await names(projectsDir)), ...(await names(historyRoot()))].sort()
}

async function seed() {
  await mkdir(path.join(ws.dir, 'renders'), { recursive: true })
  await mkdir(path.join(ws.dir, '.thumbs'), { recursive: true })
  await writeFile(path.join(ws.dir, 'shots.js'), 'export default []')
  await writeFile(path.join(ws.dir, 'renders', 'launch-1080p.mp4'), Buffer.alloc(64 * 1024, 7))
  await writeFile(path.join(ws.dir, '.thumbs', 'html_0_50.jpg'), 'jpeg')
  await writeFile(path.join(ws.dir, '.thumbs', 'scratch.jpg'), 'cache')
  await symlink('/etc/passwd', path.join(ws.dir, 'sneaky'))
  await mkdir(historyDir(ws.dir), { recursive: true })
  await writeFile(path.join(historyDir(ws.dir), 'turns.json'), '{"version":1,"turns":{}}')
  const session = path.join(agentDir, 'sessions', 'abc.jsonl')
  await mkdir(path.dirname(session), { recursive: true })
  await writeFile(session, '{"type":"message"}\n')
  return session
}

describe('workspace checkpoints', () => {
  it('times out a stalled transfer, cancels it, and allows a clean retry', async () => {
    await seed()
    stallUpload = true
    const progress = vi.fn()
    const input = { projectId, ws, version: 1, sessionFile: null, artifactKind: null }
    await expect(
      checkpoint.uploadCheckpoint({ ...input, timeoutMs: 100, progress }),
    ).rejects.toThrow('checkpoint timed out')
    expect(uploadAborted).toBe(true)
    expect(progress).toHaveBeenCalledWith('checkpoint: uploading workspace.tar', 0)
    expect(objects.has('workspaces/proj_1/1/manifest.json')).toBe(false)
    stallUpload = false
    await checkpoint.uploadCheckpoint(input)
    expect(objects.has('workspaces/proj_1/1/manifest.json')).toBe(true)
  })

  it('does not publish a version whose archive did not all arrive', async () => {
    await seed()
    truncateUpload = true
    await expect(
      checkpoint.uploadCheckpoint({
        projectId,
        ws,
        version: 1,
        sessionFile: null,
        artifactKind: null,
      }),
    ).rejects.toThrow(/workspace.tar upload is incomplete: expected \d+ bytes, got 1000/)
    expect(objects.has('workspaces/proj_1/1/manifest.json')).toBe(false)
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(projectsDir)).filter(f => f.includes('.upload-'))).toEqual([])
  })

  it('removes its archive when the bucket refuses the login', async () => {
    for (const file of ['workspace.tar', 'history.tar']) {
      await seed()
      refuseUpload = file
      const failed = await checkpoint
        .uploadCheckpoint({ projectId, ws, version: 1, sessionFile: null, artifactKind: null })
        .catch(err => err)
      expect(failed).toBeInstanceOf(Error)
      expect(failed.message).toBe('invalid_grant')
      expect(checkpoint.storageCredentialsRejected(failed)).toBe(true)
      expect(objects.has('workspaces/proj_1/1/manifest.json')).toBe(false)
      expect(await uploadArchives()).toEqual([])
      await rm(ws.dir, { recursive: true, force: true })
      await rm(historyDir(ws.dir), { recursive: true, force: true })
    }
  })

  it('sweeps the archives a dead process left behind, never one still in flight', async () => {
    await seed()
    const leftovers = [
      path.join(projectsDir, `.${ws.internal}.workspace.tar.upload-mus99i9470bz`),
      path.join(historyRoot(), `.${ws.internal}.history.tar.upload-musox51r8ke4`),
    ]
    for (const file of leftovers) await writeFile(file, Buffer.alloc(2048))
    // A turn rollback stages beside the workspace too; that is not ours to sweep.
    const bystanders = ['restore', 'backup'].map(kind =>
      path.join(projectsDir, `.${ws.internal}.${kind}-0b7c2f7e-4c1d-4f6a-9d2e-8a1b3c4d5e6f`),
    )
    for (const dir of bystanders) await mkdir(dir, { recursive: true })

    stallUpload = true
    const controller = new AbortController()
    const progress = vi.fn()
    const pending = checkpoint
      .uploadCheckpoint({
        projectId,
        ws,
        version: 1,
        sessionFile: null,
        artifactKind: null,
        signal: controller.signal,
        progress,
      })
      .catch(err => err)
    await vi.waitFor(() =>
      expect(progress).toHaveBeenCalledWith('checkpoint: uploading workspace.tar', 0),
    )
    const inFlight = (await uploadArchives()).filter(
      f => !leftovers.some(l => path.basename(l) === f),
    )
    expect(inFlight).toHaveLength(1)

    expect(await checkpoint.sweepUploadArchives()).toBe(2)
    expect(await uploadArchives()).toEqual(inFlight)
    for (const file of bystanders) await expect(stat(file)).resolves.toBeTruthy()

    controller.abort(new Error('stop'))
    expect(await pending).toBeInstanceOf(Error)
    expect(await uploadArchives()).toEqual([])
    for (const dir of bystanders) await rm(dir, { recursive: true, force: true })
  })

  it('tells a refused login from any other storage failure', () => {
    const rejected = checkpoint.storageCredentialsRejected
    expect(rejected(new Error('invalid_grant'))).toBe(true)
    expect(rejected(Object.assign(new Error('expired'), { name: 'ExpiredToken' }))).toBe(true)
    expect(rejected(Object.assign(new Error('nope'), { status: 401 }))).toBe(true)
    expect(rejected(new Error('upload failed', { cause: new Error('invalid_rapt') }))).toBe(true)
    expect(rejected(new Error('Workspace checkpoint timed out after 300000ms'))).toBe(false)
    expect(rejected(new Error('checkpoint workspace.tar upload is incomplete'))).toBe(false)
    expect(rejected(null)).toBe(false)
  })

  it('does not upload or publish a cancelled checkpoint', async () => {
    await seed()
    const controller = new AbortController()
    controller.abort(new Error('user cancelled'))
    await expect(
      checkpoint.uploadCheckpoint({
        projectId,
        ws,
        version: 1,
        sessionFile: null,
        artifactKind: null,
        signal: controller.signal,
      }),
    ).rejects.toThrow('user cancelled')
    expect(objects.size).toBe(0)
  })

  it('consumes delayed transport padding after archive end markers without EPIPE', async () => {
    await seed()
    await checkpoint.uploadCheckpoint({
      projectId,
      ws,
      version: 1,
      sessionFile: null,
      artifactKind: null,
    })
    const archive = objects.get('workspaces/proj_1/1/workspace.tar')!
    let chunks = 0
    const body = Readable.from(
      (async function* () {
        yield archive
        // tar can finish the archive before the network delivers its final chunks.
        await new Promise(resolve => setTimeout(resolve, 30))
        for (let i = 0; i < 4; i++) {
          yield Buffer.alloc(64 * 1024)
          chunks++
        }
      })(),
    )
    const into = path.join(root, 'padded-restore')
    await checkpoint.tarExtract(into, body)
    expect(chunks).toBe(4)
    expect(await readFile(path.join(into, ws.internal, 'shots.js'), 'utf8')).toBe(
      'export default []',
    )
  })

  it('extracts a large archive whole every time, leaving no download behind', async () => {
    // Streamed into tar's stdin, about one in ten of these lost data under
    // Bun and failed "Unexpected EOF in archive" (run with `bunx --bun vitest`).
    await seed()
    for (let i = 0; i < 6; i++)
      await writeFile(
        path.join(ws.dir, 'renders', `clip-${i}.mp4`),
        Buffer.alloc(2 * 1024 * 1024, i),
      )
    await checkpoint.uploadCheckpoint({
      projectId,
      ws,
      version: 1,
      sessionFile: null,
      artifactKind: null,
    })
    const archive = objects.get('workspaces/proj_1/1/workspace.tar')!
    for (let n = 0; n < 15; n++) {
      const into = path.join(root, `large-restore-${n}`)
      const body = Readable.from(
        Array.from({ length: Math.ceil(archive.length / 65536) }, (_, i) =>
          archive.subarray(i * 65536, (i + 1) * 65536),
        ),
      )
      await checkpoint.tarExtract(into, body)
      expect((await stat(path.join(into, ws.internal, 'renders', 'clip-5.mp4'))).size).toBe(
        2 * 1024 * 1024,
      )
      await rm(into, { recursive: true, force: true })
    }
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(root)).filter(f => f.includes('.fetch-'))).toEqual([])
  }, 60_000)

  it('reports a download that breaks off and keeps no partial file', async () => {
    const body = Readable.from(
      (async function* () {
        yield Buffer.alloc(1024)
        throw new Error('connection reset')
      })(),
    )
    await expect(checkpoint.tarExtract(path.join(root, 'broken-restore'), body)).rejects.toThrow(
      /Checkpoint download failed: connection reset/,
    )
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(root)).filter(f => f.includes('.fetch-'))).toEqual([])
  })

  it('still rejects a corrupt archive rather than hiding extraction errors', async () => {
    await expect(
      checkpoint.tarExtract(
        path.join(root, 'corrupt-restore'),
        Readable.from([Buffer.from('not an archive')]),
      ),
    ).rejects.toThrow(/tar|archive|extraction/i)
  })

  it('round-trips the workspace, its history and the transcript, minus caches', async () => {
    const session = await seed()
    const manifest = await checkpoint.uploadCheckpoint({
      projectId,
      ws,
      version: 1,
      sessionFile: session,
      artifactKind: 'launch',
    })
    expect(manifest.session).toBe('sessions/abc.jsonl')
    expect([...objects.keys()].sort()).toEqual([
      'workspaces/proj_1/1/history.tar',
      'workspaces/proj_1/1/manifest.json',
      'workspaces/proj_1/1/session.jsonl',
      'workspaces/proj_1/1/workspace.tar',
      'workspaces/proj_1/cover.jpg',
    ])
    expect(objects.get('workspaces/proj_1/cover.jpg')?.toString()).toBe('jpeg')

    // Another node: nothing on disk, a different transcript path.
    await rm(ws.dir, { recursive: true, force: true })
    await rm(historyDir(ws.dir), { recursive: true, force: true })
    await rm(session, { force: true })
    const restored = await checkpoint.restoreCheckpoint(projectId, ws, 1)
    expect(restored.sessionFile).toBe(session)
    expect(await readFile(session, 'utf8')).toBe('{"type":"message"}\n')
    expect(await readFile(path.join(ws.dir, 'shots.js'), 'utf8')).toBe('export default []')
    expect((await stat(path.join(ws.dir, 'renders', 'launch-1080p.mp4'))).size).toBe(64 * 1024)
    expect(await readFile(path.join(historyDir(ws.dir), 'turns.json'), 'utf8')).toContain('turns')
    // Thumbnails are a cache and are rebuilt; a symlink comes back as a link, not its target.
    await expect(stat(path.join(ws.dir, '.thumbs'))).rejects.toThrow()
    const link = await import('node:fs/promises').then(fs => fs.lstat(path.join(ws.dir, 'sneaky')))
    expect(link.isSymbolicLink()).toBe(true)
    expect(await checkpoint.readMarker(ws.dir)).toEqual({ projectId, version: 1 })
  })

  it('keeps the previous version and drops older ones', async () => {
    await seed()
    for (const version of [1, 2, 3])
      await checkpoint.uploadCheckpoint({
        projectId,
        ws,
        version,
        sessionFile: null,
        artifactKind: null,
      })
    await checkpoint.pruneCheckpoints(projectId, 2)
    const versions = new Set(
      [...objects.keys()].map(k => k.match(/\/(\d+)\//)?.[1]).filter(Boolean),
    )
    expect([...versions].sort()).toEqual(['2', '3'])
    await checkpoint.deleteCheckpoints(projectId)
    expect(objects.size).toBe(0)
  })

  it('keeps an older version while a render job still references it', async () => {
    await seed()
    for (const version of [1, 2, 3, 4])
      await checkpoint.uploadCheckpoint({
        projectId,
        ws,
        version,
        sessionFile: null,
        artifactKind: null,
      })
    await checkpoint.pruneCheckpoints(projectId, 2, [1])
    const versions = new Set(
      [...objects.keys()].map(k => k.match(/\/(\d+)\//)?.[1]).filter(Boolean),
    )
    expect([...versions].sort()).toEqual(['1', '3', '4'])
  })

  it('leaves the local copy alone when the download fails', async () => {
    await seed()
    await writeFile(path.join(ws.dir, 'shots.js'), 'local truth')
    await expect(checkpoint.restoreCheckpoint(projectId, ws, 9)).rejects.toThrow(/manifest/)
    expect(await readFile(path.join(ws.dir, 'shots.js'), 'utf8')).toBe('local truth')
  })
})
