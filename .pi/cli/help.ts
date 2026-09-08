/**
 * `pitch help` — the only documentation the model pays for up front.
 *
 * Three levels, each one a deliberate step down in cost. The top level is
 * eight lines and is embedded in the `pitch` tool's own description, so the
 * agent starts every session knowing what exists without a call. A namespace
 * listing is a line per command. A command's own page is its full description
 * and its options, and is read only by an agent about to run it.
 *
 * This replaces shipping all 55 schemas on all 116 requests of a run.
 */
import { commands, findCommand, namespaces } from './registry.ts'

/**
 * What each namespace is for. The extensions describe individual tools well
 * and themselves not at all, and the one line that tells an agent whether to
 * look inside is worth writing by hand.
 */
export const BLURBS: Record<string, string> = {
  effects: 'the motion lab — every effect on disk, to search, read and port into a film',
  motion: 'launch films — recon, scaffold, the engine schema, check, review, audio, render',
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
export async function topHelp(): Promise<string> {
  const all = await commands()
  const lines = (await namespaces()).map(ns => {
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
    'pitch help <namespace>        the commands in it, one line each',
    'pitch <namespace> <cmd> --help   what it does and every option',
    '',
    'Several commands in one call: put each on its own line. They run in order',
    'and stop at the first failure.',
  ].join('\n')
}

/** Level 2: one namespace. */
export async function namespaceHelp(ns: string): Promise<string> {
  const all = await commands()
  const mine = all.filter(c => c.namespace === ns)
  if (!mine.length) {
    const known = (await namespaces()).join(', ')
    return `No namespace "${ns}". There is: ${known}`
  }
  const width = Math.max(...mine.map(c => c.verb.length))
  const rows = mine.map(c => `  pitch ${ns} ${c.verb.padEnd(width)}  ${summarize(c.description)}`)
  return [
    `pitch ${ns} — ${BLURBS[ns] ?? ''}`,
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
  return `  --${name} <${type}>${need}  ${desc}${enums}`.trimEnd()
}

/** Level 3: one command. */
export async function commandHelp(ns: string, verb: string): Promise<string> {
  const cmd = await findCommand(ns, verb)
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
