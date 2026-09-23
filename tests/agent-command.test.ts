import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAgentCommand } from '../.pi/lib/agent-command.ts'

/** A stand-in playwright-cli: its body is the script, argv is what it was given. */
let dir: string
let savedPath: string | undefined
function stub(body: string) {
  const bin = path.join(dir, 'playwright-cli')
  fs.writeFileSync(bin, `#!/usr/bin/env node\n${body}\n`)
  fs.chmodSync(bin, 0o755)
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-command-'))
  savedPath = process.env.PATH
  process.env.PATH = `${dir}${path.delimiter}${savedPath}`
})
afterEach(() => {
  process.env.PATH = savedPath
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runAgentCommand', () => {
  it('passes words to the program without a shell', async () => {
    stub('console.log(JSON.stringify(process.argv.slice(2)))')
    const marker = path.join(dir, 'pwned')
    const { stdout } = await runAgentCommand(
      `playwright-cli -s=abc type "$(touch ${marker}) \`touch ${marker}\`"`,
      { cwd: dir },
    )
    expect(JSON.parse(stdout)).toEqual(['-s=abc', 'type', `$(touch ${marker}) \`touch ${marker}\``])
    expect(fs.existsSync(marker)).toBe(false)
  })

  it('runs nothing but playwright-cli', async () => {
    await expect(runAgentCommand('ls /', { cwd: dir })).rejects.toThrow(/Not a browser command/)
    await expect(runAgentCommand('sleep 10', { cwd: dir })).rejects.toThrow(/Not a browser command/)
  })

  it('preserves nonzero exit and browser diagnostics written on stdout', async () => {
    stub('process.stdout.write("### Error\\nBrowser connection closed");process.exit(1)')
    await expect(runAgentCommand('playwright-cli snapshot', { cwd: dir })).rejects.toMatchObject({
      code: 1,
      message: expect.stringContaining('Browser connection closed'),
    })
  })

  it('returns successful stdout without treating it as a process failure', async () => {
    stub('process.stdout.write("snapshot ready")')
    const result = await runAgentCommand('playwright-cli snapshot', { cwd: dir })
    expect(result.stdout).toBe('snapshot ready')
  })

  it('kills a stalled browser command at its deadline', async () => {
    stub('setTimeout(() => {}, 10_000)')
    const startedAt = Date.now()
    await expect(
      runAgentCommand('playwright-cli snapshot', { cwd: dir, timeoutMs: 200 }),
    ).rejects.toMatchObject({ killed: true })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
