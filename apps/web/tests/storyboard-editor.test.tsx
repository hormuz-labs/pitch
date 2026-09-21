import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoryboardEditor } from '../src/solid/studio/storyboard/StoryboardEditor'
import type { VideoStoryboard } from '../src/solid/studio/types'
import type { ProjectStore } from '../src/solid/studio/useProject'

const { saveStoryboard } = vi.hoisted(() => ({ saveStoryboard: vi.fn() }))
vi.mock('../src/solid/studio/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/solid/studio/client')>()
  return { ...actual, studio: { ...actual.studio, saveStoryboard } }
})

const storyboard: VideoStoryboard = {
  revision: 4,
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
      previewUrl: 'https://example.test/page-1.png',
      enabled: true,
      title: 'Opening result',
      screenText: ['Revenue increased by 24%'],
      narration: 'Revenue increased by 24% in the first quarter.',
      emphasis: [
        {
          phrase: 'Revenue increased by 24%',
          rect: { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 12 },
          coordinateSpace: 'page',
          style: 'highlighter',
          zoom: 1.7,
        },
      ],
      overlays: [],
      estimatedDurationSec: 3.2,
    },
  ],
}

function store() {
  return {
    id: 'project-1',
    project: { description: { extra: { storyboard } } },
    busy: false,
    getToken: vi.fn(async () => 'token'),
    addTarget: vi.fn(),
    setDraft: vi.fn(),
    send: vi.fn(async () => {}),
  } as unknown as ProjectStore
}

afterEach(() => saveStoryboard.mockReset())

describe('StoryboardEditor', () => {
  it('renders the restored canvas, narration, grounding and agent handoff', () => {
    const s = store()
    render(() => <StoryboardEditor store={s} />)

    expect(screen.getByText('Asset demo storyboard')).toBeTruthy()
    expect(screen.getByDisplayValue('Revenue increased by 24% in the first quarter.')).toBeTruthy()
    expect(screen.getByLabelText('Highlight 1 trigger phrase')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ask agent' }))
    expect(s.addTarget).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: 'scene-1', page: 1, tagName: 'storyboard-scene' }),
    )
    expect(s.setDraft).toHaveBeenCalledWith('Change this storyboard scene: ')
  })

  it('saves through the project storyboard contract without starting a chat turn', async () => {
    const s = store()
    saveStoryboard.mockResolvedValue({ ...storyboard, revision: 5 })
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Opening result'), {
      target: { value: 'Sharper opening' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledOnce())
    expect(saveStoryboard).toHaveBeenCalledWith(
      'token',
      'project-1',
      expect.objectContaining({
        revision: 4,
        scenes: [expect.objectContaining({ title: 'Sharper opening' })],
      }),
    )
    expect(s.send).not.toHaveBeenCalled()
  })
})
