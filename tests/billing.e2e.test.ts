/**
 * Billing, end to end: the real worker host (`prompt`, the credit hold, the
 * host-action guard, the live credit check, turn billing), the real meters in
 * host-actions, the real usage math, the real video_generate action and the
 * real credit ledger in packages/db — run against an in-memory database and a
 * scripted model session. Each case is one row of the matrix in
 * docs/pitch-credit-pricing.pdf ("Cases tested").
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const root = await mkdtemp(path.join(tmpdir(), 'billing-e2e-'))
process.env.PROJECTS_DIR = path.join(root, 'projects')
process.env.PI_AGENT_DIR = path.join(root, 'agent')
process.env.STUDIO_WORKER_ID = 'w1'
process.env.STUDIO_WORKSPACE_BUCKET = ''
process.env.GEMINI_API_KEY = 'test-key'
delete process.env.STUDIO_PLATFORM_MARGIN
delete process.env.STUDIO_MODEL_CREDIT_MULTIPLIERS
delete process.env.OMNI_USD_PER_SECOND

// ── In-memory database behind the real packages/db code ────────────────────
const store = vi.hoisted(() => {
  const s = {
    ledger: [] as any[],
    holds: [] as any[],
    projects: new Map<string, any>(),
    seq: 0,
  }
  const matches = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([key, want]: [string, any]) => {
      if (want && typeof want === 'object' && !(want instanceof Date)) {
        if ('not' in want) return row[key] !== want.not
        if ('in' in want) return want.in.includes(row[key])
        return true // date ranges: every test row is "today"
      }
      return row[key] === want
    })
  const client: any = {
    creditTransaction: {
      aggregate: async ({ where }: any) => ({
        _sum: { delta: s.ledger.filter(r => matches(r, where)).reduce((a, r) => a + r.delta, 0) },
      }),
      create: async ({ data }: any) => {
        if (data.idempotencyKey && s.ledger.some(r => r.idempotencyKey === data.idempotencyKey))
          throw Object.assign(new Error('duplicate'), { code: 'P2002' })
        const row = { id: `tx_${++s.seq}`, channel: 'product', createdAt: new Date(), ...data }
        s.ledger.push(row)
        return row
      },
      findUnique: async ({ where }: any) => s.ledger.find(r => matches(r, where)) ?? null,
      findMany: async ({ where }: any) => s.ledger.filter(r => matches(r, where)),
    },
    creditReservation: {
      findUnique: async ({ where }: any) => {
        const row = s.holds.find(r => matches(r, where))
        return row ? { ...row } : null
      },
      create: async ({ data }: any) => {
        const row = { id: `hold_${++s.seq}`, status: 'pending', settledCredits: null, ...data }
        s.holds.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = s.holds.find(r => matches(r, where))
        Object.assign(row, data)
        return { ...row }
      },
      updateMany: async ({ where, data }: any) => {
        const rows = s.holds.filter(r => matches(r, where))
        for (const row of rows) Object.assign(row, data)
        return { count: rows.length }
      },
      aggregate: async ({ where }: any) => ({
        _sum: {
          credits: s.holds.filter(r => matches(r, where)).reduce((a, r) => a + r.credits, 0),
        },
      }),
    },
    project: {
      findUnique: async ({ where }: any) => {
        const row = s.projects.get(where.id)
        return row ? { ...row } : null
      },
      findFirst: async ({ where }: any) => {
        for (const row of s.projects.values()) if (matches(row, where)) return { ...row }
        return null
      },
      update: async ({ where, data }: any) => {
        const row = s.projects.get(where.id)
        Object.assign(row, data)
        return { ...row }
      },
      updateMany: async ({ where, data }: any) => {
        const row = s.projects.get(where.id)
        if (row) Object.assign(row, data)
        return { count: row ? 1 : 0 }
      },
      count: async () => 0,
    },
    studioWorker: { updateMany: async () => ({ count: 1 }) },
    userProfile: { findUnique: async () => null },
    $queryRaw: async () => [],
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(client) : Promise.all(arg)),
  }
  return { s, client }
})

vi.mock('@prisma/client', () => ({
  PrismaClient: function PrismaClient() {
    return store.client
  },
  Prisma: {},
}))
vi.mock('@zenstackhq/runtime', () => ({ enhance: (p: any) => p }))
vi.mock('dotenv', () => ({ config: () => {}, default: { config: () => {} } }))
// The host imports '@saas/db'; point it at the real source, not a stale build.
vi.mock('@saas/db', async () => await import('../packages/db/src/index.js'))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  sendDiscordMessage: vi.fn(),
  updateVideoStoryboard: vi.fn(),
}))
vi.mock('../apps/api/src/worker/registry.js', () => ({
  currentEpoch: () => 3,
  setDraining: vi.fn(),
}))
vi.mock('../apps/api/src/flows/index.js', () => ({
  getAgent: () => ({
    describe: async () => ({ preview: null, outputs: [] }),
    prepare: vi.fn(async () => {}),
    context: vi.fn(async () => ''),
    hasResult: vi.fn(async () => false),
  }),
}))

// A generated clip is 6 seconds long according to ffprobe.
vi.mock('../apps/api/src/render/media.js', () => ({
  execFileAsync: vi.fn(async () => ({
    stdout: JSON.stringify({ streams: [{ width: 1280, height: 720 }], format: { duration: '6' } }),
  })),
}))

// ── The model session, scripted by each test ───────────────────────────────
const session = vi.hoisted(() => ({
  turn: 0,
  liveModelUsd: 0,
  stopped: [] as string[],
  /** Turns started and not yet finished, closed after each case. */
  open: [] as { id: string; turn: number }[],
}))
/** The runtime catalog's token prices ($ per million tokens in / out). */
const PRICES: Record<string, { input: number; output: number }> = {
  'google/gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'azure-apim/gpt-5.6-sol': { input: 4, output: 20 },
  'azure-apim/gpt-6-astra': { input: 10, output: 50 },
}
const MODELS = [
  { spec: 'google/gemini-3.8-flash', label: 'Flash', creditMultiplier: 1 },
  { spec: 'azure-apim/gpt-5.6-sol', label: 'Sol', creditMultiplier: 1 },
  { spec: 'azure-apim/gpt-6-astra', label: 'Astra', creditMultiplier: 2 },
]
vi.mock('../apps/api/src/studio/session.js', () => ({
  AGENT_DIR: '/tmp',
  activeTurnUsesProvidedSkill: () => false,
  closeSession: vi.fn(async () => {}),
  closeStudio: vi.fn(async () => {}),
  getSessionEntries: vi.fn(async () => []),
  listStudioModels: vi.fn(async () =>
    MODELS.map(m => ({ ...m, estimatedCredits: 0, harnessCredits: 0 })),
  ),
  onSessionBusy: vi.fn(),
  peekModelCost: () => session.liveModelUsd,
  peekSession: () => undefined,
  promptSession: vi.fn(async (opts: { projectId: string }) => {
    const turn = ++session.turn
    session.open.push({ id: opts.projectId, turn })
    return { delivery: 'started', turn, entryId: 'e' }
  }),
  resolveAskAnswer: () => null,
  rollbackSession: vi.fn(),
  steerQueuedPrompt: vi.fn(),
  studioModelPrice: (spec: string) => PRICES[spec],
  stopSession: vi.fn(async (id: string) => {
    session.stopped.push(id)
    return true
  }),
}))

