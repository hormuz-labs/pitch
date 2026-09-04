/**
 * Launch video: a shots.js shot list compiled by the shared GSAP engine,
 * previewed live, exported by seek-and-capture. The agent works sandboxed
 * with the launch-video skill and the motion_* host tools.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { ensureMix } from '../../lib/mix.js'
import { registerExporter } from '../../projects/export.js'
import { emitProjectEvent, onProjectEvent } from '../../studio/events.js'
import { MUSIC_DIR, SKILLS_DIR, type Workspace } from '../../studio/paths.js'
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

export async function stageMusic(ws: Workspace, music: string): Promise<string | null> {
  const file = path.basename(music)
  const src = path.join(MUSIC_DIR, file)
  if (!existsSync(src)) return null
  await mkdir(path.join(ws.dir, 'audio'), { recursive: true })
  await copyFile(src, path.join(ws.dir, 'audio', file))
  return file
}

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
