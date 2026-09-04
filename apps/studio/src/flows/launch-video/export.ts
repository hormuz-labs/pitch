/**
 * MP4 export for launch videos: the skill's capture.mjs renderer (seek and
 * capture at 60 fps with the mix muxed) into renders/launch-<res>.mp4, then
 * published to object storage as a project output. One render per project.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import type { Output } from '../../flows/types.js'
import { ensureMix } from '../../lib/mix.js'
import { nodeBinary } from '../../lib/node.js'
import type { Exporter, ExportStatus } from '../../projects/export.js'
import { type ProjectRow, workspaceOf } from '../../projects/service.js'
import { fileUrl, MOTION_SKILL_DIR } from '../../studio/paths.js'
import { RENDER_RESES, type RenderRes, renderFile } from './describe.js'

const logger = createLogger('studio:launch-export')
const CAPTURE = path.join(MOTION_SKILL_DIR, 'scripts', 'capture.mjs')

interface Job extends ExportStatus {
  proc: ChildProcess | null
  tail: string[]
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
  const { proc: _p, tail: _t, ...s } = j
  return s
}

export const launchExporter: Exporter = {
  status: id => (jobs.get(id) ? statusOf(jobs.get(id)!) : IDLE),
  cancel(id) {
    const job = jobs.get(id)
    if (!job?.running) return false
    job.error = 'cancelled'
    job.stage = 'failed'
    if (job.proc) job.proc.kill('SIGTERM')
    else {
      job.running = false
      job.finishedAt = Date.now()
    }
    return true
  },
  start(p, opts, publish) {
    const existing = jobs.get(p.id)
    if (existing?.running) return statusOf(existing)
    const res = String(opts.res ?? '1080p') as RenderRes
    if (!RENDER_RESES.includes(res))
      throw Object.assign(new Error(`unknown resolution ${res}`), { status: 400 })
    const ws = workspaceOf(p)
    if (!existsSync(path.join(ws.dir, 'index.html')))
      throw Object.assign(new Error('nothing to render yet'), { status: 409 })
    if (!existsSync(CAPTURE)) throw new Error('capture script not found')
    const job: Job = {
      ...IDLE,
      running: true,
      res,
      stage: 'mixing',
      startedAt: Date.now(),
      proc: null,
      tail: [],
    }
    jobs.set(p.id, job)
    const outFile = renderFile(res)
    void ensureMix(ws.dir)
      .catch(err => logger.warn({ err, projectId: p.id }, 'mix step failed'))
      .finally(() => {
        if (!job.running) return
        job.stage = 'starting'
        spawnCapture(p, ws.dir, ws.internal, job, outFile, res, publish)
      })
    return statusOf(job)
  },
}

function spawnCapture(
  p: ProjectRow,
  cwd: string,
  internal: string,
  job: Job,
  outFile: string,
  res: RenderRes,
  publish: (o: Output) => Promise<void>,
) {
  const proc = spawn(
    nodeBinary(),
    [CAPTURE, 'index.html', `--out=${outFile}`, `--out-res=${res}`, '--fps=60'],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  job.proc = proc
  const onLine = (raw: string) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes
    const s = raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
    if (!s) return
    job.tail.push(s)
    if (job.tail.length > 30) job.tail.shift()
    const pct = s.match(/\[\s*(\d+)%\]/)
    if (pct) {
      job.progress = Math.min(100, Number(pct[1]))
      job.stage = 'capturing'
    } else if (/Timeline duration/i.test(s)) job.stage = 'capturing'
    else if (/Assembling/i.test(s)) {
      job.progress = 100
      job.stage = 'encoding'
    } else if (/Muxing/i.test(s)) job.stage = 'muxing'
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
  proc.on('error', err => {
    job.running = false
    job.stage = 'failed'
    job.error = err.message
    job.finishedAt = Date.now()
  })
  proc.on('close', code => {
    if (buf.out) onLine(buf.out)
    if (buf.err) onLine(buf.err)
    job.proc = null
    const produced = existsSync(path.join(cwd, outFile))
    if (code === 0 && produced) {
      job.progress = 100
      job.url = fileUrl(internal, outFile)
      job.stage = 'uploading'
      void (async () => {
        try {
          const url = await storage.uploadFile(
            path.join(cwd, outFile),
            undefined,
            `pitch/${p.userId}/${p.name}/videos`,
          )
          job.url = url
          await publish({
            kind: 'video',
            url,
            res,
            label: `Launch ${res}`,
            createdAt: new Date().toISOString(),
          })
        } catch (err) {
          logger.warn({ err, projectId: p.id }, 'render upload failed — serving the local file')
        } finally {
          job.stage = 'done'
          job.running = false
          job.finishedAt = Date.now()
        }
      })()
    } else {
      job.running = false
      job.finishedAt = Date.now()
      job.stage = 'failed'
      const tail = [...job.tail].reverse()
      const errLine =
        tail.find(l => /No such filter|not found|Unknown|Invalid|ENOENT/i.test(l)) ??
        tail.find(l => /^Error[: ]/.test(l) && !/Command failed/.test(l)) ??
        tail.find(l => /error|failed/i.test(l) && !/^\s+at /.test(l))
      job.error =
        job.error === 'cancelled'
          ? job.error
          : (errLine?.slice(0, 200) ?? `renderer exited with code ${code}`)
    }
  })
}
