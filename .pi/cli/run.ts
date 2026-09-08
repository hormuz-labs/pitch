/**
 * The dispatcher: one command line in, the tool's own output back.
 *
 * Several commands may arrive at once, one per line. They run in order and
 * stop at the first failure, which is the point of the whole exercise: the
 * six `motion_schema` calls that opened the last run, or a search followed by
 * a read followed by a check, are one turn here instead of three to six.
 */
import { ArgvError, parseArgs, tokenize } from './argv.ts'
import { commandHelp, namespaceHelp, topHelp } from './help.ts'
import { findCommand, namespaces } from './registry.ts'

export interface RunContext {
  /** The project workspace — every command runs against it. */
  cwd: string
  signal?: AbortSignal
  onUpdate?: unknown
}

/** Whatever a tool returned, as the text the agent reads. */
function resultText(result: any): string {
  const content = result?.content
  if (!Array.isArray(content)) return typeof result === 'string' ? result : ''
  return content
    .map((c: any) => (c?.type === 'text' ? String(c.text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

/** Run one command line (no newlines). */
export async function runOne(line: string, ctx: RunContext): Promise<string> {
  const words = tokenize(line.replace(/^\s*(\$\s*)?pitch\b/, '').trim())
  const wantsHelp = words.some(w => w === '--help' || w === '-h')
  const rest = words.filter(w => w !== '--help' && w !== '-h')

  const [first, second, ...tail] = rest
  if (!first || first === 'help') {
    if (!second) return topHelp()
    return (await findCommand(second, tail[0] ?? ''))
      ? commandHelp(second, tail[0])
      : namespaceHelp(second)
  }

  const known = await namespaces()
  if (!known.includes(first)) {
    return `No "${first}". Namespaces: ${known.join(', ')}\n\n${await topHelp()}`
  }
  if (!second) return namespaceHelp(first)
  if (wantsHelp) return commandHelp(first, second)

  const cmd = await findCommand(first, second)
  if (!cmd) return namespaceHelp(first)

  let params: Record<string, unknown>
  try {
    params = parseArgs(tail, cmd.parameters ?? {})
  } catch (err) {
    if (err instanceof ArgvError) {
      return `pitch ${first} ${second}: ${err.message}\n\n${await commandHelp(first, second)}`
    }
    throw err
  }

  const result = await cmd.execute(
    `cli:${cmd.tool}`,
    params,
    ctx.signal ?? new AbortController().signal,
    ctx.onUpdate,
    { cwd: ctx.cwd },
  )
  return resultText(result) || '(no output)'
}

/**
 * Run a whole invocation: one command, or several on separate lines.
 *
 * A failing command stops the rest and says which ones did not run, so the
 * agent never has to guess how far a batch got.
 */
export async function run(input: string, ctx: RunContext): Promise<string> {
  const lines = input
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
  if (!lines.length) return topHelp()
  if (lines.length === 1) {
    try {
      return await runOne(lines[0], ctx)
    } catch (err) {
      return `pitch: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(`$ pitch ${lines[i].replace(/^\s*(\$\s*)?pitch\b\s*/, '')}`)
    try {
      out.push(await runOne(lines[i], ctx))
    } catch (err) {
      out.push(`failed: ${err instanceof Error ? err.message : String(err)}`)
      const left = lines.length - i - 1
      if (left) out.push(`\n${left} command${left > 1 ? 's' : ''} after this one did not run.`)
      break
    }
    out.push('')
  }
  return out.join('\n').trimEnd()
}
