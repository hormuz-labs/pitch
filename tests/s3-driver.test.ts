import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { byteExactBody } from '../packages/storage/src/s3.js'

describe('S3 uploads', () => {
  it('buffers a small stream into a byte-exact request body', async () => {
    const bytes = Buffer.from('small image bytes')

    const body = await byteExactBody(Readable.from(bytes), bytes.length)

    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body).toEqual(bytes)
  })

  it('rejects a stream when its actual bytes do not match the declared size', async () => {
    await expect(byteExactBody(Readable.from(Buffer.from('short')), 100)).rejects.toThrow(
      /expected 100 bytes but received 5/i,
    )
  })
})
