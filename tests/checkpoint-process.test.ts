import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mock.spawn,
}))

import { tarCreate } from '../apps/api/src/worker/checkpoint.ts'

describe('checkpoint producer completion', () => {
  it('finishes after process exit and complete stdout without requiring stdio close', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    })
    mock.spawn.mockReturnValue(child)
    const tar = tarCreate('/unused', 'workspace')
    const chunks: Buffer[] = []
    const consumed = (async () => {
      for await (const chunk of tar.stream) chunks.push(chunk as Buffer)
    })()
    child.emit('exit', 0)
    let completed = false
    void tar.done.then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)

    child.stdout.end('archive bytes')
    child.stderr.end()
    await expect(tar.done).resolves.toBeUndefined()
    await consumed
    expect(Buffer.concat(chunks).toString()).toBe('archive bytes')
  })
})
