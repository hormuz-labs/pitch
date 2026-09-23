import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  threadProps: [] as any[],
  download: vi.fn(),
  saveBlob: vi.fn(),
  store: {} as Record<string, any>,
}))

vi.mock('@solidjs/router', () => ({
  useNavigate: () => mocks.navigate,
  A: (props: any) => (
    <a href={props.href} aria-label={props['aria-label']}>
      {props.children}
    </a>
  ),
}))
vi.mock('../src/solid/studio/useProject', () => ({ useProject: () => mocks.store }))
vi.mock('../src/solid/studio/Composer', () => ({
  Composer: () => <textarea aria-label="Message" />,
}))
vi.mock('../src/solid/studio/Thread', () => ({
  Thread: (props: any) => {
    mocks.threadProps.push(props)
    return <div data-testid="thread" />
  },
}))
vi.mock('../src/solid/studio/AssetShelf', () => ({ AssetShelf: () => null }))
vi.mock('../src/solid/studio/Strips', () => ({ SceneStrip: () => null, SlideStrip: () => null }))
vi.mock('../src/solid/studio/previews/VideoPreview', () => ({ VideoPreview: () => null }))
vi.mock('../src/solid/studio/previews/HtmlPreview', () => ({ HtmlPreview: () => null }))
vi.mock('../src/solid/studio/previews/DeckPreview', () => ({
  DeckPreview: (props: { src: string }) => <div data-testid="deck-preview" data-src={props.src} />,
}))
vi.mock('../src/solid/studio/deck/DeckEditor', () => ({
  DeckEditor: (props: { src: string }) => <div data-testid="deck-editor" data-src={props.src} />,
}))
vi.mock('../src/solid/studio/previews/PdfPreview', () => ({ PdfPreview: () => null }))
vi.mock('../src/solid/studio/previews/BrowserPreview', () => ({ BrowserPreview: () => null }))
vi.mock('../src/solid/studio/StudioProjectControls', () => ({
  StudioProjectControls: () => <div data-testid="owner-controls" />,
}))
vi.mock('../src/solid/studio/storyboard/StoryboardEditor', () => ({ StoryboardEditor: () => null }))
vi.mock('../src/lib/save-blob', () => ({ saveBlob: mocks.saveBlob }))
vi.mock('../src/solid/studio/client', async () => {
  const actual = await vi.importActual<any>('../src/solid/studio/client')
  return { ...actual, adminStudio: { ...actual.adminStudio, download: mocks.download } }
})

import { AdminReviewBar, ownerLabel } from '../src/solid/studio/AdminReviewBar'
import { StudioView } from '../src/solid/studio/StudioView'

function store(over: Record<string, any> = {}) {
  return {
    id: 'p1',
    readOnly: true,
    owner: { id: 'owner-id', email: 'owner@example.com', firstName: 'Olive', lastName: 'Owner' },
    initialLoading: false,
    loadError: null,
    project: {
      id: 'p1',
      title: 'Launch deck',
      status: 'ready',
      options: {},
      outputs: [],
      shareSlug: null,
      description: {
        preview: { kind: 'deck', url: '/files/projects/x/deck.html?v=1' },
        outputs: [],
      },
    },
    entries: [{ id: 'e1', role: 'user', text: 'hi', at: 1 }],
    busy: false,
    assets: [],
    targets: [],
    draft: '',
    player: { current: null },
    previewUrl: (url: string) => url,
    mediaUrl: (url: string) => url,
    getToken: async () => 'tok',
    send: vi.fn(),
    rollback: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.threadProps = []
  vi.stubGlobal('innerWidth', 1280)
})

