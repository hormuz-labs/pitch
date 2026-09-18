import { fireEvent, render, screen } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pause } = vi.hoisted(() => ({ pause: vi.fn() }))

vi.mock('@solidjs/router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../src/solid/studio/useProject', () => ({
  useProject: () => ({
    project: {
      title: 'Mobile preview',
      description: { preview: { kind: 'video', url: '/video.mp4' } },
      outputs: [],
    },
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
  VideoPreview: () => <video data-testid="video" />,
}))
vi.mock('../src/solid/studio/previews/HtmlPreview', () => ({ HtmlPreview: () => null }))
vi.mock('../src/solid/studio/previews/DeckPreview', () => ({ DeckPreview: () => null }))
vi.mock('../src/solid/studio/previews/PdfPreview', () => ({ PdfPreview: () => null }))
vi.mock('../src/solid/studio/previews/BrowserPreview', () => ({ BrowserPreview: () => null }))
vi.mock('../src/solid/studio/StudioProjectControls', () => ({ StudioProjectControls: () => null }))

import { StudioView } from '../src/solid/studio/StudioView'

describe('mobile preview collapse', () => {
  beforeEach(() => {
    pause.mockClear()
    vi.stubGlobal('innerWidth', 390)
  })

  it('keeps chat open while collapsing and restoring the same player', () => {
    const { container } = render(() => <StudioView projectId="project" />)
    expect(screen.queryByRole('button', { name: /Hide chat/ })).toBeNull()
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
})
