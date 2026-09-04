import { describe, expect, it } from 'vitest'
import { buildBrowserChromeSvg } from '../apps/api/src/render/utils/browser-chrome.js'

describe('buildBrowserChromeSvg', () => {
  it('renders a 1920x56 SVG containing traffic lights and the escaped URL', () => {
    const svg = buildBrowserChromeSvg('https://example.com/path', 1920, 56, 'light')
    expect(svg).toContain('width="1920"')
    expect(svg).toContain('height="56"')
    expect(svg).toContain('#FF5F57')
    expect(svg).toContain('#FFBD2E')
    expect(svg).toContain('#28C840')
    expect(svg).toContain('example.com/path')
  })

  it('escapes XML-special characters in the URL', () => {
    const svg = buildBrowserChromeSvg('https://example.com/a=1&b=2', 1920, 56, 'light')
    expect(svg).not.toContain('a=1&b=2')
    expect(svg).toContain('a=1&amp;b=2')
  })

  it('uses light theme colors for light mode', () => {
    const svg = buildBrowserChromeSvg('https://example.com', 1920, 56, 'light')
    expect(svg).toContain('#F0F0F0')
    expect(svg).toContain('#FFFFFF')
    expect(svg).toContain('#333333')
  })

  it('uses dark theme colors for dark mode', () => {
    const svg = buildBrowserChromeSvg('https://example.com', 1920, 56, 'dark')
    expect(svg).toContain('#3A3A3C')
    expect(svg).toContain('#48484A')
    expect(svg).toContain('#FFFFFF')
  })

  it('renders a search icon inside the address bar', () => {
    const svg = buildBrowserChromeSvg('https://example.com', 1920, 56, 'light')
    expect(svg).toContain('<circle cx="6" cy="6" r="4.5"/>')
    expect(svg).toContain('<line x1="9.5" y1="9.5" x2="13" y2="13"/>')
  })

  it('uses a clean system font stack for the URL', () => {
    const svg = buildBrowserChromeSvg('https://example.com', 1920, 56, 'light')
    expect(svg).toContain(
      'font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif"',
    )
    expect(svg).toContain('font-size="13"')
    expect(svg).toContain('font-weight="400"')
  })

  it('truncates very long URLs', () => {
    const longUrl = `https://example.com/${'a'.repeat(200)}`
    const svg = buildBrowserChromeSvg(longUrl, 1920, 56, 'light')
    expect(svg).toContain('…')
    expect(svg).not.toContain('a'.repeat(200))
  })

  it('strips the protocol, www prefix, query, hash and trailing slash from the URL', () => {
    const svg = buildBrowserChromeSvg(
      'https://www.example.com/dashboard/?ref=home#section',
      1920,
      56,
      'light',
    )
    expect(svg).toContain('example.com/dashboard')
    expect(svg).not.toContain('https://www.example.com')
    expect(svg).not.toContain('ref=home')
    expect(svg).not.toContain('#section')
  })
})
