import { beforeEach, describe, expect, it, vi } from 'vitest'

// Resend's quota is small: a project's user is emailed for the first output of
// a kind only. Re-exports, other sizes and deck saves reach Discord alone.

const mocks = vi.hoisted(() => ({
  row: null as any,
  notifyProjectCompleted: vi.fn(async () => {}),
  notifyVideoRenderReady: vi.fn(async () => {}),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => mocks.row),
      update: vi.fn(async ({ data }: any) => (mocks.row = { ...mocks.row, ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../apps/api/src/studio/events.js', () => ({ publishProjectEvent: vi.fn() }))
vi.mock('../apps/api/src/lib/webhooks.js', () => ({ enqueueWebhookDeliveries: vi.fn() }))
vi.mock('../apps/api/src/projects/notifications.js', () => ({
  notifyProjectCompleted: mocks.notifyProjectCompleted,
  notifyVideoRenderReady: mocks.notifyVideoRenderReady,
}))

const { addOutput } = await import('../apps/api/src/projects/rows.js')

const now = new Date().toISOString()
const video = (res: string) => ({
  kind: 'video' as const,
  url: `https://x/${res}.mp4`,
  res,
  createdAt: now,
})
const pdf = { kind: 'pdf' as const, url: 'https://x/deck.pdf', createdAt: now }

describe('addOutput emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.row = {
      id: 'p1',
      userId: 'u1',
      flow: 'studio',
      name: 'p1',
      title: 'A film',
      prompt: '',
      options: '{}',
      outputs: '[]',
      thumbnailUrl: null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }
  })

  it('emails for the first video only, never as a second "completed" email', async () => {
    await addOutput('u1', 'p1', video('1080p'))
    await addOutput('u1', 'p1', video('1080p'))
    await addOutput('u1', 'p1', video('4k'))

    const ready = mocks.notifyVideoRenderReady.mock.calls.map((c: any[]) => c[2].email)
    expect(ready).toEqual([true, false, false])
    const completed = mocks.notifyProjectCompleted.mock.calls.map((c: any[]) => c[1].email)
    expect(completed).toEqual([false, false, false])
  })

  it('emails for the first deck PDF only', async () => {
    await addOutput('u1', 'p1', pdf)
    await addOutput('u1', 'p1', pdf)

    const completed = mocks.notifyProjectCompleted.mock.calls.map((c: any[]) => c[1].email)
    expect(completed).toEqual([true, false])
  })
})
