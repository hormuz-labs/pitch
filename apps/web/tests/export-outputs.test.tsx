import { describe, expect, it } from 'vitest'
import { downloadableOutputs } from '../src/solid/studio/export-outputs'
import type { ProjectDetail } from '../src/solid/studio/types'

const output = (
  kind: 'pdf' | 'html' | 'video',
  url: string,
  createdAt = '2026-09-19T00:00:00.000Z',
) => ({
  kind,
  url,
  createdAt,
})

function project(preview: 'deck' | 'video'): ProjectDetail {
  return {
    outputs: [output('pdf', '/published/old.pdf'), output('html', '/published/deck.html')],
    description: {
      preview: { kind: preview, url: '/preview' },
      outputs: [
        output('pdf', '/files/project/build/output.pdf'),
        output('html', '/files/project/deck.html'),
      ],
    },
  } as ProjectDetail
}

describe('downloadableOutputs', () => {
  it('uses only the current workspace PDF for a deck', () => {
    expect(downloadableOutputs(project('deck')).map(item => item.url)).toEqual([
      '/files/project/build/output.pdf',
    ])
  })

  it('never offers HTML as an export', () => {
    const video = project('video')
    video.outputs = [
      output('video', '/published/video.mp4'),
      output('html', '/published/page.html'),
    ]
    video.description.outputs = []
    expect(downloadableOutputs(video).map(item => item.kind)).toEqual(['video'])
  })

  it('shows only the newest final video while retaining PDFs', () => {
    const video = project('video')
    video.outputs = [
      output('video', '/published/older.mp4', '2026-09-19T10:00:00.000Z'),
      output('pdf', '/published/notes.pdf'),
    ]
    video.description.outputs = [
      output('video', '/files/project/renders/newest.mp4', '2026-09-19T12:00:00.000Z'),
      output('video', '/files/project/renders/oldest.mp4', '2026-09-19T09:00:00.000Z'),
    ]

    expect(downloadableOutputs(video).map(item => item.url)).toEqual([
      '/files/project/renders/newest.mp4',
      '/published/notes.pdf',
    ])
  })

  it('deduplicates the same final video URL from published and workspace outputs', () => {
    const video = project('video')
    const final = output('video', '/files/project/renders/final.mp4')
    video.outputs = [final]
    video.description.outputs = [final]
    expect(downloadableOutputs(video)).toEqual([final])
  })

  it('never offers HTML while the preview is still loading (kind null)', () => {
    const loading = project('deck')
    loading.description.preview = null
    expect(downloadableOutputs(loading).map(item => item.kind)).toEqual(['pdf', 'pdf'])
    expect(downloadableOutputs(loading).every(item => item.kind !== 'html')).toBe(true)
  })

  it('a deck with published HTML outputs never lists them, from either branch', () => {
    const deck = project('deck')
    expect(
      downloadableOutputs(deck).some(item => item.kind === 'html' || item.url.endsWith('.html')),
    ).toBe(false)
    // …and the same holds when the preview kind is unavailable
    deck.description.preview = null
    expect(downloadableOutputs(deck).every(item => item.kind !== 'html')).toBe(true)
  })
})