describe('StudioView as an admin review', () => {
  it('shows whose project it is, and the downloads, instead of the owner’s controls', () => {
    mocks.store = store()
    render(() => <StudioView projectId="p1" admin />)
    expect(screen.getByText('Admin view')).toBeTruthy()
    expect(screen.getByText('owner@example.com')).toBeTruthy()
    expect(screen.getByText('Launch deck')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download for review' })).toBeTruthy()
    expect(screen.queryByTestId('owner-controls')).toBeNull()
  })

  it('has no composer, share or export — only a read-only note', () => {
    mocks.store = store()
    render(() => <StudioView projectId="p1" admin />)
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.getByRole('note').textContent).toContain('Read-only admin view')
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /export options/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /soundtrack/i })).toBeNull()
  })

  it('shows the conversation without answer or edit-and-resend', () => {
    mocks.store = store()
    render(() => <StudioView projectId="p1" admin />)
    expect(screen.getByTestId('thread')).toBeTruthy()
    const props = mocks.threadProps.at(-1)
    expect(props.entries).toHaveLength(1)
    expect(props.onAnswer).toBeUndefined()
    expect(props.onEdit).toBeUndefined()
  })

  it('shows a deck as a plain preview, never the editor that saves', () => {
    mocks.store = store()
    render(() => <StudioView projectId="p1" admin />)
    expect(screen.queryByTestId('deck-editor')).toBeNull()
    const preview = screen.getByTestId('deck-preview')
    expect(preview.getAttribute('data-src')).toContain('studio=1')
    expect(preview.getAttribute('data-src')).not.toContain('edit=1')
  })

  it('stays on an empty project instead of bouncing to /new', () => {
    const empty = {
      entries: [],
      project: { ...store().project, status: 'empty', description: { preview: null, outputs: [] } },
    }
    mocks.store = store(empty)
    render(() => <StudioView projectId="p1" admin />)
    expect(mocks.navigate).not.toHaveBeenCalled()

    // The owner, in the same state, is sent to start something new.
    mocks.store = store({ ...empty, readOnly: false })
    render(() => <StudioView projectId="p1" />)
    expect(mocks.navigate).toHaveBeenCalledWith('/new', { replace: true })
  })

  it('shows why the page will not load for a non-admin', () => {
    mocks.store = store({ loadError: 'Only administrators can open this view.', project: null })
    render(() => <StudioView projectId="p1" admin />)
    expect(screen.getByText('Only administrators can open this view.')).toBeTruthy()
    expect(screen.queryByTestId('thread')).toBeNull()
  })
})

describe('StudioView for the owner is unchanged', () => {
  it('keeps the composer, owner controls, deck editor and edit-and-resend', () => {
    mocks.store = store({ readOnly: false, owner: null })
    render(() => <StudioView projectId="p1" />)
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.getByTestId('owner-controls')).toBeTruthy()
    expect(screen.getByTestId('deck-editor')).toBeTruthy()
    expect(screen.queryByText('Admin view')).toBeNull()
    const props = mocks.threadProps.at(-1)
    expect(props.onAnswer).toBe(mocks.store.send)
    expect(typeof props.onEdit).toBe('function')
  })
})

describe('AdminReviewBar downloads', () => {
  const owner = { id: 'owner-id', email: 'owner@example.com' }

  it.each([
    ['Chat (Markdown)', 'chat', 'pitch-p1-chat.md'],
    ['Chat (JSON)', 'chat-json', 'pitch-p1-chat.json'],
    ['Full logs (JSON)', 'logs', 'pitch-p1-logs.json'],
  ])('%s', async (label, kind, filename) => {
    const blob = new Blob(['x'])
    mocks.download.mockResolvedValueOnce({ blob, filename })
    render(() => (
      <AdminReviewBar projectId="p1" title="Launch" owner={owner} getToken={async () => 'tok'} />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Download for review' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: label }))
    await waitFor(() => expect(mocks.saveBlob).toHaveBeenCalledWith(blob, filename))
    expect(mocks.download).toHaveBeenCalledWith('tok', 'p1', kind)
  })

  it('names the file itself when the server does not', async () => {
    const blob = new Blob(['x'])
    mocks.download.mockResolvedValueOnce({ blob, filename: null })
    render(() => <AdminReviewBar projectId="p1" owner={owner} getToken={async () => 'tok'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download for review' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Full logs (JSON)' }))
    await waitFor(() => expect(mocks.saveBlob).toHaveBeenCalledWith(blob, 'pitch-p1-logs.json'))
  })

  it('shows a refusal instead of saving anything', async () => {
    mocks.download.mockRejectedValueOnce(new Error('Not authorized as admin'))
    render(() => <AdminReviewBar projectId="p1" owner={owner} getToken={async () => 'tok'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download for review' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Chat (Markdown)' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Not authorized as admin')
    expect(mocks.saveBlob).not.toHaveBeenCalled()
  })

  it('labels the owner by email, then name, then id', () => {
    expect(ownerLabel({ id: 'u', email: 'a@b.co', firstName: 'A' })).toBe('a@b.co')
    expect(ownerLabel({ id: 'u', firstName: 'Ada', lastName: 'L' })).toBe('Ada L')
    expect(ownerLabel({ id: 'u' })).toBe('u')
    expect(ownerLabel(null)).toBe('Unknown owner')
  })
})
