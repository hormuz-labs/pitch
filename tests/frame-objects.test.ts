/**
 * The things on a frame that a viewer may read as a mistake: a logo with a
 * chip over part of it, a box with nothing in it, a box over part of one from
 * another group, a frame with almost nothing in it. Each comes from a film
 * the user had to correct; the arrangements that look alike and are meant (a
 * stack, a selection frame, a glow, a corner logo) are left alone. The page
 * checks run in real Chromium on hand-built frames; they skip where none is
 * installed.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  drawOutlines,
  frameObjectFindings,
  lookLines,
  measureFrameObjects,
} from '../.pi/scripts/launch-video/lib/frame-objects.mjs'

const hasChromium = existsSync(chromium.executablePath())

const LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="48"><rect width="200" height="48" fill="#111"/></svg>',
  )

/** One shot on a 1920×1080 stage, the engine's way: .shot[id] > content. */
const frame = (body: string) => `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #fff; font: 40px sans-serif; }
  .shot { position: absolute; inset: 0; }
  .abs { position: absolute; box-sizing: border-box; }
</style></head><body><div class="shot" id="make">${body}</div></body></html>`

describe.skipIf(!hasChromium)('measureFrameObjects in the page', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  let page: Awaited<ReturnType<typeof browser.newPage>>
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  })
  afterAll(async () => {
    await browser?.close()
  })
  const measure = async (body: string, list = false) => {
    await page.setContent(frame(body))
    return page.evaluate(measureFrameObjects, list)
  }

  it('finds a chip slid over part of the page logo, and not a cursor on an icon', async () => {
    const { marks } = await measure(`
      <img class="abs logo" src="${LOGO}" style="left:95px;top:65px;width:200px;height:48px">
      <div class="abs input" style="left:250px;top:40px;width:300px;height:80px;background:#f6f6f6">trypitch.co</div>
      <img class="abs icon" src="${LOGO}" style="left:900px;top:500px;width:96px;height:96px">
      <img class="abs cursor" src="${LOGO}" style="left:950px;top:550px;width:48px;height:48px">`)
    expect(marks).toEqual([
      expect.objectContaining({ shot: 'make', el: 'img.abs.logo', by: 'div.abs.input' }),
    ])
  })

  it('finds a box with nothing in it, and leaves alone boxes that hold or frame something', async () => {
    const { empty } = await measure(`
      <div class="abs block" style="left:200px;top:800px;width:340px;height:70px;background:#ddd"></div>
      <div class="abs card" style="left:200px;top:100px;width:300px;height:200px;background:#eee">Brief</div>
      <div class="abs dot" style="left:700px;top:100px;width:80px;height:80px;border-radius:50%;background:#1385d6"></div>
      <div class="abs line" style="left:700px;top:300px;width:400px;height:12px;background:#ddd"></div>
      <div class="abs glow" style="left:1000px;top:400px;width:600px;height:400px;background:#1385d6;filter:blur(60px)"></div>
      <h2 class="abs" style="left:1210px;top:110px;margin:0">Selected title</h2>
      <div class="abs selection" style="left:1200px;top:100px;width:420px;height:80px;border:3px solid #1385d6"></div>`)
    expect(empty.map(e => e.el)).toEqual(['div.abs.block'])
  })

  it('finds a card over part of a timeline clip, and leaves a stack of siblings alone', async () => {
    const { overlaps } = await measure(`
      <div class="abs boards" style="left:0;top:0;width:1920px;height:1080px">
        <div class="abs board" style="left:900px;top:600px;width:280px;height:200px;background:#111;color:#fff">One idea.</div>
      </div>
      <div class="abs timeline" style="left:0;top:0;width:1920px;height:1080px">
        <div class="abs block" style="left:950px;top:760px;width:340px;height:70px;background:#1385d6"></div>
      </div>
      <div class="abs stack" style="left:0;top:0;width:1920px;height:1080px">
        <div class="abs card" style="left:200px;top:200px;width:300px;height:200px;background:#eee">A</div>
        <div class="abs card" style="left:260px;top:240px;width:300px;height:200px;background:#ddd">B</div>
      </div>`)
    expect(overlaps).toEqual([
      expect.objectContaining({ top: 'div.abs.block', under: 'div.abs.board' }),
    ])
  })

  it('measures how much of the frame the content fills, the corner chrome aside', async () => {
    const lone = await measure(`
      <img class="abs logo" src="${LOGO}" style="left:60px;top:40px;width:200px;height:48px">
      <div class="abs chip" style="left:860px;top:500px;width:200px;height:60px;background:#f6f6f6">Make a video.</div>`)
    expect(lone.fill.share).toBeLessThan(0.01)
    const footage = await measure(
      `<canvas class="abs" width="1920" height="1080" style="left:0;top:0"></canvas>`,
    )
    expect(footage.fill.share).toBe(1)
  })

  it('notes the small words at the frame edges, and not the headline', async () => {
    const { edge } = await measure(`
      <span class="abs kicker" style="left:1500px;top:40px;font-size:22px">AI PRODUCTION STUDIO</span>
      <h1 class="abs" style="left:120px;top:300px;margin:0;font-size:120px">One sentence.</h1>`)
    expect(edge).toEqual([expect.objectContaining({ shot: 'make', text: 'AI PRODUCTION STUDIO' })])
  })

  it('numbers every thing on the frame for look, with what each holds', async () => {
    const { things } = await measure(
      `<div class="abs card" style="left:200px;top:100px;width:300px;height:200px;background:#eee"><p style="margin:20px">Brief</p></div>
       <div class="abs block" style="left:200px;top:800px;width:340px;height:70px;background:#ddd"></div>`,
      true,
    )
    expect(things.map(t => [t.n, t.el, t.kind, t.holds])).toEqual([
      [1, 'div.abs.card', 'box', '"Brief"'],
      [2, 'div.abs.card > p', 'words', '"Brief"'],
      [3, 'div.abs.block', 'box', 'nothing in it'],
    ])
  })

  it('draws the outlines over the frame and clears them', async () => {
    await page.setContent(frame(''))
    await page.evaluate(drawOutlines, {
      items: [{ rect: [10, 10, 100, 50], label: 'div.block', tone: 'mark' }],
      caption: '[1] 15.5s',
    })
    expect(await page.evaluate(() => document.querySelector('#__look')?.textContent)).toBe(
      'div.block[1] 15.5s',
    )
    await page.evaluate(drawOutlines, {})
    expect(await page.evaluate(() => document.querySelector('#__look'))).toBeNull()
  })
})