const host = await import('../apps/api/src/worker/host.js')
await import('../apps/api/src/pipelines/video-gen.js')
const { emitProjectEvent, onProjectEvent } = await import('../apps/api/src/studio/events.js')
const { invokeHostAction, takeComputeSeconds, takeProviderUsd } = await import(
  '../apps/api/src/studio/host-actions.js'
)
const { workspaceFor } = await import('../apps/api/src/studio/paths.js')
const { CREDIT_LIMIT_MESSAGE } = await import('../apps/api/src/projects/usage.js')

// ── Helpers ────────────────────────────────────────────────────────────────
const USER = 'user_1'
const realFetch = globalThis.fetch

function grant(credits: number) {
  store.s.ledger.push({
    id: `tx_${++store.s.seq}`,
    userId: USER,
    delta: credits,
    type: 'purchase',
    channel: 'product',
  })
}

const balance = () =>
  store.s.ledger
    .filter(r => r.userId === USER && r.channel !== 'discord')
    .reduce((a, r) => a + r.delta, 0)
const held = () =>
  store.s.holds
    .filter(h => h.userId === USER && h.status === 'pending')
    .reduce((a, h) => a + h.credits, 0)
const holdOf = (id: string) => store.s.holds.find(h => h.projectId === id)
const project = (id: string) => store.s.projects.get(id)

