import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPreviewCredential,
  createPreviewRefresh,
} from '../apps/web/src/solid/studio/preview-refresh'

function setup() {
  const state = { playing: false, pending: false }
  const read = vi.fn<() => Promise<string>>().mockResolvedValue('latest')
  const apply = vi.fn()
  const error = vi.fn()
  const queue = createPreviewRefresh({
    read,
    apply,
    error,
    held: () => state.playing,
    pending: value => {
      state.pending = value
    },
  })
  return { state, read, apply, error, queue }
}
function deferred() {
  let resolve!: (value: string) => void
  const promise = new Promise<string>(done => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('preview refresh coordination', () => {
  it('keeps iframe, audio and thumbnail credentials stable across routine token rotation', () => {
    const credential = createPreviewCredential()
    expect(credential(null, 0)).toBeNull()
    expect(credential('first-token', 0)).toBe('first-token')
    expect(credential('refreshed-token', 0)).toBe('first-token')
    expect(credential('refreshed-token', 1)).toBe('refreshed-token')
    expect(credential(null, 1)).toBeNull()
    expect(credential('new-session-token', 1)).toBe('new-session-token')
  })
  it('coalesces a burst of file writes into one read and one media invalidation', async () => {
    const h = setup()
    h.queue.request(true)
    h.queue.request(false)
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(h.read).toHaveBeenCalledTimes(1)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', true)
    expect(h.state.pending).toBe(false)
    h.queue.dispose()
  })

  it('holds saves during playback and applies the latest artifact after pausing', async () => {
    const h = setup()
    h.state.playing = true
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(500)
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(h.read).not.toHaveBeenCalled()
    expect(h.state.pending).toBe(true)
    h.state.playing = false
    h.queue.resume()
    await vi.advanceTimersByTimeAsync(250)
    expect(h.read).toHaveBeenCalledTimes(1)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', true)
    h.queue.dispose()
  })

  it('discards a stale response when another file save arrived during the request', async () => {
    const h = setup()
    const first = deferred()
    h.read.mockReturnValueOnce(first.promise)
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(250)
    h.queue.request(true)
    first.resolve('stale')
    await vi.advanceTimersByTimeAsync(250)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', true)
    expect(h.read).toHaveBeenCalledTimes(2)
    h.queue.dispose()
  })

  it('does not replace media if playback starts while a refresh is in flight', async () => {
    const h = setup()
    const first = deferred()
    h.read.mockReturnValueOnce(first.promise)
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(250)
    h.state.playing = true
    first.resolve('early')
    await vi.advanceTimersByTimeAsync(500)
    expect(h.apply).not.toHaveBeenCalled()
    expect(h.state.pending).toBe(true)
    await h.queue.flush(true)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', true)
    h.queue.dispose()
  })

  it('treats an idle/metadata refresh differently from a changed media file', async () => {
    const h = setup()
    h.queue.request()
    await vi.advanceTimersByTimeAsync(250)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', false)
    await h.queue.flush()
    expect(h.read).toHaveBeenCalledTimes(1)
    h.queue.dispose()
  })

  it('keeps the current preview on a read failure and allows an explicit retry', async () => {
    const h = setup()
    h.read.mockRejectedValueOnce(new Error('Temporary failure'))
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(h.apply).not.toHaveBeenCalled()
    expect(h.error).toHaveBeenCalledTimes(1)
    expect(h.state.pending).toBe(true)
    await h.queue.flush(true)
    expect(h.apply).toHaveBeenCalledExactlyOnceWith('latest', true)
    h.queue.dispose()
  })

  it('ignores pending responses after leaving the project', async () => {
    const h = setup()
    const first = deferred()
    h.read.mockReturnValueOnce(first.promise)
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(250)
    h.queue.dispose()
    first.resolve('old project')
    await vi.advanceTimersByTimeAsync(500)
    expect(h.apply).not.toHaveBeenCalled()
    h.queue.request(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(h.read).toHaveBeenCalledTimes(1)
  })
})
