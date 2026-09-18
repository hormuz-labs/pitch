import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { attachmentKind, NewProjectAttachment } from '../src/solid/account/NewProjectAttachment'

const image = {
  url: 'https://cdn.example.com/photo.jpg',
  name: 'photo.jpg',
  type: 'image/jpeg',
  size: 120,
}

describe('NewProjectAttachment', () => {
  it('shows an uploaded image as a visual thumbnail', () => {
    render(() => <NewProjectAttachment file={image} onRemove={vi.fn()} />)

    const preview = screen.getByRole('img', { name: 'photo.jpg' })
    expect(preview.getAttribute('src')).toBe(image.url)
    expect(screen.queryByText('photo.jpg')).toBeNull()
  })

  it('detects image and video files even when the browser reports a generic mime type', () => {
    expect(attachmentKind({ name: 'scan.webp', type: 'application/octet-stream' })).toBe('image')
    expect(attachmentKind({ name: 'clip.mov', type: 'application/octet-stream' })).toBe('video')
    expect(attachmentKind({ name: 'deck.pdf', type: 'application/pdf' })).toBe('file')
  })

  it('shows a compact file tile for non-visual attachments', () => {
    render(() => (
      <NewProjectAttachment
        file={{ url: '/deck.pdf', name: 'deck.pdf', type: 'application/pdf', size: 42 }}
        onRemove={vi.fn()}
      />
    ))

    expect(screen.getByLabelText('deck.pdf')).not.toBeNull()
    expect(screen.getByText('PDF')).not.toBeNull()
  })

  it('removes the selected attachment', () => {
    const remove = vi.fn()
    render(() => <NewProjectAttachment file={image} reference onRemove={remove} />)

    expect(screen.getByText('Reference')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo.jpg' }))
    expect(remove).toHaveBeenCalledOnce()
  })
})
