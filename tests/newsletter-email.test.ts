import { describe, expect, it } from 'vitest'
import { renderNewsletterEmail } from '../packages/email/src/index.js'

describe('newsletter email rendering', () => {
  it('renders responsive branded HTML with escaped fenced code', () => {
    const result = renderNewsletterEmail({
      to: 'reader@example.com',
      firstName: 'Ada',
      subject: 'MCP tools are here',
      message: 'Connect your agent with this config:\n\n```json\n{"token":"<secret>"}\n```',
      ctaLabel: 'Read the docs',
      ctaUrl: 'https://trypitch.co/docs/mcp',
      unsubscribeUrl: 'https://api.trypitch.co/newsletter/unsubscribe?token=test',
    })

    expect(result.html).toContain('@media only screen and (max-width:620px)')
    expect(result.html).toContain('MCP tools are here')
    expect(result.html).toContain('Hi Ada,')
    expect(result.html).toContain('<pre')
    expect(result.html).toContain('&lt;secret&gt;')
    expect(result.html).not.toContain('<secret>')
    expect(result.html).toContain('Read the docs</a>')
    expect(result.html).not.toContain('Read the docs&nbsp;&nbsp;→')
    expect(result.html).toContain('https://www.youtube.com/@trypitchdotco')
    expect(result.text).toContain('```json')
  })
})
