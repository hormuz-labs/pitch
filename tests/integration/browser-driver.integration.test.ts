/**
 * The agent's browser driver against a real Chromium: every op the demo
 * skill uses, through the same parser the CLI uses.
 *
 * Skipped where Chromium cannot launch (the studio image ships none).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Browser, type BrowserContext, chromium } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseBrowserCommand } from '../../.pi/lib/browser-command.ts'
import {
  type BrowserDriver,
  createBrowserDriver,
} from '../../apps/api/src/render/utils/browser-driver.ts'

const chromiumLaunches = await (async () => {
  try {
    const b = await chromium.launch()
    await b.close()
    return true
  } catch {
    return false
  }
})()
const describeLive = chromiumLaunches ? describe : describe.skip
if (!chromiumLaunches)
  console.warn('skipping browser-driver integration tests — chromium will not launch here')

const PAGE = `<!doctype html><title>Driver test</title>
<nav id="toc"><a href="#culture" id="c">Culture</a> <a href="#transport">Transport</a></nav>
<input id="name" placeholder="Name">
<select id="size"><option>small</option><option>large</option></select>
<label><input type="checkbox" id="agree"> Agree</label>
<button id="go" onclick="document.title='clicked ' + (++window.clicks)">Go</button>
<button id="ask" onclick="window.answer = confirm('Sure?')">Ask</button>
<div style="height:2400px"></div>
<h2 id="culture">Culture</h2><button id="far" onclick="document.title='far'">Far button</button>
<div style="height:600px"></div>
<script>window.clicks = 0</script>`

describeLive('browser driver (real Chromium)', () => {
  let browser: Browser
  let context: BrowserContext
  let driver: BrowserDriver
  let ws: string
  const run = (command: string) => driver.run(parseBrowserCommand(command))
  const refFor = async (label: RegExp) => {
    const { text } = await run('snapshot')
    const line = text.split('\n').find(l => label.test(l))
    const ref = line?.match(/\[ref=(\w+)\]/)?.[1]
    if (!ref) throw new Error(`no ref for ${label} in\n${text}`)
    return ref
  }

  beforeAll(async () => {
    browser = await chromium.launch()
  })
  afterAll(async () => {
    await browser?.close()
  })
  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-ws-'))
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.setContent(PAGE)
    driver = createBrowserDriver(context, ws)
    return async () => {
      await context.close()
      fs.rmSync(ws, { recursive: true, force: true })
    }
  })

  it('snapshots the page and one region with refs', async () => {
    const { text } = await run('snapshot')
    expect(text).toMatch(/Page: Driver test/)
    expect(text).toMatch(/button "Go" \[ref=e\d+\]/)
    const region = await run('snapshot "#toc"')
    expect(region.text).toMatch(/link "Transport"/)
    expect(region.text).not.toMatch(/button "Go"/)
  })

  it('clicks with a real mouse glide and reports the box', async () => {
    const ref = await refFor(/button "Go"/)
    const result = await run(`click ${ref}`)
    expect(result.text).toMatch(/click .* done/)
    expect(result.box).toMatchObject({ hand: false })
    expect(await driver.page().title()).toBe('clicked 1')
    // The pointer really moved there (the capture draws this cursor).
    const b = result.box!
    const hovered = await driver
      .page()
      .evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: b.ax, y: b.ay })
    expect(hovered).toBe('go')
  })

  it('scrolls an off-screen target into view before clicking it', async () => {
    const ref = await refFor(/button "Far button"/)
    expect(await driver.page().evaluate(() => scrollY)).toBe(0)
    await run(`click ${ref}`)
    expect(await driver.page().title()).toBe('far')
    expect(await driver.page().evaluate(() => scrollY)).toBeGreaterThan(1500)
  })

  it('types visibly into a field, selects, checks', async () => {
    await run(`fill ${await refFor(/textbox "Name"/)} "Weekly usage"`)
    expect(await driver.page().inputValue('#name')).toBe('Weekly usage')
    await run(`select ${await refFor(/combobox/)} large`)
    expect(await driver.page().inputValue('#size')).toBe('large')
    await run(`check ${await refFor(/checkbox "Agree"/)}`)
    expect(await driver.page().isChecked('#agree')).toBe(true)
  })

  it('evaluates page and element functions, even with $() in them', async () => {
    const page = await run('eval "() => document.title + \' $(id)\'"')
    expect(page.text).toContain('Result: "Driver test $(id)"')
    const el = await run(`eval "el => el.id" ${await refFor(/button "Go"/)}`)
    expect(el.text).toContain('Result: "go"')
  })

  it('presses keys, scrolls, waits', async () => {
    await driver.page().focus('#name')
    await run('type ab')
    await run('press Backspace')
    expect(await driver.page().inputValue('#name')).toBe('a')
    await run('scroll 500')
    expect(await driver.page().evaluate(() => scrollY)).toBeGreaterThan(400)
    const started = Date.now()
    await run('wait 200')
    expect(Date.now() - started).toBeGreaterThanOrEqual(190)
  })

  it('handles dialogs by policy, dismissing by default', async () => {
    const ask = await refFor(/button "Ask"/)
    const dismissed = await run(`click ${ask}`)
    expect(dismissed.text).toMatch(/confirm "Sure\?" was dismissed/)
    expect(await driver.page().evaluate(() => (window as any).answer)).toBe(false)
    await run('dialog-accept')
    await run(`click ${ask}`)
    expect(await driver.page().evaluate(() => (window as any).answer)).toBe(true)
  })

  it('opens, lists, selects and closes tabs', async () => {
    await run('tab-new')
    expect(context.pages()).toHaveLength(2)
    const list = await run('tab-list')
    expect(list.text).toMatch(/1 \(current\)/)
    await run('tab-select 0')
    expect(await driver.page().title()).toBe('Driver test')
    await run('tab-close 1')
    expect(context.pages()).toHaveLength(1)
  })

  it('writes screenshots only inside the workspace', async () => {
    await run('screenshot --filename recording/shot.png')
    expect(fs.statSync(path.join(ws, 'recording/shot.png')).size).toBeGreaterThan(0)
    await expect(driver.run({ op: 'screenshot', file: '../escape.png' })).rejects.toThrow(
      /outside the workspace/,
    )
    await expect(driver.run({ op: 'screenshot', file: '/tmp/x.png' })).rejects.toThrow(
      /workspace-relative/,
    )
  })

  it('fails a stale ref quickly with a clear error', async () => {
    const started = Date.now()
    await expect(run('click e9999')).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(20_000)
  })

  it('measures boxes for callouts', async () => {
    const box = await driver.box({ selector: '#go' })
    expect(box?.w).toBeGreaterThan(0)
    expect(await driver.viewport()).toEqual({ width: 1280, height: 720 })
  })
})
