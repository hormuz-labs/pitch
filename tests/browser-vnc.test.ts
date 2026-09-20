import { describe, expect, it } from 'vitest'
import { demoStreamId, parseDemoStreamId } from '../apps/api/src/services/browser-routing.js'
import {
  hasVncEndpoint,
  registerVncEndpoint,
  unregisterVncEndpoint,
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
