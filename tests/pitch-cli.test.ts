import { describe, expect, it } from 'vitest'
import { ArgvError, parseArgs, tokenize } from '../.pi/cli/argv.ts'
import { summarize } from '../.pi/cli/help.ts'
import { commands, findCommand, namespaces } from '../.pi/cli/registry.ts'
import { run } from '../.pi/cli/run.ts'

const ctx = { cwd: process.cwd() }

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

  it('gives every namespace a blurb, so `pitch help` has no blank line', async () => {
    const { BLURBS } = await import('../.pi/cli/help.ts')
    for (const ns of await namespaces()) expect(BLURBS[ns]).toBeTruthy()
  })
})

describe('help', () => {
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

describe('running several commands in one call', () => {
  it('runs them in order and labels each', async () => {
    const out = await run('effects families\nhelp motion', ctx)
    expect(out).toContain('$ pitch effects families')
    expect(out).toContain('$ pitch help motion')
    expect(out.indexOf('$ pitch effects families')).toBeLessThan(out.indexOf('$ pitch help motion'))
  })

  it('ignores blank lines and comments', async () => {
    const out = await run('\n# pick a family\neffects families\n', ctx)
    expect(out).toContain('effects.')
    expect(out).not.toContain('$ pitch')
  })
})
