import { describe, expect, it } from 'vitest'
import { calculateLaunchVideoProgress } from '../apps/web/src/launch-video/progress'

const startedAt = '2026-08-11T00:00:00.000Z'

describe('launch-video displayed progress', () => {
  it('advances conservatively while a long phase is still running', () => {
    const phases = [
      { phase: 'workspace_init', status: 'completed' as const },
      { phase: 'processing', status: 'running' as const, startedAt },
    ]

    const initial = calculateLaunchVideoProgress(phases, 5, Date.parse(startedAt))
    const later = calculateLaunchVideoProgress(phases, 5, Date.parse(startedAt) + 60_000)

    expect(initial).toBeGreaterThanOrEqual(5)
    expect(later).toBeGreaterThan(initial)
    expect(later).toBeLessThan(10)
  })

  it('infers earlier ordered phases when sparse worker events jump ahead', () => {
    const phases = [
      { phase: 'workspace_init', status: 'completed' as const },
      { phase: 'processing', status: 'completed' as const },
      { phase: 'building', status: 'running' as const, startedAt },
    ]

    expect(calculateLaunchVideoProgress(phases, 10, Date.parse(startedAt))).toBeGreaterThan(30)
  })

  it('never claims completion before the backend and never moves backwards', () => {
    const phases = [{ phase: 'rendering', status: 'running' as const, startedAt }]

    expect(calculateLaunchVideoProgress(phases, 98, Date.parse(startedAt) + 60 * 60_000)).toBe(99)
    expect(calculateLaunchVideoProgress([], 100, Date.parse(startedAt))).toBe(100)
  })
})
