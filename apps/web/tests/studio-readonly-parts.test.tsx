import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { AssetShelf } from '../src/solid/studio/AssetShelf'
import { Thread } from '../src/solid/studio/Thread'

const restorable = {
  id: 'e1',
  role: 'user' as const,
  text: 'Make it faster',
  at: 1,
  sessionEntryId: 's1',
  checkpointId: 'c1',
}

describe('Thread edit-and-resend', () => {
  it('is offered when the thread can edit', () => {
    render(() => <Thread entries={[restorable]} busy={false} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Edit and resend from this message' })).toBeTruthy()
  })

  it('is not offered in a read-only thread', () => {
    render(() => <Thread entries={[restorable]} busy={false} />)
    expect(screen.queryByRole('button', { name: 'Edit and resend from this message' })).toBeNull()
    expect(screen.getByText('Make it faster')).toBeTruthy()
  })
})

const asset = {
  path: 'renders/final.mp4',
  name: 'final.mp4',
  kind: 'video',
  origin: 'render',
  size: 1024,
  mtime: '2026-09-01T10:00:00.000Z',
  url: '/files/projects/studio--owner--p/renders/final.mp4',
  thumbUrl: '/projects/p1/assets/thumb?path=renders%2Ffinal.mp4',
}

function shelfStore(readOnly: boolean) {
  return {
    readOnly,
    assets: [asset],
    targets: [],
    mediaUrl: (url: string | null) => url,
    addAssets: vi.fn(),
    deleteAsset: vi.fn(),
    addTarget: vi.fn(),
  } as any
}

describe('AssetShelf', () => {
  it('lets the owner add, reference and delete files', () => {
    render(() => <AssetShelf store={shelfStore(false)} />)
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy()
    expect(screen.getByTitle('Reference this file in your next message')).toBeTruthy()
    fireEvent.click(screen.getByTitle(/click to open/))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use in chat' })).toBeTruthy()
  })

  it('in review: files open and download, but nothing can be added, referenced or deleted', () => {
    const store = shelfStore(true)
    render(() => <AssetShelf store={store} />)
    expect(screen.queryByRole('button', { name: '+ Add' })).toBeNull()
    expect(screen.queryByTitle('Reference this file in your next message')).toBeNull()
    fireEvent.click(screen.getByTitle(/click to open/))
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use in chat' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(asset.url)
  })

  it.each([
    [false, 1],
    [true, 0],
  ])('a file dropped on the shelf (read-only: %s) is added %i times', (readOnly, times) => {
    const store = shelfStore(readOnly)
    const { container } = render(() => <AssetShelf store={store} />)
    const file = new File(['x'], 'drop.png', { type: 'image/png' })
    fireEvent.drop(container.querySelector('.asset-shelf')!, {
      dataTransfer: { files: [file], types: ['Files'] },
    })
    expect(store.addAssets).toHaveBeenCalledTimes(times)
  })
})
