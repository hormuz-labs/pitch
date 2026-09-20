import { render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getToken, connections } = vi.hoisted(() => ({
  getToken: vi.fn(),
  connections: [] as Array<EventTarget & { url: string; disconnect: ReturnType<typeof vi.fn> }>,
}))

vi.mock('../src/solid/core/auth', () => ({ useAuth: () => ({ getToken }) }))
vi.mock('@novnc/novnc', () => ({
  default: class extends EventTarget {
    disconnect = vi.fn(() => this.dispatchEvent(new CustomEvent('disconnect')))
    constructor(
      _container: HTMLElement,
      public url: string,
    ) {
      super()
      connections.push(this)
    }
  },
}))

import { BrowserViewer } from '../src/solid/studio/BrowserViewer'

beforeEach(() => {
  connections.length = 0
  getToken.mockReset().mockResolvedValue('test-token')
})
afterEach(() => vi.useRealTimers())

describe('BrowserViewer connection lifecycle', () => {
  it('preserves the connection when refreshed project objects contain the same stream', async () => {
    const [project, setProject] = createSignal({
      description: { preview: { streamId: 'recording-1' } },
    })
    render(() => <BrowserViewer streamId={project().description.preview.streamId} viewOnly />)
    await waitFor(() => expect(connections).toHaveLength(1))
    const connection = connections[0]!
    connection.dispatchEvent(new CustomEvent('connect'))

    for (let i = 0; i < 5; i++) {
      setProject({ description: { preview: { streamId: 'recording-1' } } })
      await vi.dynamicImportSettled()
    }

    expect(connection.disconnect).not.toHaveBeenCalled()
    expect(connections).toHaveLength(1)
    expect(getToken).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Linking...')).toBeNull()
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy()
  })

  it('replaces the connection when the stream changes and closes it on unmount', async () => {
    const [streamId, setStreamId] = createSignal('recording-1')
    const view = render(() => <BrowserViewer streamId={streamId()} viewOnly />)
    await waitFor(() => expect(connections).toHaveLength(1))

    setStreamId('recording-2')
    await waitFor(() => expect(connections).toHaveLength(2))
    expect(connections[0]!.disconnect).toHaveBeenCalledTimes(1)
    expect(connections[1]!.url).toContain('/browser/streams/recording-2?')

    view.unmount()
    expect(connections[1]!.disconnect).toHaveBeenCalledTimes(1)
  })

  it('still reconnects after a real disconnect and cancels retries on unmount', async () => {
    const view = render(() => <BrowserViewer streamId="recording-1" viewOnly />)
    await waitFor(() => expect(connections).toHaveLength(1))
    vi.useFakeTimers()
    connections[0]!.dispatchEvent(new CustomEvent('connect'))
    connections[0]!.dispatchEvent(new CustomEvent('disconnect'))

    await vi.advanceTimersByTimeAsync(1000)
    await vi.dynamicImportSettled()
    expect(connections).toHaveLength(2)
    expect(connections[1]!.url).toBe(connections[0]!.url)

    connections[1]!.dispatchEvent(new CustomEvent('disconnect'))
    view.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(connections).toHaveLength(2)
  })
})
