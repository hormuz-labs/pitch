import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { selectBrowserReachableHost, startSlideshowServer } from '../.pi/lib/slideshow-server'
import { collectCommands } from '../.pi/lib/testing.ts'

describe('startSlideshowServer', () => {
  const cleanup: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map(fn => fn()))
  })

  it('serves slideshow HTML and prepared local images over a browser-safe HTTP URL', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pitch-slideshow-'))
    const imagePath = path.join(dir, 'page-01.png')
    const imageBytes = Buffer.from('fixture-image-bytes')
    await writeFile(imagePath, imageBytes)
    cleanup.push(() => rm(dir, { recursive: true, force: true }))

    const served = await startSlideshowServer(
      [
        {
          image: imagePath,
          regions: [
            {
              id: 'p0r0',
              text: 'Main title',
              leftPct: 10,
              topPct: 12,
              widthPct: 30,
              heightPct: 8,
            },
          ],
        },
      ],
      { transition: 'slide' },
      { advertiseHost: '127.0.0.1', listenHost: '127.0.0.1' },
    )
    cleanup.push(served.close)

    expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/slideshow\.html$/)

    const htmlResponse = await fetch(served.url)
    expect(htmlResponse.status).toBe(200)
    const html = await htmlResponse.text()
    expect(html).toContain('class="transition-slide"')
    expect(html).toContain('src="http://127.0.0.1:')
    expect(html).toContain('/assets/0"')

    const imageResponse = await fetch(new URL('/assets/0', served.url))
    expect(imageResponse.status).toBe(200)
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(imageBytes)
  })

  it('advertises a physical network address instead of a Docker-inaccessible loopback', () => {
    expect(
      selectBrowserReachableHost({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
        wlo1: [{ address: '10.234.208.200', family: 'IPv4', internal: false }],
      }),
    ).toBe('10.234.208.200')
  })
})

describe('pitch demo build-slideshow', () => {
  const { 'build-slideshow': build } = collectCommands(demoCommands)
  const dirs: string[] = []

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  async function workspace(): Promise<string> {
    const base = await mkdtemp(path.join(tmpdir(), 'pitch-slideshow-ws-'))
    dirs.push(base)
    await mkdir(path.join(base, 'recording'))
    const image = path.join(base, 'page-01.png')
    await writeFile(image, 'fixture-image-bytes')
    const manifest = path.join(base, 'recording', 'assets.json')
    await writeFile(manifest, JSON.stringify({ assets: [{ kind: 'image', localPath: image }] }))
    await writeFile(
      path.join(base, 'recording', 'demo-config.json'),
      JSON.stringify({ startTime: Date.now(), assetsManifestPath: manifest }),
    )
    return base
  }

  const urlOf = async (base: string) => JSON.parse(await build.run({}, base)).url as string
  const serves = (url: string) =>
    fetch(url).then(
      response => response.ok,
      () => false,
    )

  it('keeps one server per workspace and replaces only its own on rebuild', async () => {
    vi.stubEnv('SLIDESHOW_BROWSER_HOST', '127.0.0.1')
    const a = await workspace()
    const b = await workspace()

    const firstA = await urlOf(a)
    const firstB = await urlOf(b)
    expect(await serves(firstA)).toBe(true)
    expect(await serves(firstB)).toBe(true)

    const secondA = await urlOf(a)
    expect(secondA).not.toBe(firstA)
    expect(await serves(firstA)).toBe(false)
    expect(await serves(secondA)).toBe(true)
    // Another project's rebuild never closes this one's slideshow.
    expect(await serves(firstB)).toBe(true)
  })
})
