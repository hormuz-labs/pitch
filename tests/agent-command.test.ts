import { describe, expect, it } from 'vitest'
import { runAgentCommand } from '../.pi/lib/agent-command'

describe('runAgentCommand', () => {
  it('kills a stalled browser command at its deadline', async () => {
    const startedAt = Date.now()

    await expect(
      runAgentCommand('sleep 10', { cwd: process.cwd(), timeoutMs: 50 }),
    ).rejects.toMatchObject({ killed: true })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
