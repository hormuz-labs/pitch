/**
 * Recon saves the brand's own web fonts, including a display face that only
 * the section headings use. trypitch.co sets its h1 and body in the system
 * font and its brand in Instrument Serif on every h2; recon saved nothing, and
 * the agent set two films in Georgia, then stopped a third hunting for the
 * files. Runs recon.mjs against a local page in real Chromium; skipped where
 * none is installed.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hasChromium = existsSync(chromium.executablePath())
const FONT = readFileSync(resolve('assets/fonts/AtlasGroteskWeb-400.woff2'))

const PAGE = `<!doctype html><html><head><title>Product</title><style>
  @font-face { font-family: "Brand Serif"; src: url(/fonts/brand-serif.woff2) format("woff2"); font-weight: 400; }
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #202020; background: #fff; }
  h1 { font: 400 16px system-ui, sans-serif; }
  h2 { font: 400 68px "Brand Serif", Georgia, serif; }
</style></head><body><main>
  <h1>Product</h1><h2>Make something worth shipping.</h2><h2>Direct it.</h2>
  <p>Body copy in the system font.</p><a href="/start" style="background:#1385d6;color:#fff;padding:12px">Get started</a>
</main></body></html>`

describe.skipIf(!hasChromium)('recon fonts', () => {
  let server: Server
  let site: string
  const ws = mkdtempSync(join(tmpdir(), 'recon-fonts-'))

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/fonts/brand-serif.woff2')
        return res.writeHead(200, { 'content-type': 'font/woff2' }).end(FONT)
      if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
      res.writeHead(404).end()
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    site = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })
  afterAll(() => {
    server?.close()
    rmSync(ws, { recursive: true, force: true })
  })

  it('saves the web face the section headings are set in', async () => {
    // async: the site is served from this process
    await promisify(execFile)(
      'node',
      [resolve('.pi/scripts/launch-video/recon.mjs'), `--url=${site}`, '--no-logo'],
      { cwd: ws, timeout: 120_000 },
    )
    expect(readFileSync(join(ws, 'assets/fonts/BrandSerif-400.woff2'))).toEqual(FONT)
    expect(readFileSync(join(ws, 'recon/brand-tokens.md'), 'utf8')).toContain(
      '{ family: "Brand Serif", src: "assets/fonts/BrandSerif-400.woff2", weight: "400" }',
    )
  })
})
