/**
 * Placement is a pure choice over the StudioWorker rows and the lease
 * columns: live, not draining, a free slot — preferring the worker whose
 * disk is still warm, else the least loaded. Everything else in
 * worker/lease.ts is one transaction around this.
 */
import { describe, expect, it } from 'vitest'
import { LEASE_TTL_MS } from '../apps/api/src/worker/config.js'
import { isLive, pickWorker, type WorkerRow } from '../apps/api/src/worker/lease.js'

const now = 1_000_000
const worker = (id: string, over: Partial<WorkerRow> = {}): WorkerRow => ({
  id,
  url: `http://${id}:3000`,
  slots: 4,
  epoch: 1,
  draining: false,
  heartbeatAt: new Date(now - 1000),
  ...over,
})

describe('pickWorker', () => {
  it('ignores dead and draining workers', () => {
    const dead = worker('dead', { heartbeatAt: new Date(now - LEASE_TTL_MS - 1) })
    const draining = worker('draining', { draining: true })
    const alive = worker('alive')
    expect(isLive(dead, now)).toBe(false)
    expect(pickWorker([dead, draining, alive], new Map(), [], now)?.id).toBe('alive')
    expect(pickWorker([dead, draining], new Map(), [], now)).toBeNull()
  })

  it('never hands a worker more projects than it has slots', () => {
    const full = worker('full', { slots: 2 })
    const spare = worker('spare', { slots: 2 })
    const held = new Map([
      ['full', 2],
      ['spare', 1],
    ])
    expect(pickWorker([full, spare], held, ['full'], now)?.id).toBe('spare')
    held.set('spare', 2)
    expect(pickWorker([full, spare], held, [], now)).toBeNull()
  })

  it('prefers the last holder while it has room, else the least loaded by share', () => {
    const big = worker('big', { slots: 8 })
    const small = worker('small', { slots: 2 })
    const held = new Map([
      ['big', 4],
      ['small', 0],
    ])
    // Half full vs empty: the empty one, unless the project was last here.
    expect(pickWorker([big, small], held, [], now)?.id).toBe('small')
    expect(pickWorker([big, small], held, ['big'], now)?.id).toBe('big')
    // A preferred worker that is full is skipped, and the next preference is tried.
    held.set('small', 2)
    expect(pickWorker([big, small], held, ['small', 'big'], now)?.id).toBe('big')
    expect(pickWorker([big, small], held, [null, undefined, 'nobody'], now)?.id).toBe('big')
  })

  it('breaks ties by id so every replica picks the same worker', () => {
    const a = worker('a')
    const b = worker('b')
    expect(pickWorker([b, a], new Map(), [], now)?.id).toBe('a')
  })
})
