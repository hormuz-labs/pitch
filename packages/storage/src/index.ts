/**
 * Object storage for the studio: public media (renders, uploads the app
 * links to), browser profiles, and workspace checkpoints.
 *
 * Two drivers, one contract (driver.ts):
 *
 *   STORAGE_DRIVER=s3    MinIO or any S3-compatible service — development,
 *                        the Compose host. MINIO_ENDPOINT / MINIO_ROOT_USER /
 *                        MINIO_ROOT_PASSWORD. The default.
 *   STORAGE_DRIVER=gcs   Google Cloud Storage with Application Default
 *                        Credentials (Workload Identity on GKE) — production.
 *
 * Bucket names and the public origin are the same either way:
 * STORAGE_BUCKET, STORAGE_PROFILES_BUCKET, STORAGE_PUBLIC_URL (the MINIO_*
 * spellings still work). A public object's URL is
 * `<STORAGE_PUBLIC_URL>/<bucket>/<key>` on both, which is exactly what GCS
 * serves at https://storage.googleapis.com and what MinIO serves
 * path-style, so a saved URL is portable between them.
 */
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { type ObjectDriver, readAll } from './driver.js'
import { gcsDriver } from './gcs.js'
import { s3Driver } from './s3.js'

export type { ObjectDriver } from './driver.js'

const DRIVER = (process.env.STORAGE_DRIVER || 's3').trim().toLowerCase()
if (DRIVER !== 's3' && DRIVER !== 'gcs')
  throw new Error(`STORAGE_DRIVER must be s3 or gcs (got "${DRIVER}")`)
export const STORAGE_DRIVER: ObjectDriver['name'] = DRIVER

const driver: ObjectDriver = DRIVER === 'gcs' ? gcsDriver() : s3Driver()

const bucket = process.env.STORAGE_BUCKET ?? process.env.MINIO_BUCKET ?? 'pitch-videos'
const publicUrl = (
  process.env.STORAGE_PUBLIC_URL ??
  process.env.MINIO_PUBLIC_URL ??
  (DRIVER === 'gcs'
    ? 'https://storage.googleapis.com'
    : (process.env.MINIO_ENDPOINT ?? 'http://localhost:9000'))
).replace(/\/$/, '')

