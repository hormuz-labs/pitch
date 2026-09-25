/**
 * MP4 export for launch videos: the skill's capture.mjs renderer (seek and
 * capture at 60 fps with the mix muxed) into renders/launch-<res>.mp4, then
 * published to object storage as a project output. One render per project.
 *
 * The render itself is the `launch_export` host action, registered as
 * remote: on a fleet it runs on a render pod against the workspace
 * checkpoint and the MP4 comes back into renders/; on a single box it runs
 * here. The exporter below only decides whether a render is needed, drives
 * the action, and keeps the status the studio polls.
 *
 * The download is always the workspace file, served by /files: object
 * storage is where the output is PUBLISHED (share page, webhooks), and its
 * public URL need not resolve from wherever the app is running. A render
 * that is still newer than its sources is handed back, never redone.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { ensureMix } from '../../lib/mix.js'
import { nodeBinary } from '../../lib/node.js'
import type { Exporter, ExportStatus } from '../../projects/export.js'
import { type ProjectRow, workspaceOf } from '../../projects/service.js'
import { shouldWatermarkVideo } from '../../projects/watermark.js'
import {
  type HostContext,
  invokeHostAction,
  registerHostAction,
} from '../../studio/host-actions.js'
import { fileUrl, MOTION_SCRIPTS_DIR, type Workspace } from '../../studio/paths.js'
import { newestMtime, RENDER_RESES, type RenderRes, renderFile, sourceTargets } from './describe.js'

const logger = createLogger('studio:launch-export')
const CAPTURE = path.join(MOTION_SCRIPTS_DIR, 'capture.mjs')
/**
 * Sits beside a render made without the free-plan watermark. No marker means
 * stamped, which is also true of every launch render made before this existed.
 * A render whose stamp no longer matches the account is redone, both ways: an
 * upgrade gets a clean cut, and a cancelled plan that has run out gets the
 * watermark back instead of the clean file handed over again.
 */
const cleanMarker = (outFile: string) => `${outFile}.clean`

interface Job extends ExportStatus {
  controller: AbortController | null
}
const jobs = new Map<string, Job>()
const IDLE: ExportStatus = {
  running: false,
  res: null,
  url: null,
  progress: 0,
  stage: 'idle',
  error: null,
  startedAt: null,
  finishedAt: null,
}
const statusOf = (j: Job): ExportStatus => {
  const { controller: _c, ...s } = j
  return s
}

// ── The render, as a host action ──────────────────────────────────────────────

/** capture.mjs prints `[ 42%]` lines while capturing and named phases after. */
export function progressFromLine(line: string): { stage: string; progress?: number } | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes
  const s = line.replace(/\x1b\[[0-9;]*m/g, '').trim()
  if (!s) return null
  const pct = s.match(/\[\s*(\d+)%\]/)
  if (pct) return { stage: 'capturing', progress: Math.min(100, Number(pct[1])) }
  if (/Timeline duration/i.test(s)) return { stage: 'capturing' }
  if (/Assembling/i.test(s)) return { stage: 'encoding', progress: 100 }
  if (/Muxing/i.test(s)) return { stage: 'muxing' }
  return null
}

/** The line in a failed renderer's tail that says why. */
export function errorFromTail(tail: string[], code: number | null): string {
  const rev = [...tail].reverse()
  const line =
    rev.find(l => /No such filter|not found|Unknown|Invalid|ENOENT/i.test(l)) ??
    rev.find(l => /^Error[: ]/.test(l) && !/Command failed/.test(l)) ??
    rev.find(l => /error|failed/i.test(l) && !/^\s+at /.test(l))
  return line?.slice(0, 200) ?? `renderer exited with code ${code}`
}

function capture(
  cwd: string,
  outFile: string,
  res: RenderRes,
  watermark: boolean,
  ctx: HostContext,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(
      nodeBinary(),
      [
        CAPTURE,
        'index.html',
        `--out=${outFile}`,
        `--out-res=${res}`,
        '--fps=60',
        ...(watermark ? [] : ['--no-watermark']),
      ],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const tail: string[] = []
    const onLine = (raw: string) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes
      const s = raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
      if (!s) return
      tail.push(s)
      if (tail.length > 30) tail.shift()
      const p = progressFromLine(s)
      if (p) ctx.progress?.(p.stage, p.progress)
    }
    const buf = { out: '', err: '' }
    const feed = (key: 'out' | 'err', chunk: Buffer) => {
      buf[key] += chunk.toString('utf8')
      const lines = buf[key].split(/\r?\n/)
      buf[key] = lines.pop() ?? ''
      for (const l of lines) onLine(l)
    }
    proc.stdout?.on('data', (c: Buffer) => feed('out', c))
    proc.stderr?.on('data', (c: Buffer) => feed('err', c))
    const onAbort = () => proc.kill('SIGTERM')
    ctx.signal?.addEventListener('abort', onAbort, { once: true })
    proc.on('error', err => {
      ctx.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    proc.on('close', code => {
      ctx.signal?.removeEventListener('abort', onAbort)
      if (buf.out) onLine(buf.out)
      if (buf.err) onLine(buf.err)
      if (ctx.signal?.aborted) return reject(new Error('cancelled'))
      if (code === 0 && existsSync(path.join(cwd, outFile))) return resolve()
      reject(new Error(errorFromTail(tail, code)))
    })
  })
}

