/**
 * capture.mjs closes with a `⏱ timings {…}` line; the export logs it so the
 * time an export spends per phase is visible on a render pod.
 */
import { describe, expect, it } from 'vitest'
import { timingsFromLine } from '../apps/api/src/flows/launch-video/export'

describe('timingsFromLine', () => {
  it('reads the closing timings line', () => {
    expect(
      timingsFromLine('⏱ timings {"setupS":1.2,"captureS":40.5,"encodeS":12,"frames":1045}'),
    ).toEqual({ setupS: 1.2, captureS: 40.5, encodeS: 12, frames: 1045 })
  })

  it('ignores progress lines and malformed payloads', () => {
    expect(timingsFromLine('  [42%] Rendered 440/1045 frames - Elapsed: 10.0s')).toBeNull()
    expect(timingsFromLine('⏱ timings {not json}')).toBeNull()
    expect(timingsFromLine('⏱ timings [1,2]')).toBeNull()
  })
})
