/**
 * Unit tests for the pure slideshow HTML builder.
 */

import { describe, expect, it } from 'vitest'
import {
  buildSlideshowHtml,
  labelForRegion,
  type Slide,
  toFileUrl,
} from '../.opencode/lib/slideshow.ts'

describe('toFileUrl', () => {
  it('prefixes absolute paths and passes through URLs', () => {
    expect(toFileUrl('/abs/page-1.png')).toBe('file:///abs/page-1.png')
    expect(toFileUrl('file:///abs/x.png')).toBe('file:///abs/x.png')
    expect(toFileUrl('https://x/y.png')).toBe('https://x/y.png')
    expect(toFileUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })
})

describe('labelForRegion', () => {
  it('collapses whitespace and truncates long text', () => {
    expect(labelForRegion('  Full   Name ')).toBe('Full Name')
    const long = 'a'.repeat(100)
    expect(labelForRegion(long).length).toBe(60)
    expect(labelForRegion(long).endsWith('…')).toBe(true)
  })
})

describe('buildSlideshowHtml', () => {
  const slideWithRegions: Slide = {
    image: '/tmp/assets/page-1.png',
    regions: [
      { id: 'p0r0', text: 'Full Name', leftPct: 10, topPct: 12, widthPct: 30, heightPct: 4 },
      { id: 'p0r1', text: 'Voter ID & PIN', leftPct: 10, topPct: 20, widthPct: 40, heightPct: 4 },
    ],
  }

  it('renders each region as a labelled, role=button hotspot with percent positioning', () => {
    const html = buildSlideshowHtml([slideWithRegions])
    expect(html).toContain('class="hotspot"')
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-label="Full Name"')
    // XML entity in text is HTML-escaped for the attribute.
    expect(html).toContain('aria-label="Voter ID &amp; PIN"')
    expect(html).toContain('left:10%;top:12%;width:30%;height:4%')
    expect(html).toContain('data-region="p0r0"')
    // Image referenced as a file URL.
    expect(html).toContain('src="file:///tmp/assets/page-1.png"')
    // Annotation layer + nav present.
    expect(html).toContain('id="annotations"')
    expect(html).toContain('__goToSlide')
  })

  it('renders a title card as the first slide and counts it in the total', () => {
    const html = buildSlideshowHtml([slideWithRegions], { title: 'My Demo' })
    expect(html).toContain('title-card')
    expect(html).toContain('<h1>My Demo</h1>')
    // title + 1 slide = 2 total.
    expect(html).toContain('data-total="2"')
    expect(html).toContain('1 / 2')
  })

  it('renders a plain image slide (no regions) without hotspots', () => {
    const html = buildSlideshowHtml([{ image: '/tmp/photo.png' }])
    expect(html).toContain('src="file:///tmp/photo.png"')
    expect(html).not.toContain('class="hotspot"')
    expect(html).toContain('data-total="1"')
  })

  it('emits an auto-advance timer only when durationMs is set', () => {
    expect(buildSlideshowHtml([slideWithRegions], { durationMs: 4000 })).toContain('setInterval')
    expect(buildSlideshowHtml([slideWithRegions])).not.toContain('setInterval')
  })

  it('renders the requested explanatory slide transition', () => {
    const sliding = buildSlideshowHtml([slideWithRegions], { transition: 'slide' })
    const zooming = buildSlideshowHtml([slideWithRegions], { transition: 'zoom' })

    expect(sliding).toContain('class="transition-slide"')
    expect(sliding).toContain('.transition-slide .slide')
    expect(zooming).toContain('class="transition-zoom"')
    expect(zooming).toContain('.transition-zoom .slide')
  })
})
