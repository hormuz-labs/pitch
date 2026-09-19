import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: 'admin',
  projectFindUnique: vi.fn(),
  userProfileFindUnique: vi.fn(),
  userProfileFindMany: vi.fn(),
  creditTxFindMany: vi.fn(),
  creditTxAggregate: vi.fn(),
  subscriptionFindMany: vi.fn(),
  topUpFindMany: vi.fn(),
  projectFindMany: vi.fn(),
  affiliateFindUnique: vi.fn(),
  renderJobFindMany: vi.fn(),
  getCreditBalance: vi.fn(),
  getEntries: vi.fn(),
  busyProjects: vi.fn(),
}))

vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'admin-id' }))
vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: {
      findUnique: mocks.userProfileFindUnique,
      findMany: mocks.userProfileFindMany,
    },
    project: {
      findUnique: mocks.projectFindUnique,
      findMany: mocks.projectFindMany,
    },
    creditTransaction: {
      findMany: mocks.creditTxFindMany,
      aggregate: mocks.creditTxAggregate,
    },
    subscription: {
      findMany: mocks.subscriptionFindMany,
    },
    topUpPurchase: {
      findMany: mocks.topUpFindMany,
    },
    affiliate: {
      findUnique: mocks.affiliateFindUnique,
    },
    renderJob: {
      findMany: mocks.renderJobFindMany,
    },
  },
  getCreditBalance: mocks.getCreditBalance,
}))
vi.mock('../apps/api/src/projects/service.js', () => ({
  busyProjects: mocks.busyProjects,
  getEntries: mocks.getEntries,
  getRow: vi.fn(),
  deleteProject: vi.fn(),
  failProject: vi.fn(),
}))
vi.mock('../apps/api/src/studio/session.js', () => ({}))

import { router } from '../apps/api/src/routes/admin.js'

const app = express().use(express.json()).use('/admin', router)

beforeEach(() => {
  mocks.role = 'admin'
  mocks.userProfileFindUnique.mockImplementation(async ({ where }: any) => {
    if (where.id === 'admin-id') return { id: 'admin-id', role: mocks.role }
    if (where.id === 'user-1') {
      return {
        id: 'user-1',
        email: 'user1@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        role: 'user',
        gptEnabled: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        onboardingSurvey: {
          creationGoal: 'Product demo',
          role: 'Founder',
          teamSize: '1-5',
          monthlyVolume: '2-5',
          discoverySource: 'Twitter',
        },
      }
    }
    return null
  })
  mocks.userProfileFindMany.mockResolvedValue([
    { id: 'user-1', email: 'user1@example.com', firstName: 'Alice', lastName: 'Smith' },
  ])
  mocks.creditTxFindMany.mockResolvedValue([])
  mocks.creditTxAggregate.mockResolvedValue({ _sum: { delta: 150 } })
  mocks.subscriptionFindMany.mockResolvedValue([
    { id: 'sub-1', userId: 'user-1', planKey: 'pro', status: 'active' },
  ])
  mocks.topUpFindMany.mockResolvedValue([])
  mocks.projectFindMany.mockResolvedValue([])
  mocks.affiliateFindUnique.mockResolvedValue(null)
  mocks.renderJobFindMany.mockResolvedValue([])
  mocks.getCreditBalance.mockResolvedValue(42)
  mocks.getEntries.mockResolvedValue({
    entries: [
      { id: 'e1', role: 'user', text: 'Prompt turn 2: make voice faster', at: 1700000010000 },
      { id: 'e2', role: 'assistant', text: 'Done, updated pace', at: 1700000020000 },
    ],
    busy: false,
    activeModel: 'anthropic/claude-3-7-sonnet',
  })
  mocks.busyProjects.mockResolvedValue(new Set())
})

describe('admin details endpoints', () => {
  describe('GET /admin/projects/:id', () => {
    it('returns detailed project information including prompts, video link, and render state', async () => {
      mocks.projectFindUnique.mockResolvedValue({
        id: 'proj-1',
        userId: 'user-1',
        flow: 'launch-video',
        name: 'test-project',
        title: 'Pitch Launch Film',
        prompt: 'Create a high-energy product launch video',
        options: '{"model":"claude-3-7-sonnet","duration":30}',
        outputs: JSON.stringify([
          {
            kind: 'video',
            url: 'https://cdn.trypitch.co/renders/proj-1.mp4',
            label: '1080p Final',
          },
        ]),
        thumbnailUrl: 'https://cdn.trypitch.co/thumbs/proj-1.jpg',
        creditsCharged: 12,
        usageUsd: 0.35,
        lastError: null,
        lastActivityAt: new Date('2026-02-01T10:05:00Z'),
        createdAt: new Date('2026-02-01T10:00:00Z'),
        updatedAt: new Date('2026-02-01T10:05:00Z'),
      })

      mocks.renderJobFindMany.mockResolvedValue([
        {
          id: 'rj-1',
          action: 'motion_render',
          status: 'completed',
          stage: 'encoding',
          progress: 100,
          params: '{}',
          result: '{"duration":30}',
          attempts: 1,
          createdAt: new Date('2026-02-01T10:01:00Z'),
        },
      ])

      const res = await request(app).get('/admin/projects/proj-1')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('proj-1')
      expect(res.body.title).toBe('Pitch Launch Film')
      expect(res.body.finalVideoUrl).toBe('https://cdn.trypitch.co/renders/proj-1.mp4')
      expect(res.body.userPrompts).toHaveLength(2)
      expect(res.body.userPrompts[0].text).toBe('Create a high-energy product launch video')
      expect(res.body.userPrompts[1].text).toBe('Prompt turn 2: make voice faster')
      expect(res.body.activeModel).toBe('anthropic/claude-3-7-sonnet')
      expect(res.body.renderJobs).toHaveLength(1)
      expect(res.body.renderJobs[0].action).toBe('motion_render')
    })

    it('returns 404 for a missing project', async () => {
      mocks.projectFindUnique.mockResolvedValue(null)
      const res = await request(app).get('/admin/projects/missing-proj')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /admin/users/:id', () => {
    it('returns full user details including financials, credits, survey, and projects', async () => {
      mocks.projectFindMany.mockResolvedValue([
        {
          id: 'proj-1',
          userId: 'user-1',
          flow: 'launch-video',
          name: 'p1',
          title: 'Launch Film',
          prompt: 'Make a video',
          options: '{}',
          outputs: '[]',
          thumbnailUrl: null,
          creditsCharged: 5,
          lastActivityAt: new Date('2026-02-01'),
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
        },
      ])

      const res = await request(app).get('/admin/users/user-1')
      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe('user-1')
      expect(res.body.user.email).toBe('user1@example.com')
      expect(res.body.user.onboardingSurvey.creationGoal).toBe('Product demo')
      expect(res.body.credits.remaining).toBe(42)
      expect(res.body.subscription.planKey).toBe('pro')
      expect(res.body.projects).toHaveLength(1)
      expect(res.body.projects[0].title).toBe('Launch Film')
    })

    it('returns 404 for a missing user', async () => {
      const res = await request(app).get('/admin/users/missing-user')
      expect(res.status).toBe(404)
    })

    it('denies access if requester is not admin', async () => {
      mocks.role = 'user'
      const res = await request(app).get('/admin/users/user-1')
      expect(res.status).toBe(403)
    })
  })
})
