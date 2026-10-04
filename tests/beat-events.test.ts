/**
 * A beat event is invisible until its moment. A `fromTo` renders its start
 * state when it is built, so the flash painted the whole shot at 0.9 from
 * frame one until its beat (found on 0xAdnan's improv-launch branch), and a
 * swap hid the words it replaces from the shot's first frame. Real
 * Chromium on a one-shot film; skipped where none is installed.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shellHtml } from '../.pi/lib/shell'
import {
  localPageUrl,
  openStudioBrowser,
  seekFilm,
} from '../.pi/scripts/launch-video/lib/browser.mjs'

const hasChromium = existsSync(chromium.executablePath())

const FACTORY = `Object.assign(window.ProjectShotFactories ||= {}, { plain: {
  mount(el) { el.appendChild(ShotKit.h('<h1 class="headline" style="position:absolute;left:200px;top:400px;margin:0;font:120px sans-serif">Before</h1>')); },
  animate(el, s, D) { const tl = gsap.timeline(); tl.to({}, { duration: D }, 0); return tl; },
} });`

describe.skipIf(!hasChromium)('beat events', () => {
  const root = mkdtempSync(join(tmpdir(), 'beat-events-'))
  const ws = join(root, 'projects', 'film')
  let studio: Awaited<ReturnType<typeof openStudioBrowser>>
  let page: Awaited<ReturnType<typeof studio.newPage>>

  beforeAll(async () => {
    mkdirSync(join(ws, 'js', 'shots'), { recursive: true })
    symlinkSync(resolve('assets'), join(root, 'assets'))
    symlinkSync(resolve('engine'), join(root, 'engine'))
    writeFileSync(join(ws, 'js', 'shots', 'plain.js'), FACTORY)
    writeFileSync(
      join(ws, 'shots.js'),
      `window.SHOTS = { brand: { bg: "#ffffff", ink: "#111111", accent: "#1385d6" }, shots: [
        { id: "flash", type: "plain", dur: 3, beats: [{ at: 1.5, kind: "flash" }] },
        { id: "rest", type: "plain", dur: 3 },
        { id: "swap", type: "plain", dur: 3, beats: [{ at: 1.5, kind: "swap", sel: ".headline", text: "After" }] },
      ] };`,
    )
    writeFileSync(
      join(ws, 'index.html'),
      shellHtml({ title: 'beats', files: { styles: [], scripts: ['js/shots/plain.js'] } }),
    )
    studio = await openStudioBrowser()
    page = await studio.newPage()
    await page.goto(localPageUrl(join(ws, 'index.html')), { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as any).__READY === true)
  })
  afterAll(async () => {
    await studio?.close()
    rmSync(root, { recursive: true, force: true })
  })

  const probe = (t: number, shot: string) =>
    seekFilm(page, t).then(() =>
      page.evaluate(id => {
        const el = document.getElementById(id)!
        const flash = el.querySelector('.beat-flash')
        const head = el.querySelector('.headline') as HTMLElement
        return {
          flash: flash ? Number(getComputedStyle(flash).opacity) : null,
          head: Number(getComputedStyle(head).opacity),
          text: head.textContent,
        }
      }, shot),
    )

  it('flashes on its beat and not before', async () => {
    expect((await probe(0.5, 'flash')).flash).toBe(0)
    expect((await probe(1.55, 'flash')).flash).toBeGreaterThan(0.3)
    expect((await probe(2.4, 'flash')).flash).toBe(0)
    expect((await probe(0.5, 'flash')).flash).toBe(0) // and again after seeking back
  })

  it('swaps the words on its beat, and shows the old ones until then', async () => {
    expect(await probe(6.5, 'swap')).toMatchObject({ head: 1, text: 'Before' })
    expect(await probe(8.2, 'swap')).toMatchObject({ head: 1, text: 'After' })
    expect(await probe(6.5, 'swap')).toMatchObject({ head: 1, text: 'Before' })
  })
})
