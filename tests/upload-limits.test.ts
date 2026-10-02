import { describe, expect, it } from 'vitest'
import { uploadLimitError, uploadSizeLimitMb } from '../packages/shared/src/upload-limits'

describe('Attachment limits shared by browser and server', () => {
  it.each([
    ['photo.png', 'image/png', 20],
    ['download.JPG', 'application/octet-stream', 20],
    ['pasted', 'image/webp', 20],
    ['song.mp3', 'audio/mpeg', 50],
    ['download.FLAC', 'application/octet-stream', 50],
    ['clip.mp4', 'video/mp4', 512],
    ['deck.pdf', 'application/pdf', 512],
  ])('accepts %s at its limit and rejects one byte over', (name, type, limit) => {
    expect(uploadSizeLimitMb({ name, type })).toBe(limit)
    expect(uploadLimitError([{ name, type, size: limit * 1024 * 1024 }])).toBeNull()
    expect(uploadLimitError([{ name, type, size: limit * 1024 * 1024 + 1 }])).toBe(
      `${name} is over ${limit} MB`,
    )
  })

  it('counts existing attachments when files are added in separate picks or pastes', () => {
    const file = { name: 'photo.png', type: 'image/png', size: 1 }
    expect(uploadLimitError(Array(20).fill(file))).toBeNull()
    expect(uploadLimitError([file], 19)).toBeNull()
    expect(uploadLimitError([file], 20)).toContain('20 files')
    expect(uploadLimitError(Array(21).fill(file))).toContain('20 files')
  })
})
