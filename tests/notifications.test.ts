import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendDiscordMessage: vi.fn().mockResolvedValue(undefined),
  sendJobStartEmail: vi.fn().mockResolvedValue(undefined),
  sendJobCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendVideoRenderReadyEmail: vi.fn().mockResolvedValue(undefined),
  getClerkUserEmail: vi.fn().mockResolvedValue('user@example.com'),
  userProfileFindUnique: vi.fn().mockResolvedValue({
    id: 'user_123',
    email: 'user@example.com',
    firstName: 'Alex',
    emailNotifications: true,
  }),
}))

vi.mock('@saas/shared', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  sendDiscordMessage: mocks.sendDiscordMessage,
  DISCORD_COLORS: {
    INFO: 0x3b82f6,
    SUCCESS: 0x10b981,
    RENDER: 0x8b5cf6,
    WARNING: 0xf59e0b,
    ERROR: 0xef4444,
  },
}))

vi.mock('@saas/email', () => ({
  sendJobStartEmail: mocks.sendJobStartEmail,
  sendJobCompleteEmail: mocks.sendJobCompleteEmail,
  sendVideoRenderReadyEmail: mocks.sendVideoRenderReadyEmail,
  getClerkUserEmail: mocks.getClerkUserEmail,
}))

vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: {
      findUnique: mocks.userProfileFindUnique,
    },
  },
}))

import {
  _resetNotificationCacheForTest,
  notifyProjectCompleted,
  notifyProjectStarted,
  notifyVideoRenderReady,
} from '../apps/api/src/projects/notifications.js'
import type { ProjectRow } from '../apps/api/src/projects/rows.js'

function makeProjectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'proj_test_1',
    userId: 'user_123',
    flow: 'studio',
    name: 'test-project',
    title: 'Test Launch Film',
    prompt: 'Create a video about our platform',
    options: {},
    sessionFile: null,
    creditsCharged: 0,
    usageUsd: 0,
    outputs: [],
    thumbnailUrl: null,
    lastError: null,
    isPublic: false,
    shareSlug: null,
    shareViews: 0,
    source: 'app',
    workerId: null,
    workerEpoch: null,
    leasedAt: null,
    lastWorkerId: null,
    workspaceVersion: 0,
    workspaceCheckpointAt: null,
    artifactKind: null,
    busyAt: null,
    pinnedAt: null,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Project Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetNotificationCacheForTest()
    mocks.userProfileFindUnique.mockResolvedValue({
      id: 'user_123',
      email: 'user@example.com',
      firstName: 'Alex',
      emailNotifications: true,
    })
    mocks.getClerkUserEmail.mockResolvedValue('user@example.com')
  })

  describe('notifyProjectStarted', () => {
    it('sends Discord alert to admins and email to user on project start', async () => {
      const p = makeProjectRow()
      await notifyProjectStarted(p, { prompt: 'Make a killer demo' })

      // Admin Discord notification
      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      const discordCall = mocks.sendDiscordMessage.mock.calls[0][0]
      expect(discordCall.content).toContain('Project Started')
      expect(discordCall.content).toContain('Test Launch Film')
      expect(discordCall.content).toContain('/projects/proj_test_1')
      expect(discordCall.embeds[0].title).toBe('🎬 Project Started: Test Launch Film')
      expect(discordCall.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Project ID', value: '`proj_test_1`' }),
          expect.objectContaining({ name: 'Studio Link' }),
        ]),
      )

      // User email notification
      expect(mocks.sendJobStartEmail).toHaveBeenCalledTimes(1)
      expect(mocks.sendJobStartEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          firstName: 'Alex',
          jobId: 'proj_test_1',
          title: 'Test Launch Film',
          prompt: 'Make a killer demo',
          projectUrl: expect.stringContaining('/projects/proj_test_1'),
        }),
      )
    })

    it('does not send user email when emailNotifications is false, but still sends Discord alert', async () => {
      mocks.userProfileFindUnique.mockResolvedValue({
        id: 'user_123',
        email: 'user@example.com',
        firstName: 'Alex',
        emailNotifications: false,
      })

      const p = makeProjectRow()
      await notifyProjectStarted(p)

      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      expect(mocks.sendJobStartEmail).not.toHaveBeenCalled()
    })

    it('deduplicates started notifications for the same project', async () => {
      const p = makeProjectRow()
      await notifyProjectStarted(p)
      await notifyProjectStarted(p)

      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      expect(mocks.sendJobStartEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('notifyProjectCompleted', () => {
    it('sends Discord alert with final result link and user email on completion', async () => {
      const p = makeProjectRow({
        isPublic: true,
        shareSlug: 'demo123',
        outputs: [
          {
            kind: 'video',
            url: 'https://storage.trypitch.co/videos/demo.mp4',
            res: '1080p',
            label: 'Final Cut',
            createdAt: new Date().toISOString(),
          },
        ],
      })

      await notifyProjectCompleted(p)

      // Discord notification with result link
      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      const discordCall = mocks.sendDiscordMessage.mock.calls[0][0]
      expect(discordCall.content).toContain('Project Completed')
      expect(discordCall.content).toContain(
        '**Final Result:** <https://storage.trypitch.co/videos/demo.mp4>',
      )
      expect(discordCall.content).toContain('/projects/proj_test_1')
      expect(discordCall.content).toContain('/d/demo123')
      expect(discordCall.embeds[0].color).toBe(0x10b981) // SUCCESS green

      // User email notification
      expect(mocks.sendJobCompleteEmail).toHaveBeenCalledTimes(1)
      expect(mocks.sendJobCompleteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          firstName: 'Alex',
          jobId: 'proj_test_1',
          title: 'Test Launch Film',
          videoUrl: 'https://storage.trypitch.co/videos/demo.mp4',
        }),
      )
    })

    it('deduplicates completed notifications for the same project', async () => {
      const p = makeProjectRow()
      await notifyProjectCompleted(p)
      await notifyProjectCompleted(p)

      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      expect(mocks.sendJobCompleteEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('notifyVideoRenderReady', () => {
    it('sends video render ready email and Discord alert with MP4 download URL', async () => {
      const p = makeProjectRow()
      const videoUrl = 'https://storage.trypitch.co/videos/render-1080p.mp4'

      await notifyVideoRenderReady(p, videoUrl, { resolution: '1080p' })

      // Discord alert
      expect(mocks.sendDiscordMessage).toHaveBeenCalledTimes(1)
      const discordCall = mocks.sendDiscordMessage.mock.calls[0][0]
      expect(discordCall.content).toContain('Video Render Ready to Export')
      expect(discordCall.content).toContain(videoUrl)
      expect(discordCall.embeds[0].color).toBe(0x8b5cf6) // RENDER purple

      // User email
      expect(mocks.sendVideoRenderReadyEmail).toHaveBeenCalledTimes(1)
      expect(mocks.sendVideoRenderReadyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          firstName: 'Alex',
          jobId: 'proj_test_1',
          videoUrl,
          title: 'Test Launch Film',
          resolution: '1080p',
        }),
      )
    })
  })
})
