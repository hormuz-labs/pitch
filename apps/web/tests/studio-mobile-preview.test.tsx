import { fireEvent, render, screen } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pause, project } = vi.hoisted(() => ({
  pause: vi.fn(),
  project: {
    title: 'Mobile preview',
    description: {
      preview: { kind: 'video', url: '/video.mp4' },
      scenes: [] as any[],
      extra: undefined as { storyboard?: unknown } | undefined,
    },
    outputs: [],
  },
}))

vi.mock('@solidjs/router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../src/solid/studio/useProject', () => ({
  useProject: () => ({
    project,
    assets: [],
    entries: [],
    targets: [],
    draft: '',
    player: { current: { pause } },
    previewUrl: (url: string) => url,
  }),
}))
vi.mock('../src/solid/studio/Composer', () => ({
  Composer: () => <textarea aria-label="Message" />,
}))
vi.mock('../src/solid/studio/Thread', () => ({ Thread: () => null }))
vi.mock('../src/solid/studio/AssetShelf', () => ({ AssetShelf: () => null }))
vi.mock('../src/solid/studio/Strips', () => ({ SceneStrip: () => null, SlideStrip: () => null }))
vi.mock('../src/solid/studio/previews/VideoPreview', () => ({
  VideoPreview: (props: { showRangeSelector?: boolean }) => (
    <video data-testid="video" data-range-selector={String(props.showRangeSelector)} />
  ),
}))
vi.mock('../src/solid/studio/previews/HtmlPreview', () => ({ HtmlPreview: () => null }))
vi.mock('../src/solid/studio/previews/DeckPreview', () => ({ DeckPreview: () => null }))
vi.mock('../src/solid/studio/previews/PdfPreview', () => ({ PdfPreview: () => null }))
vi.mock('../src/solid/studio/previews/BrowserPreview', () => ({ BrowserPreview: () => null }))
vi.mock('../src/solid/studio/StudioProjectControls', () => ({ StudioProjectControls: () => null }))
vi.mock('../src/solid/studio/storyboard/StoryboardEditor', () => ({
  StoryboardEditor: () => <div aria-label="Asset storyboard editor" />,
}))

import { StudioView } from '../src/solid/studio/StudioView'

describe('mobile preview collapse', () => {
  beforeEach(() => {
    pause.mockClear()
    project.description.scenes = []
    project.description.extra = undefined
    vi.stubGlobal('innerWidth', 390)
  })

  it('hides the generic range selector when the detailed scene timeline is available', () => {
    project.description.scenes = [{ id: 'beat-1', index: 0, start: 0, end: 2 }]
    render(() => <StudioView projectId="project" />)
    expect(screen.getByTestId('video').getAttribute('data-range-selector')).toBe('false')
  })

  it('keeps range selection for a plain video without a detailed timeline', () => {
    render(() => <StudioView projectId="project" />)
    expect(screen.getByTestId('video').getAttribute('data-range-selector')).toBe('true')
  })

  it('keeps chat open while collapsing and restoring the same player', () => {
    const { container } = render(() => <StudioView projectId="project" />)
    expect(screen.getByRole('button', { name: /Hide chat/ })).toBeTruthy()
    expect(container.querySelector('.lv-studio')?.classList.contains('is-chat-expanded')).toBe(true)
    const toggle = screen.getByRole('button', { name: 'Collapse video' })
    const stage = document.getElementById(toggle.getAttribute('aria-controls')!)!
    const video = screen.getByTestId('video')

    fireEvent.click(toggle)
    expect(pause).toHaveBeenCalledOnce()
    expect(stage.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.lv-studio')?.classList.contains('is-chat-expanded')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Expand video' }))
    expect(stage.hidden).toBe(false)
    expect(screen.getByTestId('video')).toBe(video)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('restores the preview on desktop and when the Preview tab is selected', () => {
    render(() => <StudioView projectId="project" />)
    const toggle = screen.getByRole('button', { name: 'Collapse video' })
    const stage = document.getElementById(toggle.getAttribute('aria-controls')!)!
    fireEvent.click(toggle)

    vi.stubGlobal('innerWidth', 1200)
    fireEvent(window, new Event('resize'))
    expect(stage.hidden).toBe(false)

    vi.stubGlobal('innerWidth', 390)
    fireEvent(window, new Event('resize'))
    expect(stage.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(stage.hidden).toBe(false)
  })

  it('opens the storyboard automatically when a planned storyboard becomes available', () => {
    project.description.extra = { storyboard: { revision: 1, scenes: [] } }

    render(() => <StudioView projectId="project" />)

    expect(screen.getByRole('button', { name: 'Storyboard' }).classList.contains('is-active')).toBe(
      true,
    )
    expect(screen.getByLabelText('Asset storyboard editor')).not.toBeNull()
  })

  it('lets the user move between the storyboard and the existing preview', () => {
    project.description.extra = { storyboard: { revision: 1, scenes: [] } }
    render(() => <StudioView projectId="project" />)

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Preview' }).classList.contains('is-active')).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Storyboard' }))
    expect(screen.getByRole('button', { name: 'Storyboard' }).classList.contains('is-active')).toBe(
      true,
    )
  })
})
