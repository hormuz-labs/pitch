import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ArgvError, parseArgs, tokenize } from '../.pi/cli/argv.ts'
import { summarize } from '../.pi/cli/help.ts'
import { commands, findCommand, namespaces } from '../.pi/cli/registry.ts'
import { run as dispatch } from '../.pi/cli/run.ts'
import { closePitchSocket, pitchSocket, socketPathFor } from '../.pi/cli/serve.ts'
import { GUEST_BIN_DIR } from '../.pi/lib/paths.ts'

const ctx = { cwd: process.cwd() }
const run = async (line: string | string[], c = ctx) => (await dispatch(line, c)).text

describe('tokenize', () => {
  it('splits on whitespace and keeps quoted phrases whole', () => {
    expect(tokenize('effects search a card flipping')).toEqual([
      'effects',
      'search',
      'a',
      'card',
      'flipping',
    ])
    expect(tokenize(`motion tts --script "hello there, world"`)).toEqual([
      'motion',
      'tts',
      '--script',
      'hello there, world',
    ])
  })

  it('keeps an empty quoted argument, which is not the same as no argument', () => {
    expect(tokenize(`motion sfx --query ""`)).toEqual(['motion', 'sfx', '--query', ''])
  })

  it('refuses an unbalanced quote rather than guessing where it ended', () => {
    expect(() => tokenize(`motion tts --script "unclosed`)).toThrow(ArgvError)
  })
})

describe('parseArgs', () => {
  const schema = {
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer' },
      dur: { type: 'number' },
      loop: { type: 'boolean' },
      moves: { type: 'array', items: { type: 'string' } },
      steps: { type: 'array', items: { type: 'object' } },
      dryRun: { type: 'boolean' },
    },
    required: [],
  }

  it('coerces by the schema, not by the look of the value', () => {
    // "3" is a number for --limit and a string for --query, because that is
    // what each property declares.
    expect(parseArgs(['--limit', '3', '--query', '3'], schema)).toEqual({ limit: 3, query: '3' })
  })

  it('takes a bare boolean flag as true', () => {
    expect(parseArgs(['--loop'], schema)).toEqual({ loop: true })
    expect(parseArgs(['--loop=false'], schema)).toEqual({ loop: false })
  })

  it('consumes explicit booleans without swallowing the next flag or positional', () => {
    expect(parseArgs(['--loop', 'true', '--dry-run', 'false', '--limit', '3'], schema)).toEqual({
      loop: true,
      dryRun: false,
      limit: 3,
    })
    const withQuery = { ...schema, required: ['query'] }
    expect(parseArgs(['--loop', 'a card flipping'], withQuery)).toEqual({
      loop: true,
      query: 'a card flipping',
    })
    expect(parseArgs(['--loop', '--limit', '3'], schema)).toEqual({ loop: true, limit: 3 })
  })

  it('parses the screenshot and SFX commands that failed in a studio session', () => {
    expect(
      parseArgs(
        ['recon/screenshots/full.png', '--url', 'https://example.com', '--fullPage', 'true'],
        findCommand('motion', 'screenshot')!.parameters,
      ),
    ).toEqual({ out: 'recon/screenshots/full.png', url: 'https://example.com', fullPage: true })
    expect(
      parseArgs(
        ['--mode', 'build', '--duration', '23.4', '--dry_run', 'true'],
        findCommand('motion', 'sfx')!.parameters,
      ),
    ).toEqual({ mode: 'build', duration: 23.4, dry_run: true })
  })

  it('collects a repeated array flag and splits a comma list', () => {
    expect(parseArgs(['--moves', 'flip-3d', '--moves', 'stagger'], schema).moves).toEqual([
      'flip-3d',
      'stagger',
    ])
    expect(parseArgs(['--moves', 'flip-3d,stagger'], schema).moves).toEqual(['flip-3d', 'stagger'])
  })

  it('reads an array of objects as JSON', () => {
    expect(parseArgs(['--steps', '[{"at":0}]'], schema).steps).toEqual([{ at: 0 }])
  })

  it('matches --dry-run to the dryRun property', () => {
    expect(parseArgs(['--dry-run'], schema)).toEqual({ dryRun: true })
  })

  it('names the options it does have when given one it does not', () => {
    expect(() => parseArgs(['--nope', '1'], schema)).toThrow(/no --nope here.*query/s)
  })

  it('refuses a number flag given a word', () => {
    expect(() => parseArgs(['--limit', 'lots'], schema)).toThrow(/wants a number/)
  })

  it('fills required properties from positionals, last string taking the rest', () => {
    const s = {
      properties: { id: { type: 'string' }, q: { type: 'string' } },
      required: ['id', 'q'],
    }
    expect(parseArgs(['text/snap', 'a', 'card', 'flipping'], s)).toEqual({
      id: 'text/snap',
      q: 'a card flipping',
    })
  })

  it('says what is missing rather than calling a tool without it', () => {
    const s = { properties: { id: { type: 'string' } }, required: ['id'] }
    expect(() => parseArgs([], s)).toThrow(/missing --id/)
  })
})

