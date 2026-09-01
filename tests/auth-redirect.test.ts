/**
 * Tests for safeRedirect (apps/web/src/lib/redirect.ts).
 *
 * A signed-out visitor asking for a gated page is sent to
 * /sign-up?redirect=<where they were going>, and AuthView feeds that value
 * straight to Clerk as the post-auth destination. That makes it an open-redirect
 * sink, so the allowed shape is narrow on purpose: one leading slash, nothing
 * that a browser would read as another origin.
 */

import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../apps/web/src/lib/redirect.js'

describe('safeRedirect', () => {
  it('keeps a plain same-site path', () => {
    expect(safeRedirect('/api-keys')).toBe('/api-keys')
  })

  it('keeps a path with a query and hash', () => {
    expect(safeRedirect('/new?prompt=hello#top')).toBe('/new?prompt=hello#top')
  })

  it('decodes an encoded path', () => {
    expect(safeRedirect(encodeURIComponent('/launch-video/new?prompt=a b'))).toBe(
      '/launch-video/new?prompt=a b',
    )
  })

  it.each([undefined, null, ''])('falls back to the dashboard for %j', value => {
    expect(safeRedirect(value)).toBe('/dashboard')
  })

  // Everything below is a value a browser would happily treat as another origin.
  it.each([
    'https://evil.com',
    'http://evil.com',
    '//evil.com',
    '//evil.com/path',
    'javascript:alert(1)',
    'evil.com',
    'data:text/html,<script>',
  ])('refuses the off-site destination %j', value => {
    expect(safeRedirect(value)).toBe('/dashboard')
  })

  it('refuses an encoded protocol-relative url', () => {
    expect(safeRedirect(encodeURIComponent('//evil.com'))).toBe('/dashboard')
  })

  it('refuses to bounce back to the auth pages, which would loop', () => {
    expect(safeRedirect('/sign-in')).toBe('/dashboard')
    expect(safeRedirect('/sign-up?redirect=%2Fsign-up')).toBe('/dashboard')
  })

  it('survives a malformed percent-encoding instead of throwing', () => {
    expect(safeRedirect('/ok%ZZ')).toBe('/ok%ZZ')
  })
})
