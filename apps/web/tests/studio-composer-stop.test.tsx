import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../src/solid/studio/Composer'
import type { ProjectStore } from '../src/solid/studio/useProject'

const mocks = vi.hoisted(() => ({
  models: vi.fn(async () => ({ default: 'google/gemini', models: [] })),
  navigate: vi.fn(),
}))

vi.mock('@solidjs/router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../src/solid/studio/client', () => ({ studio: { models: mocks.models } }))
vi.mock('../src/solid/studio/CreditMarker', () => ({ CreditMarker: () => null }))
vi.mock('../src/solid/studio/PendingMessages', () => ({ PendingMessages: () => null }))
vi.mock('../src/solid/studio/useBrowserProfile', () => ({
  useBrowserProfile: () => ({ loading: () => true, origins: () => [] }),
}))

function projectStore(overrides: Record<string, unknown> = {}): ProjectStore {
  return {
    id: 'project-1',
    activeModel: 'google/gemini',
    busy: true,
    clearTargets: vi.fn(),
    composerRef: { current: null },
    draft: '',
    entries: [],
    getToken: vi.fn(async () => 'token'),
    model: null,
    project: null,
    removeTarget: vi.fn(),
    selectedScene: null,
    selectedSlide: null,
    send: vi.fn(),
    setDraft: vi.fn(),
    setModel: vi.fn(),
    setSelectedScene: vi.fn(),
    setSelectedSlide: vi.fn(),
    steerQueued: vi.fn(),
    stop: vi.fn(async () => true),
    targets: [],
    upload: vi.fn(async () => []),
    ...overrides,
  } as unknown as ProjectStore
}

beforeEach(() => {
  mocks.models.mockClear()
  mocks.navigate.mockClear()
})

describe('Studio composer stop control', () => {
  it('stops an active generation when the composer is empty', async () => {
    const stop = vi.fn(async () => true)
    render(() => <Composer store={projectStore({ stop })} />)

    const button = screen.getByRole('button', { name: 'Stop generation' })
    expect(button.className).toContain('job-stop-task')
    expect(button.className).toContain('job-send-round')
    expect(button.classList.contains('stop')).toBe(false)
    fireEvent.click(button)

    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
  })

  it('keeps stop available alongside a queued follow-up draft', async () => {
    const stop = vi.fn(async () => true)
    render(() => <Composer store={projectStore({ draft: 'Do this next', stop })} />)

    expect(screen.getByRole('button', { name: 'Queue message' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }))

    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
  })

  it('shows a useful error and re-enables stop when cancellation fails', async () => {
    const stop = vi.fn(async () => {
      throw new Error('Worker unavailable')
    })
    render(() => <Composer store={projectStore({ stop })} />)

    const button = screen.getByRole('button', { name: 'Stop generation' })
    fireEvent.click(button)

    expect((await screen.findByRole('alert')).textContent).toContain('Worker unavailable')
    expect(button.hasAttribute('disabled')).toBe(false)
  })
})