function makeProject(id: string, options: Record<string, unknown>) {
  store.s.projects.set(id, {
    id,
    userId: USER,
    flow: 'studio',
    name: id,
    title: id,
    prompt: '',
    options: JSON.stringify(options),
    sessionFile: null,
    usageUsd: 0,
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
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return workspaceFor('studio', USER, id)
}

const film = (model: string, durationSeconds = 60, videoType = 'cinematic') => ({
  model,
  durationSeconds,
  videoType,
})

/** The agent used a tool this turn (which is what makes the hold count). */
const usesATool = (id: string) => emitProjectEvent(id, { type: 'tool', name: 'write' } as any)

/** The turn ends having spent `modelUsd` on tokens; waits for billing to land. */
async function finishTurn(id: string, turn: number, modelUsd: number) {
  const credited = new Promise<void>(resolve => {
    const off = onProjectEvent(id, (ev: any) => {
      if (ev.type === 'credit_balance' && ev.pending === false) {
        off()
        resolve()
      }
    })
  })
  session.open = session.open.filter(t => !(t.id === id && t.turn === turn))
  emitProjectEvent(id, { type: 'idle', turn, cost: modelUsd } as any)
  await credited
}

function omniReturnsAClip() {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 'v1_clip',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'video', data: Buffer.from('mp4').toString('base64') }],
            },
          ],
        }),
      ),
  ) as any
}

const exhausted: string[] = []
let offExhausted: (() => void)[] = []
function watchExhausted(id: string) {
  offExhausted.push(
    onProjectEvent(id, (ev: any) => {
      if (ev.type === 'credit_exhausted') exhausted.push(ev.message)
    }),
  )
}

