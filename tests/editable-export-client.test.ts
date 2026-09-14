import { describe, expect, it, vi } from 'vitest'
import { studio } from '../apps/web/src/solid/studio/client'
import { createExportRequest, exportFilename } from '../apps/web/src/solid/studio/editable-export'

describe('export downloads', () => {
  it('uses the backend ZIP filename without adding an MP4 suffix', () => {
    expect(
      exportFilename(
        { format: 'premiere', filename: 'launch-premiere.zip', res: '1080p', url: '/package' },
        'Launch',
      ),
    ).toBe('launch-premiere.zip')
  })

  it.each(['premiere', 'after-effects', 'blender'])(
    'falls back to a ZIP filename for %s rather than MP4',
    format => {
      expect(exportFilename({ format, res: '4k', url: '/package' }, 'Launch')).toBe(
        `Launch-4k-${format}.zip`,
      )
    },
  )

  it('preserves normal MP4 and PDF download names', () => {
    expect(exportFilename({ res: '720p', url: '/video' }, 'Launch')).toBe('Launch-720p.mp4')
    expect(exportFilename({ format: 'mp4', res: null, url: '/video' })).toBe('export.mp4')
    expect(exportFilename({ res: null, url: '/slides.pdf?token=abc' }, 'Slides')).toBe('Slides.pdf')
  })

  it('keeps a ZIP extension when optional format and filename metadata are missing', () => {
    expect(exportFilename({ res: null, url: '/exports/package.zip?token=abc' }, 'Launch')).toBe(
      'Launch.zip',
    )
  })
})

describe('export requests', () => {
  it('locks immediately before the request and ignores duplicate clicks until it settles', async () => {
    let finish!: () => void
    const run = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const pending = vi.fn()
    const request = createExportRequest(run, () => false, pending)
    const first = request({ format: 'premiere', res: '1080p' })
    expect(pending).toHaveBeenCalledWith(true)
    await request({ format: 'blender', res: '720p' })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ format: 'premiere', res: '1080p' })
    finish()
    await first
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('does not call the network while the project or export is busy', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const pending = vi.fn()
    let blocked = true
    const request = createExportRequest(run, () => blocked, pending)
    await request({ format: 'after-effects', res: '720p' })
    expect(run).not.toHaveBeenCalled()
    expect(pending).not.toHaveBeenCalled()
    blocked = false
    await request({ format: 'after-effects', res: '720p' })
    expect(run).toHaveBeenCalledExactlyOnceWith({ format: 'after-effects', res: '720p' })
  })

  it('allows a retry after a failed request', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('Render MP4 first'))
      .mockResolvedValue(undefined)
    const pending = vi.fn()
    const request = createExportRequest(run, () => false, pending)
    await expect(request()).rejects.toThrow('Render MP4 first')
    expect(pending).toHaveBeenLastCalledWith(false)
    await request({ res: '1080p' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it.each(['premiere', 'after-effects', 'blender'] as const)(
    'posts %s and resolution to the shared export endpoint',
    async format => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ running: true, stage: 'packaging', format })),
        )
      try {
        await studio.startExport('token', 'project/id', { format, res: '4k' })
        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(/\/projects\/project%2Fid\/export$/),
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ format, res: '4k' }) }),
        )
      } finally {
        fetch.mockRestore()
      }
    },
  )

  it('preserves the actionable 409 message from the backend', async () => {
    const message = 'Render a current 1080p MP4 first, then retry the editable export.'
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: message }), { status: 409 }))
    try {
      await expect(
        studio.startExport('token', 'id', { format: 'premiere', res: '1080p' }),
      ).rejects.toMatchObject({ status: 409, message })
    } finally {
      fetch.mockRestore()
    }
  })

  it('keeps format absent for normal MP4 exports', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    try {
      await studio.startExport('token', 'id', { res: '720p' })
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/projects\/id\/export$/),
        expect.objectContaining({ method: 'POST', body: '{"res":"720p"}' }),
      )
    } finally {
      fetch.mockRestore()
    }
  })

  it('retains completed package metadata through both launch and polling, with shared cancellation', async () => {
    const done = {
      running: false,
      stage: 'done',
      format: 'blender',
      filename: 'launch-blender.zip',
      res: '1080p',
      url: '/exports/package.zip',
    }
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(done)))
    try {
      const immediate = await studio.startExport('token', 'id', { format: 'blender', res: '1080p' })
      const polled = await studio.getExport('token', 'id')
      expect(exportFilename(immediate, 'Launch')).toBe(done.filename)
      expect(exportFilename(polled, 'Launch')).toBe(done.filename)
      expect(polled).toEqual(immediate)
      await studio.cancelExport('token', 'id')
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringMatching(/\/projects\/id\/export\/cancel$/),
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      fetch.mockRestore()
    }
  })
})
