import { describe, expect, it } from 'vitest'
import {
  approveVideoStoryboard,
  createVideoStoryboard,
  updateVideoStoryboard,
} from '../packages/shared/src/video-storyboard'

describe('video storyboard review contract', () => {
  it('approves the exact reviewed revision for rendering', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'https://cdn.example/page-1.png',
        narration: 'The report opens with a ninety-three percent literacy rate.',
        emphasis: [
          {
            phrase: 'ninety-three percent',
            rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
            coordinateSpace: 'viewport',
            style: 'pulse',
            zoom: 1.7,
          },
        ],
      },
    ])

    const edited = updateVideoStoryboard(draft, {
      revision: 1,
      scenes: [
        {
          ...draft.scenes[0]!,
          narration: 'The literacy rate reaches 93 percent.',
          emphasis: [{ ...draft.scenes[0]!.emphasis[0]!, phrase: '93 percent' }],
        },
      ],
    })
    const approved = approveVideoStoryboard(edited, 2)

    expect(approved).toMatchObject({
      revision: 2,
      approvedRevision: 2,
      status: 'approved',
      scenes: [{ narration: 'The literacy rate reaches 93 percent.' }],
    })
  })

  it('rejects annotation types the renderer cannot draw', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'https://cdn.example/page-1.png',
          narration: 'Explain this area.',
          emphasis: [
            {
              phrase: 'this area',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              coordinateSpace: 'page',
              style: 'sparkles' as any,
              zoom: 1.7,
            },
          ],
        },
      ]),
    ).toThrow('unsupported annotation type')
  })

  it('requires each annotation trigger phrase to occur in that scene narration', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'https://cdn.example/page-1.png',
          narration: 'The report shows a 93 percent literacy rate.',
          emphasis: [
            {
              phrase: 'unrelated words',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              coordinateSpace: 'page',
              style: 'box',
              zoom: 1.7,
            },
          ],
        },
      ]),
    ).toThrow('must match words in its narration')
  })

  it('rejects slideshow transitions the renderer does not support', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'page.png',
        narration: 'Explain the page.',
        emphasis: [],
      },
    ])

    expect(() =>
      updateVideoStoryboard(draft, {
        revision: 1,
        transition: 'spin' as any,
        scenes: draft.scenes,
      }),
    ).toThrow('unsupported slideshow transition')
  })
})
