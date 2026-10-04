/**
 * `pitch motion inspect` hands the agent the product's own pictures: the
 * site's videos and large images on one numbered sheet, and saves the chosen
 * ones into recon/media/. A launch film for a product whose homepage plays
 * eleven real films was built from grey boxes because the agent never saw
 * them. Runs inspect.mjs against a local site in real Chromium; skipped where
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
const svg = (w: number, h: number, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`

// A carousel the way trypitch.co builds one: posters only until played, the
// first item repeated, one item with its source, an empty src attribute.
const PAGE = `<!doctype html><html><head><title>Product</title></head><body><main>
  <h1>Make films</h1>
  <img src="/assets/logo.svg" width="600" height="200" alt="">
  <video src="" poster="/posters/alpha.svg" width="640" height="360"></video>
  <video poster="/posters/beta.svg" width="640" height="360"></video>
  <video src="/clips/alpha.mp4#t=0.6" poster="/posters/alpha.svg" width="640" height="360"></video>
  <img src="/shots/editor.svg" width="800" height="450" alt="The editor">
  <img src="/shots/thumb.svg" width="120" height="68" alt="">
</main></body></html>`

const FILES: Record<string, [string, string | Buffer]> = {
  '/': ['text/html', PAGE],
  '/assets/logo.svg': ['image/svg+xml', svg(600, 200, '#111')],
  '/posters/alpha.svg': ['image/svg+xml', svg(960, 540, '#1385d6')],
  '/posters/beta.svg': ['image/svg+xml', svg(960, 540, '#d6136a')],
  '/shots/editor.svg': ['image/svg+xml', svg(1600, 900, '#eee')],
  '/shots/thumb.svg': ['image/svg+xml', svg(960, 540, '#ccc')],
  '/clips/alpha.mp4': ['video/mp4', Buffer.from('alpha-clip')],
  '/clips/beta.mp4': ['video/mp4', Buffer.from('beta-clip')],
}

describe.skipIf(!hasChromium)('the page media inspect hands the agent', () => {
  let server: Server
  let site: string
  const ws = mkdtempSync(join(tmpdir(), 'page-media-'))

  beforeAll(async () => {
    server = createServer((req, res) => {
      const file = FILES[(req.url || '/').split('?')[0]]
      if (!file) return res.writeHead(404).end()
      res
        .writeHead(200, { 'content-type': file[0] })
        .end(req.method === 'HEAD' ? undefined : file[1])
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    site = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })
  afterAll(() => {
    server?.close()
    rmSync(ws, { recursive: true, force: true })
  })

  it('lists the videos and large images, draws them on a sheet and saves the chosen ones', async () => {
    // async: the site is served from this process
    const { stdout: out } = await promisify(execFile)(
      'node',
      [resolve('.pi/scripts/launch-video/inspect.mjs'), `--url=${site}`, '--save=all'],
      { cwd: ws, timeout: 120_000 },
    )
    expect(out).toContain('[1] video "alpha" 640×360\n')
    expect(out).toContain('[2] video "beta" 640×360 · a poster until played')
    expect(out).toContain('[3] image "The editor" 1600×900')
    expect(out).not.toMatch(/\[4\]/) // the logo and the thumbnail are left out
    expect(out).toMatch(/read recon\/media-127\.0\.0\.1-[0-9a-f]{12}\.jpg/)
    // beta's video stays hidden; it is named like its poster, as alpha's is
    expect(out).toContain('[2] recon/media/beta.mp4\n')
    expect(readFileSync(join(ws, 'recon/media/alpha.mp4'), 'utf8')).toBe('alpha-clip')
    expect(readFileSync(join(ws, 'recon/media/beta.mp4'), 'utf8')).toBe('beta-clip')
    expect(existsSync(join(ws, 'recon/media/the-editor.svg'))).toBe(true)
  })
})
