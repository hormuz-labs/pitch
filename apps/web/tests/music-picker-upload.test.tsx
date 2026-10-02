import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicPicker } from '../src/solid/studio/MusicPicker'
import type { Asset } from '../src/solid/studio/types'

const music = vi.hoisted(() => vi.fn())
vi.mock('../src/solid/studio/client', () => ({ studio: { music } }))

const personal = {
  name: 'My song.mp3',
  file: 'uploads/My_song.mp3',
  url: '/my-song.mp3',
  duration: null,
}
function setup(assets: Asset[] = []) {
  const onUpload = vi.fn(async () => personal)
  const onApply = vi.fn()
  const rendered = render(() => (
    <MusicPicker
      getToken={async () => 'token'}
      mediaUrl={path => path ?? null}
      assets={assets}
      onUpload={onUpload}
      onApply={onApply}
      onClose={vi.fn()}
    />
  ))
  return { ...rendered, onUpload, onApply }
}

beforeEach(() => {
  music.mockReset().mockResolvedValue([])
})

describe('Personal soundtracks', () => {
  it('uploads and selects a personal track, then applies its workspace path', async () => {
    const { container, onUpload, onApply } = setup()
    const file = new File(['audio'], 'My song.mp3', { type: 'audio/mpeg' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('My song.mp3')).toBeTruthy())
    expect(onUpload).toHaveBeenCalledWith(file)
    expect(screen.getByRole('button', { name: 'Preview My song.mp3' })).toBeTruthy()
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply track' }))
    expect(onApply).toHaveBeenCalledWith(personal)
  })

  it('rejects oversized and unsupported drops before uploading', () => {
    const { onUpload } = setup()
    const file = new File(['audio'], 'large.wav', { type: 'audio/wav' })
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
    fireEvent.drop(screen.getByRole('dialog'), {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    expect(screen.getByRole('alert').textContent).toContain('over 50 MB')
    fireEvent.drop(screen.getByRole('dialog'), {
      dataTransfer: {
        types: ['Files'],
        files: [new File(['image'], 'image.png', { type: 'image/png' })],
      },
    })
    expect(screen.getByRole('alert').textContent).toContain('audio file')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('accepts a 50 MB audio drop and keeps existing personal tracks usable when the library fails', async () => {
    music.mockRejectedValue(new Error('Library unavailable'))
    const { onUpload } = setup([
      {
        name: 'saved.mp3',
        path: 'uploads/saved.mp3',
        kind: 'audio',
        origin: 'upload',
        size: 10,
        url: '/saved.mp3',
        mtime: '',
        thumbUrl: null,
      },
    ])
    await screen.findByText('Library unavailable')
    fireEvent.click(screen.getByRole('button', { name: /saved.mp3 Your audio/ }))
    expect(screen.getByRole('button', { name: 'Apply track' }).hasAttribute('disabled')).toBe(false)

    const file = new File(['audio'], 'limit.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 })
    fireEvent.drop(screen.getByRole('dialog'), {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
  })
})
