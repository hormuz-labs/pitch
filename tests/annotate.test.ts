/**
 * Unit tests for the pure annotation builders.
 */

import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_STYLES,
  type AnnotationStyle,
  annotationStyleCss,
  buildAnnotateEvalJs,
  buildClearAnnotationsJs,
  overlayInnerHtml,
  padForStyle,
  sanitizeColor,
} from '../.opencode/plugins/annotations.ts'

describe('sanitizeColor', () => {
  it('accepts safe color literals', () => {
    expect(sanitizeColor('#ff0', 'box')).toBe('#ff0')
    expect(sanitizeColor('rgb(255, 0, 0)', 'box')).toBe('rgb(255, 0, 0)')
    expect(sanitizeColor('tomato', 'box')).toBe('tomato')
  })

  it('falls back on junk / injection attempts, with a style-specific default', () => {
    expect(sanitizeColor('red; } malicious', 'box')).toBe('#ff3b6b')
    expect(sanitizeColor(undefined, 'box')).toBe('#ff3b6b')
    // Highlighter has its own default.
    expect(sanitizeColor(undefined, 'highlighter')).toBe('#ffe14d')
  })
})

describe('overlayInnerHtml', () => {
  it('produces distinct markup per style', () => {
    expect(overlayInnerHtml('box')).toContain('pitch-ann-box')
    expect(overlayInnerHtml('circle')).toContain('pitch-ann-ellipse')
    expect(overlayInnerHtml('underline')).toContain('pitch-ann-underline')
    expect(overlayInnerHtml('highlighter')).toContain('pitch-ann-hl')
    expect(overlayInnerHtml('spotlight')).toContain('pitch-ann-spot')
    expect(overlayInnerHtml('arrow')).toContain('pitch-ann-arrow')
  })

  it('covers every declared style', () => {
    for (const style of ANNOTATION_STYLES) {
      expect(overlayInnerHtml(style).length).toBeGreaterThan(0)
    }
  })
})

describe('annotationStyleCss', () => {
  it('defines the animation keyframes', () => {
    const css = annotationStyleCss()
    expect(css).toContain('@keyframes pitchDraw')
    expect(css).toContain('@keyframes pitchSpot')
    expect(css).toContain('@keyframes pitchSwipe')
  })
})

describe('padForStyle', () => {
  it('inflates circle/box but not underline/arrow', () => {
    expect(padForStyle('circle')).toBeGreaterThan(0)
    expect(padForStyle('box')).toBeGreaterThan(0)
    expect(padForStyle('underline')).toBe(0)
    expect(padForStyle('arrow')).toBe(0)
  })
})

describe('buildAnnotateEvalJs', () => {
  it('for a ref target, reads the live bounding rect', () => {
    const js = buildAnnotateEvalJs({ style: 'circle', ref: 'e42' })
    expect(js.startsWith('el =>')).toBe(true)
    expect(js).toContain('getBoundingClientRect')
    expect(js).toContain("getElementById('annotations')")
    expect(js).toContain('pitch-ann-ellipse')
    expect(js).toContain('#ff3b6b')
  })

  it('for a rect target, derives px from the viewport (no element access)', () => {
    const js = buildAnnotateEvalJs({
      style: 'box',
      rect: { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 5 },
    })
    expect(js.startsWith('() =>')).toBe(true)
    expect(js).toContain('window.innerWidth')
    expect(js).toContain('10/100*vw')
    expect(js).not.toContain('getBoundingClientRect')
  })

  it('embeds the sanitized color', () => {
    expect(buildAnnotateEvalJs({ style: 'box', ref: 'e1', color: '#00ff88' })).toContain('#00ff88')
    expect(buildAnnotateEvalJs({ style: 'box', ref: 'e1', color: 'evil; }' })).toContain('#ff3b6b')
  })

  it('is free of unescaped backticks (survives shell double-quote escaping)', () => {
    for (const style of ANNOTATION_STYLES) {
      const js = buildAnnotateEvalJs({ style: style as AnnotationStyle, ref: 'e1' })
      expect(js.includes('`')).toBe(false)
    }
  })
})

describe('buildClearAnnotationsJs', () => {
  it('empties the annotations layer', () => {
    const js = buildClearAnnotationsJs()
    expect(js).toContain("getElementById('annotations')")
    expect(js).toContain("innerHTML=''")
  })
})
