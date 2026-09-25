/**
 * A finished launch render is handed back, not redone.
 *
 * Export used to spawn the capture renderer on every click, so a film that
 * was already sitting in renders/ was cut again — minutes of compute for a
 * file that existed. And the download it answered with was the object
 * storage URL, which need not resolve from where the app runs (a local
 * docker api uploads to its own MinIO while .env names the production
 * bucket): the download is the workspace file, served by /files.
 */
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let dir = ''
vi.mock('@saas/storage', () => ({ uploadFile: vi.fn(async () => 'https://s3/x.mp4') }))
vi.mock('../apps/api/src/lib/mix.js', () => ({ ensureMix: vi.fn(async () => null) }))
vi.mock('../apps/api/src/lib/node.js', () => ({ nodeBinary: () => 'node' }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  workspaceOf: () => ({ dir, internal: 'user_1--film', userId: 'user_1' }),
}))
const watermark = vi.hoisted(() => ({ should: vi.fn(async () => true) }))
vi.mock('../apps/api/src/projects/watermark.js', () => ({
  shouldWatermarkVideo: watermark.should,
}))
vi.mock('../apps/api/src/studio/paths.js', () => ({
  MOTION_SCRIPTS_DIR: '/nowhere',
  fileUrl: (internal: string, rel: string) => `/files/projects/${internal}/${rel}`,
}))

const { launchExporter } = await import('../apps/api/src/flows/launch-video/export.js')
const row = { id: 'p1', userId: 'user_1', name: 'film', outputs: [] } as any
const publish = vi.fn(async () => undefined)

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'launch-export-'))
  await writeFile(path.join(dir, 'index.html'), '<html></html>')
  await writeFile(path.join(dir, 'shots.js'), 'window.SHOTS={shots:[]}')
  await mkdir(path.join(dir, 'renders'))
})

const ago = (file: string, seconds: number) => {
  const t = new Date(Date.now() - seconds * 1000)
  return utimes(file, t, t)
}

describe('launch export and the free-plan watermark', () => {
  const freshRender = async ({ clean }: { clean: boolean }) => {
    await writeFile(path.join(dir, 'renders/launch-1080p.mp4'), 'mp4')
    if (clean) await writeFile(path.join(dir, 'renders/launch-1080p.mp4.clean'), '')
    await ago(path.join(dir, 'index.html'), 60)
    await ago(path.join(dir, 'shots.js'), 60)
  }
  const rendersAgain = async (id: string) => {
    await vi.waitFor(() => expect(launchExporter.status(id).stage).toBe('failed'))
    expect(launchExporter.status(id).error).toMatch(/capture script/)
  }

  it('re-renders a stamped film clean once the account has paid', async () => {
    await freshRender({ clean: false })
    watermark.should.mockResolvedValueOnce(false)
    const st = await launchExporter.start({ ...row, id: 'upgraded' }, { res: '1080p' }, publish)
    expect(st.running).toBe(true)
    await rendersAgain('upgraded')
  })

  it('re-renders a clean film stamped once a cancelled plan has run out', async () => {
    await freshRender({ clean: true })
    watermark.should.mockResolvedValueOnce(true)
    const st = await launchExporter.start({ ...row, id: 'lapsed' }, { res: '1080p' }, publish)
    expect(st.running).toBe(true)
    await rendersAgain('lapsed')
  })

  it('hands a clean film back to an account that is still paying', async () => {
    await freshRender({ clean: true })
    watermark.should.mockResolvedValueOnce(false)
    const st = await launchExporter.start({ ...row, id: 'paying' }, { res: '1080p' }, publish)
    expect(st.stage).toBe('done')
  })

  it('hands a stamped film back to an account that is still on the free plan', async () => {
    await freshRender({ clean: false })
    watermark.should.mockResolvedValueOnce(true)
    const st = await launchExporter.start({ ...row, id: 'still-free' }, { res: '1080p' }, publish)
    expect(st.stage).toBe('done')
  })
})

describe('launch export reuses a fresh render', () => {
  it('answers done with the workspace file when the render is newer than its sources', async () => {
    await writeFile(path.join(dir, 'renders/launch-1080p.mp4'), 'mp4')
    await ago(path.join(dir, 'index.html'), 60)
    await ago(path.join(dir, 'shots.js'), 60)
    const st = await launchExporter.start(row, { res: '1080p' }, publish)
    expect(st.stage).toBe('done')
    expect(st.running).toBe(false)
    expect(st.url).toBe('/files/projects/user_1--film/renders/launch-1080p.mp4')
    expect(launchExporter.status('p1').stage).toBe('done')
  })

  it('renders again when a source changed after the render', async () => {
    await writeFile(path.join(dir, 'renders/launch-1080p.mp4'), 'mp4')
    await ago(path.join(dir, 'renders/launch-1080p.mp4'), 60)
    // The capture script is absent here, so a real render attempt fails
    // before spawning: that is the proof it did not hand the stale file back.
    const st = await launchExporter.start(row, { res: '1080p' }, publish)
    expect(st.running).toBe(true)
    await vi.waitFor(() => expect(launchExporter.status('p1').stage).toBe('failed'))
    expect(launchExporter.status('p1').error).toMatch(/capture script/)
  })

  it('renders a resolution that has no file yet', async () => {
    const st = await launchExporter.start(row, { res: '4k' }, publish)
    expect(st.running).toBe(true)
    await vi.waitFor(() => expect(launchExporter.status('p1').stage).toBe('failed'))
    expect(launchExporter.status('p1').error).toMatch(/capture script/)
  })

  it('answers done with a fresh published render when the workspace file is absent', async () => {
    await ago(path.join(dir, 'index.html'), 60)
    await ago(path.join(dir, 'shots.js'), 60)
    const published = {
      ...row,
      id: 'published',
      outputs: [
        {
          kind: 'video',
          res: '1080p',
          url: 'https://s3/x.mp4',
          createdAt: new Date().toISOString(),
        },
      ],
    }

    const st = await launchExporter.start(published, { res: '1080p' }, publish)

    expect(st.stage).toBe('done')
    expect(st.running).toBe(false)
    expect(st.url).toBe('https://s3/x.mp4')
  })

  it('renders again when sources are newer than the published render', async () => {
    const published = {
      ...row,
      id: 'stale-published',
      outputs: [
        {
          kind: 'video',
          res: '1080p',
          url: 'https://s3/x.mp4',
          createdAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    }

    const st = await launchExporter.start(published, { res: '1080p' }, publish)

    expect(st.running).toBe(true)
    await vi.waitFor(() => expect(launchExporter.status('stale-published').stage).toBe('failed'))
    expect(launchExporter.status('stale-published').error).toMatch(/capture script/)
  })
})
