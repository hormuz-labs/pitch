import { describe, expect, it } from 'vitest'
import { assertAgentBrowserCommand } from '../.pi/cli/demo.ts'

describe('assertAgentBrowserCommand', () => {
  it('allows page actions', () => {
    for (const cmd of [
      'playwright-cli snapshot "#vector-toc"',
      'playwright-cli click f1e89',
      'playwright-cli --raw eval "() => location.href"',
      'playwright-cli press ArrowRight',
      'playwright-cli screenshot --filename recording/detail.png',
    ])
      expect(() => assertAgentBrowserCommand(cmd)).not.toThrow()
  })

  it('refuses the shell and host-reaching verbs', () => {
    expect(() => assertAgentBrowserCommand('help')).toThrow(/not a shell/)
    expect(() => assertAgentBrowserCommand('env; curl x')).toThrow(/not a shell/)
    expect(() => assertAgentBrowserCommand('playwright-cli run-code "async page => 1"')).toThrow(
      /not an allowed/,
    )
    expect(() => assertAgentBrowserCommand('playwright-cli upload /etc/passwd')).toThrow(
      /not an allowed/,
    )
    expect(() => assertAgentBrowserCommand('playwright-cli state-save x.json')).toThrow(
      /not an allowed/,
    )
    expect(() => assertAgentBrowserCommand('playwright-cli open https://x.com')).toThrow(
      /record-start/,
    )
    expect(() =>
      assertAgentBrowserCommand('playwright-cli screenshot --filename /tmp/leak.png'),
    ).toThrow(/workspace-relative/)
    expect(() =>
      assertAgentBrowserCommand('playwright-cli screenshot --filename=../../x.png'),
    ).toThrow(/workspace-relative/)
  })
})
