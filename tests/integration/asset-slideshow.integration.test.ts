import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Browser, type BrowserContext, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAnnotateEvalJs } from '../../.pi/lib/annotations'
import {
  applyStoryboardToSlides,
  pageRectToViewportRect,
  resolveManifestSlides,
} from '../../.pi/lib/asset-demo'
import { buildSlideshowHtml } from '../../.pi/lib/slideshow'
import {
  type BrowserDriver,
  createBrowserDriver,
} from '../../apps/api/src/render/utils/browser-driver'

const chromiumLaunches = await (async () => {
  try {
    const b = await chromium.launch()
    await b.close()
    return true
  } catch {
    return false
  }
})()
const suite = chromiumLaunches ? describe : describe.skip
let browser: Browser | undefined
let context: BrowserContext
let driver: BrowserDriver
let ws: string

describe('approved storyboard slideshow contract', () => {
  it('omits a deleted PDF page from the rendered slideshow HTML', () => {
    const prepared = resolveManifestSlides({
      assets: [
        {
          kind: 'pdf',
          pages: [
            'https://cdn.example/page-1.png',
            'https://cdn.example/page-2.png',
            'https://cdn.example/page-3.png',
          ],
        },
      ],
    })
    const reviewed = applyStoryboardToSlides(prepared, [
      { pageIndex: 0, enabled: true, overlays: [] },
      { pageIndex: 2, enabled: true, overlays: [] },
    ])

    const rendered = buildSlideshowHtml(reviewed)

    expect(rendered).toContain('data-total="2"')
    expect(rendered).toContain('page-1.png')
    expect(rendered).not.toContain('page-2.png')
    expect(rendered).toContain('page-3.png')
  })
})

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="white"/></svg>',
).toString('base64')
const image = `data:image/svg+xml;base64,${svg}`
const html = buildSlideshowHtml(
  [
    {
      image,
      regions: [
        { id: 'p0r0', text: 'First target', leftPct: 10, topPct: 20, widthPct: 30, heightPct: 10 },
      ],
      overlays: [
        {
          kind: 'blur',
          rect: { leftPct: 5, topPct: 8, widthPct: 20, heightPct: 12 },
          strength: 12,
        },
        {
          kind: 'callout',
          rect: { leftPct: 55, topPct: 50, widthPct: 15, heightPct: 12 },
          noteRect: { leftPct: 12, topPct: 22, widthPct: 28, heightPct: 14 },
          text: 'Reviewed point',
          shape: 'circle',
          color: 'blue',
        },
      ],
    },
    {
      image,
      regions: [
        { id: 'p1r0', text: 'Second target', leftPct: 50, topPct: 40, widthPct: 20, heightPct: 10 },
      ],
    },
  ],
  { transition: 'slide' },
)

async function boxOf(selector: string) {
  const box = await driver.box({ selector })
  if (!box) throw new Error(`No box for ${selector}`)
  return box
}

const snapshot = async () => (await driver.run({ op: 'snapshot' })).text

