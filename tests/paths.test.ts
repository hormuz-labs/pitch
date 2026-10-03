/**
 * The one path boundary.
 *
 * The agent's shell is sandboxed; the host tools are not. Both hand every
 * path they are given to `resolveIn`, and that check is all that stands
 * between "render this page" and "read /app/.env" — for the file tools, the
 * motion_* tools, the media tools and the deck tools alike. There is no
 * guest/host translation to get wrong any more: the agent names the same
 * absolute paths the host has, and this decides which of them it may touch.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ASSETS_DIR,
  contains,
  describeWorkspace,
  ENGINE_DIR,
  LIBRARY_DIRS,
  PathError,
  relativeIn,
  resolveIn,
  resolveSymlinks,
  SHARED_ROOTS,
  SKILLS_DIR,
  workspaceOf,
} from '../.pi/lib/paths'

// A workspace where the projects really are, so the shared references are
// the real .pi/skills/ and assets/ and nothing has to be faked.
const WS = path.join(path.dirname(ENGINE_DIR), 'projects', 'studio--user_1--acme')

describe('what the agent can reach', () => {
  it('resolves relative paths inside its own workspace', () => {
    expect(resolveIn(WS, 'shots.js')).toBe(path.join(WS, 'shots.js'))
    expect(resolveIn(WS, './audio/vo.wav', 'write')).toBe(path.join(WS, 'audio/vo.wav'))
    expect(resolveIn(WS, '')).toBe(WS)
    expect(resolveIn(WS, '@renders/out.mp4', 'write')).toBe(path.join(WS, 'renders/out.mp4'))
  })

  it('takes the workspace by its absolute path — the one it is told', () => {
    expect(resolveIn(WS, WS)).toBe(WS)
    expect(resolveIn(WS, path.join(WS, 'shots.js'), 'write')).toBe(path.join(WS, 'shots.js'))
  })

  it('reads the shared references at their absolute paths, and by ../../', () => {
    expect(resolveIn(WS, path.join(SKILLS_DIR, 'launch-video/SKILL.md'))).toBe(
      path.join(SKILLS_DIR, 'launch-video/SKILL.md'),
    )
    expect(resolveIn(WS, path.join(ASSETS_DIR, 'music'))).toBe(path.join(ASSETS_DIR, 'music'))
    // The relative spelling the older skills used still lands on the reference.
    expect(resolveIn(WS, '../../assets/music')).toBe(path.join(ASSETS_DIR, 'music'))
  })

  it('never writes to a shared reference', () => {
    expect(() => resolveIn(WS, path.join(ASSETS_DIR, 'music/x.mp3'), 'write')).toThrow(/read-only/)
    expect(() => resolveIn(WS, '../../assets/music/x.mp3', 'write')).toThrow(PathError)
  })

  it('does not read the engine or the vendor libraries — library code it only names', () => {
    // The agent used to read compiler.js and factories.js (135KB) several
    // times per film to find a class name `pitch motion schema` already lists.
    expect(() => resolveIn(WS, path.join(ENGINE_DIR, 'js/compiler.js'))).toThrow(PathError)
    expect(() => resolveIn(WS, '../../engine/schema.md')).toThrow(PathError)
    for (const dir of LIBRARY_DIRS) {
      expect(() => resolveIn(WS, path.join(dir, 'x.min.js'))).toThrow(/library code/)
    }
    expect(() => resolveIn(WS, '../../assets/gsap/gsap.min.js')).toThrow(/pitch motion schema/)
    // The rest of assets/ stays readable.
    expect(resolveIn(WS, path.join(ASSETS_DIR, 'fonts'))).toBe(path.join(ASSETS_DIR, 'fonts'))
  })

  it('shares the skills, but not the host scripts behind the tools', () => {
    expect(SHARED_ROOTS).toContain(SKILLS_DIR)
    expect(SHARED_ROOTS).not.toContain(ENGINE_DIR)
    expect(() => resolveIn(WS, path.join(SKILLS_DIR, '../scripts/launch-video/audit.mjs'))).toThrow(
      PathError,
    )
  })
})

describe('what it cannot reach', () => {
  const root = path.dirname(ENGINE_DIR)

  it('refuses the secrets this process is holding', () => {
    for (const p of [
      path.join(root, '.env'),
      '../../.env',
      '.env',
      '.env.local',
      '/proc/self/environ',
    ]) {
      expect(() => resolveIn(WS, p)).toThrow(PathError)
    }
  })

  it('refuses every other user’s project, however it is spelled', () => {
    expect(() => resolveIn(WS, '../studio--user_2--secret')).toThrow(PathError)
    expect(() =>
      resolveIn(WS, path.join(root, 'projects/studio--user_2--secret/shots.js')),
    ).toThrow(PathError)
    expect(() => resolveIn(WS, `${WS}/../studio--user_2--secret/shots.js`)).toThrow(PathError)
  })

  it('refuses the rest of the machine — including the API’s own checkout', () => {
    for (const p of [
      '/etc/shadow',
      '/root/.pi/credentials.json',
      path.join(root, 'apps/api/src/index.ts'),
    ]) {
      expect(() => resolveIn(WS, p)).toThrow(PathError)
    }
  })

  it('says where it may go, in the paths it was told', () => {
    expect(() => resolveIn(WS, '/etc/shadow')).toThrow(
      new RegExp(WS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    for (const root of SHARED_ROOTS) {
      expect(() => resolveIn(WS, '/etc/shadow')).toThrow(root)
    }
  })
})

describe('relativeIn, for the scripts that run with cwd = workspace', () => {
  it('is relative inside the workspace and absolute for a shared reference', () => {
    expect(relativeIn(WS, 'audio/vo.wav', 'write')).toBe('audio/vo.wav')
    expect(relativeIn(WS, path.join(WS, 'renders/out.mp4'), 'write')).toBe('renders/out.mp4')
    expect(relativeIn(WS, '')).toBe('.')
    expect(relativeIn(WS, path.join(ASSETS_DIR, 'fonts'))).toBe(path.join(ASSETS_DIR, 'fonts'))
  })
})

describe('workspaceOf', () => {
  it('is the session cwd, and nothing else', () => {
    expect(workspaceOf({ cwd: WS })).toBe(WS)
    // A tool that fell back to process.cwd() would be operating on the API's
    // own checkout — that is what the old `ctx?.cwd || process.cwd()` did.
    expect(() => workspaceOf(undefined)).toThrow(PathError)
    expect(() => workspaceOf({})).toThrow(PathError)
    expect(() => workspaceOf({ cwd: ' ' })).toThrow(PathError)
  })
})

describe('what the agent is told', () => {
  it('names the workspace and every shared reference by absolute path', () => {
    const line = describeWorkspace(WS)
    expect(line).toContain(WS)
    for (const root of SHARED_ROOTS) expect(line).toContain(root)
    expect(line).not.toMatch(/\/workspace\b|\.\.\/\.\./)
  })
})

describe('a symlink is not a way out', () => {
  // The guard used to compare the LEXICAL path, which the agent's own shell
  // can defeat from inside the sandbox: `ln -s /app/.env notes.md` makes a
  // link whose target is dangling in there and perfectly real to a tool
  // running out here. `read notes.md` then returned the secret key.
  let root: string
  let ws: string

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'paths-link-'))
    ws = path.join(root, 'projects', 'acme')
    mkdirSync(path.join(ws, 'renders'), { recursive: true })
    mkdirSync(path.join(root, 'projects', 'other'), { recursive: true })
    writeFileSync(path.join(root, '.env'), 'CLERK_SECRET_KEY=sk_live_LEAKED\n')
    writeFileSync(path.join(root, 'projects', 'other', 'shots.js'), 'someone else\n')
    writeFileSync(path.join(ws, 'shots.js'), 'window.SHOTS = {}\n')
    symlinkSync(path.join(root, '.env'), path.join(ws, 'notes.md'))
    symlinkSync(root, path.join(ws, 'up'))
    symlinkSync(path.join(root, 'projects', 'other'), path.join(ws, 'theirs'))
    symlinkSync(SKILLS_DIR, path.join(ws, 'skills'))
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('resolves a link, a link used as a directory, and a path that does not exist yet', () => {
    expect(resolveSymlinks(path.join(ws, 'notes.md'))).toBe(
      resolveSymlinks(path.join(root, '.env')),
    )
    expect(resolveSymlinks(path.join(ws, 'up', '.env'))).toBe(
      resolveSymlinks(path.join(root, '.env')),
    )
    expect(resolveSymlinks(path.join(ws, 'a/b/c/d.json'))).toBe(
      path.join(resolveSymlinks(ws), 'a/b/c/d.json'),
    )
    expect(contains(resolveSymlinks(ws), resolveSymlinks(path.join(ws, 'notes.md')))).toBe(false)
  })

  it('refuses a link pointing at the secrets, or used as a directory to climb out', () => {
    expect(() => resolveIn(ws, 'notes.md')).toThrow(PathError)
    expect(() => resolveIn(ws, 'up/.env')).toThrow(PathError)
    expect(() => resolveIn(ws, 'theirs/shots.js')).toThrow(PathError)
  })

  it('refuses writing through a link, too', () => {
    expect(() => resolveIn(ws, 'notes.md', 'write')).toThrow(PathError)
    expect(() => resolveIn(ws, 'up/planted.js', 'write')).toThrow(PathError)
    expect(() => resolveIn(ws, 'skills/launch-video/SKILL.md', 'write')).toThrow(/read-only/)
  })

  it('still allows ordinary files, files that do not exist yet, and a link INTO a shared reference', () => {
    expect(resolveIn(ws, 'shots.js')).toBe(path.join(ws, 'shots.js'))
    expect(resolveIn(ws, 'renders/out.mp4', 'write')).toBe(path.join(ws, 'renders/out.mp4'))
    expect(resolveIn(ws, 'deep/not/made/yet.json', 'write')).toBe(
      path.join(ws, 'deep/not/made/yet.json'),
    )
    expect(resolveIn(ws, 'skills/launch-video/SKILL.md')).toBe(
      path.join(ws, 'skills/launch-video/SKILL.md'),
    )
  })
})
