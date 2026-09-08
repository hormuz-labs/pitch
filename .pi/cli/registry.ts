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
 * So the host tools become subcommands of one tool. The model is shown `pitch`
 * and a one-line summary of the namespaces; it asks for detail when it needs
 * detail (`pitch help motion`, `pitch motion check --help`), and it can run
 * several commands in one call instead of one per turn.
 *
 * Nothing here re-implements a tool. The extensions stay exactly as they are —
 * `pi.registerTool({ name, description, parameters, execute })` — and this
 * module loads them with a stand-in `pi` that collects the registrations
 * instead of publishing them. A tool added to an extension tomorrow is a
 * `pitch` subcommand with no other edit, and its own description is its help.
 */
import path from 'node:path'
import { EXTENSIONS_DIR } from '../lib/paths.ts'

/** One subcommand: `pitch <namespace> <verb>`. */
export interface Command {
  /** `<namespace> <verb>` — how it is written and how it is logged. */
  id: string
  namespace: string
  verb: string
  /**
   * The pi tool this wraps, e.g. `motion_check`, or null for a command
   * written as a command. It is here for a person reading a log, never for
   * the agent: nothing addresses a subcommand by a tool name.
   */
  origin: string | null
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

/**
 * Extension file → namespace. The prefix on a tool's own name is not enough:
 * eleven of them (`grab_frames`, `storyboard_plan`, `record_click`…) carry no
 * prefix at all, and two files share one namespace. The file is the fact.
 */
const NAMESPACES: Record<string, string> = {
  'html-motion-tools.ts': 'motion',
  'media-tools.ts': 'media',
  'video-gen-tools.ts': 'video',
  'deck-tools.ts': 'deck',
  'pdf-tools.ts': 'pdf',
  'demo-tools.ts': 'demo',
  'demo-flow-tools.ts': 'demo',
  'recording-tools.ts': 'recording',
  'recording-flow-tools.ts': 'recording',
}

/**
 * Not subcommands. `ask_user` is the studio's question UI, not an operation —
 * it stays a tool because the front end renders its arguments. `motion_effects`
 * is replaced by the native `effects` commands, which read the lab off disk.
 */
const NOT_COMMANDS = new Set(['ask_user', 'motion_effects'])

/** `motion_check` in motion → `check`; `grab_frames` in recording → `grab-frames`. */
export function verbOf(tool: string, namespace: string): string {
  const stem = tool.startsWith(`${namespace}_`) ? tool.slice(namespace.length + 1) : tool
  return stem.replace(/_/g, '-')
}

/**
 * Load one extension with a stand-in `pi`, returning what it registered.
 *
 * `pi.on(...)` is accepted and dropped: the session hooks (the sandbox's
 * system-prompt rewrite, for one) belong to a live pi session and mean
 * nothing to a command line.
 */
export async function loadExtension(file: string): Promise<Command[]> {
  const namespace = NAMESPACES[path.basename(file)]
  if (!namespace) return []
  const out: Command[] = []
  const pi = {
    registerTool(tool: any) {
      if (!tool?.name || NOT_COMMANDS.has(tool.name)) return
      const verb = verbOf(tool.name, namespace)
      out.push({
        id: `${namespace} ${verb}`,
        namespace,
        verb,
        origin: tool.name,
        description: String(tool.description ?? ''),
        parameters: tool.parameters,
        execute: tool.execute,
      })
    },
    on() {},
    registerCommand() {},
    registerSkill() {},
  }
  const mod = await import(file)
  await mod.default?.(pi as any)
  return out
}

let cache: Promise<Command[]> | null = null

/** Every subcommand the host offers, loaded once per process. */
export function commands(): Promise<Command[]> {
  if (!cache) {
    cache = (async () => {
      const files = Object.keys(NAMESPACES).map(f => path.join(EXTENSIONS_DIR, f))
      const loaded = await Promise.all(files.map(f => loadExtension(f).catch(() => [])))
      const { effectsCommands } = await import('./effects.ts')
      return [...loaded.flat(), ...effectsCommands()]
    })()
  }
  return cache
}

/** The command `pitch <namespace> <verb>` names, or null. */
export async function findCommand(namespace: string, verb: string): Promise<Command | null> {
  const all = await commands()
  return all.find(c => c.namespace === namespace && c.verb === verb) ?? null
}

/** Every namespace, in the order help should print them. */
export async function namespaces(): Promise<string[]> {
  const all = await commands()
  const order = ['effects', 'motion', 'media', 'video', 'deck', 'pdf', 'demo', 'recording']
  const seen = [...new Set(all.map(c => c.namespace))]
  return [...order.filter(n => seen.includes(n)), ...seen.filter(n => !order.includes(n))]
}
