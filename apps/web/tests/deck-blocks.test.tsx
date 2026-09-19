import { describe, expect, it, vi } from 'vitest'
import type { BlockType } from '../src/solid/studio/deck/blocks'
import {
  ALL_BLOCKS,
  createBlockHTML,
  createChartConfig,
  createIconBlockHTML,
  createImageBlockHTML,
  createQrBlockHTML,
  createSlideHTML,
  createTableHTML,
  ICONS,
  layerStyle,
  SLIDE_TEMPLATES,
  searchBlocks,
} from '../src/solid/studio/deck/blocks'

// createQrBlockHTML loads `qrcode` dynamically; happy-dom has no canvas, so the
// real encoder cannot run here. The mock records the call and returns a data URL.
const qrMock = vi.hoisted(() => ({
  toDataURL: vi.fn((text: string) => Promise.resolve(`data:image/png;base64,mock:${text}`)),
}))
vi.mock('qrcode', () => ({ toDataURL: qrMock.toDataURL }))

describe('layerStyle', () => {
  it('inline: clears absolute positioning and z-index (normal flow)', () => {
    expect(layerStyle('inline')).toEqual({ position: '', zIndex: '' })
  })

  it('front: absolute and above the text layer (z >= 20)', () => {
    const s = layerStyle('front')
    expect(s.position).toBe('absolute')
    expect(Number(s.zIndex)).toBeGreaterThanOrEqual(20)
  })

  it('back: absolute and behind the text layer (z < 10)', () => {
    const s = layerStyle('back')
    expect(s.position).toBe('absolute')
    expect(Number(s.zIndex)).toBeLessThan(10)
  })
})

describe('createBlockHTML — every registered type', () => {
  // Blocks that legitimately use no theme tokens: title and heading1 inherit the
  // template's heading styles, pros-cons hardcodes its green/red pair, and every
  // callout hardcodes its kind's accent/background palette.
  const NO_THEME_VARS: BlockType[] = ['title', 'heading1', 'pros-cons']
  const usesThemeVars = (type: BlockType) =>
    !NO_THEME_VARS.includes(type) && !type.startsWith('callout-')

  it('every BlockType in ALL_BLOCKS produces non-empty HTML', () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(5)
    for (const { type } of ALL_BLOCKS) {
      const html = createBlockHTML(type)
      expect(typeof html).toBe('string')
      expect(html.length).toBeGreaterThan(0)
    }
  })

  it('themed blocks carry var(--…) fallbacks so they work without deck CSS', () => {
    for (const { type } of ALL_BLOCKS) {
      if (!usesThemeVars(type)) continue
      expect(createBlockHTML(type), `block ${type}`).toContain('var(--')
    }
  })
})

