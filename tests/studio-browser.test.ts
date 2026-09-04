/**
 * The studio's browser plumbing: there is no Chromium in the image, so every
 * motion_* script reaches the CloakBrowser over CDP and is served the
 * workspace through request interception. These are the pure parts of that —
 * the URL mapping, the manager endpoint resolution and the frame comparison
 * the audit's gates rest on. The live CDP round trip is in
 * tests/integration/motion-cdp.integration.test.ts.
 */
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const SCRIPTS = new URL('../.pi/skills/launch-video/scripts/', import.meta.url)
const browser = await import(new URL('lib/browser.mjs', SCRIPTS).href)
const png = await import(new URL('lib/png.mjs', SCRIPTS).href)

describe('local files served into a remote browser', () => {
  it('maps an absolute path onto the studio.local origin and back', () => {
    const url = browser.localPageUrl('/app/projects/acme/index.html')
    expect(url).toBe('http://studio.local/app/projects/acme/index.html')
    expect(browser.localPathFromUrl(url)).toBe('/app/projects/acme/index.html')
  })

  it('resolves a relative reference the way the filesystem does', () => {
    // index.html pulls ../../engine/js/compiler.js; because the URL path IS the
    // filesystem path, the browser's own resolution lands on the real file.
    const page = browser.localPageUrl('/app/projects/acme/index.html')
    const asset = new URL('../../engine/js/compiler.js', page).href
    expect(browser.localPathFromUrl(asset)).toBe('/app/engine/js/compiler.js')
  })

  it('keeps a query string (the audit loads index.html?audit)', () => {
    expect(browser.localPageUrl('/w/index.html', '?audit')).toBe(
      'http://studio.local/w/index.html?audit',
    )
    expect(browser.localPageUrl('/w/index.html', 'audit')).toBe(
      'http://studio.local/w/index.html?audit',
    )
  })

  it('survives spaces and unicode in a workspace name', () => {
    const p = '/app/projects/my proj — v2/index.html'
    expect(browser.localPathFromUrl(browser.localPageUrl(p))).toBe(p)
  })

  it('claims nothing outside its own origin', () => {
    expect(browser.localPathFromUrl('https://example.com/index.html')).toBeNull()
    expect(browser.localPathFromUrl('http://studio.local.evil.com/x')).toBeNull()
    expect(browser.localPathFromUrl('not a url')).toBeNull()
  })

  it('serves the content types the engine needs', () => {
    expect(browser.contentTypeFor('/x/compiler.js')).toMatch(/^text\/javascript/)
    expect(browser.contentTypeFor('/x/shots.css')).toMatch(/^text\/css/)
    expect(browser.contentTypeFor('/x/logo.svg')).toBe('image/svg+xml')
    expect(browser.contentTypeFor('/x/Brand.woff2')).toBe('font/woff2')
    expect(browser.contentTypeFor('/x/vo.wav')).toBe('audio/wav')
    expect(browser.contentTypeFor('/x/mystery')).toBe('application/octet-stream')
  })
})

describe('CDP endpoint resolution', () => {
  it('prefers the flag, then the env var, then the manager', () => {
    const prev = process.env.STUDIO_CDP_URL
    try {
      process.env.STUDIO_CDP_URL = 'http://env-endpoint/cdp'
      expect(browser.explicitCdpUrl('http://flag/cdp')).toBe('http://flag/cdp')
      expect(browser.explicitCdpUrl(null)).toBe('http://env-endpoint/cdp')
      delete process.env.STUDIO_CDP_URL
      // Nothing explicit → null, which sends openStudioBrowser to the manager.
      expect(browser.explicitCdpUrl(null)).toBeNull()
      // A bare `--cdp` with no value must not become the string "true".
      expect(browser.explicitCdpUrl(true)).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.STUDIO_CDP_URL
      else process.env.STUDIO_CDP_URL = prev
    }
  })

  it('builds the manager profile CDP url and trims a trailing slash', () => {
    expect(browser.cdpHttpUrl('abc', 'http://m:8080')).toBe('http://m:8080/api/profiles/abc/cdp')
    const prev = process.env.CLOAK_MANAGER_URL
    process.env.CLOAK_MANAGER_URL = 'https://manager.example.com/'
    expect(browser.managerBaseUrl()).toBe('https://manager.example.com')
    if (prev === undefined) delete process.env.CLOAK_MANAGER_URL
    else process.env.CLOAK_MANAGER_URL = prev
  })

  it('only sends an Authorization header when a token is configured', () => {
    const prev = process.env.CLOAK_MANAGER_AUTH_TOKEN
    delete process.env.CLOAK_MANAGER_AUTH_TOKEN
    expect(browser.managerHeaders()).toEqual({})
    process.env.CLOAK_MANAGER_AUTH_TOKEN = 'sekrit'
    expect(browser.managerHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sekrit',
    })
    if (prev === undefined) delete process.env.CLOAK_MANAGER_AUTH_TOKEN
    else process.env.CLOAK_MANAGER_AUTH_TOKEN = prev
  })
})

