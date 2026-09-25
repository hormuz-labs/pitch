/**
 * Launch films carry the "Powered by trypitch.co" stamp only for accounts that
 * have never paid. The capture renderer burns it in unless told otherwise, so
 * the export must say --no-watermark for Pro, Max and Flex customers.
 */
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let dir = ''
const spawn = vi.hoisted(() => vi.fn())
const watermark = vi.hoisted(() => vi.fn(async () => true))
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    existsSync: (file: string) => file === '/test-motion/capture.mjs' || fs.existsSync(file),
  }
})
vi.mock('@saas/storage', () => ({ uploadFile: vi.fn(async () => 'https://s3/x.mp4') }))
vi.mock('../apps/api/src/lib/mix.js', () => ({ ensureMix: vi.fn(async () => null) }))
vi.mock('../apps/api/src/lib/node.js', () => ({ nodeBinary: () => 'node' }))
vi.mock('../apps/api/src/projects/watermark.js', () => ({ shouldWatermarkVideo: watermark }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  workspaceOf: () => ({ dir, internal: 'user--film', userId: 'user_1', name: 'film' }),
  projectRowFor: async () => null,
  addOutput: vi.fn(),
}))
vi.mock('../apps/api/src/studio/paths.js', () => ({
  MOTION_SCRIPTS_DIR: '/test-motion',
  fileUrl: (_: string, rel: string) => rel,
}))
const { launchExporter } = await import('../apps/api/src/flows/launch-video/export.js')

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'launch-export-wm-'))
  await writeFile(path.join(dir, 'index.html'), '<html></html>')
  await mkdir(path.join(dir, 'renders'))
  // A renderer that writes the file it was asked for and exits cleanly.
  spawn.mockReset().mockImplementation((_bin: string, argv: string[], opts: { cwd: string }) => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const out = argv.find(a => a.startsWith('--out='))!.slice('--out='.length)
    void writeFile(path.join(opts.cwd, out), 'mp4').then(() => proc.emit('close', 0))
    return proc
  })
})
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

const exportFilm = async (id: string) => {
  await launchExporter.start(
    { id, userId: 'user_1', name: 'film', outputs: [] } as any,
    {
      res: '1080p',
    },
    vi.fn(),
  )
  await vi.waitFor(() => expect(launchExporter.status(id).stage).toBe('done'))
  return spawn.mock.calls[0][1] as string[]
}

it('renders a paying account without the watermark', async () => {
  watermark.mockResolvedValue(false)
  const argv = await exportFilm('paid')
  expect(argv).toContain('--no-watermark')
  expect(existsSync(path.join(dir, 'renders/launch-1080p.mp4.clean'))).toBe(true)
})

it('stamps a free account and leaves no clean marker', async () => {
  watermark.mockResolvedValue(true)
  const argv = await exportFilm('free')
  expect(argv).not.toContain('--no-watermark')
  expect(existsSync(path.join(dir, 'renders/launch-1080p.mp4.clean'))).toBe(false)
})
