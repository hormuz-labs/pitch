import { beforeEach, describe, expect, it, vi } from 'vitest'

const findProject = vi.fn()

vi.mock('@saas/db', () => ({
  prisma: {
    launchVideoProject: { findUnique: findProject },
  },
}))

describe('launch-video event session lookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing DB-bound session without starting or validating OpenCode', async () => {
    findProject.mockResolvedValue({ opencodeSessionId: 'session-worker-created' })
    const { getBoundSessionForProject } = await import(
      '../apps/api/src/lib/launch-video/opencode.js'
    )

    await expect(getBoundSessionForProject('user-1', 'acme-launch')).resolves.toBe(
      'session-worker-created',
    )
    expect(findProject).toHaveBeenCalledWith({
      where: { userId_name: { userId: 'user-1', name: 'acme-launch' } },
      select: { opencodeSessionId: true },
    })
  })

  it('returns null when no project session has been bound yet', async () => {
    findProject.mockResolvedValue(null)
    const { getBoundSessionForProject } = await import(
      '../apps/api/src/lib/launch-video/opencode.js'
    )

    await expect(getBoundSessionForProject('user-1', 'missing')).resolves.toBeNull()
  })

  it('authenticates the API-owned OpenCode client when the server password is configured', async () => {
    const { opencodeClientOptions } = await import('../apps/api/src/lib/launch-video/opencode.js')

    expect(
      opencodeClientOptions('http://127.0.0.1:4096', {
        OPENCODE_SERVER_USERNAME: 'opencode',
        OPENCODE_SERVER_PASSWORD: 'development',
      }),
    ).toEqual({
      baseUrl: 'http://127.0.0.1:4096',
      headers: {
        Authorization: `Basic ${Buffer.from('opencode:development').toString('base64')}`,
      },
    })

    expect(opencodeClientOptions('http://127.0.0.1:4096', {})).toEqual({
      baseUrl: 'http://127.0.0.1:4096',
    })
  })

  it('recovers busy state and useful activity from persisted async messages', async () => {
    const { sessionActivityFromMessages, sessionBusyFromMessages } = await import(
      '../apps/api/src/lib/launch-video/opencode.js'
    )
    const messages = [
      {
        info: { id: 'user-1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'text-1', type: 'text', text: 'Update scene1: change it' }],
      },
      {
        info: { id: 'assistant-1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'tool-1',
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'running',
              input: { command: 'node capture.mjs index.html --from=0 --to=6.3' },
            },
          },
        ],
      },
    ] as any

    expect(sessionBusyFromMessages(messages)).toBe(true)
    expect(sessionActivityFromMessages(messages)).toBe('Rendering the scene preview…')

    messages[1].info.time.completed = 3
    expect(sessionBusyFromMessages(messages)).toBe(false)
    expect(sessionActivityFromMessages(messages)).toBeNull()
  })
})
