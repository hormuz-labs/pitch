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
  it('finishes on process exit even when the runtime never emits stdio close', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    })
    mock.spawn.mockReturnValue(child)
    const tar = tarCreate('/unused', 'workspace')
    child.stdout.end('archive bytes')
    child.stderr.end()
    child.emit('exit', 0)
    await expect(tar.done).resolves.toBeUndefined()
    const chunks = []
    for await (const chunk of tar.stream) chunks.push(chunk)
    expect(Buffer.concat(chunks).toString()).toBe('archive bytes')
  })
})
