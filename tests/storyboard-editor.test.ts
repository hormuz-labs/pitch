import { describe, expect, it } from 'vitest'
import {
  rebaseStoryboard,
  rectFromDrag,
  transformStoryboardRect,
  updateStoryboardScene,
} from '../apps/web/src/solid/studio/storyboard/editorModel'
import type { VideoStoryboard } from '../apps/web/src/solid/studio/types'

const storyboard: VideoStoryboard = {
  revision: 2,
  status: 'draft',
  transition: 'fade',
  titleCards: {
    intro: { enabled: false, title: '', subtitle: '' },
    outro: { enabled: false, title: '', subtitle: '' },
  },
  scenes: [
    {
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: 'page-1.png',
      enabled: true,
      title: 'Opening',
      screenText: [],
      narration: 'First narration.',
      emphasis: [],
      overlays: [],
      estimatedDurationSec: 2,
    },
  ],
}

describe('storyboard editor model', () => {
  it('edits a scene without changing the saved revision', () => {
    const edited = updateStoryboardScene(storyboard, 'scene-1', {
      narration: 'A more useful reviewed narration.',
    })
    expect(edited.revision).toBe(2)
    expect(edited.status).toBe('draft')
    expect(edited.scenes[0]?.narration).toBe('A more useful reviewed narration.')
    expect(storyboard.scenes[0]?.narration).toBe('First narration.')
  })

  it('turns a drag into a clamped page-relative rectangle', () => {
    expect(
      rectFromDrag(
        { x: 180, y: 290 },
        { x: 40, y: 80 },
        { left: 100, top: 100, width: 400, height: 200 },
      ),
    ).toEqual({ leftPct: 0, topPct: 0, widthPct: 20, heightPct: 95 })
  })

  it('keeps moved and resized rectangles inside the page', () => {
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

  it('rebases local fields over a newer remote revision without losing unrelated remote edits', () => {
    const local = updateStoryboardScene(storyboard, 'scene-1', { title: 'Local title' })
    const remote = updateStoryboardScene({ ...storyboard, revision: 3 }, 'scene-1', {
      narration: 'Remote narration.',
    })

    const rebased = rebaseStoryboard(storyboard, local, remote)

    expect(rebased.revision).toBe(3)
    expect(rebased.status).toBe('draft')
    expect(rebased.scenes[0]).toMatchObject({
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: 'page-1.png',
      title: 'Local title',
      narration: 'Remote narration.',
    })
  })

  it('keeps the local value when both revisions changed the same editable field', () => {
    const local = updateStoryboardScene(storyboard, 'scene-1', { title: 'Local title' })
    const remote = updateStoryboardScene({ ...storyboard, revision: 3 }, 'scene-1', {
      title: 'Remote title',
    })

    expect(rebaseStoryboard(storyboard, local, remote).scenes[0]?.title).toBe('Local title')
  })

  it('keeps local scene additions and deletions while accepting remote additions', () => {
    const added = {
      ...storyboard.scenes[0]!,
      id: 'scene-local',
      pageIndex: 1,
      title: 'Local addition',
    }
    const remoteAdded = {
      ...storyboard.scenes[0]!,
      id: 'scene-remote',
      pageIndex: 2,
      title: 'Remote addition',
    }
    const local = { ...storyboard, scenes: [added] }
    const remote = { ...storyboard, revision: 3, scenes: [...storyboard.scenes, remoteAdded] }

    expect(rebaseStoryboard(storyboard, local, remote).scenes.map(scene => scene.id)).toEqual([
      'scene-remote',
      'scene-local',
    ])
  })

  it('keeps a locally edited scene when the newer revision deleted it', () => {
    const local = updateStoryboardScene(storyboard, 'scene-1', { title: 'Keep my edit' })
    const remote = { ...storyboard, revision: 3, scenes: [] }

    expect(rebaseStoryboard(storyboard, local, remote).scenes).toMatchObject([
      { id: 'scene-1', title: 'Keep my edit' },
    ])
  })
})
