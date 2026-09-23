import { describe, expect, it } from 'vitest'
import { runAgentCommand } from '../.pi/lib/agent-command.ts'

describe('host command error evidence', () => {
  it('preserves nonzero exit and browser diagnostics written on stdout', async () => {
    await expect(
      runAgentCommand(
        `node -e 'process.stdout.write("### Error\\nBrowser connection closed");process.exit(1)'`,
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      code: 1,
      message: expect.stringContaining('Browser connection closed'),
    })
  })

  it('returns successful stdout without treating it as a process failure', async () => {
    const result = await runAgentCommand(`node -e 'process.stdout.write("snapshot ready")'`, {
      cwd: process.cwd(),
    })
    expect(result.stdout).toBe('snapshot ready')
  })
})
