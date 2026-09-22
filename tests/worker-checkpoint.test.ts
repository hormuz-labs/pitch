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
vi.mock('@saas/storage', () => ({
  privateBucket: () => ({
    async put(key: string, body: any) {
      if (Buffer.isBuffer(body)) {
        objects.set(key, body)
        return
      }
      const chunks: Buffer[] = []
      for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
      objects.set(key, Buffer.concat(chunks))
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
  await rm(ws.dir, { recursive: true, force: true })
  await rm(historyDir(ws.dir), { recursive: true, force: true })
})

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
