/**
 * The worker host trusts the lease and nothing else. A project whose row
 * names another worker (or this worker at an older epoch) is refused and
 * dropped; a legacy workspace from before checkpoints is adopted; a
 * directory left behind by another project under the same name is replaced.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'studio-host-'))
process.env.PROJECTS_DIR = path.join(root, 'projects')
process.env.PI_AGENT_DIR = path.join(root, 'agent')
process.env.STUDIO_WORKER_ID = 'w1'
process.env.STUDIO_WORKSPACE_BUCKET = ''

const rows = new Map<string, any>()
const updates: any[] = []
vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async (args: any) => {
        updates.push(args)
        return { count: 1 }
      }),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
    studioWorker: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
  getCreditBalance: vi.fn(),
  deductCredit: vi.fn(),
  refundProjectUsage: vi.fn(),
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  sendDiscordMessage: vi.fn(),
}))
vi.mock('../apps/api/src/worker/registry.js', () => ({
  currentEpoch: () => 3,
  setDraining: vi.fn(),
}))
const describeCalls: string[] = []
vi.mock('../apps/api/src/flows/index.js', () => ({
  getAgent: () => ({
    describe: async (ws: { dir: string }) => {
      describeCalls.push(ws.dir)
      return { preview: null, outputs: [] }
    },
    prepare: vi.fn(),
    hasResult: vi.fn(),
  }),
}))
const busy = new Set<string>()
vi.mock('../apps/api/src/studio/session.js', () => ({
  AGENT_DIR: path.join(root, 'agent'),
  peekSession: (id: string) => (busy.has(id) ? { busy: true } : undefined),
  onSessionBusy: vi.fn(),
  closeSession: vi.fn(async () => {}),
  closeStudio: vi.fn(async () => {}),
  stopSession: vi.fn(async () => false),
  listStudioModels: vi.fn(async () => []),
}))

const host = await import('../apps/api/src/worker/host.js')
const { readMarker } = await import('../apps/api/src/worker/checkpoint.js')
const { workspaceFor } = await import('../apps/api/src/studio/paths.js')

function row(id: string, over: Record<string, unknown> = {}) {
  const r = {
    id,
    userId: 'user_1',
    flow: 'studio',
    name: id,
    title: id,
    prompt: '',
    options: '{}',
    sessionFile: null,
    creditsCharged: 0,
    outputs: '[]',
    thumbnailUrl: null,
    lastError: null,
    isPublic: false,
    shareSlug: null,
    shareViews: 0,
    source: 'app',
    workerId: 'w1',
    workerEpoch: 3,
    lastWorkerId: null,
    workspaceVersion: 0,
    artifactKind: null,
    busyAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
  rows.set(id, r)
  return r
}

beforeEach(async () => {
  rows.clear()
  busy.clear()
  updates.length = 0
  describeCalls.length = 0
  await rm(path.join(root, 'projects'), { recursive: true, force: true })
  await mkdir(path.join(root, 'projects'), { recursive: true })
})

describe('worker host', () => {
  it('refuses a project leased to someone else', async () => {
    row('other', { workerId: 'w2' })
    await expect(host.describe('other')).rejects.toMatchObject({ code: 'NOT_OWNER', status: 409 })
    row('stale', { workerEpoch: 2 })
    await expect(host.describe('stale')).rejects.toMatchObject({ code: 'NOT_OWNER' })
    expect(host.holds('other')).toBe(false)
  })

  it('adopts a workspace from before checkpoints and marks it', async () => {
    const ws = workspaceFor('studio', 'user_1', 'legacy')
    await mkdir(ws.dir, { recursive: true })
    await writeFile(path.join(ws.dir, 'deck.html'), '<div class="slide"/>')
    row('legacy')
    await host.describe('legacy')
    expect(host.holds('legacy')).toBe(true)
    expect(await readFile(path.join(ws.dir, 'deck.html'), 'utf8')).toContain('slide')
    expect(await readMarker(ws.dir)).toEqual({ projectId: 'legacy', version: 0 })
    expect(describeCalls).toEqual([ws.dir])
  })

  it("replaces another project's leftovers under a reused name", async () => {
    const ws = workspaceFor('studio', 'user_1', 'film')
    await mkdir(ws.dir, { recursive: true })
    await writeFile(path.join(ws.dir, 'shots.js'), 'old')
    await writeFile(
      path.join(ws.dir, '.studio-checkpoint'),
      JSON.stringify({ projectId: 'deleted', version: 4 }),
    )
    row('film')
    await host.describe('film')
    expect(existsSync(path.join(ws.dir, 'shots.js'))).toBe(false)
    expect(await readMarker(ws.dir)).toEqual({ projectId: 'film', version: 0 })
  })

  it('drops a held project once the lease moves on', async () => {
    row('moving')
    await host.describe('moving')
    expect(host.holds('moving')).toBe(true)
    row('moving', { workerId: 'w2', workerEpoch: 1 })
    await expect(host.busy('moving')).rejects.toMatchObject({ code: 'NOT_OWNER' })
    expect(host.holds('moving')).toBe(false)
  })

  it('drains gently: idle projects go at once, a running turn is waited for', async () => {
    row('idle')
    row('running')
    await host.describe('idle')
    await host.describe('running')
    busy.add('running')
    const done = host.drain(5000)
    await new Promise(r => setTimeout(r, 50))
    expect(host.holds('idle')).toBe(false)
    expect(host.holds('running')).toBe(true)
    busy.delete('running')
    await done
    expect(host.holds('running')).toBe(false)
    // Both gave their lease back (earlier tests' leftovers go too; not our concern here).
    const released = updates.filter(u => u.data.workerId === null).map(u => u.where.id)
    expect(released).toEqual(expect.arrayContaining(['idle', 'running']))
  })

  it('drains hard when the window closes with a turn still running', async () => {
    row('stuck')
    await host.describe('stuck')
    busy.add('stuck')
    await host.drain(100)
    expect(host.holds('stuck')).toBe(false)
  })

  it('answers hello first on subscribe and counts its audience', async () => {
    row('live')
    const got: any[] = []
    const off = await host.subscribe('live', ev => got.push(ev))
    expect(got).toEqual([{ type: 'hello', busy: false }])
    expect(host.emit('live', { type: 'status', busy: true })).toBe(true)
    expect(got[1]).toEqual({ type: 'status', busy: true })
    off()
    expect(host.emit('nobody', { type: 'status', busy: true })).toBe(false)
  })
})
