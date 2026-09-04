/**
 * General media host actions — the open end of the studio.
 *
 * The named pipelines produce the artifacts people ask for by name. These let
 * the agent EDIT whatever is already in the workspace: quieten a music bed,
 * trim an opening, replace an audio track, crop, extract a still. Without
 * them the studio can only regenerate, which is the wrong answer to "this is
 * almost right, just turn the music down".
 *
 * ffmpeg is powerful enough to read and write anywhere on the host, so every
 * path here is resolved against the workspace and rejected if it escapes.
 */
import { existsSync, realpathSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { addOutput, projectRowFor } from '../projects/service.js'
import { execAsync, getMediaDurationSec } from '../render/media.js'
import { registerHostAction } from '../studio/host-actions.js'
import { fileUrl, type Workspace } from '../studio/paths.js'

const logger = createLogger('studio:media')

/**
 * Resolve a workspace-relative path, refusing anything that escapes. ffmpeg
 * would happily read /etc/passwd or write over another user's project, so
 * this is the boundary — not a convenience.
 */
/**
 * The path with every symlink in it resolved.
 *
 * A path being written does not exist yet, and neither may its parents, so
 * resolve the deepest ancestor that does exist and re-attach the rest: a
 * symlink can only hide in a component that is already there.
 *
 * (The agent's file tools apply the same rule — .pi/lib/sandbox.ts. Keep the
 * two in step.)
 */
function resolveSymlinks(target: string): string {
  let head = target
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync.native(head)
      return tail.length ? path.join(real, ...tail) : real
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return path.resolve(target)
      const parent = path.dirname(head)
      if (parent === head) return path.resolve(target)
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

export function insideWorkspace(ws: Workspace, rel: string): string {
  if (typeof rel !== 'string' || !rel.trim())
    throw new Error('a workspace-relative path is required')
  if (path.isAbsolute(rel)) throw new Error(`path must be workspace-relative, got "${rel}"`)
  const abs = path.resolve(ws.dir, rel)
  // Symlinks resolved on both sides: rejecting ".." is not enough, because the
  // agent's shell can leave a link inside the workspace pointing at .env or at
  // another user's project, and these tools run out here where it resolves.
  const real = resolveSymlinks(abs)
  const root = resolveSymlinks(path.resolve(ws.dir))
  if (real !== root && !real.startsWith(`${root}${path.sep}`))
    throw new Error(`path escapes the workspace: "${rel}"`)
  return abs
}

/** Arguments that would let ffmpeg reach outside the workspace or the machine. */
function rejectUnsafeArgs(args: string[]): void {
  for (const arg of args) {
    if (typeof arg !== 'string') throw new Error('every ffmpeg argument must be a string')
    if (/^(https?|file|rtmp|rtsp|tcp|udp|pipe|concat|subfile|data):/i.test(arg))
      throw new Error(`ffmpeg protocol arguments are not allowed here: "${arg}"`)
    if (arg.startsWith('/') || arg.includes('..'))
      throw new Error(`paths must be workspace-relative and must not climb out: "${arg}"`)
  }
}

registerHostAction('media_probe', async (ws, params) => {
  const file = insideWorkspace(ws, String(params.file ?? ''))
  if (!existsSync(file)) throw new Error(`no such file in the workspace: ${params.file}`)
  const { stdout } = await execAsync(
    `ffprobe -v error -show_format -show_streams -of json "${file}"`,
    { maxBuffer: 8 * 1024 * 1024 },
  )
  const probe = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string; bit_rate?: string }
    streams?: Array<Record<string, any>>
  }
  const streams = (probe.streams ?? []).map(s => {
    const bits = [`#${s.index}`, s.codec_type, s.codec_name]
    if (s.codec_type === 'video') bits.push(`${s.width}x${s.height}`, `${s.r_frame_rate} fps`)
    if (s.codec_type === 'audio') bits.push(`${s.channels}ch`, `${s.sample_rate} Hz`)
    if (s.tags?.title) bits.push(`"${s.tags.title}"`)
    return bits.filter(Boolean).join(' · ')
  })

  // Mean/peak level per audio stream: the number you need before changing a
  // music bed's volume, and the only way to tell narration from a bed.
  const levels: string[] = []
  for (const s of probe.streams ?? []) {
    if (s.codec_type !== 'audio') continue
    try {
      const { stderr } = await execAsync(
        `ffmpeg -hide_banner -nostats -i "${file}" -map 0:${s.index} -af volumedetect -f null - 2>&1`,
        { maxBuffer: 8 * 1024 * 1024 },
      )
      const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]
      const peak = stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]
      if (mean || peak) levels.push(`#${s.index}: mean ${mean ?? '?'} dB, peak ${peak ?? '?'} dB`)
    } catch {
      /* level detection is a nicety; the stream list is the point */
    }
  }

  const dur = Number(probe.format?.duration ?? 0)
  return [
    `${params.file} — ${probe.format?.format_name ?? 'unknown container'}, ${dur.toFixed(2)}s`,
    `Streams:\n${streams.map(s => `  ${s}`).join('\n') || '  (none)'}`,
    levels.length ? `Audio levels:\n${levels.map(l => `  ${l}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
})

