/**
 * The Google Cloud Storage driver: what production on GKE uses. No keys —
 * credentials come from Application Default Credentials, which is Workload
 * Identity in the cluster and `gcloud auth application-default login` on a
 * laptop. GCS_PROJECT names the project buckets are created in when one is
 * missing (usually they are provisioned ahead of time) and GCS_LOCATION where.
 */

import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { IdempotencyStrategy, RETRYABLE_ERR_FN_DEFAULT, Storage } from '@google-cloud/storage'
import type { ObjectDriver, PutOptions } from './driver.js'

/**
 * A resumable upload goes up in chunks of this size, each its own request.
 * The client holds the chunk until Cloud Storage acknowledges it, so a
 * failed or stalled request resends that chunk, not the whole object — the
 * difference between a hiccup and restarting a workspace checkpoint.
 */
const CHUNK_SIZE = 8 * 1024 * 1024
/**
 * No request may go this long without an answer. The client sets no timeout
 * of its own on upload requests, so without this a request Cloud Storage
 * never answers waits forever. A chunk is at most CHUNK_SIZE, so a minute is
 * generous.
 */
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.GCS_REQUEST_TIMEOUT_MS || 60_000))

const notFound = (e: any) => e?.code === 404 || e?.code === 'ENOENT'
/** timedFetch below giving up on a stalled request — worth another attempt. */
const timedOut = (e: any) => e?.code === 'ETIMEDOUT'

/**
 * The client's HTTP layer (gaxios) sends through node-fetch, whose timeout —
 * like every node:http timeout — never fires under Bun: a stalled request
 * there is never cancelled. The runtime's own fetch with an abort signal is
 * the one timeout both Node and Bun honour, so uploads go through it.
 */
function timedFetch(url: string, init: any): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(
    () =>
      controller.abort(
        Object.assign(new Error(`no answer from Cloud Storage in ${REQUEST_TIMEOUT_MS}ms`), {
          code: 'ETIMEDOUT',
        }),
      ),
    REQUEST_TIMEOUT_MS,
  )
  // The client aborts on its own errors, with an AbortController polyfill.
  const outer = init?.signal
  if (outer?.aborted) controller.abort(outer.reason)
  else outer?.addEventListener?.('abort', () => controller.abort(outer.reason), { once: true })
  const body = init?.body
  return fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body,
    // A Node stream body (a resumable chunk) is sent as it is read.
    ...(body && typeof body === 'object' && Symbol.asyncIterator in body ? { duplex: 'half' } : {}),
    redirect: 'follow',
    signal: controller.signal,
  } as RequestInit).finally(() => clearTimeout(timer))
}

/**
 * gaxios hook: every request that reads its answer whole goes through
 * timedFetch. A streamed download (responseType 'stream') needs a Node stream
 * back, which only the default path gives, so it keeps that path.
 */
const adapter = (opts: any, defaultAdapter: (opts: any) => Promise<unknown>) =>
  defaultAdapter(
    opts.responseType === 'stream' ? opts : { ...opts, fetchImplementation: timedFetch },
  )

export function gcsDriver(): ObjectDriver {
  const storage = new Storage({
    projectId: process.env.GCS_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    retryOptions: {
      autoRetry: true,
      maxRetries: 5,
      // The default retries an upload only under an ifGenerationMatch
      // precondition, i.e. never for us. Every write here is safe to repeat:
      // checkpoint keys are versioned and the rest overwrite with the same bytes.
      idempotencyStrategy: IdempotencyStrategy.RetryAlways,
      retryableErrorFn: err => RETRYABLE_ERR_FN_DEFAULT(err) || timedOut(err),
    },
  })
  // Reaches the resumable upload requests (customRequestOptions), which are
  // the ones carrying bytes; metadata calls go through the client's own path.
  storage.interceptors.push({ request: (reqOpts: any) => ({ ...reqOpts, adapter }) })

  return {
    name: 'gcs',

    async ensureBucket(bucket, publicRead) {
      let exists: boolean
      try {
        ;[exists] = await storage.bucket(bucket).exists()
      } catch (e: any) {
        // Production buckets are provisioned ahead of time and the runtime
        // identity holds objectAdmin on them, which cannot read bucket
        // metadata: forbidden means there, just not ours to inspect.
        if (e?.code === 403) return
        throw e
      }
      if (exists) return
      try {
        await storage.createBucket(bucket, {
          location: process.env.GCS_LOCATION || undefined,
          iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
        })
      } catch (e: any) {
        if (e?.code !== 409) throw e // 409: someone else just created it
        return
      }
      if (publicRead) {
        const b = storage.bucket(bucket)
        const [policy] = await b.iam.getPolicy({ requestedPolicyVersion: 3 })
        policy.bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] })
        await b.iam.setPolicy(policy)
      }
      console.log(`[Storage] Created ${publicRead ? 'public' : 'private'} bucket: ${bucket}`)
    },

    async put(bucket, key, body, opts: PutOptions) {
      opts.signal?.throwIfAborted()
      const file = storage.bucket(bucket).file(key)
      const size = Buffer.isBuffer(body) ? body.length : opts.size
      // Always a resumable session, even for a small file: one more request,
      // but the only upload path that goes through timedFetch and resends a
      // failed chunk rather than failing the upload.
      const sink = file.createWriteStream({
        contentType: opts.contentType,
        resumable: true,
        chunkSize: CHUNK_SIZE,
      })
      const source = Buffer.isBuffer(body) ? Readable.from([body]) : body
      let loaded = 0
      const counted = new Transform({
        transform(chunk: Buffer, _enc, done) {
          loaded += chunk.length
          opts.onProgress?.(loaded, size)
          done(null, chunk)
        },
      })
      await pipeline(source, counted, sink, { signal: opts.signal })
    },

    async get(bucket, key) {
      const file = storage.bucket(bucket).file(key)
      try {
        const [exists] = await file.exists()
        if (!exists) return null
      } catch (e: any) {
        if (notFound(e)) return null
        throw e
      }
      // A 404 between exists() and here surfaces on the stream, as it should.
      return file.createReadStream()
    },

    async head(bucket, key) {
      try {
        const [meta] = await storage.bucket(bucket).file(key).getMetadata()
        return { size: Number(meta.size ?? 0) }
      } catch (e: any) {
        if (notFound(e)) return null
        throw e
      }
    },

    async remove(bucket, key) {
      await storage.bucket(bucket).file(key).delete({ ignoreNotFound: true })
    },

    async list(bucket, prefix) {
      try {
        const [files] = await storage.bucket(bucket).getFiles({ prefix, autoPaginate: true })
        return files.map(f => f.name)
      } catch (e: any) {
        if (notFound(e)) return []
        throw e
      }
    },
  }
}