describe('the registry', () => {
  it("has every module's commands, each tagged with its namespace", () => {
    const all = commands()
    // The count follows the modules, not a list kept here.
    expect(all.length).toBeGreaterThan(50)
    expect(findCommand('motion', 'check')).toBeTruthy()
    expect(findCommand('recording', 'grab-frames')).toBeTruthy()
    expect(findCommand('effects', 'list')).toBeTruthy()
    expect(findCommand('demo', 'record-start')?.namespace).toBe('demo')
  })

  it('never has two commands with the same name in one namespace', () => {
    const seen = new Set<string>()
    for (const c of commands()) {
      const key = `${c.namespace} ${c.verb}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })

  it('forwards cancellation and progress from media ffmpeg to the host', async () => {
    const previous = (globalThis as any).__pitchStudioHost
    const controller = new AbortController()
    const onUpdate = vi.fn()
    const call = vi.fn(async (_cwd, _name, _params, context) => {
      context.progress('checkpointing workspace', 0)
      return 'wrote clip'
    })
    ;(globalThis as any).__pitchStudioHost = { call }
    try {
      const command = findCommand('media', 'ffmpeg')!
      await command.execute(
        'test',
        { args: ['-i', 'in.mp4', 'out.mp4'], out: 'out.mp4', why: 'test' },
        controller.signal,
        onUpdate,
        { cwd: process.cwd() },
      )
      expect(call).toHaveBeenCalledWith(
        process.cwd(),
        'media_ffmpeg',
        { args: ['-i', 'in.mp4', 'out.mp4'], out: 'out.mp4', why: 'test' },
        expect.objectContaining({ signal: controller.signal }),
      )
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ content: [{ type: 'text', text: 'checkpointing workspace' }] }),
      )
    } finally {
      ;(globalThis as any).__pitchStudioHost = previous
    }
  })

  it('keeps demo capture separate from camera work and final rendering', () => {
    const demo = commands()
      .filter(command => command.namespace === 'demo')
      .map(command => command.verb)
    expect(demo).toContain('record-start')
    expect(demo).toContain('narrate')
    expect(demo).toContain('source')
    expect(demo).not.toContain('zoom-in')
    expect(demo).not.toContain('zoom-out')
    expect(demo).not.toContain('render')
    expect(findCommand('video', 'render')).toBeTruthy()
  })

  it('gives every namespace a blurb, so `pitch help` has no blank line', async () => {
    const { BLURBS } = await import('../.pi/cli/help.ts')
    for (const ns of await namespaces()) expect(BLURBS[ns]).toBeTruthy()
  })
})

describe('help', () => {
  it('serves sections and shot types together in one schema lookup', async () => {
    const out = await run('motion schema --section actors --types line,logo-cta')
    expect(out).toContain('## Actors')
    expect(out).toContain('| type | Fields |')
    expect(out).toContain('logo-cta')
  })

  it('returns type-specific fields without replaying the common-field table', async () => {
    const out = await run('motion schema --types logo-cta')
    expect(out).toContain('| type | Fields |')
    expect(out).toContain('DOM:')
    expect(out).not.toContain('## Common shot fields')
    const combined = await run('motion schema --section "common shot fields" --types logo-cta')
    expect(combined).toContain('## Common shot fields')
    expect(combined).toContain('| type | Fields |')
  })

  it('exposes SFX trim and scheduled-dip control on the supported mix command', async () => {
    const cmd = findCommand('motion', 'mix')!
    expect(
      parseArgs(['--duration', '59', '--sfx-db', '-3', '--no-breaths=false'], cmd.parameters),
    ).toMatchObject({
      duration: 59,
      sfx_db: -3,
      no_breaths: false,
    })
    expect(await run('motion mix --help')).toContain('local 400ms windows')
  })

  it('lists the namespaces with no arguments', async () => {
    const out = await run('help', ctx)
    expect(out).toContain('pitch <namespace> <command>')
    for (const ns of await namespaces()) expect(out).toContain(ns)
  })

  it('lists a namespace one line per command', async () => {
    const out = await run('help motion', ctx)
    expect(out).toContain('pitch motion check')
    // One line each: the full description of check alone is longer than this.
    expect(out.split('\n').length).toBeLessThan(30)
  })

  it('gives a command its whole description and its options', async () => {
    const out = await run('motion check --help', ctx)
    expect(out).toContain('--page')
    expect(out).toContain('Options:')
  })

  it('summarizes to the first sentence', () => {
    expect(summarize('One thing. And then another thing entirely.')).toBe('One thing.')
  })

  it('answers an unknown namespace with the ones that exist', async () => {
    expect(await run('sparkle go', ctx)).toContain('Namespaces:')
  })

  it('shows the command page when the arguments are wrong, not just an error', async () => {
    const out = await run('motion check --bogus 1', ctx)
    expect(out).toContain('no --bogus here')
    expect(out).toContain('Options:')
  })
})

describe('exit status', () => {
  it('is success for help and for a command that ran', async () => {
    expect((await dispatch('help', ctx)).ok).toBe(true)
    expect((await dispatch('effects families', ctx)).ok).toBe(true)
  })

  it('is failure for an unknown namespace, an unknown command and bad arguments', async () => {
    // `a && b` in the shell only stops at `a` if `a` says so.
    expect((await dispatch('sparkle go', ctx)).ok).toBe(false)
    expect((await dispatch('motion sparkle', ctx)).ok).toBe(false)
    expect((await dispatch('motion check --bogus 1', ctx)).ok).toBe(false)
  })

  it('takes argv already split, quotes and all', async () => {
    const out = await run(['effects', 'search', 'a card flipping'], ctx)
    expect(out).toContain('"a card flipping"')
  })
})

describe('the socket the sandboxed `pitch` talks to', () => {
  const ws = process.cwd()
  afterAll(() => closePitchSocket(ws))

  it('streams source progress on stderr while keeping the result JSON on stdout', async () => {
    vi.stubGlobal('__pitchStudioHost', {
      call: async (_cwd: string, name: string, _params: unknown, context: any) => {
        expect(name).toBe('demo_source')
        context.progress('checkpoint: uploading workspace.tar', 0)
        await new Promise(resolve => setTimeout(resolve, 20))
        return JSON.stringify({ source: 'recording/source.mp4' })
      },
    })
    try {
      const { path: socket } = await pitchSocket(ws)
      const child = spawn('node', [join(GUEST_BIN_DIR, 'pitch'), 'demo', 'source'], {
        env: { ...process.env, PITCH_SOCKET: socket },
      })
      let out = '',
        err = ''
      child.stdout.on('data', chunk => {
        out += chunk
      })
      child.stderr.on('data', chunk => {
        err += chunk
      })
      expect(await new Promise(resolve => child.on('close', resolve))).toBe(0)
      expect(JSON.parse(out)).toEqual({ source: 'recording/source.mp4' })
      expect(err).toContain('checkpoint: uploading workspace.tar')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('cancels source preparation when its calling socket disconnects', async () => {
    let started!: () => void, cancelled!: () => void
    const began = new Promise<void>(resolve => {
      started = resolve
    })
    const aborted = new Promise<void>(resolve => {
      cancelled = resolve
    })
    vi.stubGlobal('__pitchStudioHost', {
      call: async (_cwd: string, _name: string, _params: unknown, context: any) => {
        started()
        return new Promise((_, reject) =>
          context.signal.addEventListener(
            'abort',
            () => {
              cancelled()
              reject(new Error('cancelled'))
            },
            { once: true },
          ),
        )
      },
    })
    const { path: socket } = await pitchSocket(ws)
    const conn = connect(socket)
    try {
      conn.on('connect', () => conn.write(`${JSON.stringify({ argv: ['demo', 'source'] })}\n`))
      await began
      conn.destroy()
      await aborted
    } finally {
      conn.destroy()
      vi.unstubAllGlobals()
    }
  })

  it('keeps the socket path short enough for a unix socket', () => {
    const p = socketPathFor('/app/projects/studio--user_2abc--a-rather-long-project-name', '/tmp')
    expect(p.length).toBeLessThan(80)
    expect(p).toMatch(/^\/tmp\/pitch-[0-9a-f]{16}\/sock$/)
  })

  it('runs the guest program end to end: output, and the exit status', async () => {
    const { path: socket } = await pitchSocket(ws)
    const guest = (...argv: string[]) =>
      new Promise<{ out: string; code: number | null }>(resolve => {
        const child = spawn('node', [join(GUEST_BIN_DIR, 'pitch'), ...argv], {
          env: { ...process.env, PITCH_SOCKET: socket },
        })
        let out = ''
        child.stdout.on('data', c => {
          out += c
        })
        child.stderr.on('data', c => {
          out += c
        })
        child.on('close', code => resolve({ out, code }))
      })
    const ok = await guest('effects', 'families')
    expect(ok.code).toBe(0)
    expect(ok.out).toContain('Live discovery index')
    expect(ok.out).toContain('pitch effects browse')
    const bad = await guest('sparkle', 'go')
    expect(bad.code).toBe(1)
    expect(bad.out).toContain('Namespaces:')
    const quoted = await guest('effects', 'search', 'a card flipping')
    expect(quoted.out).toContain('"a card flipping"')
  })

  it('says so when it has no socket, rather than hanging', async () => {
    const child = spawn('node', [join(GUEST_BIN_DIR, 'pitch'), 'help'], {
      env: { ...process.env, PITCH_SOCKET: '' },
    })
    let err = ''
    child.stderr.on('data', c => {
      err += c
    })
    const code = await new Promise<number | null>(r => child.on('close', r))
    expect(code).toBe(2)
    expect(err).toContain('PITCH_SOCKET')
  })
})
