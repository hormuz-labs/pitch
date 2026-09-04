import { Resvg } from '@resvg/resvg-js'
import * as fs from 'fs'

export type BrowserHeaderMode = 'light' | 'dark'

interface ChromeTheme {
  headerBg: string
  barBg: string
  text: string
  divider: string
}

const THEMES: Record<BrowserHeaderMode, ChromeTheme> = {
  light: {
    headerBg: '#F0F0F0',
    barBg: '#FFFFFF',
    text: '#333333',
    divider: '#D1D1D6',
  },
  dark: {
    headerBg: '#3A3A3C',
    barBg: '#48484A',
    text: '#FFFFFF',
    divider: '#5A5A5C',
  },
}

const CLOSE = '#FF5F57'
const MINIMIZE = '#FFBD2E'
const MAXIMIZE = '#28C840'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cleanUrlForHeader(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^(www|m)\./i, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/$/, '')
}

/**
 * Build a Safari-style browser header SVG. The header is 56 px tall and spans the
 * full output width. Traffic lights sit on the left, the page URL is centered in
 * a rounded address bar pill, and a subtle divider line runs along the bottom.
 */
export function buildBrowserChromeSvg(
  url: string,
  width: number,
  height: number,
  mode: BrowserHeaderMode,
): string {
  const theme = THEMES[mode]
  const lightDiameter = 12
  const lightY = (height - lightDiameter) / 2
  const lightGap = 8
  const leftMargin = 16

  // Address bar pill: centered, max width 60% of header, 28 px tall.
  const barH = 28
  const barW = Math.min(width * 0.6, 640)
  const barX = (width - barW) / 2
  const barY = (height - barH) / 2
  const barR = barH / 2

  // Address-bar contents: a small search icon on the left, then the URL.
  const iconSize = 14
  const iconX = barX + 12
  const iconY = height / 2 - iconSize / 2
  const textX = iconX + iconSize + 8
  const textRightPadding = 16
  const maxTextW = barX + barW - textX - textRightPadding
  const charWidth = 7.3
  const maxChars = Math.max(0, Math.floor(maxTextW / charWidth))
  let displayUrl = cleanUrlForHeader(url)
  if (displayUrl.length > maxChars) {
    displayUrl = `${displayUrl.slice(0, Math.max(0, maxChars - 1))}…`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${theme.headerBg}"/>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${barR}" ry="${barR}" fill="${theme.barBg}"/>
  <g transform="translate(${iconX}, ${iconY})" fill="none" stroke="${theme.text}" stroke-width="1.6" stroke-linecap="round" opacity="0.55">
    <circle cx="6" cy="6" r="4.5"/>
    <line x1="9.5" y1="9.5" x2="13" y2="13"/>
  </g>
  <text x="${textX}" y="${height / 2 + 4.5}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="400" fill="${theme.text}">${escapeXml(displayUrl)}</text>
  <circle cx="${leftMargin + lightDiameter / 2}" cy="${lightY + lightDiameter / 2}" r="${lightDiameter / 2}" fill="${CLOSE}"/>
  <circle cx="${leftMargin + lightDiameter / 2 + lightDiameter + lightGap}" cy="${lightY + lightDiameter / 2}" r="${lightDiameter / 2}" fill="${MINIMIZE}"/>
  <circle cx="${leftMargin + lightDiameter / 2 + 2 * (lightDiameter + lightGap)}" cy="${lightY + lightDiameter / 2}" r="${lightDiameter / 2}" fill="${MAXIMIZE}"/>
  <rect x="0" y="${height - 1}" width="${width}" height="1" fill="${theme.divider}"/>
</svg>`
}

/**
 * Render the browser header SVG to a PNG file. Returns the written PNG path.
 */
export function renderBrowserChromePng(
  url: string,
  outputPath: string,
  width: number,
  height: number,
  mode: BrowserHeaderMode,
): string {
  const svg = buildBrowserChromeSvg(url, width, height, mode)
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  fs.writeFileSync(outputPath, png)
  return outputPath
}
