/**
 * argv → the parameters a tool's `execute` expects.
 *
 * A subcommand's schema is the TypeBox object its module already declares,
 * so this reads that schema to decide what each flag means: `--limit 8` is a
 * number because the schema says integer, `--loop` is true because the schema
 * says boolean, `--moves flip-3d --moves stagger` collects because the schema
 * says array. Nothing is guessed from the value's shape, which is what makes
 * `--dur 3` a number and `--text 3` a string.
 *
 * Values that are objects or arrays of objects — a shot's `steps`, a mix's
 * tracks — are given as JSON in one argument. That is the honest limit of a
 * command line, and it is still one call instead of one turn.
 */

export class ArgvError extends Error {}

/** Split a command line into words, honouring single and double quotes. */
export function tokenize(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < input.length) cur += input[++i]
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started || cur) out.push(cur)
      cur = ''
      started = false
      continue
    }
    cur += ch
  }
  if (quote) throw new ArgvError(`unbalanced ${quote} quote`)
  if (started || cur) out.push(cur)
  return out
}

type Schema = { properties?: Record<string, any>; required?: string[] }

/** `--dry-run` is the property `dryRun`; `--out` is `out`. */
function propertyFor(flag: string, schema: Schema): string | null {
  const props = schema.properties ?? {}
  if (flag in props) return flag
  const camel = flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  if (camel in props) return camel
  const snake = flag.replace(/-/g, '_')
  return snake in props ? snake : null
}

/**
 * A `Type.Union([Type.String(), Type.Array(Type.String())])` — which is how
 * the tools that take "one section, or several at once" declare themselves —
 * arrives as `anyOf`, with no `type` of its own. Pick the array branch when
 * the value looks like a list, the plain branch otherwise, so
 * `--section actors` and `--section actors,rules` both mean what they say.
 */
function branchOf(spec: any, raw: string): any {
  const anyOf: any[] = spec?.anyOf ?? spec?.oneOf ?? []
  if (!anyOf.length) return spec
  const list = raw.includes(',') || raw.trim().startsWith('[')
  const wanted = anyOf.find(b => (b?.type === 'array') === list)
  return wanted ?? anyOf[0]
}

function coerce(name: string, specIn: any, raw: string): unknown {
  const spec = branchOf(specIn, raw)
  const type = spec?.type
  if (type === 'number' || type === 'integer') {
    const n = Number(raw)
    if (!Number.isFinite(n)) throw new ArgvError(`--${name} wants a number, got "${raw}"`)
    if (type === 'integer' && !Number.isInteger(n))
      throw new ArgvError(`--${name} wants a whole number, got "${raw}"`)
    return n
  }
  if (type === 'boolean') {
    if (raw === 'true' || raw === '') return true
    if (raw === 'false') return false
    throw new ArgvError(`--${name} wants true or false, got "${raw}"`)
  }
  if (type === 'object' || (type === 'array' && spec?.items?.type === 'object')) {
    try {
      return JSON.parse(raw)
    } catch {
      throw new ArgvError(`--${name} wants JSON, got "${raw.slice(0, 40)}"`)
    }
  }
  if (type === 'array') {
    // A repeated flag collects; one flag holding JSON or a comma list also works.
    if (raw.trim().startsWith('[')) {
      try {
        return JSON.parse(raw)
      } catch {
        /* fall through to the comma list */
      }
    }
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
  return raw
}

/**
 * Parse the words after `pitch <namespace> <verb>`.
 *
 * Positionals fill the schema's `required` properties in order, so
 * `pitch effects show text/bold-text-snap` needs no flag name and
 * `pitch effects search a card flipping to reveal a price` reads as English.
 * A required string that is last takes every remaining word.
 */
export function parseArgs(words: string[], schema: Schema): Record<string, unknown> {
  const props = schema.properties ?? {}
  const params: Record<string, unknown> = {}
  const positionals: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!word.startsWith('--')) {
      positionals.push(word)
      continue
    }
    const body = word.slice(2)
    const eq = body.indexOf('=')
    const flag = eq === -1 ? body : body.slice(0, eq)
    const name = propertyFor(flag, schema)
    if (!name) {
      const known = Object.keys(props).join(', ')
      throw new ArgvError(`no --${flag} here. Options: ${known || '(none)'}`)
    }
    const spec = props[name]
    let raw: string
    if (eq !== -1) raw = body.slice(eq + 1)
    else if (spec?.type === 'boolean') raw = ''
    else if (i + 1 < words.length && !words[i + 1].startsWith('--')) raw = words[++i]
    else throw new ArgvError(`--${flag} needs a value`)

    const value = coerce(name, spec, raw)
    if (spec?.type === 'array' && spec?.items?.type !== 'object') {
      const prev = (params[name] as unknown[] | undefined) ?? []
      params[name] = [...prev, ...(Array.isArray(value) ? value : [value])]
    } else {
      params[name] = value
    }
  }

  // Positionals fill the required properties in order.
  const required = (schema.required ?? []).filter(r => !(r in params))
  for (let i = 0; i < required.length && positionals.length; i++) {
    const name = required[i]
    const spec = props[name]
    const last = i === required.length - 1
    if (spec?.type === 'string' && last) {
      params[name] = positionals.join(' ')
      positionals.length = 0
    } else {
      params[name] = coerce(name, spec, positionals.shift() as string)
    }
  }
  if (positionals.length) {
    throw new ArgvError(
      `don't know what to do with "${positionals.join(' ')}" — name it with a --flag`,
    )
  }

  const missing = (schema.required ?? []).filter(r => !(r in params))
  if (missing.length) throw new ArgvError(`missing ${missing.map(m => `--${m}`).join(', ')}`)
  return params
}
