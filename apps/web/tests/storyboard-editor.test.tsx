import { fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryboardEditor } from '../src/solid/studio/storyboard/StoryboardEditor'
import type { VideoStoryboard } from '../src/solid/studio/types'
import type { ProjectStore } from '../src/solid/studio/useProject'

const { getProject, saveStoryboard } = vi.hoisted(() => ({
  getProject: vi.fn(),
  saveStoryboard: vi.fn(),
}))
vi.mock('../src/solid/studio/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/solid/studio/client')>()
  return { ...actual, studio: { ...actual.studio, get: getProject, saveStoryboard } }
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

beforeEach(() => vi.useRealTimers())
afterEach(() => {
  saveStoryboard.mockReset()
  getProject.mockReset()
  vi.useRealTimers()
})

describe('StoryboardEditor', () => {
  it('renders the restored canvas, narration, grounding and agent handoff', () => {
    const s = store()
    render(() => <StoryboardEditor store={s} />)

    expect(screen.getByText('Video storyboard')).toBeTruthy()
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

  it('autosaves a valid edit after the debounce without starting an agent turn', async () => {
    vi.useFakeTimers()
    const s = store()
    saveStoryboard.mockResolvedValue({ ...storyboard, revision: 5 })
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Opening result'), {
      target: { value: 'A stronger opening' },
    })
    await vi.advanceTimersByTimeAsync(899)
    expect(saveStoryboard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledOnce())
    expect(s.send).not.toHaveBeenCalled()
  })

  it('keeps edits visible and reports a failed save', async () => {
    const s = store()
    saveStoryboard.mockRejectedValue(new Error('Network save failed'))
    render(() => <StoryboardEditor store={s} />)

    const label = screen.getByDisplayValue('Opening result')
    fireEvent.input(label, { target: { value: 'Keep this local edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))

    await vi.waitFor(() => expect(screen.getByText('Network save failed')).toBeTruthy())
    expect(screen.getByDisplayValue('Keep this local edit')).toBeTruthy()
  })

  it('blocks an invalid narration trigger before it reaches the API', () => {
    const s = store()
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Revenue increased by 24% in the first quarter.'), {
      target: { value: 'A rewritten line without the saved trigger.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))

    expect(saveStoryboard).not.toHaveBeenCalled()
    expect(screen.getByText('Fix narration triggers before saving')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record with agent' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('saves pending changes before asking the agent to record', async () => {
    const s = store()
    saveStoryboard.mockResolvedValue({ ...storyboard, revision: 5 })
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Opening result'), {
      target: { value: 'Approved opening' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record with agent' }))

    await vi.waitFor(() => expect(s.send).toHaveBeenCalledOnce())
    expect(saveStoryboard.mock.invocationCallOrder[0]).toBeLessThan(
      s.send.mock.invocationCallOrder[0],
    )
    expect(s.send).toHaveBeenCalledWith(
      'Use the saved asset storyboard revision 5 as the exact contract. Record, render, and publish the finished asset demo now.',
    )
  })

  it('coalesces edits made during a save into a second revision', async () => {
    let finishFirst!: (value: VideoStoryboard) => void
    const first = new Promise<VideoStoryboard>(resolve => {
      finishFirst = resolve
    })
    const s = store()
    saveStoryboard.mockReturnValueOnce(first).mockResolvedValueOnce({
      ...storyboard,
      revision: 6,
      scenes: [{ ...storyboard.scenes[0]!, title: 'Second edit' }],
    })
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Opening result'), {
      target: { value: 'First edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledOnce())

    fireEvent.input(screen.getByDisplayValue('First edit'), {
      target: { value: 'Second edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
    finishFirst({ ...storyboard, revision: 5 })

    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledTimes(2))
    expect(saveStoryboard.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        revision: 5,
        scenes: [expect.objectContaining({ title: 'Second edit' })],
      }),
    )
  })

  it('rebases visible local edits over the latest revision after a conflict', async () => {
    const conflict = Object.assign(new Error('Storyboard revision conflict'), { status: 409 })
    const remote = {
      ...storyboard,
      revision: 5,
      scenes: [
        {
          ...storyboard.scenes[0]!,
          narration: 'Revenue increased by 24%, according to the remote reviewer.',
        },
      ],
    }
    const saved = {
      ...remote,
      revision: 6,
      scenes: [{ ...remote.scenes[0]!, title: 'My local title' }],
    }
    const s = store()
    saveStoryboard.mockRejectedValueOnce(conflict).mockResolvedValueOnce(saved)
    getProject.mockResolvedValue({ description: { extra: { storyboard: remote } } })
    render(() => <StoryboardEditor store={s} />)

    fireEvent.input(screen.getByDisplayValue('Opening result'), {
      target: { value: 'My local title' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))

    await vi.waitFor(() =>
      expect(screen.getByText('Merged with revision 5 · review and save again')).toBeTruthy(),
    )
    expect(screen.getByDisplayValue('My local title')).toBeTruthy()
    expect(
      screen.getByDisplayValue('Revenue increased by 24%, according to the remote reviewer.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledTimes(2))
    expect(saveStoryboard.mock.calls[1]?.[2]).toMatchObject({
      revision: 5,
      scenes: [
        {
          title: 'My local title',
          narration: 'Revenue increased by 24%, according to the remote reviewer.',
        },
      ],
    })
  })
})
