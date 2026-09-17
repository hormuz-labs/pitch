import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { formatPageEvidence, pageEvidence } from '../.pi/scripts/launch-video/lib/page-evidence.mjs'

function inspect(text: string, links: Array<[string, string]>, options = {}) {
  const context = {
    URL,
    location: new URL('https://product.example/'),
    document: {
      title: 'Product',
      body: { innerText: text },
      querySelector: selector =>
        selector.startsWith('meta') ? { content: 'Description' } : { innerText: text },
      querySelectorAll: () =>
        links.map(([label, href]) => ({
          innerText: label,
          href,
          getAttribute: () => null,
        })),
    },
    options,
  }
  return runInNewContext(`(${pageEvidence.toString()})(options)`, context)
}

describe('product page evidence', () => {
  it('returns followable product/docs URLs, deduplicated and prioritized', () => {
    const result = inspect('A real workflow.', [
      ['Privacy', '/privacy'],
      ['Docs', 'https://docs.product.example/start'],
      ['Feature', '/features#one'],
      ['Feature again', '/features#two'],
      ['Email', 'mailto:hello@example.com'],
      ['Home', '/#top'],
      ['Unsafe', 'javascript:alert(1)'],
    ])
    expect(result.links).toEqual([
      { label: 'Feature', url: 'https://product.example/features' },
      { label: 'Docs', url: 'https://docs.product.example/start' },
      { label: 'Privacy', url: 'https://product.example/privacy' },
    ])
  })

  it('bounds text and links while preserving the source for further investigation', () => {
    const result = inspect(
      'x'.repeat(1000),
      [
        ['Docs', '/docs'],
        ['Pricing', '/pricing'],
      ],
      {
        maxChars: 100,
        maxLinks: 1,
      },
    )
    expect(result.text).toHaveLength(100)
    expect(result.truncated).toBe(true)
    expect(result.links).toHaveLength(1)
    expect(formatPageEvidence(result)).toContain('https://product.example/docs')
    expect(formatPageEvidence(result)).toContain('Page text truncated')
  })
})
