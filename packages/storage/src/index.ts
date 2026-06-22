import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import fs from 'fs'
import path from 'path'
import type { Readable } from 'stream'

const endpoint = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000'
const bucket = process.env.MINIO_BUCKET ?? 'pitch-videos'
const publicUrl = (process.env.MINIO_PUBLIC_URL ?? endpoint).replace(/\/$/, '')

const MULTIPART_THRESHOLD = 5 * 1024 * 1024 // 5 MB
const MULTIPART_PART_SIZE = 5 * 1024 * 1024 // 5 MB per part
const MULTIPART_QUEUE_SIZE = 4 // concurrent part uploads

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes for large uploads
const CONNECT_TIMEOUT_MS = 30 * 1000 // 30 seconds to establish connection

const client = new S3Client({
  endpoint,
  region: 'us-east-1', // MinIO ignores this but the SDK requires a value
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
  requestHandler: {
    requestTimeout: UPLOAD_TIMEOUT_MS / 1000, // in seconds for fetch handler
    connectionTimeout: CONNECT_TIMEOUT_MS / 1000,
  } as any,
})

async function ensureBucketExists(bucketName: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }))
  } catch {
    // Bucket doesn't exist — create it
    await client.send(new CreateBucketCommand({ Bucket: bucketName }))

    // Make the bucket publicly readable so video URLs work without auth
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucketName}/*`,
        },
      ],
    })

    await client.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: policy }))

    console.log(`[Storage] Created public bucket: ${bucketName}`)
  }
}

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

export async function uploadFile(localPath: string, bucketOverride?: string, prefix?: string) {
  const targetBucket = bucketOverride ?? bucket
  const filename = path.basename(localPath)
  const contentType = detectContentType(localPath)
  const fileSize = fs.statSync(localPath).size

  await ensureBucketExists(targetBucket)

  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const key = prefix ? path.join(prefix, uniqueId, filename) : `${uniqueId}/${filename}`

  console.log(
    `[Storage] Uploading ${filename} (${formatBytes(fileSize)}) to MinIO bucket "${targetBucket}"...`,
  )

  if (fileSize > MULTIPART_THRESHOLD) {
    const parallelUpload = new Upload({
      client,
      params: {
        Bucket: targetBucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: contentType,
      },
      queueSize: MULTIPART_QUEUE_SIZE,
      partSize: MULTIPART_PART_SIZE,
    })

    parallelUpload.on('httpUploadProgress', progress => {
      if (progress.total) {
        const pct = Math.round((progress.loaded! / progress.total) * 100)
        console.log(
          `[Storage] Upload progress: ${pct}% (${formatBytes(progress.loaded!)} / ${formatBytes(progress.total)})`,
        )
      }
    })

    await parallelUpload.done()
  } else {
    const fileBuffer = fs.readFileSync(localPath)
    await client.send(
      new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      }),
    )
  }

  const url = `${publicUrl}/${targetBucket}/${key}`
  console.log(`[Storage] Upload complete. Public URL: ${url}`)
  return url
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
  await client.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: key }))
  console.log(`[Storage] Deleted object: ${key} from bucket "${targetBucket}"`)
}

// ---------------------------------------------------------------------------
// Browser profile storage_state.json sync (MinIO ↔ local filesystem)
//
// Each user gets a single S3 object:
//   browser-profiles/<userId>/storage_state.json
//
// Upload happens when the user authenticates via the Browser Sessions tab
// (closeSession in browser-host.ts). Workers download before each job so the
// latest cookies are available regardless of which worker last ran for that user.
// ---------------------------------------------------------------------------

const PROFILES_BUCKET = process.env.MINIO_PROFILES_BUCKET ?? 'browser-profiles'

function storageStateKey(userId: string): string {
  return `${userId}/storage_state.json`
}

async function ensurePrivateBucketExists(bucketName: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }))
    console.log(`[Storage] Created private bucket: ${bucketName}`)
  }
}

/**
 * Upload a local storage_state.json to MinIO for the given user.
 * Called by the worker after the stealth browser shuts down so the latest
 * cookies are persisted for the next job (possibly on a different worker).
 *
 * Returns the S3 key that was written.
 */
export async function uploadStorageState(localPath: string, userId: string): Promise<string> {
  const key = storageStateKey(userId)
  await ensurePrivateBucketExists(PROFILES_BUCKET)
  await client.send(
    new PutObjectCommand({
      Bucket: PROFILES_BUCKET,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: 'application/json',
    }),
  )
  console.log(`[Storage] Uploaded storage_state for user ${userId} → ${PROFILES_BUCKET}/${key}`)
  return key
}

/**
 * Download storage_state.json from MinIO into a local file.
 * Called by the worker before launching the stealth browser so the latest
 * cookies are available regardless of which worker last ran a job.
 *
 * Returns true if the file was downloaded, false if no object exists yet.
 */
export async function downloadStorageState(userId: string, destPath: string): Promise<boolean> {
  const key = storageStateKey(userId)
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: PROFILES_BUCKET, Key: key }))
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const chunks: Buffer[] = []
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    fs.writeFileSync(destPath, Buffer.concat(chunks))
    console.log(`[Storage] Downloaded storage_state for user ${userId} → ${destPath}`)
    return true
  } catch (e: any) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      console.log(`[Storage] No storage_state in S3 for user ${userId} — starting fresh`)
      return false
    }
    throw e
  }
}

/**
 * Returns true when a storage_state.json exists in S3 for the given user.
 * Cheap HEAD check — does not download the object.
 */
export async function storageStateExists(userId: string): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: PROFILES_BUCKET, Key: storageStateKey(userId) }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * The S3 side of "forget this login": remove every cookie belonging to `host`
 * (and its registrable domain) from the user's stored storage_state.json. If no
 * cookies remain, the object is deleted entirely. Returns true if anything
 * changed. Done in-memory (get → filter → put/delete), no temp files.
 */
export async function pruneStorageStateCookies(userId: string, host: string): Promise<boolean> {
  const key = storageStateKey(userId)

  let raw: string
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: PROFILES_BUCKET, Key: key }))
    const chunks: Buffer[] = []
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    raw = Buffer.concat(chunks).toString('utf-8')
  } catch (e: any) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return false
    throw e
  }

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
    await client.send(new DeleteObjectCommand({ Bucket: PROFILES_BUCKET, Key: key }))
    console.log(
      `[Storage] Removed storage_state for user ${userId} (no cookies left after pruning ${target})`,
    )
    return true
  }

  state.cookies = remaining
  await client.send(
    new PutObjectCommand({
      Bucket: PROFILES_BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify(state)),
      ContentType: 'application/json',
    }),
  )
  console.log(
    `[Storage] Pruned ${before - remaining.length} cookie(s) for ${target} (user ${userId})`,
  )
  return true
}
