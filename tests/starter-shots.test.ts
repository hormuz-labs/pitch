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
    expect(spec.motion).toEqual({ exit: 'none', drift: true, cutDur: 0.5 })
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

/**
 * The scaffold's shots.js used to land with `shots: []`, so the preview stayed
 * blank until the agent had written a shot — nine minutes into a measured run.
 * The opener is the site's own words, so there is something on the stage the
 * instant the file is written.
 */
describe('the placeholder opener', () => {
  const tokens = {
    colors: { bg: '#fff', ink: '#111', accent: '#9147FF' },
    copy: { h1: ['Thomas'], h2: ['The first AI founder Backed by'] },
  }

  it('opens on the h1 and lands the h2 whole, in the accent', () => {
    const out = starterShots(tokens)
    expect(out).toContain('type: "line"')
    expect(out).toContain('{ at: 0, add: [{ text: "Thomas" }] }')
    // Four words, and never ending on the dangling "Backed by".
    expect(out).toContain('{ text: "The first AI founder", tone: "accent" }')
    expect(out).not.toContain('shots: [\n  ]')
  })

  it('falls back to the page title, then to a comment', () => {
    expect(starterShots({ ...tokens, copy: {}, title: 'Acme — ship faster' })).toContain(
      'add: [{ text: "Acme — ship" }]',
    )
    // Nothing measured yet: an empty list the agent fills, as before.
    expect(starterShots(null)).toContain('// { id: "hook"')
  })
})
