/**
 * A centred line built as it is said keeps what has been said centred: each
 * word lands at the right end and the line glides to re-centre, and when a
 * second line begins the block lifts so the begun lines stay centred. A
 * `mark` keyword arrives in a pill that sweeps in and lifts away. Real
 * Chromium on a one-shot film; skipped where none is installed.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shellHtml } from '../.pi/lib/shell'

const hasChromium = existsSync(chromium.executablePath())
const ROOT = `${pathToFileURL(resolve('.')).href}/`

const WORDS = ['Every', 'week,', 'ideas', 'are', 'born', 'inside', 'your', 'team.']
const AT = (k: number) => 0.5 + k * 0.6

const film = (style: Record<string, unknown>) => `window.SHOTS = {
  brand: { bg: "#f7f7fb", ink: "#141414", accent: "#2b3fd6", font: "Arial, sans-serif" },
  shots: [{ id: "one", type: "card", dur: 7, bg: "#f7f7fb" }],
  captions: {
    style: ${JSON.stringify({ stack: 'line', case: 'none', size: 90, weight: 500, shadow: false, color: '#141414', margin: 0.2, ...style })},
    phrases: [{ at: 0.5, each: 0.6, words: ${JSON.stringify(WORDS.map(w => (w === 'ideas' ? { text: w, fx: 'mark', weight: 800 } : w)))} }],
  },
};`

describe.skipIf(!hasChromium)('captions: a line built as it is said', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  let page: Awaited<ReturnType<typeof browser.newPage>>
  const dir = mkdtempSync(join(tmpdir(), 'captions-line-'))

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  })
  afterAll(async () => {
    await browser?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const open = async (style: Record<string, unknown>) => {
    writeFileSync(join(dir, 'shots.js'), film(style))
    const html = shellHtml({ title: 'captions', files: { styles: [], scripts: [] } }).replaceAll(
      '../../',
      ROOT,
    )
    writeFileSync(join(dir, 'index.html'), html)
    await page.goto(pathToFileURL(join(dir, 'index.html')).href)
    await page.waitForFunction(() => (window as any).__READY === true)
  }

  /** The said words' boxes at film time t, grouped into lines. */
  const said = (t: number) =>
    page.evaluate(t => {
      ;(window as any).__SEEK(t)
      const words = [...document.querySelectorAll('#captions .cap-w')] as HTMLElement[]
      const shown = words.filter(w => getComputedStyle(w).visibility === 'visible')
      const boxes = shown.map(w => w.getBoundingClientRect())
      const lines: { left: number; right: number; top: number; bottom: number }[] = []
      for (const b of boxes) {
        const l = lines.find(x => Math.abs(x.top - b.top) < 4)
        if (l) {
          l.left = Math.min(l.left, b.left)
          l.right = Math.max(l.right, b.right)
          l.bottom = Math.max(l.bottom, b.bottom)
        } else lines.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom })
      }
      const first = words[0].getBoundingClientRect()
      const mark = words[2]
      return {
        lines,
        first: first.left,
        mark: {
          on: Number(mark.style.getPropertyValue('--mark-o') || 0),
          color: getComputedStyle(mark).color,
        },
      }
    }, t)

  it('keeps every begun line centred once each word settles, and the block centred', async () => {
    await open({ align: 'center', pos: 'center' })
    let lineCount = 0
    for (let k = 0; k < WORDS.length; k++) {
      const { lines } = await said(AT(k) + 0.55)
      for (const l of lines) expect(Math.abs((l.left + l.right) / 2 - 960)).toBeLessThan(3)
      const top = lines[0].top
      const bottom = lines[lines.length - 1].bottom
      expect(Math.abs((top + bottom) / 2 - 540)).toBeLessThan(3)
      lineCount = lines.length
    }
    expect(lineCount).toBe(2)
  })

  it('glides to the new centre instead of jumping', async () => {
    await open({ align: 'center', pos: 'center' })
    for (let k = 1; k < WORDS.length; k++) {
      const before = await said(AT(k) - 0.01)
      const after = await said(AT(k) + 0.02)
      const settled = await said(AT(k) + 0.55)
      expect(Math.abs(after.first - before.first)).toBeLessThan(4)
      // A word added to the line being built moves that line left by half its width.
      if (settled.lines.length === before.lines.length)
        expect(settled.lines.at(-1)!.left).toBeLessThan(before.lines.at(-1)!.left - 10)
    }
  })

  it('leaves a left-aligned line where it was laid out', async () => {
    await open({ align: 'left', pos: 'upper' })
    const a = await said(AT(0) + 0.55)
    const b = await said(AT(4) + 0.55)
    expect(b.first).toBe(a.first)
  })

  it('sweeps a pill in behind a marked word and lifts it away', async () => {
    await open({ align: 'center', pos: 'center' })
    const held = await said(AT(2) + 0.35)
    expect(held.mark.on).toBeGreaterThan(0.95)
    expect(held.mark.color).toBe('rgb(255, 255, 255)')
    const gone = await said(AT(2) + 0.95)
    expect(gone.mark.on).toBe(0)
    expect(gone.mark.color).toBe('rgb(20, 20, 20)')
  })
})
