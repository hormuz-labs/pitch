import { describe, expect, it, vi } from 'vitest'
import { handleVideoCommand, PitchApiError } from '../apps/discord-bot/src/handler.js'

describe('/video Discord command', () => {
  it('sends unlinked users to Settings → Connections without provisioning them', async () => {
    const interaction = {
      discordUserId: '99887766',
      kind: 'launch',
      prompt: 'Make a launch video',
      acknowledge: vi.fn(),
      updateProgress: vi.fn(),
      postToChannel: vi.fn(),
    }
    const api = {
      createVideo: vi
        .fn()
        .mockRejectedValue(new PitchApiError(404, 'Discord account is not linked')),
      getProject: vi.fn(),
      shareProject: vi.fn(),
    }

    await handleVideoCommand(interaction, api, {
      appUrl: 'https://trypitch.co',
      pollIntervalMs: 0,
    })

    expect(interaction.updateProgress).toHaveBeenCalledWith(
      'Link your Discord account in Pitch first: https://trypitch.co/new?settings=connections',
    )
    expect(api.getProject).not.toHaveBeenCalled()
    expect(interaction.postToChannel).not.toHaveBeenCalled()
  })

  it('posts progress and the finished video back to the channel', async () => {
    const interaction = {
      discordUserId: '99887766',
      kind: 'launch',
      prompt: 'Make a launch video',
      acknowledge: vi.fn(),
      updateProgress: vi.fn(),
      postToChannel: vi.fn(),
    }
    const api = {
      createVideo: vi.fn().mockResolvedValue({
        project: { id: 'project_123', title: 'Launch video', status: 'working' },
      }),
      getProject: vi
        .fn()
        .mockResolvedValueOnce({
          project: { id: 'project_123', title: 'Launch video', status: 'working' },
        })
        .mockResolvedValueOnce({
          project: {
            id: 'project_123',
            title: 'Launch video',
            status: 'ready',
            outputs: [{ kind: 'video', url: 'https://cdn.example/video.mp4' }],
          },
        }),
      shareProject: vi.fn().mockResolvedValue({
        shareUrl: 'https://trypitch.co/d/abc234defg',
      }),
    }

    await handleVideoCommand(interaction, api, {
      appUrl: 'https://trypitch.co',
      pollIntervalMs: 0,
    })

    expect(interaction.acknowledge).toHaveBeenCalledOnce()
    expect(api.createVideo).toHaveBeenCalledWith('99887766', 'Make a launch video', 'launch')
    expect(interaction.updateProgress).toHaveBeenCalledWith(
      'Creating **Launch video**… Follow it in Pitch: https://trypitch.co/p/project_123',
    )
    expect(interaction.postToChannel).toHaveBeenCalledWith(
      '✅ **Launch video** is ready: https://trypitch.co/d/abc234defg',
    )
    expect(api.shareProject).toHaveBeenCalledWith('99887766', 'project_123')
  })

  it('points users with insufficient credits to the one-time welcome reward', async () => {
    const interaction = {
      discordUserId: '99887766',
      kind: 'auto',
      prompt: 'Make a video',
      acknowledge: vi.fn(),
      updateProgress: vi.fn(),
      postToChannel: vi.fn(),
    }
    const api = {
      createVideo: vi.fn().mockRejectedValue(new PitchApiError(402, 'Insufficient credits')),
      getProject: vi.fn(),
      shareProject: vi.fn(),
    }

    await handleVideoCommand(interaction, api, {
      appUrl: 'https://trypitch.co',
      pollIntervalMs: 0,
    })

    expect(interaction.updateProgress).toHaveBeenCalledWith(
      'You need more Pitch credits. Claim your one-time Discord welcome reward in Settings → Discord, or buy credits in Pitch: https://trypitch.co/new?settings=connections',
    )
    expect(api.getProject).not.toHaveBeenCalled()
  })
})