suite('asset slideshow in a real browser', () => {
  beforeAll(async () => {
    browser = await chromium.launch()
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto(`data:text/html,${encodeURIComponent(html)}`)
    await new Promise(resolve => setTimeout(resolve, 600))
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'slideshow-ws-'))
    driver = createBrowserDriver(context, ws)
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    if (ws) fs.rmSync(ws, { recursive: true, force: true })
  })

  it('maps OCR percentages onto the rendered page box', async () => {
    const page = await boxOf('.slide.active .page')
    const hotspot = await boxOf('.slide.active .hotspot')
    expect((hotspot.x - page.x) / page.w).toBeCloseTo(0.1, 2)
    expect((hotspot.y - page.y) / page.h).toBeCloseTo(0.2, 2)
    expect(hotspot.w / page.w).toBeCloseTo(0.3, 2)
    expect(hotspot.h / page.h).toBeCloseTo(0.1, 2)
  })

  it('keeps reviewed overlays page-relative and visibly styled in the browser', async () => {
    const page = await boxOf('.slide.active .page')
    const blur = await boxOf('.slide.active .overlay-blur')
    const callout = await boxOf('.slide.active .overlay-callout')
    const note = await boxOf('.slide.active .callout-note')
    expect((blur.x - page.x) / page.w).toBeCloseTo(0.05, 2)
    expect((blur.y - page.y) / page.h).toBeCloseTo(0.08, 2)
    expect(callout.w / page.w).toBeCloseTo(0.15, 2)
    expect((note.x - page.x) / page.w).toBeCloseTo(0.12, 2)
    expect((note.y - page.y) / page.h).toBeCloseTo(0.22, 2)

    expect(
      await driver.evaluate(
        '() => ({ blur: getComputedStyle(document.querySelector(".overlay-blur")).backdropFilter, note: document.querySelector(".callout-note").textContent })',
      ),
    ).toEqual({ blur: 'blur(12px)', note: 'Reviewed point' })
  })

  it('fits each page to the live viewport without decorative stage chrome', async () => {
    const page = await boxOf('.slide.active .page')
    expect(page.x).toBeCloseTo(100, 2)
    expect(page.y).toBeCloseTo(0, 2)
    expect(page.w).toBeCloseTo(1080, 2)
    expect(page.h).toBeCloseTo(720, 2)

    expect(
      await driver.evaluate(
        '() => ({ counter: getComputedStyle(document.querySelector("#counter")).display, nav: getComputedStyle(document.querySelector("#nav")).display })',
      ),
    ).toEqual({ counter: 'none', nav: 'none' })
  })

  it('converts a page rectangle to the same live viewport box as its hotspot', async () => {
    const page = await boxOf('.slide.active .page')
    const hotspot = await boxOf('.slide.active .hotspot')
    const viewport = await driver.viewport()
    const converted = pageRectToViewportRect(
      { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 10 },
      { left: page.x, top: page.y, width: page.w, height: page.h },
      viewport,
    )

    expect((converted.leftPct / 100) * viewport.width).toBeCloseTo(hotspot.x, 1)
    expect((converted.topPct / 100) * viewport.height).toBeCloseTo(hotspot.y, 1)
    expect((converted.widthPct / 100) * viewport.width).toBeCloseTo(hotspot.w, 1)
    expect((converted.heightPct / 100) * viewport.height).toBeCloseTo(hotspot.h, 1)

    await driver.evaluate(buildAnnotateEvalJs({ style: 'underline', rect: converted }))
    const annotation = await boxOf('.pitch-ann')
    expect(annotation.x).toBeCloseTo(hotspot.x, 1)
    expect(annotation.y).toBeCloseTo(hotspot.y, 1)
    expect(annotation.w).toBeCloseTo(hotspot.w, 1)
    expect(annotation.h).toBeCloseTo(hotspot.h, 1)
  })

  it('exposes only the active page hotspot and draws a production annotation on it', async () => {
    const firstSnapshot = await snapshot()
    expect(firstSnapshot).toContain('First target')
    expect(firstSnapshot).not.toContain('Second target')

    const ref = firstSnapshot
      .split('\n')
      .find(line => line.includes('First target'))
      ?.match(/\[ref=(\w+)\]/)?.[1]
    expect(ref).toBeTruthy()
    const annotateJs = buildAnnotateEvalJs({ style: 'pulse', ref: ref! })
    expect(JSON.stringify(await driver.evaluate(annotateJs, ref))).toContain('ok')
    expect((await boxOf('.pitch-ann-pulse'))?.w).toBeGreaterThan(0)

    await driver.run({ op: 'press', key: 'ArrowRight' })
    await new Promise(resolve => setTimeout(resolve, 600))
    const secondSnapshot = await snapshot()
    expect(secondSnapshot).toContain('Second target')
    expect(secondSnapshot).not.toContain('First target')
  })
})
