/**
 * The media tools' workspace-relative guard.
 *
 * media_probe, media_ffmpeg and media_publish take workspace-RELATIVE paths
 * (the API resolves them itself) and share the symlink rule every other tool
 * gets from .pi/lib/paths.ts: `ln -s /app/.env notes.md` inside the sandbox
 * is a link whose target is dangling in there and perfectly real out here.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insideWorkspace } from '../apps/api/src/pipelines/media'

let root: string
let ws: string

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'host-tool-paths-'))
  ws = path.join(root, 'projects', 'acme')
  mkdirSync(path.join(ws, 'renders'), { recursive: true })
  mkdirSync(path.join(root, 'projects', 'other'), { recursive: true })
  writeFileSync(path.join(root, '.env'), 'CLERK_SECRET_KEY=sk_live_LEAKED\n')
  writeFileSync(path.join(root, 'projects', 'other', 'shots.js'), 'someone else\n')
  writeFileSync(path.join(ws, 'index.html'), '<!doctype html>\n')
  symlinkSync(path.join(root, '.env'), path.join(ws, 'notes.md'))
  symlinkSync(root, path.join(ws, 'up'))
  symlinkSync(path.join(root, 'projects', 'other'), path.join(ws, 'theirs'))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('insideWorkspace (media_probe, media_ffmpeg, media_publish)', () => {
  const at = (p: string) => insideWorkspace({ dir: ws } as never, p)

  it('allows ordinary workspace paths, existing or not', () => {
    expect(at('index.html')).toBe(path.join(ws, 'index.html'))
    expect(at('renders/final.mp4')).toBe(path.join(ws, 'renders/final.mp4'))
  })

  it('still refuses the obvious escapes', () => {
    expect(() => at('/app/.env')).toThrow(/workspace-relative/)
    expect(() => at('../other/shots.js')).toThrow(/escapes the workspace/)
    expect(() => at('')).toThrow(/required/)
  })

  it('refuses a symlink to the secrets', () => {
    expect(() => at('notes.md')).toThrow(/escapes the workspace/)
  })

  it('refuses a symlink used as a directory', () => {
    expect(() => at('up/.env')).toThrow(/escapes the workspace/)
    expect(() => at('theirs/shots.js')).toThrow(/escapes the workspace/)
  })

  it('refuses writing an output through a link', () => {
    // media_ffmpeg resolves its --out this way; without the check it would
    // happily write over anything on the host.
    expect(() => at('up/planted.mp4')).toThrow(/escapes the workspace/)
  })
})
