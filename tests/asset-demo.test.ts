import { describe, expect, it } from 'vitest'
import {
  pageRectToViewportRect,
  resolveManifestSlides,
  zoomEventForViewportRect,
} from '../.opencode/lib/asset-demo'

describe('resolveManifestSlides', () => {
  it('preserves manifest order and attaches OCR regions to PDF pages and images', () => {
    const slides = resolveManifestSlides({
      jobId: 'job-1',
      baseDir: '/tmp/assets',
      assets: [
        {
          kind: 'pdf',
          pages: ['/tmp/assets/page-1.png', '/tmp/assets/page-2.png'],
          pageData: [
            {
              image: '/tmp/assets/page-1.png',
              regions: [
                {
                  id: 'p0r0',
                  text: 'Heading',
                  leftPct: 10,
                  topPct: 10,
                  widthPct: 20,
                  heightPct: 5,
                },
              ],
            },
            { image: '/tmp/assets/page-2.png', regions: [] },
          ],
        },
        {
          kind: 'image',
          localPath: '/tmp/assets/chart.png',
          regions: [],
        },
      ],
    })

    expect(slides.map(slide => slide.image)).toEqual([
      '/tmp/assets/page-1.png',
      '/tmp/assets/page-2.png',
      '/tmp/assets/chart.png',
    ])
    expect(slides[0].regions?.[0]?.text).toBe('Heading')
  })
})

describe('zoomEventForViewportRect', () => {
  it('emits the x/y event shape consumed by the renderer', () => {
    const event = zoomEventForViewportRect(
      { leftPct: 25, topPct: 25, widthPct: 20, heightPct: 20 },
      3.5,
    )

    expect(event).toMatchObject({
      type: 'in',
      videoTimeSec: 3.5,
      x: expect.any(Number),
      y: expect.any(Number),
      zoom: expect.any(Number),
    })
    expect(event).not.toHaveProperty('cx')
    expect(event).not.toHaveProperty('cy')
  })
})

describe('pageRectToViewportRect', () => {
  it('maps PDF-page percentages through the live contained page bounds', () => {
    const viewportRect = pageRectToViewportRect(
      {
        leftPct: 76.65282885416667,
        topPct: 22.47755425925926,
        widthPct: 6.4112499999999955,
        heightPct: 7.823111296296297,
      },
      { left: 149.333333, top: 72, width: 1621.333334, height: 912 },
      { width: 1920, height: 1080 },
    )

    expect(viewportRect.leftPct).toBeCloseTo(72.507, 2)
    expect(viewportRect.topPct).toBeCloseTo(25.648, 2)
    expect(viewportRect.widthPct).toBeCloseTo(5.414, 2)
    expect(viewportRect.heightPct).toBeCloseTo(6.606, 2)
  })
})