/** A minimal 8-bit RGB PNG with filter 0 on every row. */
function makePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
) {
  const raw = Buffer.alloc(height * (1 + width * 3))
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(8 + body.length + 4)
    out.writeUInt32BE(body.length, 0)
    out.write(type, 4, 'ascii')
    body.copy(out, 8)
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 8 + body.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf: Buffer) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

describe('frame comparison (the audit gates rest on this)', () => {
  const flat = (r: number, g: number, b: number) => () => [r, g, b] as [number, number, number]

  it('decodes an 8-bit RGB PNG', () => {
    const img = png.decodePng(makePng(4, 3, flat(10, 20, 30)))
    expect(img).toMatchObject({ width: 4, height: 3, channels: 3 })
    expect([...img.data.subarray(0, 3)]).toEqual([10, 20, 30])
  })

  it('calls two identical frames identical', () => {
    const a = makePng(64, 64, flat(12, 34, 56))
    expect(png.pixelDiffRatio(a, makePng(64, 64, flat(12, 34, 56)))).toBe(0)
  })

  it('ignores rasterization noise but sees a real cut', () => {
    // This is the case that made the audit's old byte comparison unusable: the
    // CloakBrowser re-renders the same seek a shade differently, and PNG
    // compression turns that into a wholly different file.
    const base = makePng(64, 64, flat(100, 100, 100))
    const noisy = makePng(64, 64, (x, y) => [100 + ((x + y) % 2), 100, 100])
    expect(png.pixelDiffRatio(base, noisy)).toBeLessThan(0.001)
    expect(png.pixelDiffRatio(base, makePng(64, 64, flat(200, 40, 40)))).toBe(1)
  })

  it('reports a size change as a total difference', () => {
    expect(png.pixelDiffRatio(makePng(64, 64, flat(0, 0, 0)), makePng(32, 32, flat(0, 0, 0)))).toBe(
      1,
    )
  })
})

describe('nothing in the studio reaches for a local Chromium', () => {
  const REPO = new URL('..', import.meta.url).pathname

  // Executable files only — the skills' prose says "playwright install is never
  // the answer", and that sentence is the point, not a violation.
  const CODE = ['--include=*.ts', '--include=*.js', '--include=*.mjs', '--include=*.cjs']

  function grep(pattern: string, ...dirs: string[]): string[] {
    try {
      const out = execFileSync('grep', ['-rnE', ...CODE, pattern, ...dirs], {
        encoding: 'utf8',
      }).trim()
      return out ? out.split('\n') : []
    } catch {
      return [] // grep exits 1 when it matches nothing
    }
  }

  // The places allowed to name these: browser.mjs and manager-browser.ts
  // connect over CDP rather than launching, and sandbox.ts names the install
  // command only to say the sandbox is what stops it.
  const ALLOWED = [
    '/scripts/lib/browser.mjs:',
    '/render/utils/manager-browser.ts:',
    '/.pi/lib/sandbox.ts:',
  ]
  const offenders = (lines: string[]) => lines.filter(l => !ALLOWED.some(a => l.includes(a)))

  it('has no chromium.launch left in the skills or the api', () => {
    expect(offenders(grep('chromium\\.launch\\(', `${REPO}.pi`, `${REPO}apps/api/src`))).toEqual([])
  })

  it('never tells the agent to install a browser', () => {
    expect(
      offenders(grep('playwright install|install chromium', `${REPO}.pi`, `${REPO}apps/api/src`)),
    ).toEqual([])
  })

  it('never calls setContent, which does not complete over a CDP connection', () => {
    // Every renderer writes its HTML and navigates to it through the
    // studio.local route instead.
    expect(offenders(grep('\\.setContent\\(', `${REPO}.pi`, `${REPO}apps/api/src`))).toEqual([])
  })
})

describe('the api serves local files into the remote browser the same way', () => {
  it('agrees with the skill library on the URL mapping', async () => {
    const api = await import('../apps/api/src/render/utils/manager-browser')
    const p = '/app/projects/acme/deck.html'
    expect(api.localPageUrl(p)).toBe(browser.localPageUrl(p))
    expect(api.localPathFromUrl(api.localPageUrl(p))).toBe(p)
    expect(api.localPathFromUrl('https://example.com/deck.html')).toBeNull()
    expect(api.contentTypeFor('/x/deck.html')).toMatch(/^text\/html/)
    expect(api.contentTypeFor('/x/mystery')).toBe('application/octet-stream')
  })
})
