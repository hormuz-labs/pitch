/**
 * Which moments of a harvested clip become frames, and what the harvest asks
 * the user for when a site is thin. Pure decisions; the ffmpeg side only
 * extracts what these return.
 */
import { describe, expect, it } from 'vitest'
import {
  assetGaps,
  gapsReport,
  planFrameTimes,
} from '../.pi/skills/launch-video/scripts/lib/harvest-plan.mjs'

describe('planFrameTimes', () => {
  it('keeps scene changes, drops the edges and collapses near pairs', () => {
    const t = planFrameTimes([0.2, 5, 5.4, 12, 30, 59.8], 60, { min: 3 })
    expect(t).toEqual([5, 12, 30])
  })
  it('fills with even samples when scene changes are few', () => {
    const t = planFrameTimes([20], 40)
    expect(t.length).toBeGreaterThanOrEqual(6)
    expect(t).toContain(20)
    expect(Math.min(...t)).toBeGreaterThanOrEqual(2.4)
    expect(Math.max(...t)).toBeLessThanOrEqual(37.6)
  })
  it('caps at max with an even spread', () => {
    const many = Array.from({ length: 40 }, (_, i) => 2 + i * 1.5)
    const t = planFrameTimes(many, 70, { max: 8 })
    expect(t).toHaveLength(8)
    expect(t[0]).toBe(5)
    expect(t[7]).toBe(60.5)
  })
  it('is empty for no duration', () => {
    expect(planFrameTimes([1, 2], 0)).toEqual([])
  })
})

describe('assetGaps', () => {
  it('asks for everything on an empty harvest', () => {
    const gaps = assetGaps({ media: [], svg: [] })
    const needs = gaps.map(g => g.need).join('\n')
    expect(needs).toMatch(/logo as an SVG/)
    expect(needs).toMatch(/screen recording/)
    expect(needs).toMatch(/product screenshots/)
    expect(gaps.some(g => /Lottie/.test(g.need))).toBe(false)
  })
  it('asks for sharper clips when the footage is small, and a Lottie once a logo exists', () => {
    const gaps = assetGaps({
      media: [
        { kind: 'video', width: 480 },
        { kind: 'image', width: 1600, alt: 'dashboard screenshot' },
      ],
      svg: [{ logoish: true }],
    })
    const needs = gaps.map(g => g.need).join('\n')
    expect(needs).toMatch(/1080p \(the largest here is 480px wide\)/)
    expect(needs).toMatch(/Lottie or Rive/)
    expect(needs).not.toMatch(/product screenshots/)
    expect(needs).not.toMatch(/logo as an SVG/)
  })
  it('asks for font files when recon saved none', () => {
    const gaps = assetGaps(
      {
        media: [
          { kind: 'video', width: 1920 },
          { kind: 'image', width: 1440, alt: 'app' },
        ],
        svg: [{ logoish: true }],
      },
      { fontsSaved: 0, fontFamily: 'Inter' },
    )
    expect(gaps.map(g => g.need).join('\n')).toMatch(/Inter font files/)
  })
  it('prints nothing when there are no gaps', () => {
    expect(gapsReport([])).toBe('')
    expect(gapsReport([{ need: 'x', why: 'y', unlocks: 'z' }])).toMatch(/Ask the user for/)
  })
})
