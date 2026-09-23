/**
 * The dispatcher: argv in, the command's own output and an exit status back.
 *
 * Three programs share it. `bin/pitch` on a developer's terminal, the
 * studio's socket (serve.ts) that the sandboxed shell's `pitch` talks to,
 * and the tests. Whatever the front, this is the one place a command line
 * is read: strip a leading `pitch`, find the namespace, let a group name
 * narrow it (`pitch effects text list`), parse the rest by the command's own
 * schema, run it.
 *
 * It runs ONE command. Several are the shell's business — `a && b` stops at
 * the first failure, a newline does not — and that is why a failed command
 * says so in its exit status, not only in its text.
 */
import { ArgvError, parseArgs, tokenize } from './argv.ts'
import { commandHelp, groupHelp, namespaceHelp, topHelp } from './help.ts'
import { findCommand, groupsOf, namespaces } from './registry.ts'

export interface RunContext {
  /** The project workspace — every command runs against it. */
  cwd: string
  signal?: AbortSignal
  onUpdate?: unknown
}

export interface RunResult {
  text: string
  /** False when the command could not run, was not found, or failed. */
  ok: boolean
}

/** Whatever a command returned, as the text the agent reads. */
export function resultText(result: any): string {
  const content = result?.content
  if (!Array.isArray(content)) return typeof result === 'string' ? result : ''
  return content
    .map((c: any) => (c?.type === 'text' ? String(c.text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

const done = (text: string): RunResult => ({ text, ok: true })
const failed = (text: string): RunResult => ({ text, ok: false })

/** Run one command line: argv, or a string to split as a shell would. */
export async function run(input: string | string[], ctx: RunContext): Promise<RunResult> {
  let words = Array.isArray(input) ? [...input] : tokenize(input)
  if (words[0] === '$') words.shift()
  if (words[0] === 'pitch') words.shift()
  const wantsHelp = words.some(w => w === '--help' || w === '-h')
  words = words.filter(w => w !== '--help' && w !== '-h')

  const [first, ...afterFirst] = words
  if (!first || first === 'help') {
    const [ns, verb] = afterFirst
    if (!ns) return done(topHelp())
    return done(verb && findCommand(ns, verb) ? commandHelp(ns, verb) : namespaceHelp(ns))
  }

  const known = namespaces()
  if (!known.includes(first)) {
    return failed(`No "${first}". Namespaces: ${known.join(', ')}\n\n${topHelp()}`)
  }
  if (!afterFirst.length) return done(namespaceHelp(first))

  // `pitch effects text list`: a group name before the verb narrows it.
  const groups = groupsOf(first)
  const preset: Record<string, unknown> = {}
  let group: string | null = null
  if (groups?.list().includes(afterFirst[0])) {
    group = afterFirst.shift() as string
    preset[groups.param] = group
    if (!afterFirst.length) return done(groupHelp(first, group))
  }
  const [verb, ...tail] = afterFirst
  if (wantsHelp) return done(group ? groupHelp(first, group) : commandHelp(first, verb))

  const cmd = findCommand(first, verb)
  if (!cmd) {
    const where = group ? groupHelp(first, group) : namespaceHelp(first)
    return failed(`No "pitch ${first} ${verb}".\n\n${where}`)
  }
  if (group && !(groups!.param in (cmd.parameters?.properties ?? {}))) {
    return failed(`pitch ${first} ${verb} takes no ${groups!.noun}.\n\n${groupHelp(first, group)}`)
  }

  let params: Record<string, unknown>
  try {
    params = { ...preset, ...parseArgs(tail, cmd.parameters ?? {}) }
  } catch (err) {
    if (!(err instanceof ArgvError)) throw err
    return failed(`pitch ${first} ${verb}: ${err.message}\n\n${commandHelp(first, verb)}`)
  }

  try {
    const result: any = await cmd.execute(
      `pitch:${cmd.namespace}:${cmd.verb}`,
      params,
      ctx.signal ?? new AbortController().signal,
      ctx.onUpdate,
      { cwd: ctx.cwd },
    )
    const text = resultText(result) || '(no output)'
    return result?.isError ? failed(text) : done(text)
  } catch (err) {
    return failed(`pitch ${first} ${verb}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
