import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { selectBrowserReachableHost, startSlideshowServer } from '../.pi/lib/slideshow-server'

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
