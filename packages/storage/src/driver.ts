/**
 * What the two object stores have in common. Everything public in this
 * package is written against this; `s3.ts` (MinIO, any S3) and `gcs.ts`
 * (Google Cloud Storage) each implement it.
 *
 * Keys are `<bucket>/<key>` everywhere, and a public object's URL is
 * `<publicUrl>/<bucket>/<key>` — the same shape on both, so a URL saved in
 * the database can be taken apart again by deleteFile() without knowing
 * which store wrote it.
 */
import type { Readable } from 'node:stream'

export interface PutOptions {
  contentType: string
  /** Bytes when known; lets a driver pick single-shot vs multipart. */
  size?: number
  onProgress?: (loaded: number, total?: number) => void
  signal?: AbortSignal
}

export interface ObjectDriver {
  readonly name: 's3' | 'gcs'
  /** Make sure the bucket exists; `publicRead` grants anonymous GET on its objects. */
  ensureBucket(bucket: string, publicRead: boolean): Promise<void>
  put(bucket: string, key: string, body: Readable | Buffer, opts: PutOptions): Promise<void>
  /** The object's bytes, or null when there is no such object (or bucket). */
  get(bucket: string, key: string): Promise<Readable | null>
  head(bucket: string, key: string): Promise<{ size: number } | null>
  /** Idempotent: a missing object or bucket is not an error. */
  remove(bucket: string, key: string): Promise<void>
  list(bucket: string, prefix: string): Promise<string[]>
}

export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}
