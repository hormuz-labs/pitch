/**
 * Every host capability, as one command tree — the `pitch` CLI's registry.
 *
 * The studio used to show the model 55 tool definitions, ~40KB of names,
 * descriptions and JSON schemas, on every request of a run. A launch film
 * paid for eleven demo_*, eight recording_* and four pdf_* it never called,
 * and the toolkit grew a whole family-gating apparatus to hide them again.
 * None of that was the real bill: the run's 114 tool calls each replayed the
 * whole context, and the tool RESULTS were only 37k tokens all together. What
 * costs money is round trips.
 *
 * So the capabilities are subcommands of one program, `pitch`, which the
 * agent runs from its shell like any other. The skills say when to reach for
 * which command; `pitch --help` says what exists; and several commands in one
 * `bash` call are one round trip.
 *
 * Each namespace is a module in this directory that returns its commands. A
 * command added to a module is a subcommand with no edit here, and its own
 * description is its help. A new namespace is one line in NAMESPACES and one
 * in help.ts's BLURBS.
 */
import deck from './deck.ts'
import demo from './demo.ts'
import demoFlow from './demo-flow.ts'
import effects, { families } from './effects.ts'
import media from './media.ts'
import motion from './motion.ts'
import pdf from './pdf.ts'
import recording from './recording.ts'
import recordingFlow from './recording-flow.ts'
import video from './video.ts'

/** What a module declares: everything about a command except which namespace it is in. */
export interface CommandSpec {
  verb: string
  description: string
  /** A TypeBox `Type.Object` — the argv parser reads it to coerce values. */
  parameters: any
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate: unknown,
    ctx: { cwd: string },
  ) => Promise<unknown>
}

/** One subcommand: `pitch <namespace> <verb>`. */
export interface Command extends CommandSpec {
  namespace: string
}

/**
 * A namespace whose commands can be narrowed by a name that is itself a
 * subcommand: `pitch effects text list` is `pitch effects list --family
 * text`. The names come off disk, so a new family is a new subcommand with
 * no edit anywhere.
 */
export interface Groups {
  /** What one of them is called in help: "family". */
  noun: string
  /** The parameter the group's name fills on the command it precedes. */
  param: string
  /** The names, as they exist right now. */
  list: () => string[]
}

interface Namespace {
  /** The modules that fill it, in the order help prints them. */
  modules: (() => CommandSpec[])[]
  groups?: Groups
}

/**
 * Two namespaces come from more than one module: the demo and recording
 * pipelines each keep their browser-driving commands apart from their flow
 * commands.
 */
const NAMESPACES: Record<string, Namespace> = {
  effects: {
    modules: [effects],
    groups: { noun: 'family', param: 'family', list: families },
  },
  motion: { modules: [motion] },
  media: { modules: [media] },
  video: { modules: [video] },
  deck: { modules: [deck] },
  pdf: { modules: [pdf] },
  demo: { modules: [demo, demoFlow] },
  recording: { modules: [recording, recordingFlow] },
}

let cache: Command[] | null = null

/** Every subcommand the host offers, built once per process. */
export function commands(): Command[] {
  if (!cache) {
    cache = Object.entries(NAMESPACES).flatMap(([namespace, { modules }]) =>
      modules.flatMap(m => m().map(spec => ({ ...spec, namespace }))),
    )
  }
  return cache
}

/** The command `pitch <namespace> <verb>` names, or null. */
export function findCommand(namespace: string, verb: string): Command | null {
  return commands().find(c => c.namespace === namespace && c.verb === verb) ?? null
}

/** Every namespace, in the order help should print them. */
export function namespaces(): string[] {
  return Object.keys(NAMESPACES)
}

/** The groups a namespace can be narrowed by, or null. */
export function groupsOf(namespace: string): Groups | null {
  return NAMESPACES[namespace]?.groups ?? null
}
