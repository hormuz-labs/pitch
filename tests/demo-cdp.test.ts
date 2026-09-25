import { describe, expect, it } from 'vitest'
import { assertRecordingCoversTimeline } from '../apps/api/src/render/recording.js'
import { withTimeout } from '../apps/api/src/render/utils/cloak-browser.js'

describe('direct CloakBrowser operation bounds', () => {
  it('returns completed operations', async () => {
    await expect(withTimeout('quick operation', Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('rejects stalled operations', async () => {
    await expect(withTimeout('stalled operation', new Promise(() => {}), 5)).rejects.toThrow(
      'stalled operation timed out after 5ms',
    )
  })
})

describe('recording artifact finalization', () => {
  it('rejects a recording that ends well before the tracked session', () => {
    expect(() => assertRecordingCoversTimeline(39.5, 1_000, 58_000)).toThrow(
      /captured 39.5s of 57.0s/,
    )
  })

  it('allows normal recorder finalization tolerance', () => {
    expect(() => assertRecordingCoversTimeline(56, 1_000, 58_000)).not.toThrow()
  })
})
