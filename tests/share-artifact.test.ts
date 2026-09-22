import { describe, expect, it, vi } from 'vitest'
import { publishShareArtifact } from '../apps/api/src/projects/share-artifact.js'

const workspace = {
  flow: 'studio',
  userId: 'user_1',
  name: 'launch-film',
  internal: 'studio--user_1--launch-film',
  dir: '/projects/studio--user_1--launch-film',
} as const

const project = {
  id: 'project_1',
  userId: 'user_1',
  name: 'launch-film',
  outputs: [],
} as any

describe('publishing a workspace artifact for sharing', () => {
  it('uploads and records an already-rendered local video', async () => {
    const upload = vi.fn(async () => 'https://storage.example/launch-1080p.mp4')
    const record = vi.fn(async () => undefined)

    const output = await publishShareArtifact(
      project,
      workspace,
      {
        preview: { kind: 'html', url: '/files/projects/project/index.html' },
        outputs: [
          {
            kind: 'video',
            res: '1080p',
            url: '/files/projects/studio--user_1--launch-film/renders/launch-1080p.mp4',
            createdAt: '2026-09-22T08:00:00.000Z',
          },
        ],
      },
      upload,
      record,
    )

    expect(upload).toHaveBeenCalledWith(
      '/projects/studio--user_1--launch-film/renders/launch-1080p.mp4',
      'pitch/user_1/launch-film/videos',
    )
    expect(output).toMatchObject({
      kind: 'video',
      res: '1080p',
      url: 'https://storage.example/launch-1080p.mp4',
    })
    expect(record).toHaveBeenCalledWith(output)
  })

  it('republishes a local-only database output instead of exposing an authenticated file URL', async () => {
    const upload = vi.fn(async () => 'https://storage.example/video.mp4')
    const record = vi.fn(async () => undefined)
    const localUrl = '/files/projects/studio--user_1--launch-film/renders/video.mp4'

    await publishShareArtifact(
      { ...project, outputs: [{ kind: 'video', url: localUrl, createdAt: '2026-09-22' }] },
      workspace,
      {
        preview: { kind: 'video', url: localUrl },
        outputs: [{ kind: 'video', url: localUrl, createdAt: '2026-09-22' }],
      },
      upload,
      record,
    )

    expect(upload).toHaveBeenCalledOnce()
    expect(record).toHaveBeenCalledOnce()
  })

  it('reuses a current public output without uploading it again', async () => {
    const published = {
      kind: 'video' as const,
      res: '1080p',
      url: 'https://storage.example/video.mp4',
      createdAt: '2026-09-22T09:00:00.000Z',
    }
    const upload = vi.fn(async () => 'unused')
    const record = vi.fn(async () => undefined)

    const output = await publishShareArtifact(
      { ...project, outputs: [published] },
      workspace,
      {
        preview: { kind: 'html', url: '/preview' },
        outputs: [
          {
            kind: 'video',
            res: '1080p',
            url: '/files/projects/studio--user_1--launch-film/renders/launch-1080p.mp4',
            createdAt: '2026-09-22T08:00:00.000Z',
          },
        ],
      },
      upload,
      record,
    )

    expect(output).toEqual(published)
    expect(upload).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})
