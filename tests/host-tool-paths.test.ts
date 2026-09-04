/**
 * The host tools' path guard.
 *
 * The agent's shell is sandboxed; these tools are NOT. motion_*, media_* and
 * the deck tools run in the API process with its full privileges, and they
 * take paths from the agent — so the guard in front of them is the only thing
 * between "render this page" and "read /app/.env".
 *
 * Both guards used to compare the LEXICAL path, which the shell defeats from
 * inside its own sandbox: `ln -s /app/.env notes.md` makes a link whose target
 * is dangling in there and perfectly real out here.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contains, resolveSymlinks } from '../.pi/lib/sandbox'
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

describe('resolveSymlinks', () => {
  it('resolves a link to its real target', () => {
    expect(resolveSymlinks(path.join(ws, 'notes.md'))).toBe(
      resolveSymlinks(path.join(root, '.env')),
    )
  })

  it('resolves a link used as a directory component', () => {
    expect(resolveSymlinks(path.join(ws, 'up', '.env'))).toBe(
      resolveSymlinks(path.join(root, '.env')),
    )
  })

  it('leaves a path that does not exist yet alone, resolving only its real parents', () => {
    expect(resolveSymlinks(path.join(ws, 'renders/out.mp4'))).toBe(
      path.join(resolveSymlinks(ws), 'renders/out.mp4'),
    )
    expect(resolveSymlinks(path.join(ws, 'a/b/c/d.json'))).toBe(
      path.join(resolveSymlinks(ws), 'a/b/c/d.json'),
    )
  })

  it('does not report a link as contained just because it sits in the workspace', () => {
    const real = resolveSymlinks(ws)
    expect(contains(real, resolveSymlinks(path.join(ws, 'index.html')))).toBe(true)
    expect(contains(real, resolveSymlinks(path.join(ws, 'notes.md')))).toBe(false)
    expect(contains(real, resolveSymlinks(path.join(ws, 'theirs/shots.js')))).toBe(false)
  })
})

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
