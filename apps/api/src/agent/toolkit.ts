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
 * Every pipeline, plus the general media toolbox.
 *
 * "Loading them all is cheap" turned out to be wrong. Measured on a real
 * 30-second launch film: 58 tools, ~42KB of names, descriptions and JSON
 * schemas, and pi has no way to vary the tool list per turn — so that 42KB
 * ships on every one of the 60 model requests the run took. About a quarter
 * of the entire token bill, most of it for tools the project will never call:
 * a launch film pays for eleven demo_*, eight recording_* and four pdf_*.
 *
 * So the families below load per session instead (see extensionsFor). This is
 * NOT the old flow registry coming back: nothing is decided by what kind of
 * project this is, the families widen on their own as evidence appears, and
 * any project can still become anything. It is lazy loading, not a category.
 */
export const FAMILIES = {
  /** Always: the file tools' companion for "this is nearly right, but…". */
  core: [extension('media-tools.ts')],
  /** Launch films: shots.js + the GSAP engine. */
  motion: [extension('html-motion-tools.ts'), extension('video-gen-tools.ts')],
  /** Decks: scaffold, scrape, build, render, publish. */
  deck: [extension('deck-tools.ts'), extension('pdf-tools.ts')],
  /** Demos: drive the browser, narrate, record. */
  demo: [
    extension('demo-tools.ts'),
    extension('demo-flow-tools.ts'),
    extension('video-gen-tools.ts'),
  ],
  /** Uploaded screen recordings: probe, transcribe, inspect, render the edit. */
  recording: [extension('recording-tools.ts'), extension('recording-flow-tools.ts')],
} as const

export type Family = keyof typeof FAMILIES

/** Everything, for callers that want the whole toolkit (tests, tooling). */
export const EXTENSIONS: string[] = [...new Set(Object.values(FAMILIES).flat() as string[])]

/** What the workspace already holds, as evidence of what this project is. */
export interface ProjectEvidence {
  /** Workspace-relative paths that exist (a shallow listing is enough). */
  files?: string[]
  /** The user's words this turn, and the ones that opened the project. */
  prompt?: string
  /** Names of anything they attached. */
  uploads?: string[]
}

const VIDEO_FILE = /\.(mp4|webm|mov|mkv|avi)$/i
const DECK_FILE = /\.(pdf|pptx?|key)$/i

/**
 * Which families this project needs.
 *
 * Deliberately generous — a family costs a few KB, a missing tool costs the
 * agent a turn and the user a wrong answer. When the request says nothing and
 * the workspace is empty, everything loads: a bare "help me" must not land in
 * a project that cannot do anything.
 */
export function familiesFor(evidence: ProjectEvidence): Set<Family> {
  const need = new Set<Family>(['core'])
  const files = evidence.files ?? []
  const uploads = evidence.uploads ?? []
  const words = (evidence.prompt ?? '').toLowerCase()
  const has = (re: RegExp) => files.some(f => re.test(f))

  // Evidence on disk: whatever is already here, the agent must be able to edit.
  if (has(/^(shots\.js|index\.html|direction\.md)$/)) need.add('motion')
  if (has(/^(deck\.html|build\/pdf-builder\.js)$/)) need.add('deck')
  if (has(/^storyboard\.json$/) || has(/^recording\//)) need.add('demo')
  if (files.some(f => /^(recording|uploads)\//.test(f) && VIDEO_FILE.test(f))) need.add('recording')
  if (uploads.some(u => VIDEO_FILE.test(u))) need.add('recording')
  if (uploads.some(u => DECK_FILE.test(u))) need.add('deck')

  // What they asked for.
  if (/\b(launch|promo|teaser|trailer|kinetic|motion graphic|announce)\b/.test(words))
    need.add('motion')
  if (/\b(deck|slide|slides|presentation|powerpoint|pitch deck|keynote)\b/.test(words))
    need.add('deck')
  if (/\b(demo|walkthrough|walk through|tutorial|screencast|narrat)\w*\b/.test(words))
    need.add('demo')
  if (/\b(recording|screen record|footage|my video|this video|the video i)\b/.test(words))
    need.add('recording')
  // "video" alone is ambiguous: a launch film and a demo are both videos.
  if (/\bvideo\b/.test(words) && need.size === 1) {
    need.add('motion')
    need.add('demo')
  }

  // Nothing to go on — hand over everything rather than guess wrong.
  if (need.size === 1 && !files.length && !uploads.length) {
    for (const f of Object.keys(FAMILIES) as Family[]) need.add(f)
  }
  return need
}

/** The extension files for a set of families, deduplicated. */
export function extensionsForFamilies(families: Iterable<Family>): string[] {
  const out = new Set<string>()
  for (const f of families) for (const e of FAMILIES[f]) out.add(e)
  return [...out]
}

/** The extensions this project needs, from its evidence. */
export function extensionsFor(evidence: ProjectEvidence): string[] {
  return extensionsForFamilies(familiesFor(evidence))
}

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
