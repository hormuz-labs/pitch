/**
 * The words on a frame: a card over another card's heading or a bubble over
 * a caption fails the audit, a moment of overlap (a wipe, an exit) does not,
 * and a caret over a prompt that is never typed is a note. The page checks
 * run in real Chromium on hand-built frames; they skip where none is installed.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { frameTextFindings, measureFrameText } from '../.pi/scripts/launch-video/lib/frame-text.mjs'

const hasChromium = existsSync(chromium.executablePath())

/** One shot on a 1920×1080 stage, the engine's way: .shot[id] > content. */
const frame = (body: string) => `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #fff; font: 64px sans-serif; }
  .shot { position: absolute; inset: 0; }
  .card { position: absolute; width: 600px; height: 400px; border-radius: 24px; padding: 40px; box-sizing: border-box; }
  h2 { margin: 0; font-size: 64px; }
</style></head><body><div class="shot" id="studio">${body}</div></body></html>`

describe.skipIf(!hasChromium)('measureFrameText in the page', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  let page: Awaited<ReturnType<typeof browser.newPage>>
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  })
  afterAll(async () => {
    await browser?.close()
  })
  const measure = async (body: string) => {
    await page.setContent(frame(body))
    return page.evaluate(measureFrameText)
  }

  it('finds a card sitting on the heading of the card behind it', async () => {
    const { covered } = await measure(`
      <div class="card deck" style="left:200px;top:300px;background:#f6f6f6"><h2>Ready to share.</h2></div>
      <div class="card film" style="left:420px;top:260px;background:#111;color:#fff"><h2>Your idea.</h2></div>`)
    expect(covered).toEqual([
      expect.objectContaining({
        shot: 'studio',
        text: 'Ready to share.',
        by: expect.stringMatching(/^div\.card\.film/),
      }),
    ])
  })

  it('finds a graphic over a title and words over words', async () => {
    const { covered } = await measure(`
      <div class="card film" style="left:200px;top:200px;background:#111;color:#fff">
        <h2 class="title">Your idea.</h2>
        <div class="stacks" style="position:absolute;left:20px;top:30px;width:400px;height:90px;background:#f6f6f6"></div>
      </div>
      <h2 class="caption" style="position:absolute;left:1000px;top:700px">Make the title bigger.</h2>
      <h2 class="note" style="position:absolute;left:1010px;top:705px">Every revision.</h2>`)
    const by = Object.fromEntries(covered.map(c => [c.text, c.by]))
    expect(by['Your idea.']).toBe('div.stacks')
    expect(by['Make the title bigger.']).toBe('h2.note')
  })

  it('leaves alone words on their own card, under a frame line, a faint veil or behind their mask', async () => {
    const { covered } = await measure(`
      <div class="card" style="left:100px;top:100px;background:#111;color:#fff"><h2>On its own card.</h2></div>
      <h2 style="position:absolute;left:900px;top:120px">Selected title</h2>
      <div class="select-frame" style="position:absolute;left:880px;top:100px;width:600px;height:120px;border:3px solid #1385d6"></div>
      <h2 style="position:absolute;left:100px;top:700px">Under a veil</h2>
      <div style="position:absolute;left:80px;top:680px;width:700px;height:140px;background:#000;opacity:.1"></div>
      <div style="position:absolute;left:1000px;top:700px;height:80px;overflow:hidden"><h2 style="transform:translateY(120%)">Rising through a mask</h2></div>
      <div style="position:absolute;inset:0"></div>`)
    expect(covered).toEqual([])
  })

  it('sees an overlay that ignores the pointer', async () => {
    const { covered } = await measure(`
      <h2 style="position:absolute;left:300px;top:300px">Hidden under glass</h2>
      <div class="bubble" style="position:absolute;left:280px;top:280px;width:800px;height:140px;background:#f6f6f6;pointer-events:none"></div>`)
    expect(covered.map(c => c.by)).toEqual(['div.bubble'])
    expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).toBe('auto')
  })

  it('reads a caret and the words before it', async () => {
    const { carets } = await measure(`
      <div class="brief-carrier" style="position:absolute;left:400px;top:400px;font-size:64px">Make a launch film.<i class="brief-caret" style="display:inline-block;width:3px;height:60px;background:#000"></i></div>`)
    expect(carets).toEqual([
      expect.objectContaining({
        shot: 'studio',
        el: 'div.brief-carrier',
        read: 'Make a launch film.',
      }),
    ])
  })
})

const over = (t: number, shot = 'studio', by = 'div.card.film', text = 'Ready to share.') => ({
  t,
  covered: [{ shot, el: 'h2', text, by, share: 0.6 }],
  carets: [],
})
const caret = (t: number, read: string, at = 0.98) => ({
  t,
  covered: [],
  carets: [{ shot: 'brief', el: 'div.brief-carrier', text: read, read, at }],
})

describe('frameTextFindings', () => {
  it('fails words covered for a second, naming what covers them and when', () => {
    const [line] = frameTextFindings([over(9.5), over(10), over(10.5), over(11)])
    expect(line.level).toBe('fail')
    expect(line.msg).toContain(
      '#studio "Ready to share." (h2) under div.card.film, 9.5–11.0s, 60% of it',
    )
  })

  it('lets a wipe or an exit cross the words for a moment', () => {
    expect(frameTextFindings([over(9.5), over(10)])).toEqual([])
    const crossing = ['One brief.', 'Research.', 'Make.'].map((text, i) =>
      over(9.5 + i / 2, 'studio', 'div.mask', text),
    )
    expect(frameTextFindings(crossing)).toEqual([])
  })

  it('counts the words covered whatever covers them, naming what does most', () => {
    const moving = [over(10, 'studio', 'div.art-stacks > i'), over(10.5), over(11), over(11.5)]
    const [line] = frameTextFindings(moving)
    expect(line.msg).toContain('under div.card.film, 10.0–11.5s')
  })

  it('keeps a scoped run to its shots', () => {
    const samples = [over(1, 'idea'), over(1.5, 'idea'), over(2, 'idea')]
    expect(frameTextFindings(samples, ['studio'])).toEqual([])
    expect(frameTextFindings(samples, ['idea'])).toHaveLength(1)
  })

  it('notes a caret whose prompt never changes, not one that is typed and then holds', () => {
    const [line] = frameTextFindings([
      caret(4, 'Make a launch film.'),
      caret(4.5, 'Make a launch film.'),
    ])
    expect(line.level).toBe('warn')
    expect(line.msg).toContain('#brief "Make a launch film." (div.brief-carrier)')
    const typed = [
      caret(4, 'Make a', 0.4),
      caret(4.5, 'Make a launch film.'),
      caret(5, 'Make a launch film.'),
      caret(5.5, 'Make a launch film.'),
    ]
    expect(frameTextFindings(typed)).toEqual([])
    expect(frameTextFindings([caret(4, 'Make a launch film.')])).toEqual([])
  })
})
