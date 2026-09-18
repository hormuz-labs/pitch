import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import {
  animateToLatest,
  FeedJumpLatest,
  isAwayFromLatest,
} from '../src/solid/studio/FeedJumpLatest'

describe('studio jump to latest', () => {
  it('renders the production control and invokes its scroll callback', () => {
    const jump = vi.fn()
    render(() => <FeedJumpLatest onClick={jump} />)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest message' }))
    expect(jump).toHaveBeenCalledOnce()
  })

  it('uses the same 64px threshold as studio auto-follow', () => {
    expect(isAwayFromLatest({ scrollHeight: 600, scrollTop: 100, clientHeight: 200 })).toBe(true)
    expect(isAwayFromLatest({ scrollHeight: 600, scrollTop: 336, clientHeight: 200 })).toBe(true)
    expect(isAwayFromLatest({ scrollHeight: 600, scrollTop: 337, clientHeight: 200 })).toBe(false)
  })

  it('animates through intermediate positions before reaching the bottom', () => {
    const feed = { scrollTop: 100, scrollHeight: 600 }
    const frames: FrameRequestCallback[] = []
    animateToLatest(
      feed,
      320,
      callback => frames.push(callback) - 1,
      () => 0,
    )

    frames.shift()?.(160)
    expect(feed.scrollTop).toBeGreaterThan(100)
    expect(feed.scrollTop).toBeLessThan(600)
    frames.shift()?.(320)
    expect(feed.scrollTop).toBe(600)
  })
})
