/**
 * Generated footage is the only third-party cost a turn has, and it is billed
 * where it happens: video_generate records what the clip cost, whichever chat
 * model asked for it, and a turn that never calls it records nothing.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({ seconds: 6 as number | null }))

vi.mock('../apps/api/src/render/media.js', () => ({
  execFileAsync: vi.fn(async () => {
    if (probe.seconds === null) throw new Error('ffprobe not installed')
    return {
      stdout: JSON.stringify({
        streams: [{ width: 1280, height: 720 }],
        format: { duration: String(probe.seconds) },
      }),
    }
  }),
}))

import {
  DEFAULT_OMNI_USD_PER_SECOND,
  FALLBACK_CLIP_SECONDS,
  generatedClipUsd,
  omniUsdPerSecond,
} from '../apps/api/src/pipelines/video-gen.js'
import {
  invokeHostAction,
  setHostActionGuard,
  takeProviderUsd,
} from '../apps/api/src/studio/host-actions.js'
import type { Workspace } from '../apps/api/src/studio/paths.js'

describe('generated clip pricing', () => {
  it('prices a clip by its length and resolution', () => {
    expect(generatedClipUsd('720p', 6)).toBeCloseTo(6 * DEFAULT_OMNI_USD_PER_SECOND['720p'])
    expect(generatedClipUsd('4k', 6)).toBeGreaterThan(generatedClipUsd('1080p', 6))
    expect(generatedClipUsd('360p', 6)).toBeLessThan(generatedClipUsd('720p', 6))
  })

  it('bills the typical clip length when the clip cannot be probed', () => {
    expect(generatedClipUsd('720p', null)).toBeCloseTo(
      FALLBACK_CLIP_SECONDS * DEFAULT_OMNI_USD_PER_SECOND['720p'],
    )
    expect(generatedClipUsd('720p', 0)).toBe(generatedClipUsd('720p', null))
    expect(generatedClipUsd('720p', Number.NaN)).toBe(generatedClipUsd('720p', null))
  })

  it('falls back to the 720p rate for an unpriced resolution', () => {
    expect(generatedClipUsd('8k', 2, { '720p': 0.1 })).toBeCloseTo(0.2)
  })

  it('merges deployment overrides and ignores bad values', () => {
    expect(omniUsdPerSecond('{"720p":0.12,"4k":"lots","1080p":-1}')).toEqual({
      ...DEFAULT_OMNI_USD_PER_SECOND,
      '720p': 0.12,
    })
    expect(omniUsdPerSecond('not json')).toEqual(DEFAULT_OMNI_USD_PER_SECOND)
    expect(omniUsdPerSecond(undefined)).toEqual(DEFAULT_OMNI_USD_PER_SECOND)
  })
})

describe('video_generate meters the provider', () => {
  let ws: Workspace
  const realFetch = globalThis.fetch

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    setHostActionGuard(null)
    const dir = await mkdtemp(path.join(tmpdir(), 'pitch-video-gen-'))
    ws = { flow: 'studio', userId: 'u', name: 'n', internal: `cost-${path.basename(dir)}`, dir }
    probe.seconds = 6
  })

  afterEach(async () => {
    globalThis.fetch = realFetch
    takeProviderUsd(ws.internal)
    await rm(ws.dir, { recursive: true, force: true })
  })

  const omniReturns = (body: unknown, status = 200) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as any
  }

  it('records the clip it generated, by probed length and resolution', async () => {
    omniReturns({
      id: 'v1_abc',
      steps: [
        {
          type: 'model_output',
          content: [
            { type: 'video', data: Buffer.from('mp4').toString('base64'), mime_type: 'video/mp4' },
          ],
        },
      ],
    })

    await invokeHostAction(ws, 'video_generate', {
      prompt: 'a sunrise over a city',
      out: 'sunrise.mp4',
      resolution: '1080p',
    })

    expect(takeProviderUsd(ws.internal)).toBeCloseTo(6 * DEFAULT_OMNI_USD_PER_SECOND['1080p'])
  })

  it('records nothing when the provider refuses', async () => {
    omniReturns({ error: { message: 'safety' } }, 400)

    await expect(
      invokeHostAction(ws, 'video_generate', { prompt: 'x', out: 'x.mp4' }),
    ).rejects.toThrow('refused')

    expect(takeProviderUsd(ws.internal)).toBe(0)
  })
})
