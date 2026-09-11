import { afterEach, describe, expect, it } from 'vitest'
import {
  __setEncoderForTesting,
  appendEncoderFilter,
  createVideoEncodePlan,
  encoderCandidates,
  videoEncodePlan,
} from '../apps/api/src/render/utils/encoder'

afterEach(() => {
  __setEncoderForTesting(null)
})

describe('video encoder selection', () => {
  it('prefers VideoToolbox on macOS', () => {
    expect(encoderCandidates('darwin')).toEqual(['videotoolbox', 'cpu'])
  })

  it('prefers NVENC, then VAAPI, on Linux', () => {
    expect(encoderCandidates('linux')).toEqual(['nvenc', 'vaapi', 'cpu'])
  })

  it('uses NVENC when selected', async () => {
    __setEncoderForTesting('nvenc')
    const plan = await videoEncodePlan({ quality: 21 })
    expect(plan.outputArgs).toContain('h264_nvenc')
    expect(plan.outputArgs).toContain('-cq 21')
  })

  it('uses VideoToolbox quality mode on macOS', () => {
    const plan = createVideoEncodePlan('videotoolbox', { quality: 20 })
    expect(plan.outputArgs).toContain('h264_videotoolbox')
    expect(plan.outputArgs).toContain('-q:v 60')
    expect(plan.uploadFilter).toBeNull()
  })

  it('initializes VAAPI and uploads software-filtered frames', () => {
    const plan = createVideoEncodePlan('vaapi', { quality: 19 })
    expect(plan.inputArgs).toContain('-init_hw_device vaapi=va:/dev/dri/renderD128')
    expect(plan.uploadFilter).toBe('format=nv12,hwupload')
    expect(plan.outputArgs).toContain('h264_vaapi')
    expect(plan.outputArgs).toContain('-qp 19')
  })

  it('appends VAAPI upload after the existing software graph', () => {
    const plan = createVideoEncodePlan('vaapi')
    expect(appendEncoderFilter('[0:v]scale=1280:720[v]', '[v]', plan)).toEqual({
      graph: '[0:v]scale=1280:720[v];[v]format=nv12,hwupload[encodedv]',
      outputLabel: '[encodedv]',
    })
  })

  it('falls back to libx264 with the chosen preset', () => {
    const plan = createVideoEncodePlan('cpu', { quality: 18, cpuPreset: 'veryfast' })
    expect(plan.outputArgs).toContain('libx264')
    expect(plan.outputArgs).toContain('-preset veryfast')
    expect(plan.outputArgs).toContain('-crf 18')
  })
})
