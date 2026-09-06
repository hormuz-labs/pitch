/**
 * The studio sandbox's bwrap recipe.
 *
 * The agent's shell lives in the API container, which holds every secret the
 * product has and every user's workspace. This is the recipe that keeps it to
 * its own project; the path boundary the file tools and host tools share is
 * in tests/paths.test.ts, and the live namespace behaviour is in
 * tests/integration/sandbox.integration.test.ts, which needs Linux.
 */

import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  bwrapArgs,
  bwrapCommand,
  explainBwrapFailure,
  runInSandbox,
  sandboxEnv,
  sandboxMode,
  unconfinedCommand,
} from '../.pi/lib/sandbox'

const WS = '/app/projects/studio--user_1--acme'
const SHARED = ['/app/engine', '/app/.pi/skills', '/app/assets']

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
    const env = sandboxEnv(WS)
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
    expect(pairs('--bind')).toEqual([[WS, WS]])
    expect(pairs('--ro-bind')).toEqual(expect.arrayContaining([['/usr', '/usr']]))
    // Each reference at the path it already has — the agent, the shell and
    // the host tools name one set of paths.
    expect(pairs('--ro-bind-try')).toEqual(expect.arrayContaining(SHARED.map(root => [root, root])))
  })

  it('binds nothing else of the host — no /app, no /etc wholesale, no /root', () => {
    const bound = [...pairs('--bind'), ...pairs('--ro-bind'), ...pairs('--ro-bind-try')].map(
      ([host]) => host,
    )
    expect(bound).not.toContain('/app')
    expect(bound).not.toContain('/etc')
    expect(bound).not.toContain('/root')
    // Of /etc, only the three files the shell needs to have a name and a CA.
    expect(bound.filter(h => h.startsWith('/etc')).sort()).toEqual([
      '/etc/group',
      '/etc/passwd',
      '/etc/ssl/certs',
    ])
  })

  it('dies with the studio rather than outliving it', () => {
    expect(args).toContain('--die-with-parent')
    expect(args).toContain('--new-session')
  })

  it('lands in the workspace and runs the command through a login shell', () => {
    const argv = bwrapCommand('echo hi', { workspace: WS, shared: SHARED })
    expect(argv.slice(-5)).toEqual(['--chdir', WS, '/bin/bash', '-lc', 'echo hi'])
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

describe('running a command in the sandbox', () => {
  /** A stand-in for the bwrap child process. */
  function fakeSpawn(script: (child: any) => void) {
    return ((_cmd: string, _argv: string[]) => {
      const child: any = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => {}
      queueMicrotask(() => script(child))
      return child
    }) as never
  }

  it('hands onData BYTES, not a string', async () => {
    // A string here throws ERR_INVALID_ARG_TYPE inside pi's TextDecoder, and
    // that uncaught exception takes the whole studio process down. The first
    // bash call an agent made killed the API this way.
    const seen: unknown[] = []
    await runInSandbox('echo hi', {
      workspace: '/ws',
      onData: c => seen.push(c),
      spawnFn: fakeSpawn(child => {
        child.stdout.emit('data', Buffer.from('hello'))
        child.stderr.emit('data', Buffer.from('warn'))
        child.emit('close', 0)
      }),
    })
    expect(seen).toHaveLength(2)
    for (const chunk of seen) expect(Buffer.isBuffer(chunk)).toBe(true)
  })

  it('returns the command’s own exit code', async () => {
    const r = await runInSandbox('exit 3', {
      workspace: '/ws',
      onData: () => {},
      spawnFn: fakeSpawn(child => child.emit('close', 3)),
    })
    expect(r.exitCode).toBe(3)
  })

  it('turns a sandbox that will not start into an explained failure', async () => {
    await expect(
      runInSandbox('true', {
        workspace: '/ws',
        mode: 'bwrap',
        onData: () => {},
        spawnFn: fakeSpawn(child => {
          child.stderr.emit('data', Buffer.from('bwrap: No permissions to create a new namespace'))
          child.emit('close', 1)
        }),
      }),
    ).rejects.toThrow(/sandbox could not start.*seccomp/s)
  })

  it('never falls back to running unconfined when bwrap is missing', async () => {
    await expect(
      runInSandbox('true', {
        workspace: '/ws',
        mode: 'bwrap',
        onData: () => {},
        spawnFn: fakeSpawn(child => {
          const err: NodeJS.ErrnoException = new Error('spawn bwrap ENOENT')
          err.code = 'ENOENT'
          child.emit('error', err)
        }),
      }),
    ).rejects.toThrow(/sandbox could not start.*bubblewrap/s)
  })

  it('runs the shell directly, in the workspace, when the mode is unconfined', async () => {
    const calls: Array<[string, string[], any]> = []
    const r = await runInSandbox('echo hi', {
      workspace: '/ws',
      cwd: '/ws/sub',
      mode: 'unconfined',
      onData: () => {},
      spawnFn: ((cmd: string, argv: string[], opts: any) => {
        calls.push([cmd, argv, opts])
        const child: any = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = () => {}
        queueMicrotask(() => child.emit('close', 0))
        return child
      }) as never,
    })
    expect(r.exitCode).toBe(0)
    const [cmd, argv, opts] = calls[0]!
    expect(cmd).toBe('/bin/bash')
    expect(argv).toEqual(['-lc', 'echo hi'])
    expect(opts.cwd).toBe('/ws/sub')
    expect(opts.env.STUDIO_SANDBOX).toBe('none')
    expect(Object.keys(opts.env)).not.toContain('GEMINI_API_KEY')
  })

  it('does not mistake a failed command for a broken sandbox', async () => {
    const r = await runInSandbox('nope', {
      workspace: '/ws',
      onData: () => {},
      spawnFn: fakeSpawn(child => {
        child.stderr.emit('data', Buffer.from('nope: command not found'))
        child.emit('close', 127)
      }),
    })
    expect(r.exitCode).toBe(127)
  })
})

describe('which sandbox a host gets', () => {
  it('is bubblewrap on Linux and nothing on macOS, where bwrap does not exist', () => {
    expect(sandboxMode('linux', {})).toBe('bwrap')
    expect(sandboxMode('darwin', {})).toBe('unconfined')
  })

  it('lets STUDIO_SANDBOX force either', () => {
    expect(sandboxMode('linux', { STUDIO_SANDBOX: 'none' })).toBe('unconfined')
    expect(sandboxMode('darwin', { STUDIO_SANDBOX: 'bwrap' })).toBe('bwrap')
  })

  it('still builds the guest environment from scratch when unconfined — PATH and HOME from the host, no secrets', () => {
    const c = unconfinedCommand(
      'node -v',
      { workspace: WS },
      { PATH: '/opt/homebrew/bin:/usr/bin', HOME: '/Users/me', GEMINI_API_KEY: 'x' },
    )
    expect(c.file).toBe('/bin/bash')
    expect(c.args).toEqual(['-lc', 'node -v'])
    expect(c.cwd).toBe(WS)
    expect(c.env.PATH).toBe('/opt/homebrew/bin:/usr/bin')
    expect(c.env.HOME).toBe('/Users/me')
    expect(c.env.STUDIO_SANDBOX).toBe('none')
    expect(c.env).not.toHaveProperty('GEMINI_API_KEY')
  })
})