beforeEach(async () => {
  store.s.ledger.length = 0
  store.s.holds.length = 0
  store.s.projects.clear()
  session.liveModelUsd = 0
  session.stopped.length = 0
  exhausted.length = 0
  await rm(process.env.PROJECTS_DIR!, { recursive: true, force: true })
  await mkdir(process.env.PROJECTS_DIR!, { recursive: true })
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

afterEach(async () => {
  // Close every turn a case left open, so no live check outlives its case.
  session.liveModelUsd = 0
  for (const t of [...session.open]) await finishTurn(t.id, t.turn, 0)
  expect(balance()).toBeGreaterThanOrEqual(0)
  globalThis.fetch = realFetch
  for (const off of offExhausted) off()
  offExhausted = []
  for (const id of store.s.projects.keys()) {
    const ws = workspaceFor('studio', USER, id)
    takeComputeSeconds(ws.internal)
    takeProviderUsd(ws.internal)
  }
})

// ── A. Starting a job ──────────────────────────────────────────────────────
describe('A. starting a job', () => {
  it('A1 holds the estimate when the balance covers it', async () => {
    grant(1000)
    makeProject('a1', film('azure-apim/gpt-5.6-sol'))
    await host.prompt('a1', 'make the film')
    // Sol's typical turn is 255 (its real token price); 60 s cinematic:
    // max(40, ceil(255 × 2 × 1.25)) = 638.
    expect(holdOf('a1')).toMatchObject({ status: 'pending', credits: 638 })
    expect(balance()).toBe(1000)
    expect(balance() - held()).toBe(362)
  })

  it('A2 starts on 231 credits by shrinking the hold to the balance (the reported case)', async () => {
    grant(231)
    makeProject('a2', film('azure-apim/gpt-5.6-sol'))
    await expect(host.prompt('a2', 'make the film')).resolves.toMatchObject({ delivery: 'started' })
    expect(holdOf('a2')).toMatchObject({ status: 'pending', credits: 231 })
  })

  it('A3 starts at exactly the 40-credit minimum', async () => {
    grant(40)
    makeProject('a3', film('azure-apim/gpt-6-astra'))
    await host.prompt('a3', 'make the film')
    expect(holdOf('a3')?.credits).toBe(40)
  })

  it('A4 refuses to start below 40 and touches nothing', async () => {
    grant(39)
    makeProject('a4', film('azure-apim/gpt-5.6-sol'))
    await expect(host.prompt('a4', 'make the film')).rejects.toMatchObject({ status: 402 })
    expect(store.s.holds).toHaveLength(0)
    expect(balance()).toBe(39)
  })

  it('A5 counts credits held by another running job as unavailable', async () => {
    grant(300)
    makeProject('a5-first', film('azure-apim/gpt-5.6-sol'))
    makeProject('a5-second', film('azure-apim/gpt-5.6-sol'))
    await host.prompt('a5-first', 'make the film')
    expect(holdOf('a5-first')?.credits).toBe(300)
    await expect(host.prompt('a5-second', 'make another')).rejects.toMatchObject({ status: 402 })
  })

  it('A6 does not place a second hold for a job already under way', async () => {
    grant(1000)
    makeProject('a6', film('azure-apim/gpt-5.6-sol'))
    await host.prompt('a6', 'make the film')
    await host.prompt('a6', 'and make it blue')
    expect(store.s.holds.filter(h => h.projectId === 'a6')).toHaveLength(1)
  })

  it('A7 holds on the first paid tool when the brief was not known up front', async () => {
    grant(60)
    const ws = makeProject('a7', { skill: 'launch-video', model: 'google/gemini-3.8-flash' })
    await host.prompt('a7', 'make a launch film')
    expect(store.s.holds).toHaveLength(0)
    omniReturnsAClip()
    await invokeHostAction(ws, 'video_generate', { prompt: 'sunrise', out: 'sunrise.mp4' })
    // Flash's launch-video estimate is 73; the balance is 60, so the hold is 60.
    expect(holdOf('a7')).toMatchObject({ status: 'pending', credits: 60 })
    await finishTurn('a7', session.turn, 0)
  })

  it('A8 refuses the first paid tool below 40, with a plain message', async () => {
    grant(20)
    const ws = makeProject('a8', { skill: 'launch-video', model: 'google/gemini-3.8-flash' })
    watchExhausted('a8')
    await host.prompt('a8', 'make a launch film')
    omniReturnsAClip()
    await expect(
      invokeHostAction(ws, 'video_generate', { prompt: 'sunrise', out: 'sunrise.mp4' }),
    ).rejects.toThrow('Insufficient credits')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(exhausted).toEqual(['You need more credits to start. Top up to keep going.'])
    expect(balance()).toBe(20)
    await finishTurn('a8', session.turn, 0)
  })
})

// ── A′. The Discord welcome account (750 free credits) ─────────────────────
describe('A′. a Discord welcome account', () => {
  const welcome = async () => {
    const { DISCORD_WELCOME_CREDITS } = await import('../packages/db/src/index.js')
    // The same ledger row grantDiscordWelcomeReward writes: regular credits.
    store.s.ledger.push({
      id: `tx_${++store.s.seq}`,
      userId: USER,
      delta: DISCORD_WELCOME_CREDITS,
      type: 'promo',
      channel: 'product',
    })
    return DISCORD_WELCOME_CREDITS
  }

  it('W1 starts a 60 s cinematic Sol film with its full 638-credit hold', async () => {
    expect(await welcome()).toBe(750)
    makeProject('w1', film('azure-apim/gpt-5.6-sol'))
    await expect(host.prompt('w1', 'make the film')).resolves.toMatchObject({ delivery: 'started' })
    expect(holdOf('w1')?.credits).toBe(638)
  })

  it('W2 starts on Astra, whose 2,888 hold shrinks to the 750 it has', async () => {
    await welcome()
    makeProject('w2', film('azure-apim/gpt-6-astra'))
    await host.prompt('w2', 'make the film')
    expect(holdOf('w2')?.credits).toBe(750)
  })

  it('W3 finishes one typical teaser (about 630 credits) and keeps the rest', async () => {
    await welcome()
    makeProject('w3', film('google/gemini-3.8-flash', 30, 'teaser'))
    const { turn } = await host.prompt('w3', 'make a teaser')
    usesATool('w3')
    await finishTurn('w3', turn, 1.26) // $1.26 × 1.25 = $1.575 → 630 credits
    expect(balance()).toBe(120)
  })

  it('W4 runs a bigger film to exactly zero, stops it, and refuses the next message', async () => {
    await welcome()
    makeProject('w4', film('google/gemini-3.8-flash'))
    watchExhausted('w4')
    const { turn } = await host.prompt('w4', 'make the film')
    usesATool('w4')
    session.liveModelUsd = 2 // 1,000 credits of work against 750
    await vi.waitFor(() => expect(session.stopped).toEqual(['w4']), { timeout: 3000 })
    await finishTurn('w4', turn, 2)
    expect(balance()).toBe(0)
    expect(exhausted).toEqual([CREDIT_LIMIT_MESSAGE])
    await expect(host.prompt('w4', 'keep going')).rejects.toMatchObject({ status: 402 })
  })
})

// ── B. During a job ────────────────────────────────────────────────────────
describe('B. during a job', () => {
  it('B1 charges a code-animated 60 s Sol film only for its tokens (no $14)', async () => {
    grant(1000)
    makeProject('b1', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('b1', 'make the film')
    usesATool('b1')
    await finishTurn('b1', turn, 0.4)
    // $0.40 × 1 × 1.25 = $0.50 → 200 credits. The old code charged ≈1,367 more.
    expect(holdOf('b1')).toMatchObject({ status: 'settled', settledCredits: 200 })
    expect(balance()).toBe(800)
    expect(held()).toBe(0)
  })

  it('B2 charges a real generated clip near cost, whichever model asked', async () => {
    grant(1000)
    const ws = makeProject('b2', film('google/gemini-3.8-flash', 30, 'teaser'))
    const { turn } = await host.prompt('b2', 'make a teaser')
    usesATool('b2')
    omniReturnsAClip()
    await invokeHostAction(ws, 'video_generate', { prompt: 'sunrise', out: 'sunrise.mp4' })
    await finishTurn('b2', turn, 0)
    // 6 s × $0.10 × (0.0025 ÷ 0.0128) × 1.25 = $0.1465 → 58 credits, plus
    // a few milliseconds of machine time.
    const charged = holdOf('b2')?.settledCredits
    expect(charged).toBeGreaterThanOrEqual(58)
    expect(charged).toBeLessThanOrEqual(59)
  })

  it('B3 records nothing for a clip the provider refused', async () => {
    grant(1000)
    const ws = makeProject('b3', film('google/gemini-3.8-flash', 30, 'teaser'))
    const { turn } = await host.prompt('b3', 'make a teaser')
    usesATool('b3')
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: 'safety' } }), { status: 400 }),
    ) as any
    await expect(
      invokeHostAction(ws, 'video_generate', { prompt: 'x', out: 'x.mp4' }),
    ).rejects.toThrow('refused')
    await finishTurn('b3', turn, 0)
    expect(holdOf('b3')?.settledCredits).toBe(0)
    expect(balance()).toBe(1000)
  })

  it('B4 lets a job run while its cost stays within the balance', async () => {
    grant(1000)
    makeProject('b4', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('b4', 'make the film')
    usesATool('b4')
    session.liveModelUsd = 1 // 500 credits so far, under the 1,000 available
    await new Promise(r => setTimeout(r, 1200))
    expect(session.stopped).toEqual([])
    await finishTurn('b4', turn, 1)
  })

  it('B5 stops the job when its cost passes the balance, with a plain message', async () => {
    grant(300)
    makeProject('b5', film('azure-apim/gpt-5.6-sol'))
    watchExhausted('b5')
    const { turn } = await host.prompt('b5', 'make the film')
    usesATool('b5')
    session.liveModelUsd = 1 // 500 credits so far, only 300 exist
    await vi.waitFor(() => expect(session.stopped).toEqual(['b5']), { timeout: 3000 })
    expect(exhausted).toEqual([CREDIT_LIMIT_MESSAGE])
    expect(exhausted[0]).not.toMatch(/\d|×|skill|accrued|rate/i)
    await finishTurn('b5', turn, 1)
  })

  it('B6 releases the hold of a turn that only asked a question', async () => {
    grant(1000)
    makeProject('b6', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('b6', 'what can you make?')
    await finishTurn('b6', turn, 0.02)
    expect(holdOf('b6')?.status).toBe('released')
    // The answer's tokens are still billed: $0.02 × 1.25 = 10 credits.
    expect(balance()).toBe(990)
  })
})

