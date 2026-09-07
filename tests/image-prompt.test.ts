/**
 * What a generated image may be, and the prompt that keeps it in the brand.
 * The model call is thin; these are the decisions.
 */
import { describe, expect, it } from 'vitest'
import {
  buildImagePrompt,
  checkImageRequest,
  IMAGE_KINDS,
  paletteLine,
} from '../.pi/scripts/launch-video/lib/image-prompt.mjs'

describe('checkImageRequest', () => {
  it('accepts the allowed kinds with a real subject', () => {
    for (const kind of Object.keys(IMAGE_KINDS)) {
      expect(checkImageRequest({ kind, subject: 'a brass key on grey felt' }).ok).toBe(true)
    }
  })
  it('refuses unknown kinds and empty subjects', () => {
    expect(checkImageRequest({ kind: 'screenshot', subject: 'a dashboard' }).ok).toBe(false)
    expect(checkImageRequest({ kind: 'plate', subject: 'sky' }).ok).toBe(false)
  })
  it('refuses screens, logos, people and text, each with its reason', () => {
    const ui = checkImageRequest({ kind: 'illustration', subject: 'a dashboard with charts' })
    expect(ui.ok).toBe(false)
    expect(ui.reason).toMatch(/fabricated product/)
    expect(checkImageRequest({ kind: 'object', subject: 'the company logo in 3D' }).reason).toMatch(
      /redrawn mark/,
    )
    expect(
      checkImageRequest({ kind: 'plate', subject: 'a smiling customer at a desk' }).reason,
    ).toMatch(/testimonial/)
    expect(
      checkImageRequest({ kind: 'plate', subject: 'a poster with the headline in bold' }).reason,
    ).toMatch(/misspell/)
  })
})

describe('paletteLine', () => {
  it('names only the measured colours', () => {
    const line = paletteLine({
      bg: '#F5F5F5',
      ink: '#000000',
      accent: '#65A8EF',
      palette: { red: '#ED1B26' },
    })
    expect(line).toBe(
      'Use only these colours: background #F5F5F5, darkest tone #000000, one accent #65A8EF, red #ED1B26. No other hues.',
    )
    expect(paletteLine({})).toBe('')
  })
})

describe('buildImagePrompt', () => {
  it('frames the kind, locks the palette and forbids text, screens and people', () => {
    const p = buildImagePrompt({
      kind: 'object',
      subject: 'a paper desktop scattered with stickers',
      style: 'flat vector, soft shadows',
      brand: { bg: '#F5F5F5', ink: '#000000', accent: '#65A8EF' },
      aspect: '16:9',
      refs: 2,
    })
    expect(p).toMatch(/^one physical object/)
    expect(p).toContain('Subject: a paper desktop scattered with stickers.')
    expect(p).toContain('Style: flat vector, soft shadows.')
    expect(p).toContain('Use only these colours: background #F5F5F5')
    expect(p).toContain('16:9 frame')
    expect(p).toContain(
      'No text, letters, numbers, logos, watermarks, user interfaces, screens or people.',
    )
    expect(p).toContain('2 reference images')
    expect(p).toContain('one clear focal point')
  })
  it('asks textures and plates for no focal point', () => {
    expect(
      buildImagePrompt({ kind: 'texture', subject: 'warm recycled paper grain', brand: {} }),
    ).toContain('no focal point')
  })
})