describe('frameObjectFindings', () => {
  const mark = {
    shot: 'make',
    el: 'img.logo',
    by: 'div.input',
    share: 0.22,
    rect: [95, 65, 200, 48],
    byRect: [250, 40, 300, 80],
  }
  const fill = (share: number) => ({ share, rect: [0, 0, 100, 100] })
  const at = (t: number, extra: Record<string, unknown> = {}) => ({
    t,
    marks: [],
    overlaps: [],
    empty: [],
    fill: fill(0.5),
    ...extra,
  })

  it('keeps what holds for two probes, and lists marks before the rest', () => {
    const moments = frameObjectFindings(
      [
        at(4, { marks: [mark], fill: fill(0.01), shot: 'open' }),
        at(4.5, { marks: [mark], fill: fill(0.01), shot: 'open' }),
        at(5, { fill: fill(0.01), shot: 'open' }),
        at(5.5, {
          fill: fill(0.01),
          shot: 'open',
          empty: [{ shot: 'make', el: 'div.block', share: 0.01, rect: [0, 0, 1, 1] }],
        }),
        at(6),
      ],
      { step: 0.5 },
    )
    expect(moments.map(m => m.kind)).toEqual(['mark', 'small'])
    expect(lookLines(moments)).toEqual([
      '[1] 4.0–5.0s #make — img.logo has div.input over part of it',
      '[2] 4.0–6.0s #open — everything on screen fits in 1.0% of the frame',
    ])
  })

  it("finds a website's header and footer kept through the film, and not one shot's label", () => {
    const corner = (text: string) => ({ shot: '', text, rect: [1500, 40, 300, 30] })
    const samples = [0, 1, 2, 3, 4, 5].map(t =>
      at(t, {
        shot: ['open', 'make', 'ship'][Math.floor(t / 2)],
        edge: [corner('AI PRODUCTION STUDIO'), ...(t < 2 ? [corner('Step 1')] : [])],
      }),
    )
    const moments = frameObjectFindings(samples, { step: 1 })
    expect(moments.map(m => m.kind)).toEqual(['chrome'])
    expect(lookLines(moments)).toEqual([
      '[1] 0.0–6.0s — the same words sit at the edges of shot after shot: "AI PRODUCTION STUDIO" — a page\'s header and footer, not a film\'s',
    ])
  })

  it('folds an arrangement colliding with itself into one moment', () => {
    const pair = (top: string, under: string, share: number) => ({
      shot: 'formats',
      top,
      under,
      share,
      rect: [0, 0, 1, 1],
      underRect: [0, 0, 1, 1],
    })
    const overlaps = [pair('div.art', 'div.format', 0.4), pair('div.art > i', 'div.format', 0.6)]
    const moments = frameObjectFindings([at(9, { overlaps }), at(9.5, { overlaps })], { step: 0.5 })
    expect(moments).toHaveLength(1)
    expect(moments[0].text).toBe('div.art > i sits over part of div.format (and 1 more pair then)')
  })
})
