import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeSession,
  type OpenSessionOptions,
  promptSession,
  steerQueuedPrompt,
  stopSession,
} from '../apps/api/src/studio/session.js'

const mocks = vi.hoisted(() => ({
  events: [] as any[],
  create: vi.fn(),
  subscriber: undefined as ((event: any) => void) | undefined,
}))
vi.mock('@earendil-works/pi-coding-agent', () => ({
  ModelRuntime: { create: async () => ({ getModel: () => undefined, setRuntimeApiKey: vi.fn() }) },
  SessionManager: { create: () => ({}) },
  DefaultResourceLoader: class {
    async reload() {}
    getSkills() {
      return {
        skills: [
          {
            filePath: join(process.cwd(), '.pi/skills/launch-video/SKILL.md'),
          },
        ],
      }
    }
    getExtensions() {
      return { extensions: [] }
    }
  },
  createAgentSession: mocks.create,
}))
vi.mock('@saas/db', () => ({
  prisma: {
    project: { findUnique: async () => ({ outputs: '[]', thumbnailUrl: null, lastError: null }) },
  },
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('../apps/api/src/studio/events.js', () => ({
  // SSE serializes immediately. Holding the original object would mask the bug.
  emitProjectEvent: (_id: string, event: unknown) => mocks.events.push(structuredClone(event)),
}))
vi.mock('../apps/api/src/agent/toolkit.js', () => ({ EXTENSIONS: [] }))
vi.mock('../apps/api/src/projects/assets.js', () => ({ ASSET_PATH: /uploads\// }))
vi.mock('../apps/api/src/studio/watch.js', () => ({
  watchWorkspace: vi.fn(),
  unwatchWorkspace: vi.fn(),
}))
vi.mock('../apps/api/src/studio/host-actions.js', () => ({ abortHostActions: vi.fn() }))
vi.mock('../apps/api/src/studio/history.js', () => ({
  createWorkspaceCheckpoint: async () => 'checkpoint',
  readTurnHistory: async () => new Map(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

const opened: OpenSessionOptions[] = []
afterEach(async () => {
  for (const opts of opened.splice(0)) {
    await closeSession(opts.projectId, null, opts.ws.dir)
    await rm(opts.ws.dir, { recursive: true, force: true })
  }
  mocks.events.length = 0
})

async function start() {
  const dir = await mkdtemp(join(tmpdir(), 'studio-queue-'))
  let finish = () => {}
  const pi = {
    isStreaming: false,
    sessionManager: { getBranch: () => [] },
    subscribe: vi.fn((subscriber: (event: any) => void) => {
      mocks.subscriber = subscriber
    }),
    prompt: vi.fn(async (_text: string, options?: { streamingBehavior: string }) => {
      if (options?.streamingBehavior === 'steer') return
      pi.isStreaming = true
      await new Promise<void>(resolve => {
        finish = resolve
      })
      pi.isStreaming = false
    }),
    abort: async () => {
      finish()
    },
  }
  mocks.create.mockResolvedValue({ session: pi })
  const opts: OpenSessionOptions = {
    projectId: dir,
    ws: { dir, internal: 'queue-test', flow: 'studio', userId: 'user', name: 'queue-test' },
    sessionFile: null,
    agent: {
      systemPrompt: async () => '',
      skills: async () => [],
      builtinTools: [],
      sandbox: false,
    } as unknown as OpenSessionOptions['agent'],
  }
  opened.push(opts)
  const active = await promptSession(opts, 'Make a launch film')
  await vi.waitFor(() => expect(pi.prompt).toHaveBeenCalledOnce())
  return {
    opts,
    pi,
    session: active.session,
    finish: () => finish(),
    emit: (event: any) => mocks.subscriber?.(event),
  }
}

describe('studio queue and steering', () => {
  it('broadcasts queued state immediately and waits for the active turn to finish', async () => {
    const h = await start()
    const queued = await promptSession(h.opts, 'Then make it square')
    expect(
      mocks.events.find(e => e.type === 'entry' && e.entry.id === queued.entryId)?.entry.pending,
    ).toBe('queued')
    expect(h.pi.prompt).toHaveBeenCalledTimes(1)
    h.finish()
    await vi.waitFor(() => expect(h.pi.prompt).toHaveBeenCalledTimes(2))
    expect(h.pi.prompt).toHaveBeenLastCalledWith('Then make it square')
    expect(h.session.entries.find(e => e.id === queued.entryId)?.pending).toBeUndefined()
  })

  it('promotes a queued message once, with context, into the current run', async () => {
    const h = await start()
    const queued = await promptSession(h.opts, 'Use the blue logo', 'Selected: uploads/blue.svg')
    expect(await steerQueuedPrompt(h.opts.projectId, queued.entryId)).toBe(true)
    expect(h.pi.prompt).toHaveBeenLastCalledWith(
      '<studio-context>\nSelected: uploads/blue.svg\n</studio-context>\n\nUse the blue logo',
      { streamingBehavior: 'steer' },
    )
    expect(h.session.queue).toHaveLength(0)
    expect(await steerQueuedPrompt(h.opts.projectId, queued.entryId)).toBe(false)
    h.finish()
    await vi.waitFor(() => expect(h.session.busy).toBe(false))
    expect(h.pi.prompt).toHaveBeenCalledTimes(2)
  })

  it('broadcasts direct steering and sends it without queuing a later turn', async () => {
    const h = await start()
    const result = await promptSession(h.opts, 'Focus on one thing', undefined, 'steer')
    expect(result.delivery).toBe('steered')
    expect(
      mocks.events.find(e => e.type === 'entry' && e.entry.id === result.entryId)?.entry.pending,
    ).toBe('steering')
    expect(h.pi.prompt).toHaveBeenLastCalledWith('Focus on one thing', {
      streamingBehavior: 'steer',
    })
    expect(h.session.queue).toHaveLength(0)
  })

  it('keeps a message queued when resolving its steering context fails', async () => {
    const h = await start()
    const queued = await promptSession(h.opts, 'Keep this instruction', async () => {
      throw new Error('Lookup failed')
    })
    await expect(steerQueuedPrompt(h.opts.projectId, queued.entryId)).rejects.toThrow(
      'Lookup failed',
    )
    expect(h.session.queue.map(r => r.entry.id)).toEqual([queued.entryId])
    expect(h.session.entries.find(e => e.id === queued.entryId)?.pending).toBe('queued')
  })

  it('does not deliver twice if the queued turn starts during context lookup', async () => {
    const h = await start()
    const context = deferred<string>()
    const queued = await promptSession(h.opts, 'Next instruction', () => context.promise)
    const steering = steerQueuedPrompt(h.opts.projectId, queued.entryId)
    h.finish()
    await vi.waitFor(() => expect(h.session.active?.entry.id).toBe(queued.entryId))
    context.resolve('context')
    expect(await steering).toBe(false)
    await vi.waitFor(() => expect(h.pi.prompt).toHaveBeenCalledTimes(2))
    expect(h.pi.prompt).toHaveBeenLastCalledWith(
      '<studio-context>\ncontext\n</studio-context>\n\nNext instruction',
    )
    expect(h.session.preStartSteers).toHaveLength(0)
  })

  it('cancels queued messages on stop', async () => {
    const h = await start()
    const queued = await promptSession(h.opts, 'Next instruction')
    await stopSession(h.opts.projectId)
    await vi.waitFor(() => expect(h.session.busy).toBe(false))
    expect(h.session.entries.find(e => e.id === queued.entryId)?.pending).toBe('cancelled')
    expect(h.pi.prompt).toHaveBeenCalledTimes(1)
  })

  it('snapshots model cost and provided-skill use before the next queued turn starts', async () => {
    const h = await start()
    const queued = await promptSession(h.opts, 'Then answer normally')
    const skillPath = join(process.cwd(), '.pi/skills/launch-video/SKILL.md')
    h.emit({
      type: 'message_end',
      message: { role: 'assistant', usage: { cost: { total: 0.01 } } },
    })
    h.emit({
      type: 'tool_execution_start',
      toolCallId: 'skill-1',
      toolName: 'read',
      args: { path: skillPath },
    })
    h.emit({ type: 'tool_execution_end', toolCallId: 'skill-1', toolName: 'read', isError: false })
    h.finish()

    await vi.waitFor(() => expect(h.session.active?.entry.id).toBe(queued.entryId))
    const firstIdle = mocks.events.find(event => event.type === 'idle' && event.turn === 1)
    expect(firstIdle).toMatchObject({ cost: 0.01, usedProvidedSkill: true, busy: true })

    h.emit({
      type: 'message_end',
      message: { role: 'assistant', usage: { cost: { total: 0.02 } } },
    })
    h.finish()
    await vi.waitFor(() => expect(h.session.busy).toBe(false))
    const secondIdle = mocks.events.find(event => event.type === 'idle' && event.turn === 2)
    expect(secondIdle).toMatchObject({ cost: 0.02, usedProvidedSkill: false, busy: false })
  })

  it('does not classify a failed provided-skill read', async () => {
    const h = await start()
    h.emit({
      type: 'tool_execution_start',
      toolCallId: 'skill-failed',
      toolName: 'read',
      args: { path: join(process.cwd(), '.pi/skills/launch-video/SKILL.md') },
    })
    h.emit({
      type: 'tool_execution_end',
      toolCallId: 'skill-failed',
      toolName: 'read',
      isError: true,
    })
    h.finish()
    await vi.waitFor(() => expect(h.session.busy).toBe(false))
    expect(mocks.events.find(event => event.type === 'idle' && event.turn === 1)).toMatchObject({
      usedProvidedSkill: false,
    })
  })
})
