import { describe, expect, it } from 'vitest'
import {
  approveVideoStoryboard,
  createVideoStoryboard,
  defaultCalloutNoteRect,
  updateVideoStoryboard,
} from '../packages/shared/src/video-storyboard'

describe('video storyboard review contract', () => {
  it('starts every scene with an empty persistent overlay layer', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'page.png',
        narration: 'Explain the page.',
        emphasis: [],
      },
    ])

    expect(draft.scenes[0]?.overlays).toEqual([])
  })

  it('rejects blur overlays with unsafe strength values', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'blur',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              strength: 99,
            },
          ],
        },
      ]),
    ).toThrow('invalid blur strength')
  })

  it('rejects media overlays that do not use a browser-safe URL', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'media',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              url: 'javascript:alert(1)',
              alt: 'Reaction',
              source: 'upload',
            },
          ],
        },
      ]),
    ).toThrow('invalid media URL')
  })

  it('requires useful text for callout overlays', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'callout',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              text: '   ',
              shape: 'box',
              color: 'blue',
            },
          ],
        },
      ]),
    ).toThrow('callout needs text')
  })

  it('places legacy callout notes inside the page beside their target', () => {
    expect(
      defaultCalloutNoteRect({ leftPct: 80, topPct: 75, widthPct: 15, heightPct: 20 }),
    ).toEqual({ leftPct: 47, topPct: 78, widthPct: 28, heightPct: 14 })
  })

  it('rejects a moved callout note that leaves the rendered page', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'callout',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              noteRect: { leftPct: 90, topPct: 10, widthPct: 28, heightPct: 14 },
              text: 'Important result',
              shape: 'box',
              color: 'blue',
            },
          ],
        },
      ]),
    ).toThrow('callout note must stay inside')
  })

  it('rejects overlay types the slideshow cannot render', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'video',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
            } as any,
          ],
        },
      ]),
    ).toThrow('unsupported overlay type')
  })

  it('rejects invalid editor layer positions', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'blur',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              strength: 10,
              layer: -1,
            },
          ],
        },
      ]),
    ).toThrow('invalid layer position')
  })

  it('rejects callout presentation values outside the renderer allowlist', () => {
    expect(() =>
      createVideoStoryboard([
        {
          pageIndex: 0,
          previewUrl: 'page.png',
          narration: 'Explain the page.',
          emphasis: [],
          overlays: [
            {
              kind: 'callout',
              rect: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
              text: 'Important result',
              shape: 'box',
              color: 'blue" onclick="alert(1)',
            } as any,
          ],
        },
      ]),
    ).toThrow('unsupported callout presentation')
  })

  it('starts PDF title cards disabled with no fallback text', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'page.png',
        narration: 'Explain the page.',
        emphasis: [],
      },
    ])

    expect(draft.titleCards).toEqual({
      intro: { enabled: false, title: '', subtitle: '' },
      outro: { enabled: false, title: '', subtitle: '' },
    })
  })

  it('keeps reviewed title-card text and enabled choices in the next revision', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'page.png',
        narration: 'Explain the page.',
        emphasis: [],
      },
    ])

    const edited = updateVideoStoryboard(draft, {
      revision: draft.revision,
      scenes: draft.scenes,
      titleCards: {
        intro: { enabled: true, title: 'Quarterly Review', subtitle: 'April 2026' },
        outro: { enabled: true, title: 'Questions?', subtitle: 'finance@example.com' },
      },
    })

    expect(edited.titleCards).toEqual({
      intro: { enabled: true, title: 'Quarterly Review', subtitle: 'April 2026' },
      outro: { enabled: true, title: 'Questions?', subtitle: 'finance@example.com' },
    })
  })

  it('keeps legacy PDF storyboards card-free when they are approved', () => {
    const draft = createVideoStoryboard([
      {
        pageIndex: 0,
        previewUrl: 'page.png',
        narration: 'Explain the page.',
        emphasis: [],
      },
    ])
    const legacyDraft = { ...draft, titleCards: undefined } as any

    expect(approveVideoStoryboard(legacyDraft, draft.revision).titleCards).toEqual({
      intro: { enabled: false, title: '', subtitle: '' },
      outro: { enabled: false, title: '', subtitle: '' },
    })
  })

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