function detectContentType(filePath: string): string {
  if (filePath.endsWith('.mp4')) return 'video/mp4'
  if (filePath.endsWith('.webm')) return 'video/webm'
  if (filePath.endsWith('.wav') || filePath.endsWith('.mp3')) return 'audio/mpeg'
  if (filePath.endsWith('.pdf')) return 'application/pdf'
  if (filePath.endsWith('.pptx') || filePath.endsWith('.ppt'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
  if (filePath.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const uniqueKey = (filename: string, prefix?: string) => {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return prefix ? path.join(prefix, uniqueId, filename) : `${uniqueId}/${filename}`
}

const logProgress = (loaded: number, total?: number) => {
  if (!total) return
  const pct = Math.round((loaded / total) * 100)
  console.log(`[Storage] Upload progress: ${pct}% (${formatBytes(loaded)} / ${formatBytes(total)})`)
}

async function publish(
  targetBucket: string,
  key: string,
  body: Readable | Buffer,
  contentType: string,
  size: number,
): Promise<string> {
  await driver.ensureBucket(targetBucket, true)
  console.log(
    `[Storage] Uploading ${path.basename(key)} (${formatBytes(size)}) to ${driver.name} bucket "${targetBucket}"...`,
  )
  await driver.put(targetBucket, key, body, { contentType, size, onProgress: logProgress })
  const url = `${publicUrl}/${targetBucket}/${key}`
  console.log(`[Storage] Upload complete. Public URL: ${url}`)
  return url
}

export async function uploadFile(localPath: string, bucketOverride?: string, prefix?: string) {
  const size = fs.statSync(localPath).size
  return publish(
    bucketOverride ?? bucket,
    uniqueKey(path.basename(localPath), prefix),
    fs.createReadStream(localPath),
    detectContentType(localPath),
    size,
  )
}

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  contentType: string,
  bucketOverride?: string,
  prefix?: string,
) {
  return publish(
    bucketOverride ?? bucket,
    uniqueKey(filename, prefix),
    buffer,
    contentType,
    buffer.length,
  )
}

/**
 * Stage a public file on the server. Our own URLs use the authenticated driver:
 * the browser-facing origin (e.g. localhost:9002) need not be reachable from a
 * worker container. External attachments still download over HTTP.
 * Only replace the destination after the entire stream has arrived.
 */
export async function downloadFile(url: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true })
  const tempDir = await mkdtemp(path.join(path.dirname(dest), '.download-'))
  try {
    const prefix = `${publicUrl}/${bucket}/`
    let body: Readable
    if (url.startsWith(prefix)) {
      const stored = await driver.get(bucket, url.slice(prefix.length))
      if (!stored) throw new Error('Uploaded file was not found in storage')
      body = stored
    } else {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok || !res.body) throw new Error(`Failed to download file: HTTP ${res.status}`)
      body = Readable.fromWeb(res.body as any)
    }
    const temp = path.join(tempDir, 'file')
    await pipeline(body, fs.createWriteStream(temp))
    await rename(temp, dest)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

/**
 * Deletes an object from storage given its public URL.
 * Silently no-ops if the URL doesn't belong to the configured bucket.
 */
export async function deleteFile(publicFileUrl: string, bucketOverride?: string): Promise<void> {
  const targetBucket = bucketOverride ?? bucket
  // Extract the key — URL format is: <publicUrl>/<bucket>/<key>
  const prefix = `${publicUrl}/${targetBucket}/`
  if (!publicFileUrl.startsWith(prefix)) {
    console.warn(
      `[Storage] deleteFile: URL does not match expected prefix, skipping. URL: ${publicFileUrl}`,
    )
    return
  }
  const key = publicFileUrl.slice(prefix.length)
  await driver.remove(targetBucket, key)
  console.log(`[Storage] Deleted object: ${key} from bucket "${targetBucket}"`)
}

// ---------------------------------------------------------------------------
// Browser profile storage_state.json sync (object store ↔ local filesystem)
//
// Each user gets a single object:
//   browser-profiles/<userId>/storage_state.json
//
// Upload happens when the user authenticates via the Browser Sessions tab
// (closeSession in browser-host.ts). Workers download before each job so the
// latest cookies are available regardless of which worker last ran for that user.
// ---------------------------------------------------------------------------

const PROFILES_BUCKET =
  process.env.STORAGE_PROFILES_BUCKET ?? process.env.MINIO_PROFILES_BUCKET ?? 'browser-profiles'

function storageStateKey(userId: string): string {
  return `${userId}/storage_state.json`
}

/**
 * Upload a local storage_state.json for the given user. Called by the
 * worker after the stealth browser shuts down so the latest cookies are
 * persisted for the next job (possibly on a different worker).
 *
 * Returns the key that was written.
 */
export async function uploadStorageState(localPath: string, userId: string): Promise<string> {
  const key = storageStateKey(userId)
  await driver.ensureBucket(PROFILES_BUCKET, false)
  await driver.put(PROFILES_BUCKET, key, fs.createReadStream(localPath), {
    contentType: 'application/json',
    size: fs.statSync(localPath).size,
  })
  console.log(`[Storage] Uploaded storage_state for user ${userId} → ${PROFILES_BUCKET}/${key}`)
  return key
}

/**
 * Download storage_state.json into a local file. Called by the worker before
 * launching the stealth browser so the latest cookies are available
 * regardless of which worker last ran a job.
 *
 * Returns true if the file was downloaded, false if no object exists yet.
 */
export async function downloadStorageState(userId: string, destPath: string): Promise<boolean> {
  const body = await driver.get(PROFILES_BUCKET, storageStateKey(userId))
  if (!body) {
    console.log(`[Storage] No storage_state stored for user ${userId} — starting fresh`)
    return false
  }
  const dir = path.dirname(destPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(destPath, await readAll(body))
  console.log(`[Storage] Downloaded storage_state for user ${userId} → ${destPath}`)
  return true
}

/**
 * Returns true when a storage_state.json exists for the given user.
 * Cheap HEAD check — does not download the object.
 */
export async function storageStateExists(userId: string): Promise<boolean> {
  try {
    return (await driver.head(PROFILES_BUCKET, storageStateKey(userId))) !== null
  } catch {
    return false
  }
}

/**
 * The stored side of "forget this login": remove every cookie belonging to
 * `host` (and its registrable domain) from the user's storage_state.json. If
 * no cookies remain, the object is deleted entirely. Returns true if anything
 * changed. Done in-memory (get → filter → put/delete), no temp files.
 */
export async function pruneStorageStateCookies(userId: string, host: string): Promise<boolean> {
  const key = storageStateKey(userId)
  const body = await driver.get(PROFILES_BUCKET, key)
  if (!body) return false
  const raw = (await readAll(body)).toString('utf-8')

  let state: { cookies?: Array<{ domain?: string }>; origins?: unknown[] }
  try {
    state = JSON.parse(raw)
  } catch {
    return false // unparseable — leave it alone
  }

  const target = host.toLowerCase().replace(/^www\./, '')
  const reg = target.split('.').slice(-2).join('.')
  const belongsToHost = (domain?: string): boolean => {
    if (!domain) return false
    const d = domain.replace(/^\./, '').toLowerCase()
    return d === target || d === reg || d.endsWith(`.${reg}`)
  }

  const before = state.cookies?.length ?? 0
  const remaining = (state.cookies ?? []).filter(c => !belongsToHost(c.domain))
  if (remaining.length === before) return false // nothing matched this host

  if (remaining.length === 0) {
    await driver.remove(PROFILES_BUCKET, key)
    console.log(
      `[Storage] Removed storage_state for user ${userId} (no cookies left after pruning ${target})`,
    )
    return true
  }

  state.cookies = remaining
  await driver.put(PROFILES_BUCKET, key, Buffer.from(JSON.stringify(state)), {
    contentType: 'application/json',
  })
  console.log(
    `[Storage] Pruned ${before - remaining.length} cookie(s) for ${target} (user ${userId})`,
  )
  return true
}

// ---------------------------------------------------------------------------
// Private objects (studio workspace checkpoints)
//
// Workspace checkpoints hold every file of a project — uploads, recordings,
// the pi transcript — so they live in a PRIVATE bucket: nothing here ever
// receives the public read grant uploadFile() applies. Callers stream bodies
// in and out; nothing is buffered whole in memory.
// ---------------------------------------------------------------------------

export interface PrivateObjectStore {
  put(key: string, body: Readable | Buffer, contentType?: string): Promise<void>
  get(key: string): Promise<Readable | null>
  head(key: string): Promise<{ size: number } | null>
  remove(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

/** An object store scoped to one private bucket, created on first use. */
export function privateBucket(bucketName: string): PrivateObjectStore {
  let ensured: Promise<void> | null = null
  const ensure = () => {
    ensured ??= driver.ensureBucket(bucketName, false).catch(err => {
      ensured = null
      throw err
    })
    return ensured
  }
  return {
    async put(key, body, contentType = 'application/octet-stream') {
      await ensure()
      await driver.put(bucketName, key, body, { contentType })
    },
    get: key => driver.get(bucketName, key),
    head: key => driver.head(bucketName, key),
    remove: key => driver.remove(bucketName, key),
    list: prefix => driver.list(bucketName, prefix),
  }
}
