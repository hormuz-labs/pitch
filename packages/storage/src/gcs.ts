/**
 * The Google Cloud Storage driver: what production on GKE uses. No keys —
 * credentials come from Application Default Credentials, which is Workload
 * Identity in the cluster and `gcloud auth application-default login` on a
 * laptop. GCS_PROJECT names the project buckets are created in when one is
 * missing (usually they are provisioned ahead of time) and GCS_LOCATION where.
 */

import { pipeline } from 'node:stream/promises'
import { Storage } from '@google-cloud/storage'
import type { ObjectDriver, PutOptions } from './driver.js'

const RESUMABLE_THRESHOLD = 8 * 1024 * 1024 // below this, one request; above, a resumable session

const notFound = (e: any) => e?.code === 404 || e?.code === 'ENOENT'

export function gcsDriver(): ObjectDriver {
  const storage = new Storage({
    projectId: process.env.GCS_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    retryOptions: { autoRetry: true, maxRetries: 5 },
  })

  return {
    name: 'gcs',

    async ensureBucket(bucket, publicRead) {
      const [exists] = await storage.bucket(bucket).exists()
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
      const file = storage.bucket(bucket).file(key)
      if (Buffer.isBuffer(body)) {
        await file.save(body, {
          contentType: opts.contentType,
          resumable: body.length > RESUMABLE_THRESHOLD,
        })
        opts.onProgress?.(body.length, body.length)
        return
      }
      const resumable = opts.size === undefined || opts.size > RESUMABLE_THRESHOLD
      const sink = file.createWriteStream({ contentType: opts.contentType, resumable })
      if (opts.onProgress) {
        let loaded = 0
        body.on('data', (chunk: Buffer | string) => {
          loaded += chunk.length
          opts.onProgress!(loaded, opts.size)
        })
      }
      await pipeline(body, sink)
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
