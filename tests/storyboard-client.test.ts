import { afterEach, describe, expect, it, vi } from 'vitest'
import { studio } from '../apps/web/src/solid/studio/client'
import type { VideoStoryboard } from '../apps/web/src/solid/studio/types'

const storyboard: VideoStoryboard = {
  revision: 7,
  approvedRevision: 7,
  status: 'approved',
  transition: 'zoom',
  titleCards: {
    intro: { enabled: true, title: 'Quarterly update', subtitle: 'Q1' },
    outro: { enabled: false, title: '', subtitle: '' },
  },
  scenes: [
    {
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: '/page.png',
      enabled: true,
      title: 'Result',
      screenText: [],
      narration: 'Revenue increased.',
      emphasis: [],
      overlays: [],
      estimatedDurationSec: 2,
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('storyboard client', () => {
  it('posts the optimistic editable contract to the encoded project endpoint', async () => {
    const saved = { ...storyboard, revision: 8, status: 'draft' as const }
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(saved), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(studio.saveStoryboard('token', 'project/id', storyboard)).resolves.toEqual(saved)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/projects\/project%2Fid\/storyboard$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          revision: storyboard.revision,
          transition: storyboard.transition,
          titleCards: storyboard.titleCards,
          scenes: storyboard.scenes,
        }),
      }),
    )
  })

  it('preserves a revision conflict for editor recovery', async () => {
    const message = 'Storyboard revision conflict: expected 8, received 7.'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: message }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(studio.saveStoryboard('token', 'project', storyboard)).rejects.toMatchObject({
      status: 409,
      message,
    })
  })
})