// ── C. Ending a job ────────────────────────────────────────────────────────
describe('C. ending a job', () => {
  it('C1 returns the unused part of the hold', async () => {
    grant(1000)
    makeProject('c1', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('c1', 'make the film')
    usesATool('c1')
    await finishTurn('c1', turn, 0.1)
    expect(holdOf('c1')?.settledCredits).toBe(50)
    expect(balance()).toBe(950)
    expect(held()).toBe(0)
  })

  it('C2 charges past the hold when the balance covers it', async () => {
    grant(1000)
    makeProject('c2', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('c2', 'make the film')
    usesATool('c2')
    await finishTurn('c2', turn, 1.6) // 800 credits against a 638 hold
    expect(holdOf('c2')?.settledCredits).toBe(800)
    expect(balance()).toBe(200)
  })

  it('C3 takes an overshoot to zero, writes off the rest, never goes negative', async () => {
    grant(300)
    makeProject('c3', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('c3', 'make the film')
    usesATool('c3')
    await finishTurn('c3', turn, 1) // 500 credits measured, 300 exist
    expect(holdOf('c3')?.settledCredits).toBe(300)
    expect(balance()).toBe(0)
    // The whole 500 is marked charged, so nothing is carried into the next turn.
    expect(project('c3').creditsCharged).toBe(500)
  })

  it('C4 settles a hold at zero when the turn cost nothing', async () => {
    grant(1000)
    makeProject('c4', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('c4', 'make the film')
    usesATool('c4')
    await finishTurn('c4', turn, 0)
    expect(holdOf('c4')).toMatchObject({ status: 'settled', settledCredits: 0 })
    expect(balance()).toBe(1000)
  })
})

// ── D. Follow-up turns ─────────────────────────────────────────────────────
describe('D. follow-up turns', () => {
  async function filmThatLeaves(id: string, left: number) {
    grant(left + 200)
    makeProject(id, film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt(id, 'make the film')
    usesATool(id)
    await finishTurn(id, turn, 0.4) // 200 credits
    expect(balance()).toBe(left)
  }

  it('D1 continues below 40 and charges down to zero', async () => {
    await filmThatLeaves('d1', 12)
    const { turn } = await host.prompt('d1', 'make the logo bigger')
    await finishTurn('d1', turn, 0.1) // 50 credits measured, 12 left
    expect(balance()).toBe(0)
    expect(project('d1').creditsCharged).toBe(250)
  })

  it('D2 refuses a new message at zero, so no step runs for free', async () => {
    await filmThatLeaves('d2', 0)
    const before = session.turn
    await expect(host.prompt('d2', 'one more change')).rejects.toMatchObject({ status: 402 })
    expect(session.turn).toBe(before)
  })

  it('D3 accepts a message while the job is still under way, even at zero available', async () => {
    grant(300)
    makeProject('d3', film('azure-apim/gpt-5.6-sol'))
    const { turn } = await host.prompt('d3', 'make the film')
    expect(balance() - held()).toBe(0)
    await expect(host.prompt('d3', 'also add captions')).resolves.toBeTruthy()
    usesATool('d3')
    await finishTurn('d3', turn, 0.1)
  })

  it('D4 never bills an earlier clip again on the next turn', async () => {
    grant(1000)
    const ws = makeProject('d4', film('google/gemini-3.8-flash', 30, 'teaser'))
    const first = await host.prompt('d4', 'make a teaser')
    usesATool('d4')
    omniReturnsAClip()
    await invokeHostAction(ws, 'video_generate', { prompt: 'sunrise', out: 'sunrise.mp4' })
    await finishTurn('d4', first.turn, 0)
    const afterClip = balance()

    const second = await host.prompt('d4', 'tighten the ending')
    await finishTurn('d4', second.turn, 0.01) // 5 credits
    const charged = afterClip - balance()
    expect(charged).toBeGreaterThanOrEqual(5)
    expect(charged).toBeLessThanOrEqual(6)
  })

  it('D5 adds small edits up instead of rounding each one', async () => {
    await filmThatLeaves('d5', 500)
    const charges: number[] = []
    for (let i = 0; i < 3; i++) {
      const before = balance()
      const { turn } = await host.prompt('d5', `tweak ${i}`)
      await finishTurn('d5', turn, 0.0008) // 0.4 credits each
      charges.push(before - balance())
    }
    expect(charges).toEqual([0, 0, 1])
  })
})

// ── E. What the price does not depend on ───────────────────────────────────
describe('E. independence', () => {
  it('E1 the selected duration does not change what a turn costs', async () => {
    grant(2000)
    makeProject('e1-short', film('azure-apim/gpt-5.6-sol', 15))
    makeProject('e1-long', film('azure-apim/gpt-5.6-sol', 120))
    for (const id of ['e1-short', 'e1-long']) {
      const { turn } = await host.prompt(id, 'make the film')
      usesATool(id)
      await finishTurn(id, turn, 0.2)
    }
    expect(holdOf('e1-short')?.settledCredits).toBe(100)
    expect(holdOf('e1-long')?.settledCredits).toBe(100)
  })

  it("E3 sizes the hold from the model's real token price", async () => {
    grant(10_000)
    makeProject('e3-flash', film('google/gemini-3.8-flash'))
    makeProject('e3-sol', film('azure-apim/gpt-5.6-sol'))
    makeProject('e3-astra', film('azure-apim/gpt-6-astra'))
    for (const id of ['e3-flash', 'e3-sol', 'e3-astra']) await host.prompt(id, 'make the film')
    // Typical turn 73 / 255 / 1,155, × (60 s ÷ 30 s) × 1.25 cinematic.
    expect(holdOf('e3-flash')?.credits).toBe(183)
    expect(holdOf('e3-sol')?.credits).toBe(638)
    expect(holdOf('e3-astra')?.credits).toBe(2888)
  })

  it('E2 the model changes only the token price', async () => {
    grant(2000)
    makeProject('e2-sol', film('azure-apim/gpt-5.6-sol'))
    makeProject('e2-astra', film('azure-apim/gpt-6-astra'))
    for (const id of ['e2-sol', 'e2-astra']) {
      const { turn } = await host.prompt(id, 'make the film')
      usesATool(id)
      await finishTurn(id, turn, 0.2)
    }
    // Sol 1×: $0.20 × 1.25 = 100; Astra 2×: $0.40 × 1.25 = 200. No per-length fee.
    expect(holdOf('e2-sol')?.settledCredits).toBe(100)
    expect(holdOf('e2-astra')?.settledCredits).toBe(200)
  })
})
