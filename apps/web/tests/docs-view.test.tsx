import { render } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@solidjs/router', () => ({
  A: (props: { href?: string; to?: string; children: JSX.Element; class?: string }) => (
    <a href={props.href ?? props.to} class={props.class}>
      {props.children}
    </a>
  ),
  Navigate: () => null,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/docs' }),
}))

import { DOC_PAGES } from '../src/docs/pages'
import { DocsView } from '../src/solid/public/DocsView'

describe('DocsView rendering', () => {
  it('renders the tools documentation without [native code] corruption', () => {
    const { container } = render(() => <DocsView slug="tools" />)

    const text = container.textContent ?? ''
    expect(text).not.toContain('[native code]')
    expect(text).not.toContain('function ()')

    // Verify key MCP tool arguments are properly rendered
    expect(text).toContain('prompt_project')
    expect(text).toContain('projectId')
    expect(text).toContain('create_project')
    expect(text).toContain('get_project')
    expect(text).toContain('export_project')

    // Verify code elements exist in tables
    const codeElements = container.querySelectorAll('code')
    expect(codeElements.length).toBeGreaterThan(10)
    const codeTexts = Array.from(codeElements).map(el => el.textContent)
    expect(codeTexts).toContain('projectId')
    expect(codeTexts).toContain('text')
    expect(codeTexts).toContain('prompt_project')
  })

  it('renders all documentation pages cleanly with no [native code]', () => {
    for (const page of DOC_PAGES) {
      const { container, unmount } = render(() => <DocsView slug={page.slug} />)

      const text = container.textContent ?? ''
      expect(text, `Page "${page.title}" (${page.slug}) contains [native code]`).not.toContain(
        '[native code]',
      )
      expect(text, `Page "${page.title}" (${page.slug}) contains function ()`).not.toContain(
        'function ()',
      )
      unmount()
    }
  })
})
