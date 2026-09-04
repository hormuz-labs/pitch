import { afterEach, describe, expect, it } from 'vitest'
import { __setNvencForTesting, videoEncodeArgs } from '../apps/api/src/render/utils/encoder'

afterEach(() => {
  __setNvencForTesting(null) // reset the cached probe
})

describe('videoEncodeArgs', () => {
  it('uses NVENC when the GPU is available', async () => {
    __setNvencForTesting(true)
    const args = await videoEncodeArgs({ quality: 21 })
    expect(args).toContain('h264_nvenc')
    expect(args).toContain('-cq 21')
  })

  it('falls back to libx264 with the chosen preset when no GPU', async () => {
    __setNvencForTesting(false)
    const args = await videoEncodeArgs({ quality: 18, cpuPreset: 'veryfast' })
    expect(args).toContain('libx264')
    expect(args).toContain('-preset veryfast')
    expect(args).toContain('-crf 18')
  })

  it('defaults quality and preset sensibly on the CPU path', async () => {
    __setNvencForTesting(false)
    const args = await videoEncodeArgs()
    expect(args).toContain('-crf 20')
    expect(args).toContain('-preset veryfast')
  })
})
