/**
 * What work costs, in credits.
 *
 * Credits are fine grained — one is worth $0.0025 of measured model and compute
 * spend — so the numbers here are the contract behind "a demo video runs about
 * 120 credits". Change CREDIT_USD without changing these and the studio starts
 * billing a different price.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('../apps/api/src/studio/host-actions.js', () => ({ takeComputeSeconds: vi.fn(() => 0) }))
vi.mock('../apps/api/src/projects/service.js', () => ({ workspaceOf: vi.fn(() => ({})) }))

import { CREDIT_USD, creditsOwed, MIN_BALANCE } from '../apps/api/src/projects/usage.js'
import {
  LAUNCH_VIDEO_NARRATION_CREDITS,
  LAUNCH_VIDEO_RESOLUTIONS,
  launchVideoCreditCost,
} from '../packages/shared/src/index.js'

describe('the credit scale', () => {
  it('bills about 120 credits for a demo video', () => {
    // A demo video costs roughly $0.30 of model spend plus render time.
    expect(creditsOwed(0.3, 0)).toBe(120)
  })

  it('prices a credit small enough that a plan is quoted in thousands', () => {
    expect(CREDIT_USD).toBeLessThan(0.01)
  })

  it('requires enough balance to pay for a meaningful slice of a turn', () => {
    expect(MIN_BALANCE).toBe(40)
  })
})

describe('launch video pricing', () => {
  it('prices a narrated 1080p film at the tier plus the narration pass', () => {
    expect(launchVideoCreditCost('1080p', true)).toBe(
      LAUNCH_VIDEO_RESOLUTIONS['1080p'].credits + LAUNCH_VIDEO_NARRATION_CREDITS,
    )
    expect(launchVideoCreditCost('1080p', true)).toBe(360)
  })

  it('drops the narration surcharge for a music-only cut', () => {
    expect(launchVideoCreditCost('720p', false)).toBe(200)
  })

  it('prices 4K above 1080p', () => {
    expect(launchVideoCreditCost('4k', true)).toBeGreaterThan(launchVideoCreditCost('1080p', true))
  })
})
