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
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PI_DIR, PI_EXTENSIONS_DIR, SKILLS_DIR } from '../studio/paths.js'

const extension = (file: string) => path.join(PI_EXTENSIONS_DIR, file)

/**
 * Every pipeline, plus the general media toolbox. Loading them all is cheap:
 * a pi extension only costs its tool descriptions in the prompt, and the
 * alternative is a project that cannot answer a reasonable request.
 */
export const EXTENSIONS: string[] = [
  extension('html-motion-tools.ts'), // launch films: shots.js + the GSAP engine
  extension('deck-tools.ts'), // decks: render and publish
  extension('pdf-tools.ts'), // decks: scaffold, scrape images, build
  extension('demo-tools.ts'), // demos: drive the browser and narrate
  extension('demo-flow-tools.ts'), // demos: record / stop / render
  extension('recording-tools.ts'), // uploaded recordings: probe, transcribe, inspect
  extension('recording-flow-tools.ts'), // uploaded recordings: render the edit
  extension('media-tools.ts'), // anything else: probe, ffmpeg, publish
  extension('video-gen-tools.ts'), // footage nobody has: generate a clip
]

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
 * either way, so the VM costs them nothing and buys them a workspace.
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
