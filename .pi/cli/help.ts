/**
 * `pitch --help` — the documentation the agent reads when it needs it.
 *
 * Three levels, each a deliberate step down in cost. The top level is a line
 * per namespace. A namespace's page is a line per command. A command's own
 * page is its full description and every option, read only by an agent
 * about to run it. The skills say which commands a job needs and in what
 * order; this is what the commands themselves say.
 *
 * This replaces shipping all 55 schemas on all 116 requests of a run.
 */
import { commands, findCommand, groupsOf, namespaces } from './registry.ts'

/**
 * What each namespace is for. The modules describe individual commands well
 * and themselves not at all, and the one line that tells an agent whether to
 * look inside is worth writing by hand.
 */
export const BLURBS: Record<string, string> = {
  effects: 'the motion lab — every effect on disk, to search, read and port into a film',
  icons: 'offline brand and interface SVGs — search, import selected assets with provenance',
  motion: 'launch films — recon, scaffold, the engine schema, check, review, audio; user exports',
  media: 'ffmpeg, probing any media file, and publishing a finished file to the project',
  video: 'generated video from a prompt or a still',
  deck: 'slide decks — render and publish',
  pdf: 'PDFs — scaffold, parse, build, and scrape their images',
  demo: 'driving a browser to record a product demo, and narrating it',
  recording: 'an uploaded screen recording — probe, transcribe, find its moments, cut it',
}

/** The first sentence of a description, for a one-line listing. */
export function summarize(description: string, max = 96): string {
  const flat = description.replace(/\s+/g, ' ').trim()
  const stop = flat.search(/\.\s/)
  const first = stop === -1 ? flat : flat.slice(0, stop + 1)
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

/** Level 1: the namespaces. */
export function topHelp(): string {
  const all = commands()
  const lines = namespaces().map(ns => {
    const n = all.filter(c => c.namespace === ns).length
    return `  ${ns.padEnd(10)} ${BLURBS[ns] ?? ''} (${n})`
  })
  return [
    'pitch — every host capability of the studio, as commands.',
    '',
    'usage: pitch <namespace> <command> [--flag value] [positional]',
    '',
    ...lines,
    '',
    'pitch <namespace> --help             its commands, one line each',
    'pitch <namespace> <command> --help   what it does and every option',
    '',
    'Several commands in one shell call are one round trip; join them with &&',
    'so the first failure stops the rest.',
  ].join('\n')
}

/** Level 2: one namespace. */
export function namespaceHelp(ns: string): string {
  const all = commands()
  const mine = all.filter(c => c.namespace === ns)
  if (!mine.length) {
    const known = namespaces().join(', ')
    return `No namespace "${ns}". There is: ${known}`
  }
  const width = Math.max(...mine.map(c => c.verb.length))
  const rows = mine.map(c => `  pitch ${ns} ${c.verb.padEnd(width)}  ${summarize(c.description)}`)
  const groups = groupsOf(ns)
  const narrowing = groups
    ? [
        '',
        `A ${groups.noun} is a subcommand too — pitch ${ns} <${groups.noun}> <command> runs it on that ${groups.noun} only:`,
        `  ${groups.list().join(', ')}`,
      ]
    : []
  return [
    `pitch ${ns} — ${BLURBS[ns] ?? ''}`,
    '',
    ...rows,
    ...narrowing,
    '',
    `pitch ${ns} <command> --help for the whole description and its options.`,
  ].join('\n')
}

/** Level 2, narrowed: `pitch effects text` — the commands that take a family. */
export function groupHelp(ns: string, group: string): string {
  const groups = groupsOf(ns)
  if (!groups) return namespaceHelp(ns)
  const mine = commands().filter(
    c => c.namespace === ns && groups.param in (c.parameters?.properties ?? {}),
  )
  const width = Math.max(...mine.map(c => c.verb.length))
  const rows = mine.map(
    c => `  pitch ${ns} ${group} ${c.verb.padEnd(width)}  ${summarize(c.description)}`,
  )
  return [
    `pitch ${ns} ${group} — the ${groups.noun} "${group}" only.`,
    '',
    ...rows,
    '',
    `pitch ${ns} <command> --help for the whole description and its options.`,
  ].join('\n')
}

/** One option's line on a command's page. */
function optionLine(name: string, spec: any, required: boolean): string {
  const branches: any[] = spec?.anyOf ?? spec?.oneOf ?? [spec]
  const name_ = (s: any) =>
    s?.type === 'array'
      ? `${s.items?.type ?? 'string'}[]`
      : s?.type === 'integer'
        ? 'int'
        : (s?.type ?? 'string')
  const type = [...new Set(branches.map(name_))].join('|')
  const enums = Array.isArray(spec?.enum) ? ` one of: ${spec.enum.join(', ')}` : ''
  const need = required ? ' (required)' : ''
  const desc = String(spec?.description ?? '').replace(/\s+/g, ' ')
  const value = type === 'boolean' ? '[true|false]' : `<${type}>`
  return `  --${name} ${value}${need}  ${desc}${enums}`.trimEnd()
}

/** Level 3: one command. */
export function commandHelp(ns: string, verb: string): string {
  const cmd = findCommand(ns, verb)
  if (!cmd) return namespaceHelp(ns)
  const schema = cmd.parameters ?? {}
  const props: Record<string, any> = schema.properties ?? {}
  const required: string[] = schema.required ?? []
  const names = [...required, ...Object.keys(props).filter(k => !required.includes(k))]
  const options = names.map(n => optionLine(n, props[n], required.includes(n)))
  return [
    `pitch ${ns} ${verb}`,
    '',
    cmd.description.replace(/\s+/g, ' ').trim(),
    ...(options.length ? ['', 'Options:', ...options] : ['', '(no options)']),
    ...(required.length
      ? [
          '',
          `Required values may be given without their flag, in this order: ${required.join(', ')}.`,
        ]
      : []),
  ].join('\n')
}
