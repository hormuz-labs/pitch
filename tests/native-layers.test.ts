import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  buildNativeLayerSidecar,
  discoverNativeCandidates,
  sampleNativeCandidates,
} from '../.pi/scripts/launch-video/lib/native-layers.mjs'

const text = {
  id: 'native-0-0',
  name: 'Title',
  shotId: 'hero',
  kind: 'text',
  text: 'Ship faster',
  box: { width: 400, height: 80 },
  font: {
    family: 'Inter',
    style: 'normal',
    weight: '700',
    size: 64,
    lineHeight: 72,
    tracking: -1,
    color: 'rgb(255, 255, 255)',
    align: 'center',
  },
}

const options = {
  stage: { width: 1920, height: 1080 },
  fps: 10,
  frames: 5,
  from: 2,
  sourceBytes: 1234,
  sourceMtimeMs: 5678.5,
  sourceSha256: 'b'.repeat(64),
  assetPath: {},
}

function sample(id: string, frame: number, extra = {}) {
  return {
    id,
    text: 'Ship faster',
    source: null,
    baseWidth: 400,
    baseHeight: 80,
    centerX: 100 + frame * 10,
    centerY: 200,
    worldWidth: 400 + frame * 40,
    worldHeight: 80 + frame * 8,
    rotation: frame * 2,
    opacity: 1 - frame * 0.1,
    visible: true,
    color: 'rgb(255, 255, 255)',
    colorAlpha: 1,
    font: {
      family: 'Inter',
      style: 'normal',
      weight: '700',
      size: 64,
      lineHeight: 72,
      tracking: -1,
      align: 'center',
    },
    warning: null,
    ...extra,
  }
}

describe('buildNativeLayerSidecar', () => {
  it('builds animated text with segment-relative frames and removes linear middle keys', () => {
    const samples = Array.from({ length: 5 }, (_, frame) => [sample(text.id, frame)])
    const sidecar = buildNativeLayerSidecar({ candidates: [text], warnings: [] }, samples, options)

    expect(sidecar).toEqual({
      version: 1,
      stage: { width: 1920, height: 1080 },
      fps: 10,
      frames: 5,
      sourceBytes: 1234,
      sourceMtimeMs: 5678.5,
      sourceSha256: 'b'.repeat(64),
      layers: [
        {
          ...text,
          inFrame: 0,
          outFrame: 5,
          keys: {
            position: [
              [0, 100, 200],
              [4, 140, 200],
            ],
            scale: [
              [0, 100, 100],
              [4, 140, 140],
            ],
            rotation: [
              [0, 0],
              [4, 8],
            ],
            opacity: [
              [0, 100],
              [4, 60],
            ],
          },
          warnings: [],
        },
      ],
      warnings: [],
    })
  })

  it('uses image natural dimensions and deterministic mapped source identity', () => {
    const image = {
      id: 'native-1-0',
      name: 'Product image',
      shotId: 'proof',
      kind: 'image',
      source: 'http://studio.local/work/uploads/product.webp',
      box: { width: 1200, height: 800 },
    }
    const imageSample = {
      id: image.id,
      text: null,
      source: image.source,
      baseWidth: 1200,
      baseHeight: 800,
      centerX: 960,
      centerY: 540,
      worldWidth: 600,
      worldHeight: 400,
      rotation: 0,
      opacity: 1,
      visible: true,
      warning: null,
    }
    const result = buildNativeLayerSidecar(
      { candidates: [image], warnings: [] },
      [[imageSample], [imageSample]],
      {
        ...options,
        frames: 2,
        assetPath: { [image.source]: 'uploads/product.webp' },
        assetSha256: { [image.source]: 'a'.repeat(64) },
      },
    )

    expect(result.layers[0]).toMatchObject({
      asset: 'uploads/product.webp',
      assetSha256: 'a'.repeat(64),
      box: { width: 1200, height: 800 },
      inFrame: 0,
      outFrame: 2,
      keys: {
        scale: [
          [0, 50, 50],
          [1, 50, 50],
        ],
      },
    })
  })

  it('rejects changing text and unsupported geometry with diagnostics', () => {
    const changing = [sample(text.id, 0), sample(text.id, 1, { text: 'Changed' })]
    const unsupported = {
      ...text,
      id: 'native-0-1',
      name: 'Clipped',
    }
    const result = buildNativeLayerSidecar(
      { candidates: [text, unsupported], warnings: ['shot "fx": canvas ancestor is unsupported'] },
      [
        [changing[0], sample(unsupported.id, 0, { warning: 'clip-path is unsupported' })],
        [changing[1], sample(unsupported.id, 1, { warning: 'clip-path is unsupported' })],
      ],
      { ...options, frames: 2 },
    )

    expect(result.layers).toEqual([])
    expect(result.warnings).toEqual([
      'shot "fx": canvas ancestor is unsupported',
      'Title (native-0-0): text changed during capture',
      'Clipped (native-0-1): clip-path is unsupported',
    ])
  })

  it('computes exclusive in/out frames without adding the source segment offset', () => {
    const hidden = sample(text.id, 0, { visible: false })
    const result = buildNativeLayerSidecar(
      { candidates: [text], warnings: [] },
      [[hidden], [sample(text.id, 1)], [sample(text.id, 2)], [hidden]],
      { ...options, frames: 4, from: 9 },
    )

    expect(result.layers[0]).toMatchObject({ inFrame: 0, outFrame: 4 })
    expect(result.layers[0].keys.position[0][0]).toBe(0)
  })

  it('retains zero-opacity boundary samples around a visible fade', () => {
    const hidden = sample(text.id, 0, { visible: false, opacity: 0 })
    const result = buildNativeLayerSidecar(
      { candidates: [text], warnings: [] },
      [[hidden], [sample(text.id, 1, { opacity: 0.4 })], [sample(text.id, 2)], [hidden]],
      { ...options, frames: 4 },
    )

    expect(result.layers[0].keys.opacity).toEqual([
      [0, 0],
      [2, 80],
      [3, 0],
    ])
  })

  it('keeps hostile labels and text as inert data', () => {
    const hostile = '<img src=x onerror=alert(1)>; globalThis.pwned = true'
    const candidate = { ...text, name: hostile, shotId: hostile, text: hostile }
    const result = buildNativeLayerSidecar(
      { candidates: [candidate], warnings: [] },
      [[sample(text.id, 0, { text: hostile })]],
      { ...options, frames: 1 },
    )

    expect(result.layers[0]).toMatchObject({ name: hostile, shotId: hostile, text: hostile })
    expect(JSON.parse(JSON.stringify(result)).layers[0].text).toBe(hostile)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('rejects local images without an approved raster mapping', () => {
    const source = 'http://studio.local/work/uploads/vector.svg'
    const image = {
      id: 'native-0-0',
      name: 'Vector',
      shotId: 'hero',
      kind: 'image',
      source,
      box: { width: 100, height: 100 },
    }
    const result = buildNativeLayerSidecar(
      { candidates: [image], warnings: [] },
      [[sample(image.id, 0, { source, baseWidth: 100, baseHeight: 100 })]],
      { ...options, frames: 1 },
    )

    expect(result.layers).toEqual([])
    expect(result.warnings).toContain(
      'Vector (native-0-0): image source is not an approved workspace raster asset',
    )
  })
})

describe('browser extractors', () => {
  it.each([discoverNativeCandidates, sampleNativeCandidates])(
    '%s is standalone serializable code',
    fn => {
      const restored = vm.runInNewContext(`(${fn.toString()})`)
      expect(typeof restored).toBe('function')
      expect(restored.name).toBe(fn.name)
    },
  )
})
