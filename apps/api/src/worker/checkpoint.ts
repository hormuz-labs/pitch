/**
 * Durable copies of a workspace in object storage.
 *
 * The hot copy of a project is a directory on one worker's disk. That disk is
 * fast and it is where ffmpeg, the browser and the file watcher want the
 * files, but it dies with the node. So whenever a workspace has changed and
 * gone quiet, the owning worker streams it into a private bucket:
 *
 *   workspaces/<projectId>/<version>/workspace.tar   projects/<internal>/ (minus caches)
 *   workspaces/<projectId>/<version>/history.tar     projects/.pitch-history/<internal>/
 *   workspaces/<projectId>/<version>/session.jsonl   the pi transcript
 *   workspaces/<projectId>/<version>/manifest.json
 *   workspaces/<projectId>/cover.jpg                 the grid thumbnail, if one was cached
 *
 * and bumps Project.workspaceVersion. A worker opening a project compares
 * that version with the marker file in its local copy and restores when they
 * differ. Only the lease holder may upload, and the version bump is fenced by
 * the lease, so two hot copies can never both win.
 *
 * tar is used as a plain container, uncompressed: workspaces are mostly video
 * and audio that gzip would spend minutes not shrinking.
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createLogger } from '@saas/shared'
import { type PrivateObjectStore, privateBucket } from '@saas/storage'
import { historyDir } from '../studio/history.js'
import { PROJECTS_DIR, type Workspace } from '../studio/paths.js'
import { AGENT_DIR } from '../studio/session.js'
import { CHECKPOINTS_ENABLED, WORKSPACE_BUCKET } from './config.js'

const logger = createLogger('studio:checkpoint')

export const MARKER = '.studio-checkpoint'

export interface Marker {
  projectId: string
  version: number
}

export interface Manifest {
  format: 1
  projectId: string
  version: number
  internal: string
  /** Transcript path relative to the pi agent dir, or null when the project never spoke. */
  session: string | null
  artifactKind: string | null
  createdAt: string
}

let store: PrivateObjectStore | null = null
export function bucket(): PrivateObjectStore {
  if (!CHECKPOINTS_ENABLED) throw new Error('workspace checkpoints are disabled')
  store ??= privateBucket(WORKSPACE_BUCKET)
  return store
}

const keyOf = (projectId: string, version: number, file: string) =>
  `workspaces/${projectId}/${version}/${file}`
const coverKey = (projectId: string) => `workspaces/${projectId}/cover.jpg`

export async function readMarker(dir: string): Promise<Marker | null> {
  try {
    const m = JSON.parse(await readFile(path.join(dir, MARKER), 'utf8'))
    if (typeof m?.projectId !== 'string' || !Number.isInteger(m?.version)) return null
    return { projectId: m.projectId, version: m.version }
  } catch {
    return null
  }
}

export async function writeMarker(dir: string, marker: Marker): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, MARKER), `${JSON.stringify(marker)}\n`)
}

/** Files under the workspace that are caches or scratch: rebuilt, never restored. */
const EXCLUDES = ['.thumbs', '.editable-*', '.health-*', MARKER, '.*.restore-*', '.*.backup-*']

/**
 * Archive `name` under `parent` (or explicit `members`, relative to it) into
 * `file`, and return its size. tar writes the file itself: under Bun on
 * Linux a child's pipes drop data (the other half of tarExtract's note), and
 * a checkpoint read from tar's stdout was sometimes stored as 0 bytes.
 */
