/**
 * The studio sandbox's path boundary and bwrap recipe.
 *
 * The agent's shell lives in the API container, which holds every secret the
 * product has and every user's workspace. These are the rules that keep it to
 * its own project; the live namespace behaviour is in
 * tests/integration/sandbox.integration.test.ts, which needs Linux.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bwrapArgs,
  bwrapCommand,
  explainBwrapFailure,
  GUEST_WORKSPACE,
  SandboxPathError,
  type SharedMounts,
  sandboxEnv,
  toGuestPath,
  toHostPath,
} from '../.pi/lib/sandbox'

const WS = '/app/projects/studio--user_1--acme'
const SHARED: SharedMounts = {
  '/engine': '/app/engine',
  '/.pi/skills': '/app/.pi/skills',
  '/assets': '/app/assets',
}
const resolve = (p: string, mode: 'read' | 'write' = 'read') => toHostPath(WS, SHARED, p, mode)

describe('what the agent can reach', () => {
  it('resolves relative paths inside its own workspace', () => {
    expect(resolve('shots.js')).toBe(`${WS}/shots.js`)
    expect(resolve('./audio/vo.wav')).toBe(`${WS}/audio/vo.wav`)
    expect(resolve('')).toBe(WS)
  })

  it('resolves the /workspace name the shell uses', () => {
    expect(resolve('/workspace')).toBe(WS)
    expect(resolve('/workspace/shots.js')).toBe(`${WS}/shots.js`)
  })

  it('resolves ../../engine the way every skill writes it', () => {
    // This is the whole reason the guest keeps a /workspace name: the skills
    // say ../../engine/schema.md, and it must land on the read-only mount.
    expect(resolve('../../engine/schema.md')).toBe('/app/engine/schema.md')
    expect(resolve('/engine/js/compiler.js')).toBe('/app/engine/js/compiler.js')
    expect(resolve('../../assets/music')).toBe('/app/assets/music')
    expect(resolve('/.pi/skills/launch-video/SKILL.md')).toBe(
      '/app/.pi/skills/launch-video/SKILL.md',
    )
  })
})

describe('what it cannot reach', () => {
  it('refuses the secrets this process is holding', () => {
    for (const p of ['/app/.env', '../../.env', '../../../app/.env', '/proc/self/environ']) {
      expect(() => resolve(p)).toThrow(SandboxPathError)
    }
  })

  it('refuses every other user’s project', () => {
    expect(() => resolve('../studio--user_2--secret')).toThrow(SandboxPathError)
    expect(() => resolve('/app/projects/studio--user_2--secret/shots.js')).toThrow(SandboxPathError)
  })

  it('refuses the rest of the machine', () => {
    for (const p of ['/etc/shadow', '/root/.pi/credentials.json', '/app/apps/api/src/index.ts']) {
      expect(() => resolve(p)).toThrow(SandboxPathError)
    }
  })

  it('does not let a traversal climb out through the workspace name', () => {
    expect(() => resolve('/workspace/../studio--user_2--secret/shots.js')).toThrow(SandboxPathError)
    expect(() => resolve('audio/../../../../etc/passwd')).toThrow(SandboxPathError)
  })

  it('lets it READ the shared mounts but never write them', () => {
    expect(resolve('/engine/js/compiler.js', 'read')).toBe('/app/engine/js/compiler.js')
    expect(() => resolve('/engine/js/compiler.js', 'write')).toThrow(/read-only/)
    expect(() => resolve('../../.pi/skills/launch-video/SKILL.md', 'write')).toThrow(/read-only/)
  })

  it('says where it is in terms the agent understands', () => {
    expect(() => resolve('/app/.env')).toThrow(/\/workspace/)
  })
})

describe('host paths map back to the names the agent knows', () => {
  it('round-trips the workspace and the shared mounts', () => {
    expect(toGuestPath(WS, SHARED, `${WS}/audio/vo.wav`)).toBe('/workspace/audio/vo.wav')
    expect(toGuestPath(WS, SHARED, WS)).toBe(GUEST_WORKSPACE)
    expect(toGuestPath(WS, SHARED, '/app/engine/schema.md')).toBe('/engine/schema.md')
    expect(toGuestPath(WS, SHARED, path.posix.join('/app/assets', 'music/bed.mp3'))).toBe(
      '/assets/music/bed.mp3',
    )
  })
})

describe('the bwrap recipe', () => {
  const args = bwrapArgs({ workspace: WS, shared: SHARED })
  const pairs = (flag: string) => {
    const out: string[][] = []
    args.forEach((a, i) => {
      if (a === flag) out.push(args.slice(i + 1, i + 3))
    })
    return out
  }

  it('unshares the network — this is what stops "npx playwright install"', () => {
    expect(args).toContain('--unshare-net')
  })

  it('unshares the user namespace and maps root, so the bind is writable', () => {
    expect(args).toContain('--unshare-user')
    expect(args.join(' ')).toContain('--uid 0')
    expect(args.join(' ')).toContain('--gid 0')
  })

  it('starts from an empty environment rather than inheriting the API keys', () => {
    expect(args).toContain('--clearenv')
    const env = sandboxEnv()
    expect(Object.keys(env).sort()).toEqual([
      'HOME',
      'LANG',
      'PATH',
      'PWD',
      'STUDIO_SANDBOX',
      'TERM',
    ])
    expect(JSON.stringify(env)).not.toMatch(/key|secret|token/i)
  })

  it('binds the workspace read-write and the shared references read-only', () => {
    expect(pairs('--bind')).toEqual([[WS, GUEST_WORKSPACE]])
    expect(pairs('--ro-bind')).toEqual(
      expect.arrayContaining([
        ['/usr', '/usr'],
        ['/app/engine', '/engine'],
        ['/app/.pi/skills', '/.pi/skills'],
        ['/app/assets', '/assets'],
      ]),
    )
  })

  it('binds nothing else of the host — no /app, no /etc wholesale, no /root', () => {
    const bound = [...pairs('--bind'), ...pairs('--ro-bind')].map(([host]) => host)
    expect(bound).not.toContain('/app')
    expect(bound).not.toContain('/etc')
    expect(bound).not.toContain('/root')
    expect(bound.filter(h => h.startsWith('/etc'))).toEqual([])
  })

  it('dies with the studio rather than outliving it', () => {
    expect(args).toContain('--die-with-parent')
    expect(args).toContain('--new-session')
  })

  it('lands in the workspace and runs the command through a login shell', () => {
    const argv = bwrapCommand('echo hi', { workspace: WS, shared: SHARED })
    expect(argv.slice(-5)).toEqual(['--chdir', GUEST_WORKSPACE, '/bin/bash', '-lc', 'echo hi'])
  })
})

describe('a sandbox that will not start explains itself', () => {
  it.each([
    ['bwrap: No permissions to create a new namespace', /seccomp/],
    ['bwrap: Failed to make / slave: Permission denied', /apparmor/],
    ['bwrap: pivot_root: Operation not permitted', /apparmor/],
    ['bwrap: loopback: Failed RTM_NEWADDR', /SYS_ADMIN/],
    ['ENOENT', /bubblewrap/],
  ])('names the fix for %s', (stderr, expected) => {
    expect(explainBwrapFailure(stderr) ?? '').toMatch(expected)
  })

  it('says nothing about a command that simply failed', () => {
    // Reporting "the sandbox is broken" for the agent's own typo would send it
    // chasing infrastructure instead of its command.
    expect(explainBwrapFailure('node: command not found')).toBeNull()
    expect(explainBwrapFailure('ffmpeg: not found')).toBeNull()
    expect(explainBwrapFailure('')).toBeNull()
  })
})
