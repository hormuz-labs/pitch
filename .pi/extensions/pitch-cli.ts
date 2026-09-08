/**
 * `pitch` — every host capability, as one tool.
 *
 * There used to be 55 of them, and the model was shown their names,
 * descriptions and JSON schemas on every request: about 8k tokens of the 82k
 * context a launch film carried, most of it for pipelines that film would
 * never touch. That was worth hiding, so the toolkit grew families, evidence,
 * widening and a `tools:` line in every skill's frontmatter to hide them.
 *
 * The schemas were never the expensive part. A measured 30-second film spent
 * 18 minutes and $1.38 across 114 tool calls, each replaying the whole
 * context; the results of all 114 came to 37k tokens. The bill is round
 * trips. A command line cuts round trips: several commands go in one call,
 * and the agent stops paying a turn apiece for six schema lookups.
 *
 * So: one tool, one string. `pitch help` lists the namespaces, `pitch help
 * motion` lists a namespace's commands, `pitch motion check --help` is one
 * command's page. The commands themselves are the extensions' own tools,
 * discovered at load time (../cli/registry.ts) — adding a tool to an
 * extension adds a subcommand, and adding an effect to effects/ adds it to
 * `pitch effects list`, with no edit here.
 */
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { BLURBS } from '../cli/help.ts'
import { run } from '../cli/run.ts'
import { workspaceOf } from '../lib/paths.ts'

/**
 * The namespace list, inline, so the agent knows what exists without spending
 * a call on `pitch help`. Everything below this line costs a call, and only
 * when it is needed.
 */
const DESCRIPTION = [
  "Run the studio's command line. Every capability this host has is a subcommand:",
  '',
  ...Object.entries(BLURBS).map(([ns, blurb]) => `  ${ns.padEnd(10)} ${blurb}`),
  '',
  'usage: pitch <namespace> <command> [--flag value] [positional]',
  '  pitch help <namespace>          its commands, one line each',
  '  pitch <namespace> <cmd> --help  the full description and every option',
  '',
  'Put SEVERAL commands on separate lines to run them in one call — they run in',
  'order and stop at the first failure. Prefer that to a call per command.',
  'Values that are objects or arrays of objects are given as JSON in one argument.',
].join('\n')

export default function pitchCli(pi: ExtensionAPI) {
  let localCwd: string | null = null

  pi.on('session_start', async (_event, ctx) => {
    localCwd = ctx.cwd
  })

  pi.registerTool({
    name: 'pitch',
    label: 'pitch',
    description: DESCRIPTION,
    parameters: Type.Object({
      command: Type.String({
        description:
          'One command line, e.g. `motion check`. Or several, one per line, to run in order.',
      }),
    }),
    async execute(_id, p: any, signal, onUpdate, ctx: ExtensionContext) {
      const cwd = localCwd ?? workspaceOf(ctx)
      const out = await run(String(p?.command ?? ''), { cwd, signal, onUpdate })
      return { content: [{ type: 'text' as const, text: out }], details: {} }
    },
  })
}