export async function tarToFile(
  parent: string,
  what: string | string[],
  file: string,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted()
  const args = Array.isArray(what)
    ? ['-cf', file, '-C', parent, '--', ...what]
    : ['-cf', file, ...EXCLUDES.map(e => `--exclude=${e}`), '-C', parent, what]
  const proc = spawn('tar', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  proc.stderr.on('data', (c: Buffer) => {
    err += c.toString('utf8')
  })
  const kill = () => proc.kill('SIGKILL')
  signal?.addEventListener('abort', kill, { once: true })
  try {
    await new Promise<void>((resolve, reject) => {
      proc.on('error', reject)
      proc.on('exit', code =>
        code === 0
          ? resolve()
          : reject(new Error(`tar exited ${code}: ${err.trim().slice(0, 500)}`)),
      )
    })
  } finally {
    signal?.removeEventListener('abort', kill)
  }
  signal?.throwIfAborted()
  const { size } = await stat(file)
  // A tar is at least its two 512-byte end blocks; less is not an archive.
  if (size < 1024) throw new Error(`tar wrote an empty archive (${size} bytes)`)
  return size
}

/**
 * Unpack an archive stream into `into`. The bytes land in a file beside it
 * first and tar reads that file: streaming them into tar's stdin loses data
 * under Bun — about one restore in ten failed "Unexpected EOF in archive"
 * although every byte had arrived.
 */
export async function tarExtract(into: string, body: NodeJS.ReadableStream): Promise<void> {
  await mkdir(into, { recursive: true })
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const archive = path.join(path.dirname(into), `.${path.basename(into)}.fetch-${tag}.tar`)
  try {
    // Opened before streaming, so the file exists by the time `finally`
    // removes it even when the download fails at once.
    const file = await open(archive, 'w')
    try {
      await pipeline(body, file.createWriteStream())
    } catch (err) {
      throw new Error(`Checkpoint download failed: ${String((err as Error)?.message ?? err)}`, {
        cause: err,
      })
    } finally {
      await file.close().catch(() => {})
    }
    const proc = spawn('tar', ['-xf', archive, '-C', into], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (c: Buffer) => {
      err += c.toString('utf8')
    })
    await new Promise<void>((resolve, reject) => {
      proc.on('error', reject)
      proc.on('exit', code =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Checkpoint extraction failed: tar exited ${code}: ${err.trim().slice(0, 500)}`,
              ),
            ),
      )
    })
  } finally {
    await rm(archive, { force: true })
  }
}

function sessionRelative(sessionFile: string | null): string | null {
  if (!sessionFile) return null
  const rel = path.relative(AGENT_DIR, sessionFile)
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel
  return path.join('foreign', path.basename(sessionFile))
}

export interface CheckpointInput {
  projectId: string
  ws: Workspace
  version: number
  sessionFile: string | null
  artifactKind: string | null
  signal?: AbortSignal
  progress?: (stage: string, percent?: number) => void
  timeoutMs?: number
}

/** Upload a new version. Returns the manifest; throws if anything did not land. */
export async function uploadCheckpoint(input: CheckpointInput): Promise<Manifest> {
  const { projectId, ws, version } = input
  const s = bucket()
  const started = Date.now()
  const controller = new AbortController()
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal
  const timeoutMs = input.timeoutMs ?? 5 * 60_000
  const timer = setTimeout(
    () => controller.abort(new Error(`Workspace checkpoint timed out after ${timeoutMs}ms`)),
    timeoutMs,
  )
  try {
    signal.throwIfAborted()
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const put = async (file: string, parent: string, name: string) => {
      signal.throwIfAborted()
      logger.info({ projectId, version, file }, 'checkpoint archive started')
      input.progress?.(`checkpoint: packing ${file}`, 0)
      // Beside `name`, never inside it, so it is not archived with it.
      const archive = path.join(parent, `.${name}.${file}.upload-${tag}`)
      const key = keyOf(projectId, version, file)
      try {
        const size = await tarToFile(parent, name, archive, signal)
        input.progress?.(`checkpoint: uploading ${file}`, 0)
        await s.put(key, createReadStream(archive) as any, 'application/x-tar', size, {
          signal,
          onProgress: loaded =>
            input.progress?.(
              `checkpoint: ${file} (${Math.floor(loaded / 1048576)} MiB uploaded)`,
              0,
            ),
        })
        signal.throwIfAborted()
        // Never publish a version whose archive is not all there.
        const stored = await s.head(key)
        if (stored?.size !== size)
          throw new Error(
            `checkpoint ${file} upload is incomplete: expected ${size} bytes, got ${stored?.size ?? 'nothing'}`,
          )
        logger.info({ projectId, version, file, bytes: size }, 'checkpoint archive finished')
      } catch (error) {
        logger.warn(
          { err: error, projectId, version, file, ms: Date.now() - started },
          'checkpoint archive failed',
        )
        controller.abort(error)
        throw error
      } finally {
        await rm(archive, { force: true })
      }
    }
    await put('workspace.tar', PROJECTS_DIR, ws.internal)
    const history = historyDir(ws.dir)
    if (existsSync(history)) await put('history.tar', path.dirname(history), path.basename(history))
    const session = sessionRelative(input.sessionFile)
    if (input.sessionFile && session && existsSync(input.sessionFile))
      await s.put(
        keyOf(projectId, version, 'session.jsonl'),
        await readFile(input.sessionFile),
        'application/x-ndjson',
        undefined,
        { signal },
      )
    const manifest: Manifest = {
      format: 1,
      projectId,
      version,
      internal: ws.internal,
      session: input.sessionFile && existsSync(input.sessionFile) ? session : null,
      artifactKind: input.artifactKind,
      createdAt: new Date().toISOString(),
    }
    await s.put(
      keyOf(projectId, version, 'manifest.json'),
      Buffer.from(JSON.stringify(manifest)),
      'application/json',
      undefined,
      { signal },
    )
    await uploadCover(projectId, ws, signal).catch(err =>
      logger.warn({ err, projectId }, 'cover upload failed'),
    )
    signal.throwIfAborted()
    logger.info({ projectId, version, ms: Date.now() - started }, 'workspace checkpointed')
    return manifest
  } finally {
    clearTimeout(timer)
  }
}

/** The newest cached grid thumbnail (thumbnails.ts writes `<kind>_0_50.jpg` for t=0.5). */
async function uploadCover(projectId: string, ws: Workspace, signal?: AbortSignal): Promise<void> {
  const dir = path.join(ws.dir, '.thumbs')
  const names = (await readdir(dir).catch(() => [] as string[])).filter(f =>
    /^[a-z]+_0_50\.jpg$/.test(f),
  )
  if (!names.length) return
  let newest: { file: string; mtime: number } | null = null
  for (const name of names) {
    const st = await stat(path.join(dir, name)).catch(() => null)
    if (st && (!newest || st.mtimeMs > newest.mtime))
      newest = { file: path.join(dir, name), mtime: st.mtimeMs }
  }
  if (newest)
    await bucket().put(coverKey(projectId), await readFile(newest.file), 'image/jpeg', undefined, {
      signal,
    })
}

/** The grid thumbnail of a project nobody holds right now. */
export async function readCover(projectId: string): Promise<Buffer | null> {
  if (!CHECKPOINTS_ENABLED) return null
  const body = await bucket().get(coverKey(projectId))
  if (!body) return null
  const chunks: Buffer[] = []
  for await (const c of body as AsyncIterable<Buffer>) chunks.push(c)
  return Buffer.concat(chunks)
}

export async function readManifest(projectId: string, version: number): Promise<Manifest | null> {
  const body = await bucket().get(keyOf(projectId, version, 'manifest.json'))
  if (!body) return null
  const chunks: Buffer[] = []
  for await (const c of body as AsyncIterable<Buffer>) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Manifest
}

/**
 * Replace the local copy with `version` from the bucket. Everything lands in
 * staging directories first and is swapped in by rename, so a failed download
 * leaves whatever was there untouched. Returns the transcript's absolute path
 * on this node (null when the checkpoint has none).
 */
export async function restoreCheckpoint(
  projectId: string,
  ws: Workspace,
  version: number,
): Promise<{ sessionFile: string | null }> {
  const s = bucket()
  const manifest = await readManifest(projectId, version)
  if (!manifest) throw new Error(`checkpoint ${projectId}@${version} has no manifest`)
  const started = Date.now()
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const wsStage = path.join(PROJECTS_DIR, `.${ws.internal}.restore-${tag}`)
  const history = historyDir(ws.dir)
  const histStage = path.join(path.dirname(history), `.${ws.internal}.restore-${tag}`)
  try {
    const wsBody = await s.get(keyOf(projectId, version, 'workspace.tar'))
    if (!wsBody) throw new Error(`checkpoint ${projectId}@${version} has no workspace.tar`)
    await tarExtract(wsStage, wsBody as any)
    const histBody = await s.get(keyOf(projectId, version, 'history.tar'))
    if (histBody) await tarExtract(histStage, histBody as any)
    let sessionFile: string | null = null
    if (manifest.session) {
      const body = await s.get(keyOf(projectId, version, 'session.jsonl'))
      if (body) {
        sessionFile = path.join(AGENT_DIR, manifest.session)
        await mkdir(path.dirname(sessionFile), { recursive: true })
        const tmp = `${sessionFile}.${tag}.tmp`
        const chunks: Buffer[] = []
        for await (const c of body as AsyncIterable<Buffer>) chunks.push(c)
        await writeFile(tmp, Buffer.concat(chunks))
        await rename(tmp, sessionFile)
      }
    }
    const extractedWs = path.join(wsStage, ws.internal)
    if (!existsSync(extractedWs)) throw new Error('workspace.tar did not contain the workspace')
    await rm(ws.dir, { recursive: true, force: true })
    await rename(extractedWs, ws.dir)
    const extractedHist = path.join(histStage, path.basename(history))
    await rm(history, { recursive: true, force: true })
    if (existsSync(extractedHist)) {
      await mkdir(path.dirname(history), { recursive: true })
      await rename(extractedHist, history)
    }
    await writeMarker(ws.dir, { projectId, version })
    logger.info({ projectId, version, ms: Date.now() - started }, 'workspace restored')
    return { sessionFile }
  } finally {
    await rm(wsStage, { recursive: true, force: true }).catch(() => {})
    await rm(histStage, { recursive: true, force: true }).catch(() => {})
  }
}

/** Drop stored versions except the newest `keep` and versions a render job still needs. */
export async function pruneCheckpoints(
  projectId: string,
  keep = 2,
  protectedVersions: Iterable<number> = [],
): Promise<void> {
  const s = bucket()
  const keys = await s.list(`workspaces/${projectId}/`)
  const versions = new Set<number>()
  for (const k of keys) {
    const m = k.match(/^workspaces\/[^/]+\/(\d+)\//)
    if (m) versions.add(Number(m[1]))
  }
  const protectedSet = new Set(protectedVersions)
  const stale = [...versions]
    .sort((a, b) => b - a)
    .slice(keep)
    .filter(version => !protectedSet.has(version))
  for (const k of keys) {
    const m = k.match(/^workspaces\/[^/]+\/(\d+)\//)
    if (m && stale.includes(Number(m[1]))) await s.remove(k).catch(() => {})
  }
}

/** Everything stored for a project; used when it is deleted. */
export async function deleteCheckpoints(projectId: string): Promise<void> {
  if (!CHECKPOINTS_ENABLED) return
  const s = bucket()
  for (const k of await s.list(`workspaces/${projectId}/`)) await s.remove(k).catch(() => {})
}
