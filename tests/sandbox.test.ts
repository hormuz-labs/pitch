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
  seatbeltCommand,
  seatbeltProfile,
  unconfinedCommand,
} from '../.pi/lib/sandbox'

const WS = '/app/projects/studio--user_1--acme'
const SHARED = ['/app/.pi/skills', '/app/assets', '/app/effects']
const HIDDEN = ['/app/assets/gsap', '/app/assets/three']

describe('the bwrap recipe', () => {
  const args = bwrapArgs({ workspace: WS, shared: SHARED, hidden: HIDDEN })
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

  it('hides the vendor libraries under an empty tmpfs, after the bind they sit in', () => {
    const tmpfs = args.map((a, i) => (a === '--tmpfs' ? args[i + 1] : null)).filter(Boolean)
    expect(tmpfs).toEqual(expect.arrayContaining(HIDDEN))
    const lastBind = args.lastIndexOf('--ro-bind-try')
    for (const dir of HIDDEN) expect(args.indexOf(dir)).toBeGreaterThan(lastBind)
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

describe('the line to `pitch`', () => {
  const pitch = { socket: '/tmp/pitch-abc/sock', bin: '/app/.pi/guest' }

  it('binds the program read-only and the socket directory where the program looks', () => {
    const args = bwrapArgs({ workspace: WS, shared: SHARED, pitch })
    const after = (from: string) => args[args.indexOf(from) + 1]
    expect(
      args.slice(args.indexOf('/app/.pi/guest') - 1, args.indexOf('/app/.pi/guest') + 2),
    ).toEqual(['--ro-bind', '/app/.pi/guest', '/opt/pitch'])
    expect(after('/tmp/pitch-abc')).toBe('/run/pitch')
    const env = Object.fromEntries(
      args.flatMap((a, i) => (a === '--setenv' ? [[args[i + 1], args[i + 2]]] : [])),
    )
    expect(env.PATH.startsWith('/opt/pitch:')).toBe(true)
    expect(env.PITCH_SOCKET).toBe('/run/pitch/sock')
  })

  it('is absent from the shell when no bridge is given', () => {
    const args = bwrapArgs({ workspace: WS, shared: SHARED })
    expect(args).not.toContain('/opt/pitch')
    expect(args.join(' ')).not.toContain('PITCH_SOCKET')
  })

  it('opens exactly one hole in the seatbelt: the program, and that socket', () => {
    const profile = seatbeltProfile({ workspace: WS, shared: SHARED, pitch })
    expect(profile).toContain('(deny network*)')
    expect(profile).toContain('(allow network-outbound (literal "/tmp/pitch-abc/sock"))')
    expect(profile).toContain('(allow file-read* (subpath "/app/.pi/guest"))')
    expect(profile.indexOf('(deny network*)')).toBeLessThan(profile.indexOf('network-outbound'))
    const cmd = seatbeltCommand(
      'pitch help',
      { workspace: WS, shared: SHARED, pitch },
      { PATH: '/usr/bin' },
    )
    expect(cmd.env.PATH).toBe('/app/.pi/guest:/usr/bin')
    expect(cmd.env.PITCH_SOCKET).toBe('/tmp/pitch-abc/sock')
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
  it('is bubblewrap on Linux and the seatbelt on macOS, where bwrap does not exist', () => {
    expect(sandboxMode('linux', {})).toBe('bwrap')
    expect(sandboxMode('darwin', {})).toBe('seatbelt')
  })

  it('lets STUDIO_SANDBOX force any of them', () => {
    expect(sandboxMode('linux', { STUDIO_SANDBOX: 'none' })).toBe('unconfined')
    expect(sandboxMode('darwin', { STUDIO_SANDBOX: 'none' })).toBe('unconfined')
    expect(sandboxMode('darwin', { STUDIO_SANDBOX: 'bwrap' })).toBe('bwrap')
    expect(sandboxMode('linux', { STUDIO_SANDBOX: 'seatbelt' })).toBe('seatbelt')
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

describe('the seatbelt recipe (macOS)', () => {
  // The developer's laptop used to run the shell unconfined: the agent, told
  // it had no network and no engine, fetched the site with node, read the
  // extensions' source and ran the host scripts by hand.
  const opts = {
    workspace: '/Users/dev/code/pitch/projects/studio--user_1--acme',
    shared: ['/Users/dev/code/pitch/.pi/skills', '/Users/dev/code/pitch/assets'],
    hidden: ['/Users/dev/code/pitch/assets/gsap'],
    home: '/Users/dev',
    repo: '/Users/dev/code/pitch',
    projects: '/Users/dev/code/pitch/projects',
  }
  const profile = seatbeltProfile(opts)
  const rules = profile.trim().split('\n')
  const at = (needle: string) => rules.findIndex(r => r.includes(needle))

  it('denies the network', () => {
    expect(rules).toContain('(deny network*)')
  })

  it('reads as a narrowing: home, checkout and projects out, then the workspace back', () => {
    expect(at('(deny file* (subpath "/Users/dev"))')).toBeGreaterThan(at('(allow default)'))
    expect(at('(deny file* (subpath "/Users/dev/code/pitch"))')).toBeGreaterThan(-1)
    expect(
      at('(allow file* (subpath "/Users/dev/code/pitch/projects/studio--user_1--acme"))'),
    ).toBeGreaterThan(at('(deny file* (subpath "/Users/dev/code/pitch/projects"))'))
  })

  it('allows the shared references read-only and hides the vendor libraries after them', () => {
    for (const root of opts.shared) {
      expect(at(`(allow file-read* (subpath "${root}"))`)).toBeGreaterThan(
        at('(deny file* (subpath "/Users/dev"))'),
      )
    }
    expect(at('(deny file-read* (subpath "/Users/dev/code/pitch/assets/gsap"))')).toBeGreaterThan(
      at('(allow file-read* (subpath "/Users/dev/code/pitch/assets"))'),
    )
  })

  it('lets the toolchains through, and stat everywhere', () => {
    expect(profile).toContain('(allow file-read* (subpath "/Users/dev/.nvm"))')
    expect(profile).toContain('(allow file-read* (subpath "/Users/dev/.cargo"))')
    expect(rules[rules.length - 1]).toBe('(allow file-read-metadata)')
  })

  it('escapes a quote in a path rather than ending the rule', () => {
    expect(seatbeltProfile({ ...opts, workspace: '/Users/dev/a"b' })).toContain(
      '(subpath "/Users/dev/a\\"b")',
    )
  })

  it('runs the command through sandbox-exec with the guest environment', () => {
    const c = seatbeltCommand('node -v', opts, {
      PATH: '/opt/homebrew/bin',
      HOME: '/Users/dev',
      GEMINI_API_KEY: 'x',
    })
    expect(c.file).toBe('/usr/bin/sandbox-exec')
    expect(c.args.slice(0, 1)).toEqual(['-p'])
    expect(c.args[1]).toBe(profile)
    expect(c.args.slice(2)).toEqual(['/bin/bash', '-c', 'node -v'])
    expect(c.cwd).toBe(opts.workspace)
    expect(c.env.STUDIO_SANDBOX).toBe('seatbelt')
    expect(c.env).not.toHaveProperty('GEMINI_API_KEY')
  })
})
