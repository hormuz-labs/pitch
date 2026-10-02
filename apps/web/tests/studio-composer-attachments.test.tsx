import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../src/solid/studio/Composer'
import type { ProjectStore } from '../src/solid/studio/useProject'

vi.mock('@solidjs/router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../src/solid/studio/client', () => ({
  studio: { models: vi.fn(async () => ({ default: '', models: [] })) },
}))
vi.mock('../src/solid/studio/CreditMarker', () => ({ CreditMarker: () => null }))
vi.mock('../src/solid/studio/PendingMessages', () => ({ PendingMessages: () => null }))
vi.mock('../src/solid/studio/useBrowserProfile', () => ({
  useBrowserProfile: () => ({ loading: () => true, origins: () => [] }),
}))

function setup() {
  const uploads = [{ name: 'logo.png', url: '/logo.png', type: 'image/png', size: 4 }]
  const store = {
    id: 'project-1',
    busy: false,
    draft: 'Use these assets',
    entries: [],
    targets: [],
    composerRef: { current: null },
    getToken: vi.fn(async () => 'token'),
    setDraft: vi.fn(),
    upload: vi.fn(async () => uploads),
    send: vi.fn(),
  } as unknown as ProjectStore
  let chat!: HTMLElement
  const rendered = render(() => (
    <aside ref={chat}>
      <div data-testid="feed">Chat messages</div>
      <Composer store={store} attachmentTarget={() => chat} />
    </aside>
  ))
  return { ...rendered, store, chat, uploads }
}

describe('Chat attachments', () => {
  it('attaches files dropped from browser downloads anywhere in the chat and sends their uploads', async () => {
    const { store, uploads } = setup()
    const file = new File(['logo'], 'logo.png', { type: 'image/png' })
    const transfer = { types: ['Files'], files: [file], dropEffect: '' }
    const feed = screen.getByTestId('feed')

    expect(fireEvent.dragOver(feed, { dataTransfer: transfer })).toBe(false)
    fireEvent.dragEnter(feed, { dataTransfer: transfer })
    expect(screen.getByRole('status').textContent).toContain('Drop files')
    expect(fireEvent.drop(feed, { dataTransfer: transfer })).toBe(false)
    expect(screen.getByText('logo.png')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('textbox'))

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(store.send).toHaveBeenCalledWith('Use these assets', {
        uploads,
        delivery: undefined,
      }),
    )
    expect(store.upload).toHaveBeenCalledWith([file])
  })

  it('pastes clipboard images with unique filenames and leaves ordinary text paste alone', async () => {
    const { store } = setup()
    const textbox = screen.getByRole('textbox')
    const image = new File(['image'], 'image.png', { type: 'image/png' })
    const clipboardData = { items: [{ kind: 'file', getAsFile: () => image }], files: [image] }
    expect(fireEvent.paste(textbox, { clipboardData })).toBe(false)
    expect(fireEvent.paste(textbox, { clipboardData })).toBe(false)
    expect(screen.getAllByRole('button', { name: /Remove pasted-image-/ })).toHaveLength(2)
    expect(
      fireEvent.paste(textbox, {
        clipboardData: { items: [{ kind: 'string' }], files: [], getData: () => 'text' },
      }),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(store.upload).toHaveBeenCalledOnce())
    const files = vi.mocked(store.upload).mock.calls[0][0]
    expect(files[0].name).not.toBe(files[1].name)
    expect(files.map(file => file.type)).toEqual(['image/png', 'image/png'])
  })

  it('rejects audio over 50 MB and allows removing a pending attachment', () => {
    setup()
    const file = new File(['audio'], 'large.mp3', { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
    fireEvent.drop(screen.getByTestId('feed'), {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    expect(screen.getByRole('alert').textContent).toContain('large.mp3 is over 50 MB')
    expect(screen.queryByRole('button', { name: 'Remove large.mp3' })).toBeNull()

    const image = new File(['logo'], 'logo.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('feed'), {
      dataTransfer: { types: ['Files'], files: [image] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo.png' }))
    expect(screen.queryByText('logo.png')).toBeNull()
  })

  it('limits repeated drops and pastes to 20 attachments, with room again after removing one', () => {
    setup()
    const files = Array.from(
      { length: 20 },
      (_, i) => new File(['image'], `photo-${i}.png`, { type: 'image/png' }),
    )
    fireEvent.drop(screen.getByTestId('feed'), { dataTransfer: { types: ['Files'], files } })
    expect(screen.getAllByRole('button', { name: /Remove photo-/ })).toHaveLength(20)
    const image = new File(['image'], 'image.png', { type: 'image/png' })
    const clipboardData = { items: [{ kind: 'file', getAsFile: () => image }], files: [image] }
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData })
    expect(screen.getByRole('alert').textContent).toContain('20 files')
    expect(screen.queryByRole('button', { name: /Remove pasted-image-/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo-0.png' }))
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData })
    expect(screen.getByRole('button', { name: /Remove pasted-image-/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects oversized pasted images before attaching', () => {
    setup()
    const image = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'image.png', {
      type: 'image/png',
    })
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { items: [{ kind: 'file', getAsFile: () => image }], files: [image] },
    })
    expect(screen.getByRole('alert').textContent).toContain('20 MB')
    expect(screen.queryByRole('button', { name: /Remove pasted-image-/ })).toBeNull()
  })
})
