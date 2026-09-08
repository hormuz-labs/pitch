/**
 * The studio agent's toolkit — one set, for every project.
 *
 * The studio used to hand each project the tools of its "flow", which meant a
 * recording edit could not touch a deck, and nothing could do the ordinary
 * thing people actually ask for: "this is nearly right, just turn the music
 * down". A project is a workspace and a conversation, not a category, so the
 * agent gets everything and decides what the request needs.
 *
 * The skills carry the instructions for the named outcomes (launch film, demo
 * recording, deck, recording edit); the agent reads the one it needs instead
 * of being born knowing exactly one of them.
 *
 * There is nothing to choose between any more. Every host capability is one
 * tool now — `pitch`, a command line whose subcommands are the pipelines
 * (.pi/cli/) — so the model is shown eight tools in total: the sandboxed file
 * tools, the question card, and `pitch`. The apparatus that used to hide 55
 * tool schemas behind families, workspace evidence, `tools:` frontmatter and
 * mid-turn widening is gone with them: it existed to save ~8k tokens a
 * request, and it cost a whole class of failure where a project landed
 * without the tools its skill named and the agent went reading extension
 * source to find out why.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PI_DIR, PI_EXTENSIONS_DIR, SKILLS_DIR } from '../studio/paths.js'

const extension = (file: string) => path.join(PI_EXTENSIONS_DIR, file)

/**
 * What a session loads.
 *
 * `pitch-cli.ts` registers the one tool and, through ../../../.pi/cli, reaches
 * every other extension's tools as subcommands — so the others are NOT loaded
 * into pi. `ask-tools.ts` stays a tool because the studio's front end renders
 * its arguments as the question card; it is UI, not an operation.
 */
export const EXTENSIONS: string[] = [extension('pitch-cli.ts'), extension('ask-tools.ts')]

/** Every skill directory under .pi/skills. */
export async function skills(): Promise<string[]> {
  if (!existsSync(SKILLS_DIR)) return []
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  return entries.filter(e => e.isDirectory()).map(e => path.join(SKILLS_DIR, e.name))
}

/**
 * Sandboxed file tools for every project. The demo and recording pipelines
 * used to run with no built-in tools at all, so the agent could record a video
 * it was then unable to read back. Their real work happens in host tools
 * either way, so the sandbox costs them nothing and buys them a workspace.
 */
export const BUILTIN_TOOLS = ['read', 'edit', 'write', 'find', 'grep', 'ls', 'bash']

/** The base prompt: what a project is, and how to find the rest. */
export async function systemPrompt(): Promise<string> {
  const parts = await Promise.all([
    readFile(path.join(PI_DIR, 'AGENT.md'), 'utf8').catch(() => ''),
    readFile(path.join(PI_DIR, 'APPEND_SYSTEM.md'), 'utf8').catch(() => ''),
  ])
  return parts.filter(Boolean).join('\n\n')
}
