import { describe, expect, it } from 'vitest'
import {
  rectFromDrag,
  storyboardDurationSec,
  transformStoryboardRect,
  updateStoryboardScene,
  updateStoryboardTitleCard,
} from '../apps/web/src/lib/storyboardEditor'

const storyboard = {
  revision: 2,
  status: 'draft' as const,
  transition: 'fade' as const,
  scenes: [
    {
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: 'page-1.png',
      enabled: true,
      title: 'Opening',
      screenText: ['First point'],
      narration: 'First narration.',
      emphasis: [],
      estimatedDurationSec: 2,
    },
    {
      id: 'scene-2',
      pageIndex: 1,
      previewUrl: 'page-2.png',
      enabled: true,
      title: 'Results',
      screenText: ['Second point'],
      narration: 'Second narration.',
      emphasis: [],
      estimatedDurationSec: 2,
    },
  ],
}

describe('storyboard editor model', () => {
  it('includes enabled title cards in the reviewed final duration', () => {
    expect(
      storyboardDurationSec({
        ...storyboard,
        titleCards: {
          intro: { enabled: true, title: 'Opening', subtitle: '' },
          outro: { enabled: false, title: '', subtitle: '' },
        },
      }),
    ).toBe(6.5)
  })

  it('edits one title card without changing the other card or saved revision', () => {
    const current = {
      ...storyboard,
      titleCards: {
        intro: { enabled: false, title: '', subtitle: '' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
    }

    const edited = updateStoryboardTitleCard(current, 'intro', {
      enabled: true,
      title: 'Quarterly Review',
    })

    expect(edited).toMatchObject({
      revision: 2,
      status: 'draft',
      titleCards: {
        intro: { enabled: true, title: 'Quarterly Review', subtitle: '' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
    })
  })

  it('edits a scene without mutating the saved revision', () => {
    const edited = updateStoryboardScene(storyboard, 'scene-2', {
      narration: 'Reviewed result narration.',
    })

    expect(edited.revision).toBe(2)
    expect(edited.scenes.map(scene => scene.id)).toEqual(['scene-1', 'scene-2'])
    expect(edited.scenes[1]).toMatchObject({
      narration: 'Reviewed result narration.',
    })
    expect(storyboard.scenes[1]!.narration).toBe('Second narration.')
  })

  it('converts a user-drawn preview area into a clamped page-relative rectangle', () => {
    expect(
      rectFromDrag(
        { x: 180, y: 290 },
        { x: 40, y: 80 },
        { left: 100, top: 100, width: 400, height: 200 },
      ),
    ).toEqual({
      leftPct: 0,
      topPct: 0,
      widthPct: 20,
      heightPct: 95,
    })

    expect(
      rectFromDrag(
        { x: 120, y: 120 },
        { x: 121, y: 121 },
        { left: 100, top: 100, width: 400, height: 200 },
      ),
    ).toBeNull()
  })

  it('moves a grounding box while keeping the complete box inside the slide', () => {
    expect(
      transformStoryboardRect(
        { leftPct: 70, topPct: 60, widthPct: 30, heightPct: 40 },
        'move',
        { x: 100, y: 100 },
        { x: 500, y: 500 },
        { left: 100, top: 100, width: 400, height: 200 },
      ),
    ).toEqual({ leftPct: 70, topPct: 60, widthPct: 30, heightPct: 40 })
  })

  it('resizes a grounding box from a corner in slide-relative coordinates', () => {
    expect(
      transformStoryboardRect(
        { leftPct: 20, topPct: 20, widthPct: 30, heightPct: 30 },
        'northWest',
        { x: 100, y: 100 },
        { x: 60, y: 80 },
        { left: 0, top: 0, width: 400, height: 200 },
      ),
    ).toEqual({ leftPct: 10, topPct: 10, widthPct: 40, heightPct: 40 })
  })
})
