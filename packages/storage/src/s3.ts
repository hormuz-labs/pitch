/**
 * The S3 driver: MinIO in development and on the Compose host, or any
 * S3-compatible service. Configured by MINIO_ENDPOINT, MINIO_ROOT_USER and
 * MINIO_ROOT_PASSWORD (the names predate the driver split and are kept).
 */

import type { Readable } from 'node:stream'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import { type ObjectDriver, type PutOptions, readAll } from './driver.js'

const MULTIPART_THRESHOLD = 5 * 1024 * 1024 // 5 MB
const MULTIPART_PART_SIZE = 5 * 1024 * 1024 // 5 MB per part
const MULTIPART_QUEUE_SIZE = 4 // concurrent part uploads

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes for large uploads
const CONNECT_TIMEOUT_MS = 30 * 1000 // 30 seconds to establish connection
/**
 * One upload request (a whole small object, or one multipart part) that has
 * no answer by now is dead, and fails as a TimeoutError the SDK retries — a
 * multipart upload resends just that part.
 */
const UPLOAD_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.S3_UPLOAD_REQUEST_TIMEOUT_MS || 60 * 1000),
)

const notFound = (e: any) =>
  e?.name === 'NoSuchKey' ||
  e?.name === 'NotFound' ||
  e?.name === 'NoSuchBucket' ||
  e?.$metadata?.httpStatusCode === 404

/** S3-compatible endpoints require the declared length to match the wire body exactly. */
export async function byteExactBody(body: Readable | Buffer, size: number): Promise<Buffer> {
  const bytes = Buffer.isBuffer(body) ? body : await readAll(body)
  if (bytes.length !== size) {
    throw new Error(`Upload expected ${size} bytes but received ${bytes.length}`)
  }
  return bytes
}

export function s3Driver(): ObjectDriver {
  const config = {
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.MINIO_REGION ?? 'us-east-1', // MinIO ignores this but the SDK requires a value
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    },
    forcePathStyle: true, // required for MinIO
  }
  // Uploads send buffers (a small object, or one multipart part) and read a
  // small answer, so they go through fetch: the node:http handler's timeouts
  // never fire under Bun, and a part the server never answered used to hang
  // the upload until the caller gave up. The fetch handler's timeout is a
  // plain timer, which holds on any runtime.
  const uploads = new S3Client({
    ...config,
    requestHandler: new FetchHttpHandler({ requestTimeout: UPLOAD_REQUEST_TIMEOUT_MS }),
  })
  const client = new S3Client({
    ...config,
    // Milliseconds: the SDK uses the node-http handler here, not fetch.
    // (Dividing by 1000 gave every request a 600 ms budget, which only
    // warned but was wrong.)
    requestHandler: {
      requestTimeout: UPLOAD_TIMEOUT_MS,
      connectionTimeout: CONNECT_TIMEOUT_MS,
    } as any,
  })

  return {
    name: 's3',

    async ensureBucket(bucket, publicRead) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }))
        return
      } catch {
        // fall through: create it
      }
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }))
      } catch (e: any) {
        // Two processes noticing the missing bucket at once: the loser's
        // create fails, and the bucket is there all the same.
        if (e?.name !== 'BucketAlreadyOwnedByYou' && e?.name !== 'BucketAlreadyExists') throw e
        return
      }
      if (publicRead) {
        // Public read so media URLs work without auth.
        const policy = JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${bucket}/*`,
            },
          ],
        })
        await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
      }
      console.log(`[Storage] Created ${publicRead ? 'public' : 'private'} bucket: ${bucket}`)
    },

    async put(bucket, key, body, opts: PutOptions) {
      opts.signal?.throwIfAborted()
      const small = Buffer.isBuffer(body) && body.length <= MULTIPART_THRESHOLD
      const known =
        !Buffer.isBuffer(body) && opts.size !== undefined && opts.size <= MULTIPART_THRESHOLD
      if (small || known) {
        const exactBody = await byteExactBody(
          body,
          Buffer.isBuffer(body) ? body.length : opts.size!,
        )
        await uploads.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: exactBody,
            ContentType: opts.contentType,
            ContentLength: exactBody.length,
          }),
          { abortSignal: opts.signal },
        )
        return
      }
      const upload = new Upload({
        client: uploads,
        params: { Bucket: bucket, Key: key, Body: body, ContentType: opts.contentType },
        queueSize: MULTIPART_QUEUE_SIZE,
        partSize: MULTIPART_PART_SIZE,
      })
      if (opts.onProgress)
        upload.on('httpUploadProgress', p => opts.onProgress!(p.loaded ?? 0, p.total))
      const abort = () => {
        void upload.abort().catch(() => {})
      }
      opts.signal?.addEventListener('abort', abort, { once: true })
      if (opts.signal?.aborted) abort()
      try {
        await upload.done()
      } finally {
        opts.signal?.removeEventListener('abort', abort)
      }
    },

    async get(bucket, key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        return (res.Body as Readable) ?? null
      } catch (e: any) {
        if (notFound(e)) return null
        throw e
      }
    },

    async head(bucket, key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { size: Number(res.ContentLength ?? 0) }
      } catch (e: any) {
        if (notFound(e)) return null
        throw e
      }
    },

    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(e => {
        if (!notFound(e)) throw e
      })
    },

    async list(bucket, prefix) {
      const keys: string[] = []
      let token: string | undefined
      do {
        let res: any
        try {
          res = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
          )
        } catch (e: any) {
          if (e?.name === 'NoSuchBucket') return keys
          throw e
        }
        for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key)
        token = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (token)
      return keys
    },
  }
}
