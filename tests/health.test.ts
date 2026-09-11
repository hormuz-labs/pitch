import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { checkWritableDirectory, healthRouter } from '../apps/api/src/lib/health.js'

describe('Kubernetes health checks', () => {
  const app = (check: () => Promise<unknown>, isDraining = () => false) =>
    express().use('/health', healthRouter({ check, isDraining, timeoutMs: 10 }))
  it('separates process liveness from failing dependencies', async () => {
    const check = vi.fn().mockRejectedValue(new Error('postgresql://secret@host'))
    const server = app(check)
    expect((await request(server).get('/health/live')).status).toBe(200)
    expect(check).not.toHaveBeenCalled()
    const res = await request(server).get('/health/ready')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'unavailable' })
    expect(res.headers['cache-control']).toBe('no-store')
  })
  it('reports ready only after checks succeed', async () => {
    expect((await request(app(async () => {})).get('/health/ready')).status).toBe(200)
  })
  it('stops advertising readiness during shutdown', async () => {
    const check = vi.fn()
    expect((await request(app(check, () => true)).get('/health/ready')).status).toBe(503)
    expect(check).not.toHaveBeenCalled()
  })
  it('bounds slow dependency checks', async () => {
    expect((await request(app(() => new Promise(() => {}))).get('/health/ready')).status).toBe(503)
  })
  it('checks persistent writes and removes probe files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pitch-health-'))
    try {
      await checkWritableDirectory(dir)
      expect(await readdir(dir)).toEqual([])
      await expect(checkWritableDirectory(path.join(dir, 'missing'))).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
