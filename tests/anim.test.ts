import { describe, expect, it } from 'vitest'
// @ts-expect-error
import anim from '../effects/_lib/anim.js'

describe('anim properties animation toolkit', () => {
  describe('interpolate', () => {
    it('interpolates numbers linearly', () => {
      const v = anim.interpolate(10, [0, 20], [0, 1])
      expect(v).toBe(0.5)
    })

    it('handles clamping on left and right', () => {
      const left = anim.interpolate(-5, [0, 20], [0, 100], { extrapolateLeft: 'clamp' })
      expect(left).toBe(0)

      const right = anim.interpolate(30, [0, 20], [0, 100], { extrapolateRight: 'clamp' })
      expect(right).toBe(100)
    })

    it('handles multi-point keyframes', () => {
      const v1 = anim.interpolate(10, [0, 20, 80, 100], [0, 1, 1, 0])
      expect(v1).toBe(0.5)

      const v2 = anim.interpolate(50, [0, 20, 80, 100], [0, 1, 1, 0])
      expect(v2).toBe(1)

      const v3 = anim.interpolate(90, [0, 20, 80, 100], [0, 1, 1, 0])
      expect(v3).toBe(0.5)
    })

    it('supports perceptual scale area interpolation', () => {
      const half = anim.interpolate(30, [0, 60], [0, 1], {
        output: 'perceptual-scale',
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
      expect(Math.abs(half - Math.sqrt(0.5))).toBeLessThan(1e-5)
    })

    it('supports tuple interpolation', () => {
      const coords = anim.interpolate(
        15,
        [0, 30],
        [
          [0, 10],
          [100, 50],
        ],
      )
      expect(coords).toEqual([50, 30])
    })

    it('supports string transform values with units', () => {
      const res = anim.interpolate(15, [0, 30], ['0px 0px', '100px 50px'])
      expect(res).toBe('50px 25px')
    })

    it('supports posterization (frame quantization)', () => {
      const v0 = anim.interpolate(0, [0, 60], [0, 1], { posterize: 3 })
      const v1 = anim.interpolate(1, [0, 60], [0, 1], { posterize: 3 })
      const v2 = anim.interpolate(2, [0, 60], [0, 1], { posterize: 3 })
      const v3 = anim.interpolate(3, [0, 60], [0, 1], { posterize: 3 })

      expect(v0).toBe(v1)
      expect(v1).toBe(v2)
      expect(v3).toBeGreaterThan(v2)
    })
  })

  describe('interpolateColors', () => {
    it('interpolates hex colors', () => {
      const mid = anim.interpolateColors(10, [0, 20], ['#000000', '#ffffff'])
      expect(mid).toBe('rgba(128, 128, 128, 1)')
    })

    it('interpolates named colors', () => {
      const redToWhite = anim.interpolateColors(10, [0, 20], ['red', 'white'])
      expect(redToWhite).toBe('rgba(255, 128, 128, 1)')
    })

    it('interpolates rgba with alpha', () => {
      const fade = anim.interpolateColors(10, [0, 20], ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)'])
      expect(fade).toBe('rgba(0, 0, 0, 0.5)')
    })
  })

  describe('spring physics', () => {
    it('starts at from and moves towards to', () => {
      const s0 = anim.spring({ frame: 0, fps: 30, from: 0, to: 100 })
      expect(s0).toBe(0)

      const s10 = anim.spring({ frame: 10, fps: 30, from: 0, to: 100 })
      expect(s10).toBeGreaterThan(0)
    })

    it('overshoots and bounces with default settings', () => {
      let maxVal = 0
      for (let f = 0; f < 60; f++) {
        const val = anim.spring({ frame: f, fps: 30, from: 0, to: 1 })
        if (val > maxVal) maxVal = val
      }
      expect(maxVal).toBeGreaterThan(1.0) // Natural spring overshoot
    })

    it('clamps overshoot when overshootClamping: true', () => {
      for (let f = 0; f < 60; f++) {
        const val = anim.spring({
          frame: f,
          fps: 30,
          from: 0,
          to: 1,
          config: { overshootClamping: true },
        })
        expect(val).toBeLessThanOrEqual(1.0)
      }
    })

    it('settles near target', () => {
      const finalVal = anim.spring({ frame: 90, fps: 30, from: 0, to: 1 })
      expect(Math.abs(finalVal - 1)).toBeLessThan(0.01)
    })

    it('respects delay', () => {
      const beforeDelay = anim.spring({ frame: 10, fps: 30, from: 0, to: 1, delay: 15 })
      expect(beforeDelay).toBe(0)

      const afterDelay = anim.spring({ frame: 20, fps: 30, from: 0, to: 1, delay: 15 })
      expect(afterDelay).toBeGreaterThan(0)
    })

    it('measures settling time', () => {
      const frames = anim.measureSpring({ fps: 30, config: { stiffness: 100, damping: 10 } })
      expect(frames).toBeGreaterThan(10)
      expect(frames).toBeLessThan(150)
    })
  })

  describe('Easing', () => {
    it('evaluates cubic bezier', () => {
      const ease = anim.Easing.bezier(0.25, 0.1, 0.25, 1)
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      expect(ease(0.5)).toBeGreaterThan(0.5)
    })

    it('evaluates bounce and elastic', () => {
      expect(anim.Easing.bounce(0)).toBe(0)
      expect(anim.Easing.bounce(1)).toBe(1)
      expect(anim.Easing.elastic()(0)).toBe(0)
      expect(anim.Easing.elastic()(1)).toBe(1)
    })
  })
})
