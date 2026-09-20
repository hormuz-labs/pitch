import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { startVncDisplay } from '../../apps/api/src/services/browser-vnc.js'

const describeLinux = process.platform === 'linux' ? describe : describe.skip

function rfbGreeting(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('VNC greeting timed out'))
    }, 10_000)
    socket.once('data', data => {
      clearTimeout(timer)
      socket.destroy()
      resolve(data.toString('ascii'))
    })
    socket.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    socket.connect(port, '127.0.0.1')
  })
}

describeLinux('isolated browser VNC display', () => {
  it('starts an RFB server and releases it on close', async () => {
    const display = await startVncDisplay(`integration-${process.pid}`)
    expect(await rfbGreeting(display.port)).toMatch(/^RFB 003\.008/)
    await display.close()
    await expect(rfbGreeting(display.port)).rejects.toThrow()
  }, 30_000)
})