registerHostAction('media_ffmpeg', async (ws, params) => {
  const args = Array.isArray(params.args) ? (params.args as string[]) : null
  if (!args?.length) throw new Error('args must be a non-empty array of ffmpeg arguments')
  rejectUnsafeArgs(args)
  const outRel = String(params.out ?? '')
  const out = insideWorkspace(ws, outRel)

  // Resolve every argument that names an existing workspace file, so ffmpeg
  // runs on absolute paths and cwd can never change what it reads.
  const resolved = args.map(arg => {
    if (arg.startsWith('-')) return arg
    const abs = path.resolve(ws.dir, arg)
    return existsSync(abs) || abs === out ? abs : arg
  })
  const cmd = `ffmpeg -y -hide_banner ${resolved.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`
  logger.info({ workspace: ws.internal, out: outRel }, 'media_ffmpeg')

  const started = Date.now()
  try {
    await execAsync(cmd, { cwd: ws.dir, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60_000 })
  } catch (err: any) {
    // ffmpeg says exactly what is wrong on stderr; hand that back verbatim so
    // the agent can fix the command instead of guessing.
    const detail = String(err?.stderr || err?.message || err)
      .trim()
      .split('\n')
      .slice(-12)
      .join('\n')
    throw new Error(`ffmpeg failed:\n${detail}`)
  }
  const seconds = (Date.now() - started) / 1000

  if (!existsSync(out)) throw new Error(`ffmpeg reported success but ${outRel} was not written`)
  const { size } = await stat(out)
  const duration = await getMediaDurationSec(out).catch(() => 0)
  return [
    `Wrote ${outRel} (${(size / 1e6).toFixed(1)} MB${duration ? `, ${duration.toFixed(1)}s` : ''}) in ${seconds.toFixed(1)}s.`,
    `${params.why ?? 'Edit applied'}.`,
    'Preview it, and call media_publish when it is what the user asked for.',
  ].join(' ')
})

registerHostAction('media_publish', async (ws, params) => {
  const rel = String(params.file ?? '')
  const file = insideWorkspace(ws, rel)
  if (!existsSync(file)) throw new Error(`no such file in the workspace: ${rel}`)
  const ext = path.extname(file).toLowerCase()
  const kind = ext === '.pdf' ? 'pdf' : /\.(html?|htm)$/.test(ext) ? 'html' : 'video'

  const row = await projectRowFor(ws)
  if (!row) throw new Error('no project row for this workspace')

  let url = fileUrl(ws.internal, rel)
  let published = false
  try {
    url = await storage.uploadFile(file, undefined, `pitch/${ws.userId}/${ws.name}/outputs`)
    published = true
  } catch (err) {
    logger.warn({ err, workspace: ws.internal }, 'publish upload failed — serving the local file')
  }
  await addOutput(ws.userId, row.id, {
    kind: kind as 'video' | 'pdf' | 'html',
    url,
    label: String(params.label ?? 'Result'),
    createdAt: new Date().toISOString(),
  })
  return published
    ? `Published ${rel} as "${params.label}". URL: ${url}`
    : `Recorded ${rel} as "${params.label}" (upload failed; serving it from the workspace).`
})
