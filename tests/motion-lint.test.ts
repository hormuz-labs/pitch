import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { measureMotion, motionFindings } from '../.pi/scripts/launch-video/lib/motion-lint.mjs'

const page = {
  kind: 'page',
  shot: 'slide',
  t: 12.2,
  el: 'div.ds',
  travel: 1400,
  share: 0.73,
  fills: 1,
}
const pop = {
  kind: 'pop',
  shot: 'inputs',
  t: 2.17,
  el: 'div.card',
  travel: 1500,
  share: 0.78,
  ease: 'expo.out',
  firstFrame: 404,
}

describe('motionFindings', () => {
  it('fails a composition sliding as one page and names where', () => {
    const [line] = motionFindings([page])
    expect(line.level).toBe('fail')
    expect(line.msg).toContain('#slide div.ds at 12.2s')
    expect(line.msg).toContain('fills 100% of the frame, travels 73% of it')
  })

  it('notes a long move at full speed on its first frame, without failing', () => {
    const [line] = motionFindings([pop])
    expect(line.level).toBe('warn')
    expect(line.msg).toContain('1500px on expo.out, 404px in frame one')
  })

  it('says nothing about a film without either, and keeps a scoped run to its shots', () => {
    expect(motionFindings([])).toEqual([])
    expect(motionFindings([page, pop], ['inputs']).map(l => l.level)).toEqual(['warn'])
  })
})

const block = (shot: string, t: number, text: string) => ({
  kind: 'block',
  shot,
  t,
  el: 'span',
  text,
})

describe('headings that arrive whole', () => {
  it('notes a film whose headings mostly slide in already written', () => {
    const [line] = motionFindings([
      block('studio', 8.9, 'A whole studio.'),
      block('direct', 17.2, 'Select. Say it. See it.'),
      { kind: 'split', el: 'h1', shot: 'idea' },
    ])
    expect(line.level).toBe('warn')
    expect(line.msg).toContain('#studio span at 8.9s "A whole studio."')
    expect(line.msg).toContain('#direct span at 17.2s "Select. Say it. See it."')
  })

  it('says nothing when most headings arrive word by word, or only one is whole', () => {
    const split = (shot: string) => ({ kind: 'split', el: 'h1', shot })
    expect(
      motionFindings([
        block('a', 1, 'One two'),
        block('b', 2, 'Three four'),
        split('c'),
        split('d'),
      ]),
    ).toEqual([])
    expect(motionFindings([block('a', 1, 'One two')])).toEqual([])
  })
})

const hasChromium = existsSync(chromium.executablePath())

describe.skipIf(!hasChromium)('measureMotion in the page', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  let page: Awaited<ReturnType<typeof browser.newPage>>
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  })
  afterAll(async () => {
    await browser?.close()
  })

  /** A one-shot film: `build(tl, q)` adds the shot's tweens to a timeline labelled "studio". */
  const rowsOf = async (body: string, build: string) => {
    await page.setContent(`<!doctype html><html><head><style>
      html, body { margin: 0; width: 1920px; height: 1080px; font: 40px sans-serif; }
      .shot { position: absolute; inset: 0; overflow: hidden; }
      .mask { position: absolute; overflow: hidden; }
      .big { display: block; font-size: 236px; line-height: 1.1; white-space: nowrap; }
    </style></head><body><div class="shot" id="studio">${body}</div></body></html>`)
    await page.addScriptTag({ path: 'assets/gsap/gsap.min.js' })
    await page.evaluate(`(() => {
      gsap.registerEase('move', gsap.parseEase('power2.inOut'))
      const tl = gsap.timeline({ paused: true }).addLabel('studio', 0)
      const q = s => document.querySelector(s)
      ${build}
      window.__MASTER = tl
    })()`)
    return page.evaluate(measureMotion)
  }

  it('lets a word rise fast through its own mask, or out of a heavy blur', async () => {
    const rows = await rowsOf(
      `<div class="mask" style="left:100px;top:100px;height:290px"><span class="big rise">Directed.</span></div>
       <span class="big haze" style="position:absolute;left:100px;top:600px">Ready.</span>`,
      `tl.fromTo(q('.rise'), { yPercent: 115 }, { yPercent: 0, duration: 0.6, ease: 'expo.out' }, 0.5)
       tl.fromTo(q('.haze'), { y: 300, filter: 'blur(20px)' }, { y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'expo.out' }, 1)`,
    )
    expect(rows.filter((r: { kind: string }) => r.kind === 'pop')).toEqual([])
  })

  it('still notes a word or a card at full speed in plain sight', async () => {
    const rows = await rowsOf(
      `<span class="big bare" style="position:absolute;left:100px;top:100px">Directed.</span>
       <div class="card" style="position:absolute;left:600px;top:300px;width:600px;height:400px;background:#111"></div>`,
      `tl.fromTo(q('.bare'), { yPercent: 115 }, { yPercent: 0, duration: 0.6, ease: 'expo.out' }, 0.5)
       tl.fromTo(q('.card'), { y: 1080 }, { y: 0, duration: 0.6, ease: 'expo.out' }, 1)`,
    )
    expect(
      rows.filter((r: { kind: string }) => r.kind === 'pop').map((r: { el: string }) => r.el),
    ).toEqual(['span.big.bare', 'div.card'])
  })

  it('tells a heading that slides in whole from one that arrives word by word or is typed', async () => {
    const rows = await rowsOf(
      `<div class="mask" style="left:100px;top:60px;height:150px"><span class="whole" style="display:block;font-size:120px">A whole studio.</span></div>
       <h1 class="split" style="position:absolute;left:100px;top:400px;font-size:120px;margin:0"><span class="w">Select.</span> <span class="w">Say</span> <span class="w">it.</span></h1>
       <div class="typed" style="position:absolute;left:100px;top:700px;font-size:120px">One brief.</div>
       <div class="small" style="position:absolute;left:100px;top:950px;font-size:30px">One agent. Any starting point.</div>`,
      `tl.fromTo(q('.whole'), { yPercent: 115 }, { yPercent: 0, duration: 0.8 }, 0.2)
       tl.from(document.querySelectorAll('.w'), { yPercent: 100, opacity: 0, stagger: 0.1, duration: 0.5 }, 1)
       tl.fromTo(q('.typed'), { opacity: 0, text: '' }, { opacity: 1, text: 'One brief.', duration: 1 }, 2)
       tl.fromTo(q('.small'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 3)`,
    )
    expect(rows.filter((r: { kind: string }) => r.kind === 'block')).toEqual([
      expect.objectContaining({ shot: 'studio', el: 'span.whole', text: 'A whole studio.' }),
    ])
    expect(rows.filter((r: { kind: string }) => r.kind === 'split')).toEqual([
      { kind: 'split', el: 'h1.split', shot: 'studio' },
    ])
  })
})
