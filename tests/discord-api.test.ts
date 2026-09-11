import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: vi.fn() },
  },
  grantDiscordVideoReward: vi.fn(),
}))

vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../apps/api/src/projects/service.js', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  shareProject: vi.fn(),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    status = 402
    constructor(public balance: number) {
      super('Insufficient credits')
    }
  },
}))

import * as db from '@saas/db'
import * as projects from '../apps/api/src/projects/service.js'
import { router as discordRouter } from '../apps/api/src/routes/internal-discord.js'

const app = express()
app.use(express.json())
app.use('/internal/discord', discordRouter)

describe('Discord internal project API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DISCORD_SERVICE_TOKEN = 'service-secret'
    process.env.DISCORD_STUDIO_MODEL = 'google/gemini-3.8-flash'
  })

  it('rejects requests without the shared service credential', async () => {
    const response = await request(app)
      .post('/internal/discord/projects')
      .send({ discordUserId: '99887766', prompt: 'Make a launch video' })

    expect(response.status).toBe(401)
    expect(projects.createProject).not.toHaveBeenCalled()
  })

  it('does not create a Pitch user or project for an unlinked Discord account', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue(null)

    const response = await request(app)
      .post('/internal/discord/projects')
      .set('Authorization', 'Bearer service-secret')
      .send({ discordUserId: '99887766', prompt: 'Make a launch video' })

    expect(response.status).toBe(404)
    expect((db as any).grantDiscordVideoReward).not.toHaveBeenCalled()
    expect(projects.createProject).not.toHaveBeenCalled()
  })

  it('creates a Discord-attributed project for the linked Pitch user', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({ id: 'user_123' })
    vi.mocked((db as any).grantDiscordVideoReward).mockResolvedValue({
      granted: true,
      credits: 120,
      remaining: 2,
    })
    vi.mocked(projects.createProject).mockResolvedValue({
      id: 'project_123',
      userId: 'user_123',
      title: 'Launch video',
      status: 'working',
    } as any)

    const response = await request(app)
      .post('/internal/discord/projects')
      .set('Authorization', 'Bearer service-secret')
      .send({
        discordUserId: '99887766',
        kind: 'launch',
        prompt: 'Make a launch video for Pitch',
      })

    expect(response.status).toBe(202)
    expect(response.body.project).toMatchObject({ id: 'project_123', status: 'working' })
    expect(response.body.reward).toEqual({ granted: true, credits: 120, remaining: 2 })
    expect((db as any).grantDiscordVideoReward).toHaveBeenCalledWith('user_123', 120, {
      dailyLimit: 3,
    })
    expect(projects.createProject).toHaveBeenCalledWith('user_123', {
      prompt: expect.stringMatching(
        /cinematic launch film.*User request:.*Make a launch video for Pitch/s,
      ),
      source: 'discord',
      model: 'google/gemini-3.8-flash',
    })
  })

  it('refuses generation instead of falling back to the main Studio model', async () => {
    delete process.env.DISCORD_STUDIO_MODEL
    process.env.STUDIO_MODEL = 'google/gemini-3.1-pro-preview'

    const response = await request(app)
      .post('/internal/discord/projects')
      .set('Authorization', 'Bearer service-secret')
      .send({ discordUserId: '99887766', prompt: 'Make a launch video' })

    expect(response.status).toBe(503)
    expect(response.body.error).toMatch(/Discord model is not configured/)
    expect((db as any).grantDiscordVideoReward).not.toHaveBeenCalled()
    expect(projects.createProject).not.toHaveBeenCalled()
  })

  it('rejects the fourth Discord video in a UTC day before creating a project', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({ id: 'user_123' })
    vi.mocked((db as any).grantDiscordVideoReward).mockResolvedValue({
      granted: false,
      credits: 0,
      remaining: 0,
    })

    const response = await request(app)
      .post('/internal/discord/projects')
      .set('Authorization', 'Bearer service-secret')
      .send({ discordUserId: '99887766', prompt: 'Make one more video' })

    expect(response.status).toBe(429)
    expect(response.body.error).toMatch(/3 Discord videos per day/)
    expect(projects.createProject).not.toHaveBeenCalled()
  })

  it('creates the canonical short public share link for a completed project', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({ id: 'user_123' })
    vi.mocked(projects.shareProject).mockResolvedValue({
      id: 'project_123',
      userId: 'user_123',
      shareSlug: 'abc234defg',
      isPublic: true,
    } as any)

    const response = await request(app)
      .post('/internal/discord/projects/project_123/share')
      .set('Authorization', 'Bearer service-secret')
      .send({ discordUserId: '99887766' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ shareUrl: 'https://trypitch.co/d/abc234defg' })
    expect(projects.shareProject).toHaveBeenCalledWith('user_123', 'project_123')
  })

  it('returns derived project status only for its linked Discord owner', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({ id: 'user_123' })
    vi.mocked(projects.getProject).mockResolvedValue({
      id: 'project_123',
      userId: 'user_123',
      status: 'ready',
      outputs: [{ kind: 'video', url: 'https://cdn.example/video.mp4' }],
    } as any)

    const response = await request(app)
      .get('/internal/discord/projects/project_123?discordUserId=99887766')
      .set('Authorization', 'Bearer service-secret')

    expect(response.status).toBe(200)
    expect(response.body.project).toMatchObject({ id: 'project_123', status: 'ready' })
    expect(projects.getProject).toHaveBeenCalledWith('user_123', 'project_123')
  })
})
