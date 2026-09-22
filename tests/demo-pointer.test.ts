import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { pointerGlideCode } from '../.pi/lib/demo-pointer.ts'

describe('paced browser mouse movement', () => {
  it('moves the real mouse over time and settles before returning for a click', async () => {
    vi.useFakeTimers()
    try {
      const samples: Array<{ x: number; y: number; time: number }> = []
      const page = {
        locator: vi.fn(() => ({
          waitFor: async () => {},
          scrollIntoViewIfNeeded: async () => {},
          boundingBox: async () => ({ x: 980, y: 380, width: 40, height: 40 }),
        })),
        evaluate: async () => ({ x: 100, y: 400 }),
        waitForTimeout: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
        mouse: {
          move: async (x: number, y: number) => {
            samples.push({ x, y, time: Date.now() })
          },
        },
      }
      // CLI run-code has a VM with page, not Node globals such as setTimeout.
      const run = runInNewContext(`(${pointerGlideCode('e12')})`, { Date })
      const start = Date.now()
      const movement = run(page)
      await vi.runAllTimersAsync()
      await movement
      expect(page.locator).toHaveBeenCalledWith('aria-ref=e12')
      expect(samples.length).toBeGreaterThan(30)
      expect(samples[0]).toMatchObject({ x: 100, y: 400 })
      expect(samples.at(-1)).toMatchObject({ x: 1000, y: 400 })
      expect(samples.at(-1)!.time - start).toBeGreaterThanOrEqual(600)
      expect(Date.now() - samples.at(-1)!.time).toBe(100)
      expect(samples.every((s, i) => i === 0 || s.x >= samples[i - 1]!.x)).toBe(true)
      const firstStep = samples[1]!.x - samples[0]!.x
      const middle = Math.floor(samples.length / 2)
      expect(samples[middle]!.x - samples[middle - 1]!.x).toBeGreaterThan(firstStep)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not accept executable input as a snapshot ref', () => {
    expect(() => pointerGlideCode('e1; exit')).toThrow('snapshot ref')
    expect(pointerGlideCode('f12e1477')).toContain('aria-ref=f12e1477')
  })
})
