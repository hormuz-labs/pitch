import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAnnotateEvalJs } from '../../.opencode/lib/annotations'
import {
  applyStoryboardToSlides,
  pageRectToViewportRect,
  resolveManifestSlides,
} from '../../.opencode/lib/asset-demo'
import { ELEMENT_BOX_JS, parseElementBoxJson } from '../../.opencode/lib/demo-core'
import { buildSlideshowHtml } from '../../.opencode/lib/slideshow'

const execAsync = promisify(exec)
const PLAYWRIGHT_SESSION = 'asset-slideshow-integration'
const hasCli = (() => {
  try {
    execSync('command -v playwright-cli', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const pw = (args: string) =>
  execAsync(`playwright-cli -s=${PLAYWRIGHT_SESSION} ${args}`, { maxBuffer: 16 * 1024 * 1024 })
const suite = hasCli ? describe : describe.skip

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
  const { stdout } = await pw(`--raw eval '${ELEMENT_BOX_JS}' '${selector}'`)
  const parsed = parseElementBoxJson(stdout)
  if (!parsed) throw new Error(`Could not parse browser box output: ${stdout}`)
  return parsed
}

async function viewportSize() {
  const { stdout } = await pw(`--raw eval '() => ({width: innerWidth, height: innerHeight})'`)
  return JSON.parse(stdout.trim()) as { width: number; height: number }
}

suite('asset slideshow in a real browser', () => {
  beforeAll(async () => {
    process.env.PLAYWRIGHT_CLI_SESSION = PLAYWRIGHT_SESSION
    await pw('close').catch(() => {})
    await pw('open')
    await pw('resize 1280 720')
    await pw(`goto "data:text/html,${encodeURIComponent(html)}"`)
    await new Promise(resolve => setTimeout(resolve, 600))
  }, 60_000)

  afterAll(async () => {
    delete process.env.PLAYWRIGHT_CLI_SESSION
    await pw('close').catch(() => {})
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

    const { stdout } = await pw(
      `--raw eval '() => ({ blur: getComputedStyle(document.querySelector(".overlay-blur")).backdropFilter, note: document.querySelector(".callout-note").textContent })'`,
    )
    expect(JSON.parse(stdout.trim())).toEqual({ blur: 'blur(12px)', note: 'Reviewed point' })
  })

  it('fits each page to the live viewport without decorative stage chrome', async () => {
    const page = await boxOf('.slide.active .page')
    expect(page).toMatchObject({ x: 100, y: 0, w: 1080, h: 720 })

    const { stdout } = await pw(
      `--raw eval '() => ({ counter: getComputedStyle(document.querySelector("#counter")).display, nav: getComputedStyle(document.querySelector("#nav")).display })'`,
    )
    expect(JSON.parse(stdout.trim())).toEqual({ counter: 'none', nav: 'none' })
  })

  it('converts a page rectangle to the same live viewport box as its hotspot', async () => {
    const page = await boxOf('.slide.active .page')
    const hotspot = await boxOf('.slide.active .hotspot')
    const viewport = await viewportSize()
    const converted = pageRectToViewportRect(
      { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 10 },
      { left: page.x, top: page.y, width: page.w, height: page.h },
      viewport,
    )

    expect((converted.leftPct / 100) * viewport.width).toBeCloseTo(hotspot.x, 1)
    expect((converted.topPct / 100) * viewport.height).toBeCloseTo(hotspot.y, 1)
    expect((converted.widthPct / 100) * viewport.width).toBeCloseTo(hotspot.w, 1)
    expect((converted.heightPct / 100) * viewport.height).toBeCloseTo(hotspot.h, 1)

    const annotateJs = buildAnnotateEvalJs({ style: 'underline', rect: converted })
    const escaped = annotateJs.replace(/(["\\$`])/g, '\\$1')
    await pw(`--raw eval "${escaped}"`)
    const annotation = await boxOf('.pitch-ann')
    expect(annotation.x).toBeCloseTo(hotspot.x, 1)
    expect(annotation.y).toBeCloseTo(hotspot.y, 1)
    expect(annotation.w).toBeCloseTo(hotspot.w, 1)
    expect(annotation.h).toBeCloseTo(hotspot.h, 1)
  })

  it('exposes only the active page hotspot and draws a production annotation on it', async () => {
    const firstSnapshot = (await pw('snapshot')).stdout
    expect(firstSnapshot).toContain('First target')
    expect(firstSnapshot).not.toContain('Second target')

    const annotateJs = buildAnnotateEvalJs({ style: 'pulse', ref: 'current' })
    const escaped = annotateJs.replace(/(["\\$`])/g, '\\$1')
    const annotated = (await pw(`--raw eval "${escaped}" '.slide.active .hotspot'`)).stdout
    expect(annotated).toContain('ok')
    expect((await boxOf('.pitch-ann-pulse'))?.w).toBeGreaterThan(0)

    await pw('press ArrowRight')
    await new Promise(resolve => setTimeout(resolve, 600))
    const secondSnapshot = (await pw('snapshot')).stdout
    expect(secondSnapshot).toContain('Second target')
    expect(secondSnapshot).not.toContain('First target')
  })
})
