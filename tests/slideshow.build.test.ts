/**
 * Unit tests for the pure slideshow HTML builder.
 */

import { describe, expect, it } from 'vitest'
import { buildSlideshowHtml, labelForRegion, type Slide } from '../.pi/lib/slideshow.ts'

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
    // The image source is used as given; the server rewrites local paths first.
    expect(html).toContain('src="/tmp/assets/page-1.png"')
    // Annotation layer + nav present.
    expect(html).toContain('id="annotations"')
    expect(html).toContain('__goToSlide')
  })

  it('renders a plain image slide (no regions) without hotspots', () => {
    const html = buildSlideshowHtml([{ image: '/tmp/photo.png' }])
    expect(html).toContain('src="/tmp/photo.png"')
    expect(html).not.toContain('class="hotspot"')
    expect(html).toContain('data-total="1"')
  })

  it('renders the requested explanatory slide transition', () => {
    const sliding = buildSlideshowHtml([slideWithRegions], { transition: 'slide' })

    expect(sliding).toContain('class="transition-slide"')
    expect(sliding).toContain('.transition-slide .slide')
    expect(buildSlideshowHtml([slideWithRegions])).toContain('class="transition-fade"')
  })

  it('renders persistent blur, media, and callout overlays on the slide page', () => {
    const html = buildSlideshowHtml([
      {
        image: '/tmp/photo.png',
        overlays: [
          {
            kind: 'blur',
            rect: { leftPct: 5, topPct: 10, widthPct: 20, heightPct: 15 },
            strength: 12,
            layer: 4,
          },
          {
            kind: 'media',
            rect: { leftPct: 60, topPct: 10, widthPct: 25, heightPct: 25 },
            url: 'https://media.giphy.com/example.gif',
            alt: 'Celebration',
            source: 'giphy',
            giphyId: 'gif-1',
          },
          {
            kind: 'callout',
            rect: { leftPct: 30, topPct: 55, widthPct: 20, heightPct: 15 },
            noteRect: { leftPct: 62, topPct: 20, widthPct: 28, heightPct: 14 },
            text: 'Notice <this> result',
            shape: 'circle',
            color: 'blue',
          },
        ],
      },
    ])

    expect(html).toContain('class="slide-overlay overlay-blur"')
    expect(html).toContain('z-index:4')
    expect(html).toContain('backdrop-filter:blur(12px)')
    expect(html).toContain('src="https://media.giphy.com/example.gif"')
    expect(html).toContain('data-giphy-id="gif-1"')
    expect(html).toContain('class="overlay-callout color-blue shape-circle"')
    expect(html).toContain(
      'class="callout-note" role="note" style="left:62%;top:20%;width:28%;height:14%"',
    )
    expect(html).toContain('class="callout-connector"')
    expect(html).toContain('Notice &lt;this&gt; result')
  })
})
