/**
 * Launch video: a shots.js shot list compiled by the shared GSAP engine,
 * previewed live, exported by seek-and-capture. The agent works sandboxed
 * with the launch-video skill and the motion_* host tools.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ensureMix } from '../../lib/mix.js'
import { nodeBinary } from '../../lib/node.js'
import { registerExporter } from '../../projects/export.js'
import { emitProjectEvent, onProjectEvent } from '../../studio/events.js'
import { registerHostAction } from '../../studio/host-actions.js'
import { MOTION_SCRIPTS_DIR, SKILLS_DIR, type Workspace } from '../../studio/paths.js'
import type { UploadRef } from '../types.js'
import { launchExporter } from './export.js'

const RELEVANT =
  /^(index\.html|shots\.js|js\/[^/]+\.js|css\/[^/]+\.css|assets\/.+|audio\/[^/]+\.(wav|mp3|m4a|aac|ogg))$/i

const FIRST_TURN_BRIEF =
  'The user wants results, not questions. Do NOT interview the user or wait for confirmations ' +
  '— run the launch-video workflow immediately: recon, direction.md, shot list, shots.js, ' +
  "audio mix, motion_audit. Your CWD is this job's workspace; the video is a shots.js shot list " +
  'compiled by the shared engine (index.html loads ../../engine/). Make every creative decision ' +
  'yourself, grounded in recon evidence, and briefly narrate your choices as you go. Build ' +
  'progressively: the studio shows every saved shots.js immediately, so write index.html and ' +
  'shots.js with the first two or three shots as soon as the shot list exists, then add shots ' +
  'in small batches, saving after each — the user watches the film grow shot by shot. Do not ' +
  'render an MP4. Only stop early if a hard requirement is missing (e.g. you cannot access the ' +
  'product at all).'

function hostOf(prompt: string): string | null {
  const m =
    prompt.match(/https?:\/\/([^/\s)]+)/i) ?? prompt.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i)
  return m?.[1]?.replace(/^www\./i, '') ?? null
}

const allSkills = existsSync(SKILLS_DIR)
  ? (await readdir(SKILLS_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => path.join(SKILLS_DIR, e.name))
  : []

registerExporter('launch-video', launchExporter)

// ── Heavy skill scripts, as render actions ────────────────────────────────────
//
// Narration alignment runs on the render tier against the workspace checkpoint.
// MP4 capture belongs to the user-triggered exporter in export.ts, not the agent CLI.

const execFileAsync = promisify(execFile)

/** Arguments are flags and workspace-relative paths, nothing that climbs out. */
function scriptArgs(params: Record<string, any>): string[] {
  const args = Array.isArray(params.args) ? params.args.map(String) : []
  for (const a of args) {
    const value = a.includes('=') ? a.slice(a.indexOf('=') + 1) : a
    if (value.startsWith('/') || value.split('/').includes('..'))
      throw new Error(`script arguments must stay inside the workspace: "${a}"`)
  }
  return args
}

async function runSkillScript(
  name: string,
  ws: Workspace,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(
      nodeBinary(),
      [path.join(MOTION_SCRIPTS_DIR, name), ...args],
      {
        cwd: ws.dir,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: timeoutMs,
        signal,
      },
    )
    return `${stdout}\n${stderr}`.trim()
  } catch (err) {
    // A failing script's own diagnosis lives in its output, not in "Command
    // failed with exit code 1" — surface it, or the agent invents a workaround.
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || e.message || String(err)
    throw new Error(detail)
  }
}

registerHostAction('launch_inspect', (ws, params, ctx) =>
  runSkillScript('inspect.mjs', ws, scriptArgs(params), 90_000, ctx.signal),
)

registerHostAction(
  'launch_align',
  (ws, params, ctx) => runSkillScript('align.mjs', ws, scriptArgs(params), 300_000, ctx.signal),
  { remote: true },
)

// A turn that ended without a mixdown (abort, crash, a model that stopped
// early) still gets sound: rebuild audio/mix.wav from the workspace.
const _uploads: UploadRef[] = []
void _uploads
export function watchMixes(projectId: string, ws: Workspace): () => void {
  return onProjectEvent(projectId, ev => {
    if (ev.type === 'idle')
      void ensureMix(ws.dir)
        .catch(() => {})
        .then(() =>
          emitProjectEvent(projectId, { type: 'preview', ok: true, files: ['audio/mix.wav'] }),
        )
  })
}