/**
 * Mix, capture, publish. Params: { res }. Writes renders/launch-<res>.mp4
 * and records it as a project output; returns the published URL (or a note
 * that publishing failed and the workspace file stands).
 */
registerHostAction(
  'launch_export',
  async (ws: Workspace, params, ctx) => {
    const res = String(params.res ?? '1080p') as RenderRes
    if (!RENDER_RESES.includes(res)) throw new Error(`unknown resolution ${res}`)
    if (!existsSync(path.join(ws.dir, 'index.html'))) throw new Error('nothing to render yet')
    if (!existsSync(CAPTURE)) throw new Error('capture script not found')
    const outFile = renderFile(res)
    ctx.progress?.('mixing')
    await ensureMix(ws.dir)
    if (ctx.signal?.aborted) throw new Error('cancelled')
    ctx.progress?.('starting')
    const watermark = await shouldWatermarkVideo(ws.userId)
    await capture(ws.dir, outFile, res, watermark, ctx)
    const marker = path.join(ws.dir, cleanMarker(outFile))
    if (watermark) await rm(marker, { force: true })
    else await writeFile(marker, '')
    ctx.progress?.('uploading', 100)
    try {
      const { addOutput, projectRowFor } = await import('../../projects/service.js')
      const url = await storage.uploadFile(
        path.join(ws.dir, outFile),
        undefined,
        `pitch/${ws.userId}/${ws.name}/videos`,
      )
      const row = await projectRowFor(ws)
      if (row)
        await addOutput(ws.userId, row.id, {
          kind: 'video',
          url,
          res,
          label: `Launch ${res}`,
          createdAt: new Date().toISOString(),
        })
      return `Rendered ${outFile}. Published video URL: ${url}`
    } catch (err) {
      logger.warn({ err, workspace: ws.internal }, 'render publish failed — the local file stands')
      return `Rendered ${outFile}; publishing failed, the workspace file stands.`
    }
  },
  { remote: true },
)

// ── The exporter the studio's Export button reaches ───────────────────────────

export const launchExporter: Exporter = {
  status: id => (jobs.get(id) ? statusOf(jobs.get(id)!) : IDLE),
  cancel(id) {
    const job = jobs.get(id)
    if (!job?.running) return false
    job.error = 'cancelled'
    job.stage = 'failed'
    if (job.controller) job.controller.abort()
    else {
      job.running = false
      job.finishedAt = Date.now()
    }
    return true
  },
  async start(p, opts, _publish) {
    const existing = jobs.get(p.id)
    if (existing?.running) return statusOf(existing)
    const res = String(opts.res ?? '1080p') as RenderRes
    if (!RENDER_RESES.includes(res))
      throw Object.assign(new Error(`unknown resolution ${res}`), { status: 400 })
    const ws = workspaceOf(p)
    if (!existsSync(path.join(ws.dir, 'index.html')))
      throw Object.assign(new Error('nothing to render yet'), { status: 409 })
    const outFile = renderFile(res)
    // A render stamped the wrong way for the account is stale, however fresh its sources.
    const renderedClean = existsSync(path.join(ws.dir, cleanMarker(outFile)))
    const force = opts.force || renderedClean === (await shouldWatermarkVideo(ws.userId))
    if (!force && (await isFresh(ws.dir, outFile))) {
      const done: Job = {
        ...IDLE,
        res,
        url: fileUrl(ws.internal, outFile),
        progress: 100,
        stage: 'done',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        controller: null,
      }
      jobs.set(p.id, done)
      return statusOf(done)
    }
    const published = p.outputs.find(
      o => o.kind === 'video' && o.res === res && Number.isFinite(Date.parse(o.createdAt)),
    )
    if (
      !force &&
      published &&
      (await newestMtime(sourceTargets(ws.dir))) <= Date.parse(published.createdAt)
    ) {
      const now = Date.now()
      const done: Job = {
        ...IDLE,
        res,
        url: published.url,
        progress: 100,
        stage: 'done',
        startedAt: now,
        finishedAt: now,
        controller: null,
      }
      jobs.set(p.id, done)
      return statusOf(done)
    }
    const controller = new AbortController()
    const job: Job = {
      ...IDLE,
      running: true,
      res,
      stage: 'mixing',
      startedAt: Date.now(),
      controller,
    }
    jobs.set(p.id, job)
    void invokeHostAction(
      ws,
      'launch_export',
      { res },
      {
        signal: controller.signal,
        progress: (stage, percent) => {
          if (!job.running) return
          job.stage = stage
          if (percent !== undefined) job.progress = percent
        },
      },
    )
      .then(() => {
        if (!job.running) return
        job.progress = 100
        job.url = fileUrl(ws.internal, outFile)
        job.stage = 'done'
      })
      .catch(err => {
        if (!job.running) return
        logger.warn({ err, projectId: p.id }, 'launch export failed')
        job.stage = 'failed'
        job.error = job.error === 'cancelled' ? job.error : (err?.message ?? String(err))
      })
      .finally(() => {
        job.running = false
        job.controller = null
        job.finishedAt = Date.now()
      })
    return statusOf(job)
  },
}

/** The render exists and nothing it was cut from has changed since. */
async function isFresh(dir: string, outFile: string): Promise<boolean> {
  const file = path.join(dir, outFile)
  if (!existsSync(file)) return false
  const [st, sourcesAt] = await Promise.all([stat(file), newestMtime(sourceTargets(dir))])
  return st.size > 0 && sourcesAt <= st.mtimeMs
}

export type { ProjectRow }
