/**
 * A custom shot's cursor is the engine's: ShotKit.cursor puts the arrow on
 * the stage, ShotKit.click brings it in, lands its tip on the button and
 * presses (the agent's own cursor was a hollow outline icon aimed by typed
 * numbers). `pitch motion look` then names what is on that frame. Real
 * Chromium on a one-shot film; skipped where none is installed.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import motionCommands from '../.pi/cli/motion.ts'
import { shellHtml } from '../.pi/lib/shell'
import { collectCommands } from '../.pi/lib/testing.ts'
import {
  localPageUrl,
  openStudioBrowser,
  seekFilm,
} from '../.pi/scripts/launch-video/lib/browser.mjs'

const hasChromium = existsSync(chromium.executablePath())
const tools = collectCommands(motionCommands)

const FACTORY = `Object.assign(window.ProjectShotFactories ||= {}, { clicker: {
  mount(el) {
    el.appendChild(ShotKit.h('<button class="go" style="position:absolute;left:900px;top:500px;width:200px;height:80px;font:40px sans-serif">Go</button>'));
  },
  animate(el, s, D) {
    const tl = gsap.timeline();
    const c = ShotKit.cursor(el);
    window.__press = ShotKit.click(tl, c, el.querySelector(".go"), 0.5);
    tl.to({}, { duration: D }, 0);
    return tl;
  },
} });`

describe.skipIf(!hasChromium)('the engine cursor in a custom shot', () => {
  const root = mkdtempSync(join(tmpdir(), 'shotkit-cursor-'))
  const ws = join(root, 'projects', 'film')
  let studio: Awaited<ReturnType<typeof openStudioBrowser>>
  let page: Awaited<ReturnType<typeof studio.newPage>>

  beforeAll(async () => {
    mkdirSync(join(ws, 'js', 'shots'), { recursive: true })
    symlinkSync(resolve('assets'), join(root, 'assets'))
    symlinkSync(resolve('engine'), join(root, 'engine'))
    writeFileSync(join(ws, 'js', 'shots', 'clicker.js'), FACTORY)
    writeFileSync(
      join(ws, 'shots.js'),
      'window.SHOTS = { brand: { bg: "#ffffff", ink: "#111111", accent: "#1385d6" }, shots: [{ id: "go", type: "clicker", dur: 3 }] };',
    )
    writeFileSync(
      join(ws, 'index.html'),
      shellHtml({ title: 'cursor', files: { styles: [], scripts: ['js/shots/clicker.js'] } }),
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

  const pointer = (t: number) =>
    seekFilm(page, t).then(() =>
      page.evaluate(() => {
        const node = document.querySelector('.ui-cursor') as HTMLElement
        const tip = node.querySelector('path')!.getBoundingClientRect()
        const ripple = getComputedStyle(node.querySelector('.ui-ripple')!)
        return {
          opacity: Number(getComputedStyle(node).opacity),
          x: tip.left,
          y: tip.top,
          ripple: Number(ripple.opacity),
        }
      }),
    )

  it('comes in after its cue, lands its tip on the button and presses it', async () => {
    expect(await page.evaluate(() => (window as any).__press)).toBeCloseTo(1.36, 2)
    expect((await pointer(0.3)).opacity).toBe(0)
    const landed = await pointer(1.25)
    expect(landed.opacity).toBe(1)
    // the arrow's path starts at its tip; the button's centre is (1000, 540)
    expect(Math.abs(landed.x - 1000)).toBeLessThan(4)
    expect(Math.abs(landed.y - 540)).toBeLessThan(4)
    const pressed = await pointer(1.5)
    expect(pressed.ripple).toBeGreaterThan(0)
    expect(pressed.ripple).toBeLessThan(1)
  })

  it('starts its travel from rest, so the eye can pick it up', async () => {
    const [a, b] = [await pointer(0.5), await pointer(0.5 + 1 / 30)]
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(4)
  })

  it('names what is on the frame for pitch motion look', async () => {
    const out = await tools.look.run({ at: [1.25] }, ws)
    expect(out).toMatch(/1\.25s · #go \(clicker\) → look\/look-1\.jpg/)
    expect(out).toMatch(/\] button\.go — box 200×80 at 900,500 · "Go"/)
    expect(out).toMatch(/\] div\.ui-cursor > svg — cursor 48×48/)
    expect(existsSync(join(ws, 'look', 'look-1.jpg'))).toBe(true)
  })
})