describe('createBlockHTML — text & structure', () => {
  it('paragraph: returns a paragraph element with body text', () => {
    const html = createBlockHTML('paragraph')
    expect(html).toMatch(/^<p\b/)
    expect(html).toContain('</p>')
  })

  it('title: returns an h1 using the template main-title class', () => {
    const html = createBlockHTML('title')
    expect(html).toMatch(/^<h1\b/)
    expect(html).toContain('main-title')
  })

  it('heading1..4: return the matching heading tag', () => {
    expect(createBlockHTML('heading1')).toMatch(/^<h1\b/)
    expect(createBlockHTML('heading2')).toMatch(/^<h2\b/)
    expect(createBlockHTML('heading3')).toMatch(/^<h3\b/)
    expect(createBlockHTML('heading4')).toMatch(/^<h4\b/)
  })

  it('blockquote: returns a blockquote element', () => {
    expect(createBlockHTML('blockquote')).toMatch(/^<blockquote\b/)
  })

  it('label: returns a span styled as a pill label', () => {
    const html = createBlockHTML('label')
    expect(html).toMatch(/^<span\b/)
  })

  it('bulleted list: returns a <ul> with list items', () => {
    const html = createBlockHTML('bulleted')
    expect(html).toMatch(/^<ul\b/)
    expect((html.match(/<li/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('numbered list: returns an <ol> with list items', () => {
    const html = createBlockHTML('numbered')
    expect(html).toMatch(/^<ol\b/)
    expect((html.match(/<li/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('todo list: returns a list whose items carry a checkbox', () => {
    const html = createBlockHTML('todo')
    expect(html).toMatch(/^<ul\b/)
    expect(html).toContain('type="checkbox"')
  })

  it('divider: returns an <hr>', () => {
    expect(createBlockHTML('divider')).toMatch(/^<hr\b/)
  })
})

describe('createBlockHTML — callout boxes', () => {
  const CALLOUTS: { type: BlockType; label: string; accent: string }[] = [
    { type: 'callout-note', label: 'Note', accent: '#64748b' },
    { type: 'callout-info', label: 'Info', accent: '#2563eb' },
    { type: 'callout-warning', label: 'Warning', accent: '#d97706' },
    { type: 'callout-success', label: 'Success', accent: '#16a34a' },
    { type: 'callout-caution', label: 'Caution', accent: '#dc2626' },
    { type: 'callout-question', label: 'Question', accent: '#7c3aed' },
  ]

  it.each(CALLOUTS)(
    '$type: a div with role="note", its label and its accent',
    ({ type, label, accent }) => {
      const html = createBlockHTML(type)
      expect(html).toMatch(/^<div\b/)
      expect(html).toContain('role="note"')
      expect(html).toContain(`>${label}</strong>`)
      expect(html).toContain(accent)
    },
  )

  it('different callout kinds use different accent colors', () => {
    expect(createBlockHTML('callout-info')).not.toEqual(createBlockHTML('callout-warning'))
  })
})

describe('createBlockHTML — smart layouts', () => {
  it('stats: three big-number stat items', () => {
    const html = createBlockHTML('stats')
    expect(html).toMatch(/^<div\b/)
    expect((html.match(/data-stat/g) || []).length).toBe(3)
  })

  it('bar-stats: labelled horizontal bars', () => {
    const html = createBlockHTML('bar-stats')
    expect((html.match(/data-bar/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('process: numbered steps', () => {
    const html = createBlockHTML('process')
    expect((html.match(/data-step/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('timeline: dated entries', () => {
    expect((createBlockHTML('timeline').match(/data-tl/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('columns: a two-column layout', () => {
    expect((createBlockHTML('columns').match(/data-col/g) || []).length).toBe(2)
  })

  it('pros-cons: a pros box and a cons box', () => {
    const html = createBlockHTML('pros-cons')
    expect(html.toLowerCase()).toContain('pros')
    expect(html.toLowerCase()).toContain('cons')
  })
})

describe('createTableHTML — dynamic size', () => {
  it('builds a rows×cols grid for arbitrary sizes', () => {
    const html = createTableHTML(3, 5)
    expect(html).toMatch(/^<table\b/)
    expect((html.match(/<tr/g) || []).length).toBe(3)
    expect((html.match(/<t[dh]/g) || []).length).toBe(15)
  })

  it('styles the first row as a header', () => {
    const html = createTableHTML(2, 2)
    expect((html.match(/<th/g) || []).length).toBe(2)
    expect((html.match(/<td/g) || []).length).toBe(2)
  })

  it('supports a single row and a single column', () => {
    expect((createTableHTML(1, 4).match(/<tr/g) || []).length).toBe(1)
    expect((createTableHTML(4, 1).match(/<t[dh]/g) || []).length).toBe(4)
  })

  it('clamps non-positive sizes up to 1', () => {
    const html = createTableHTML(0, 0)
    expect((html.match(/<tr/g) || []).length).toBe(1)
    expect((html.match(/<t[dh]/g) || []).length).toBe(1)
  })

  it('clamps huge sizes down to 20', () => {
    const html = createTableHTML(99, 99)
    expect((html.match(/<tr/g) || []).length).toBe(20)
    expect((html.match(/<t[dh]/g) || []).length).toBe(400)
  })
})

describe('createImageBlockHTML / isSafeUrl', () => {
  it('embeds the given src and includes an alt attribute', () => {
    const html = createImageBlockHTML('https://example.com/cat.png')
    expect(html).toMatch(/^<img\b/)
    expect(html).toContain('src="https://example.com/cat.png"')
    expect(html).toContain('alt=')
  })

  it('allows http(s), data:image, absolute, relative and anchor URLs', () => {
    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/png;base64,iVBORw0KGgo=',
      '/uploads/a.png',
      './renders/a.png',
      'renders/a.png',
      '#fragment',
    ]) {
      expect(createImageBlockHTML(src), src).not.toBe('')
    }
  })

  it('rejects javascript: and vbscript: URLs, even obfuscated', () => {
    expect(createImageBlockHTML('javascript:alert(1)')).toBe('')
    expect(createImageBlockHTML('vbscript:msgbox(1)')).toBe('')
    expect(createImageBlockHTML('  JAVASCRIPT:alert(1)  ')).toBe('')
    expect(createImageBlockHTML('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('rejects an empty src', () => {
    expect(createImageBlockHTML('')).toBe('')
  })

  it('escapes quotes in the src so the attribute cannot be broken out of', () => {
    const html = createImageBlockHTML('x"><script>alert(1)</script>')
    expect(html).not.toContain('"><script>')
  })
})

describe('createIconBlockHTML', () => {
  it('exposes a non-empty catalog of icon names', () => {
    expect(Array.isArray(ICONS)).toBe(true)
    expect(ICONS.length).toBeGreaterThan(0)
  })

  it('returns inline SVG for a known icon with an accessible label', () => {
    const html = createIconBlockHTML(ICONS[0])
    expect(html).toMatch(/^<svg\b/)
    expect(html).toMatch(/role="img"/)
    expect(html).toContain('aria-label=')
  })

  it('applies a custom stroke color', () => {
    expect(createIconBlockHTML('star', '#ff0000')).toContain('stroke="#ff0000"')
  })

  it('returns empty string for an unknown icon', () => {
    expect(createIconBlockHTML('definitely-not-an-icon')).toBe('')
  })
})

describe('createQrBlockHTML', () => {
  it('produces an <img> with a data-URL QR for the given text', async () => {
    const html = await createQrBlockHTML('https://trypitch.co')
    expect(html).toMatch(/^<img\b/)
    expect(html).toContain('src="data:image/')
    expect(html).toContain('alt=')
  })

  it('passes the trimmed text and size options to the encoder', async () => {
    qrMock.toDataURL.mockClear()
    await createQrBlockHTML('  https://trypitch.co  ')
    expect(qrMock.toDataURL).toHaveBeenCalledWith('https://trypitch.co', { margin: 1, width: 320 })
  })

  it('returns empty string for empty input without calling the encoder', async () => {
    qrMock.toDataURL.mockClear()
    expect(await createQrBlockHTML('')).toBe('')
    expect(await createQrBlockHTML('   ')).toBe('')
    expect(qrMock.toDataURL).not.toHaveBeenCalled()
  })

  it('escapes the text inside the alt attribute', async () => {
    const html = await createQrBlockHTML('a"b<c')
    expect(html).toContain('alt="QR code for a&quot;b&lt;c"')
  })
})

describe('createChartConfig — data charts', () => {
  it('bar/line/pie carry the requested type and a populated dataset', () => {
    for (const k of ['bar', 'line', 'pie'] as const) {
      const c = createChartConfig(k)
      expect(c.type).toBe(k)
      expect(c.data.datasets.length).toBeGreaterThanOrEqual(1)
      expect(c.data.labels.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('pie: one color per slice, white slice borders, legend shown', () => {
    const c = createChartConfig('pie')
    const ds = c.data.datasets[0]
    expect(Array.isArray(ds.backgroundColor)).toBe(true)
    expect((ds.backgroundColor as string[]).length).toBe(c.data.labels.length)
    expect(ds.borderColor).toBe('#ffffff')
    expect(ds.borderWidth).toBe(2)
    const legend = (c.options.plugins as { legend: { display: boolean } }).legend
    expect(legend.display).toBe(true)
  })

  it('line: smoothed (tension), unfilled, legend hidden', () => {
    const ds = createChartConfig('line').data.datasets[0]
    expect(ds.tension).toBe(0.35)
    expect(ds.fill).toBe(false)
    const legend = (createChartConfig('line').options.plugins as { legend: { display: boolean } })
      .legend
    expect(legend.display).toBe(false)
  })

  it('bar: single solid series color', () => {
    const ds = createChartConfig('bar').data.datasets[0]
    expect(ds.backgroundColor).toBe('#6366f1')
    expect(ds.borderColor).toBe('#4f46e5')
  })

  it('serializes to JSON containing the keys the chart editor edits', () => {
    const json = JSON.stringify(createChartConfig('bar'))
    expect(json).toContain('"labels"')
    expect(json).toContain('"data"')
    expect(json).toContain('"backgroundColor"')
    expect(json).toContain('"borderColor"')
  })
})

describe('createSlideHTML — new slide templates', () => {
  it('SLIDE_TEMPLATES lists the five choices with id + label', () => {
    expect(SLIDE_TEMPLATES.map(t => t.id)).toEqual([
      'blank',
      'title',
      'title-content',
      'two-column',
      'section',
    ])
    for (const t of SLIDE_TEMPLATES) expect(t.label.length).toBeGreaterThan(0)
  })

  it('every template renders a 1280×720 .slide container with a .content region', () => {
    for (const t of SLIDE_TEMPLATES) {
      const html = createSlideHTML(t.id)
      expect(html).toMatch(/^<div[^>]*class="slide/)
      expect(html).toContain('width:1280px')
      expect(html).toContain('height:720px')
      expect(html).toContain('class="content"')
    }
  })

  it('produces a queryable slide DOM (happy-dom)', () => {
    const host = document.createElement('div')
    host.innerHTML = createSlideHTML('title')
    const slide = host.querySelector('.slide')
    expect(slide).toBeTruthy()
    expect(slide?.querySelector('.content')).toBeTruthy()
    expect(slide?.querySelector('.main-title')?.textContent).toBe('Presentation title')
  })

  it('blank template has no heading; title template has a main title', () => {
    expect(createSlideHTML('blank')).not.toContain('<h1')
    expect(createSlideHTML('title')).toMatch(/<h1|main-title/)
  })

  it('two-column template renders two columns', () => {
    expect((createSlideHTML('two-column').match(/data-col/g) || []).length).toBe(2)
  })

  it('section template renders the accent bar and an oversized heading', () => {
    const html = createSlideHTML('section')
    expect(html).toContain('font-size:64px')
    expect(html).toContain('var(--primary,')
  })

  it('unknown template falls back to a blank slide', () => {
    // @ts-expect-error testing runtime fallback for an invalid id
    expect(createSlideHTML('nope')).toMatch(/class="slide/)
  })
})

describe('searchBlocks', () => {
  it('ALL_BLOCKS lists insertable blocks with labels', () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(5)
    expect(ALL_BLOCKS[0]).toHaveProperty('type')
    expect(ALL_BLOCKS[0]).toHaveProperty('label')
  })

  it('finds a block by label keyword (case-insensitive)', () => {
    const hits = searchBlocks('quote')
    expect(hits.some(b => b.type === 'blockquote')).toBe(true)
  })

  it('matches on keyword synonyms (e.g. "bullet" → bulleted list)', () => {
    expect(searchBlocks('bullet').some(b => b.type === 'bulleted')).toBe(true)
  })

  it('"callout" finds every callout block', () => {
    const hits = searchBlocks('callout')
    expect(hits.length).toBe(6)
    expect(hits.every(b => b.type.startsWith('callout-'))).toBe(true)
  })

  it('"CALLOUT" is case-insensitive', () => {
    expect(searchBlocks('CALLOUT').length).toBe(6)
  })

  it('"stats" ranks the exact Stats block before Bar stats', () => {
    const hits = searchBlocks('stats')
    expect(hits.map(b => b.type)).toEqual(['stats', 'bar-stats'])
  })

  it('"table" matches nothing — no table block is registered in ALL_BLOCKS', () => {
    // createTableHTML exists but was never added to the registry (checked back
    // through the file's history); this documents the gap, not a ranking rule.
    expect(searchBlocks('table')).toEqual([])
  })

  it('returns the full list for an empty or whitespace query', () => {
    expect(searchBlocks('').length).toBe(ALL_BLOCKS.length)
    expect(searchBlocks('   ').length).toBe(ALL_BLOCKS.length)
  })
})
