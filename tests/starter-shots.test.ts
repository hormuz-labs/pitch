/**
 * The starter shots.js motion_scaffold writes: the file's shape is not a
 * creative decision, so the agent gets it with the brand recon measured.
 */
import { describe, expect, it } from 'vitest'
import { fontEntries, fontStack, starterShots } from '../.pi/lib/starter-shots'

const tokens = {
  colors: { bg: '#FFFFFF', ink: '#111111', accent: '#006CFF' },
  type: { headFamily: 'Inter', bodyFamily: 'Inter' },
  fonts: [
    { family: 'Inter', weight: '400', style: 'normal', file: 'assets/fonts/Inter-400.woff2' },
    { family: 'Inter', weight: '700', style: 'normal', file: 'assets/fonts/Inter-700.woff2' },
    { family: 'Inter', weight: '700', style: 'normal', file: 'assets/fonts/Inter-700-latin.woff2' },
    {
      family: 'Inter',
      weight: '400',
      style: 'italic',
      file: 'assets/fonts/Inter-400-italic.woff2',
    },
  ],
}

/** The literal, evaluated the way the engine and the studio's probe evaluate it. */
function evaluate(src: string): any {
  const fn = new Function('window', `"use strict";\n${src}\n;return window.SHOTS;`)
  return fn({})
}

describe('starterShots', () => {
  it('is a complete evaluating literal with the measured brand and an open shot list', () => {
    const spec = evaluate(starterShots(tokens))
    expect(spec.brand).toMatchObject({ bg: '#FFFFFF', ink: '#111111', accent: '#006CFF' })
    expect(spec.brand.font).toBe(
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    )
    expect(spec.shots).toEqual([])
    expect(spec.ambient).toEqual({ kind: 'none' })
    expect(spec.audio).toBeUndefined()
  })

  it('self-hosts what recon saved, once per family/weight/style', () => {
    const spec = evaluate(starterShots(tokens))
    expect(spec.brand.fonts).toEqual([
      { family: 'Inter', src: 'assets/fonts/Inter-400.woff2', weight: '400' },
      { family: 'Inter', src: 'assets/fonts/Inter-700.woff2', weight: '700' },
      {
        family: 'Inter',
        src: 'assets/fonts/Inter-400-italic.woff2',
        weight: '400',
        style: 'italic',
      },
    ])
    expect(fontEntries(undefined)).toEqual([])
  })

  it('says the brand is a placeholder when recon has not run', () => {
    const src = starterShots(null)
    expect(src).toContain('PLACEHOLDERS')
    const spec = evaluate(src)
    expect(spec.brand.bg).toBe('#FFFFFF')
    expect(spec.brand.fonts).toBeUndefined()
    expect(starterShots(tokens)).not.toContain('PLACEHOLDERS')
  })

  it('keeps a generic family as a system stack', () => {
    expect(fontStack('ui-sans-serif')).toBe(
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
    )
    expect(fontStack(null)).toBe('-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif')
    expect(fontStack('"Fraunces"')).toBe(
      '"Fraunces", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    )
  })
})
