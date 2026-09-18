import { ArrowDown } from 'lucide-solid'

export const isAwayFromLatest = (
  feed: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
) => feed.scrollHeight - feed.scrollTop - feed.clientHeight >= 64

export function animateToLatest(
  feed: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
  duration = 320,
  frame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  now: () => number = () => performance.now(),
): void {
  const start = feed.scrollTop
  const target = Math.max(0, feed.scrollHeight)
  const distance = target - start
  if (distance <= 0) return
  const started = now()
  const step = (time: number) => {
    const progress = Math.min(1, (time - started) / duration)
    const eased = 1 - (1 - progress) ** 3
    feed.scrollTop = start + distance * eased
    if (progress < 1) frame(step)
  }
  frame(step)
}

export function FeedJumpLatest(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      class="feed-jump-latest"
      aria-label="Jump to latest message"
      title="Jump to latest"
      onClick={props.onClick}
    >
      <ArrowDown size={18} />
    </button>
  )
}
