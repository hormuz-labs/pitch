import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  prompt: vi.fn(),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    project: { findMany: mocks.findMany, update: mocks.update },
    studioWorker: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  sendDiscordMessage: vi.fn(),
}))
vi.mock('../apps/api/src/worker/client.js', () => ({
  withOwner: vi.fn(async (_id: string, fn: (worker: unknown) => unknown) =>
    fn({ prompt: mocks.prompt }),
  ),
}))
vi.mock('../apps/api/src/worker/host.js', () => ({
  discardLocal: vi.fn(),
  followFirstTurn: vi.fn(),
}))
vi.mock('../apps/api/src/studio/session.js', () => ({ listStudioModels: vi.fn() }))

import { listProjects, type ProjectRow, promptProject } from '../apps/api/src/projects/service.js'

beforeEach(() => vi.clearAllMocks())

describe('project conversation recency', () => {
  it('requests projects in latest-activity order', async () => {
    mocks.findMany.mockResolvedValue([])

    await listProjects('user_1')

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
    })
  })

  it('advances activity only after a prompt is accepted', async () => {
    mocks.prompt.mockResolvedValue({ delivery: 'queued', turn: 2, entryId: 'entry_2' })
    mocks.update.mockResolvedValue({})

    await promptProject({ id: 'project_1' } as ProjectRow, 'Revise this')

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'project_1' },
      data: { lastActivityAt: expect.any(Date) },
    })
  })
})
