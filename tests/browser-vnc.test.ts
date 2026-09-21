import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { demoStreamId, parseDemoStreamId } from '../apps/api/src/services/browser-routing.js'
import {
  hasVncEndpoint,
  registerVncEndpoint,
  unregisterVncEndpoint,
  waitForXvfbDisplay,
} from '../apps/api/src/services/browser-vnc.js'

describe('browser VNC routing', () => {
  it('registers one isolated loopback endpoint per session', () => {
    registerVncEndpoint('vnc-test', 5901)
    expect(hasVncEndpoint('vnc-test')).toBe(true)
    expect(() => registerVncEndpoint('vnc-test', 5902)).toThrow(/already registered/)
    unregisterVncEndpoint('vnc-test')
    expect(hasVncEndpoint('vnc-test')).toBe(false)
  })

  it('binds demo sessions to a worker epoch', () => {
    const id = demoStreamId('project-1', 'worker.us-east-1', 42)
    expect(parseDemoStreamId(id)).toEqual({
      projectId: 'project-1',
      workerId: 'worker.us-east-1',
      workerEpoch: 42,
    })
    expect(parseDemoStreamId('project-1')).toBeNull()
  })
})

function childProcess() {
  const child = new EventEmitter() as ChildProcess & { pitchStderr?: () => string }
  Object.assign(child, {
    exitCode: null,
    signalCode: null,
    pitchStderr: () => '',
  })
  return child
}

describe('Xvfb display startup', () => {
  it('uses Xvfb displayfd readiness without requiring a filesystem socket', async () => {
    const child = childProcess()
    const displayfd = new PassThrough()
    const ready = waitForXvfbDisplay(child, displayfd, undefined, 200)

    displayfd.end('147\n')

    await expect(ready).resolves.toBe(147)
  })

  it('surfaces an early Xvfb failure and captured stderr immediately', async () => {
    const child = childProcess()
    child.pitchStderr = () => 'Server is already active for display 147'
    const displayfd = new PassThrough()
    const ready = waitForXvfbDisplay(child, displayfd, undefined, 1_000)

    child.emit('exit', 1, null)

    await expect(ready).rejects.toThrow('Server is already active for display 147')
  })

  it('rejects malformed displayfd output instead of waiting for the full timeout', async () => {
    const child = childProcess()
    const displayfd = new PassThrough()
    const ready = waitForXvfbDisplay(child, displayfd, undefined, 1_000)

    displayfd.end('not-a-display\n')

    await expect(ready).rejects.toThrow('invalid display number')
  })
})
