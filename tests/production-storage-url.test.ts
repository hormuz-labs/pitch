import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizePublishedUrl } from '../apps/api/src/projects/output-urls.js'

const root = path.resolve(import.meta.dirname, '..')

describe('production storage URLs', () => {
  it('pins the production API to the public S3 origin', () => {
    const compose = readFileSync(path.join(root, 'docker-compose.prod.yml'), 'utf8')

    expect(compose).toMatch(/MINIO_PUBLIC_URL:\s*https:\/\/s3\.trypitch\.co/)
  })

  it('repairs output URLs stored before the production config fix', () => {
    expect(
      normalizePublishedUrl('http://localhost:9002/trypitch/pitch/user/project/output.pdf', {
        publicUrl: 'https://s3.trypitch.co',
        endpoint: 'http://minio:9000',
      }),
    ).toBe('https://s3.trypitch.co/trypitch/pitch/user/project/output.pdf')
  })

  it('does not rewrite unrelated external URLs', () => {
    expect(
      normalizePublishedUrl('https://cdn.example.com/result.pdf', {
        publicUrl: 'https://s3.trypitch.co',
        endpoint: 'http://minio:9000',
      }),
    ).toBe('https://cdn.example.com/result.pdf')
  })
})
