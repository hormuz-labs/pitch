import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

let dir = ''
const capture = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: capture }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    existsSync: (file: string) => file === '/test-motion/capture.mjs' || fs.existsSync(file),
  }
})
vi.mock('@saas/storage', () => ({ uploadFile: vi.fn() }))
vi.mock('../apps/api/src/lib/mix.js', () => ({
  ensureMix: vi.fn(async () => {
    throw new Error('SFX overpower music near 8.0s')
  }),
}))
vi.mock('../apps/api/src/lib/node.js', () => ({ nodeBinary: () => 'node' }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  workspaceOf: () => ({ dir, internal: 'user--film' }),
}))
vi.mock('../apps/api/src/studio/paths.js', () => ({
  MOTION_SCRIPTS_DIR: '/test-motion',
  fileUrl: (_: string, rel: string) => rel,
}))
const { launchExporter } = await import('../apps/api/src/flows/launch-video/export.js')
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

it('stops export at a failed audio gate instead of capturing with the previous mix', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'launch-export-audio-'))
  await mkdir(path.join(dir, 'audio'))
  await writeFile(path.join(dir, 'index.html'), '<html></html>')
  await writeFile(path.join(dir, 'audio/mix.wav'), 'old mix')
  const publish = vi.fn()
  await launchExporter.start(
    { id: 'audio-fail', userId: 'u', name: 'film', outputs: [] } as any,
    { res: '1080p' },
    publish,
  )
  await vi.waitFor(() => expect(launchExporter.status('audio-fail').stage).toBe('failed'))
  expect(launchExporter.status('audio-fail').error).toContain('SFX overpower music')
  expect(capture).not.toHaveBeenCalled()
  expect(publish).not.toHaveBeenCalled()
})
