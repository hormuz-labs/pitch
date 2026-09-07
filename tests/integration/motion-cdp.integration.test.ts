/**
 * The real round trip: a page on this disk, rendered by a browser that is not
 * on this machine.
 *
 * The studio image ships no Chromium (Dockerfile.base sets
 * PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1), so every motion_* script connects to the
 * CloakBrowser Manager over CDP. That browser cannot see the workspace, which
 * is the part worth testing end to end: the page and every file it pulls —
 * including ../../engine/, outside the workspace — are served into it by
 * request interception.
 *
 * Skipped unless CLOAK_MANAGER_URL points at a reachable manager, so `bun run
 * test:integration` stays green without one.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPTS = new URL('../../.pi/scripts/launch-video/', import.meta.url)
const browserLib = await import(new URL('lib/browser.mjs', SCRIPTS).href)
const { pixelDiffRatio } = await import(new URL('lib/png.mjs', SCRIPTS).href)

const MANAGER = process.env.CLOAK_MANAGER_URL
async function managerReachable(): Promise<boolean> {
  if (!MANAGER) return false
  try {
    const res = await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles`, {
      signal: AbortSignal.timeout(8000),
      headers: browserLib.managerHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

const live = await managerReachable()
const describeLive = live ? describe : describe.skip
if (!live) {
  console.warn(
    `skipping motion CDP integration tests — no manager at ${MANAGER ?? '(CLOAK_MANAGER_URL unset)'}`,
  )
}

describeLive('motion scripts drive the CloakBrowser over CDP', () => {
  let dir: string
  let studio: any

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'motion-cdp-'))
    // A page whose subresource sits OUTSIDE the workspace, the way index.html
    // reaches ../../engine/ — the case a plain static root would break.
    await writeFile(
      path.join(dir, 'engine.js'),
      'window.__READY = true; window.__DURATION = () => 3.5;',
    )
    await writeFile(
      path.join(dir, 'index.html'),
      `<!doctype html><meta charset="utf-8">
       <body style="margin:0;background:#123456">
         <h1 id="t" style="font:700 96px sans-serif;color:#fff">served</h1>
         <script src="./engine.js"></script>
       </body>`,
    )
    studio = await browserLib.openStudioBrowser({
      viewport: { width: 640, height: 360 },
      log: () => {},
    })
  }, 120_000)

  afterAll(async () => {
    await studio?.close().catch(() => {})
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('connects to the manager rather than launching a browser', () => {
    expect(studio.mode).toBe('cdp')
    expect(studio.endpoint).toContain('/api/profiles/')
  })

  it('serves the workspace into the remote browser, subresources included', async () => {
    const page = await studio.newPage()
    await page.goto(browserLib.localPageUrl(path.join(dir, 'index.html')), {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction('window.__READY === true', null, { timeout: 20_000 })
    expect(await page.textContent('#t')).toBe('served')
    expect(await page.evaluate('window.__DURATION()')).toBe(3.5)
    await page.close()
  }, 60_000)

  it('404s a missing file instead of hanging or reaching the network', async () => {
    const page = await studio.newPage()
    const res = await page.goto(browserLib.localPageUrl(path.join(dir, 'nope.html')), {
      waitUntil: 'domcontentloaded',
    })
    expect(res?.status()).toBe(404)
    await page.close()
  }, 60_000)

  it('leaves other origins alone', async () => {
    const page = await studio.newPage()
    const res = await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
    expect(res?.ok()).toBe(true)
    expect(await page.title()).toMatch(/example/i)
    await page.close()
  }, 60_000)

  it('captures at the requested scale, so a 4K render is really 4K', async () => {
    const scaled = await browserLib.openStudioBrowser({
      viewport: { width: 320, height: 180 },
      deviceScaleFactor: 2,
      log: () => {},
    })
    try {
      const page = await scaled.newPage()
      await page.goto(browserLib.localPageUrl(path.join(dir, 'index.html')), {
        waitUntil: 'domcontentloaded',
      })
      const cdp = await page.context().newCDPSession(page)
      // capture.mjs uses clip.scale because raw CDP otherwise returns CSS pixels.
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 320, height: 180, scale: 2 },
      })
      const shot = Buffer.from(data, 'base64')
      expect(shot.readUInt32BE(16)).toBe(640)
      expect(shot.readUInt32BE(20)).toBe(360)
    } finally {
      await scaled.close()
    }
  }, 120_000)

  it('renders the same seek to the same picture, so the audit gate means something', async () => {
    const page = await studio.newPage()
    await page.goto(browserLib.localPageUrl(path.join(dir, 'index.html')), {
      waitUntil: 'domcontentloaded',
    })
    const first = await page.screenshot()
    await page.evaluate(() => {
      document.body.style.background = '#654321'
    })
    await page.evaluate(() => {
      document.body.style.background = '#123456'
    })
    const second = await page.screenshot()
    // Byte equality is NOT the assertion: the CloakBrowser perturbs its own
    // rasterization, so the same picture can encode to a different file.
    expect(pixelDiffRatio(first, second)).toBeLessThan(0.001)
    await page.close()
  }, 60_000)
})
