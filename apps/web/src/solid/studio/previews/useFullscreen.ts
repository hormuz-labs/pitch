import { createSignal, onCleanup, onMount } from 'solid-js'

/** Fullscreen the existing player node, so entering/exiting never remounts media. */
export function useFullscreen(element: () => HTMLElement | undefined) {
  const [native, setNative] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  let overflow = ''
  const collapse = () => {
    if (!expanded()) return
    setExpanded(false)
    document.body.style.overflow = overflow
  }
  const toggle = async () => {
    const node = element()
    if (!node) return
    if (expanded()) {
      collapse()
      return
    }
    if (document.fullscreenElement === node) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    if (node.requestFullscreen) {
      try {
        await node.requestFullscreen()
        return
      } catch {
        /* Embedded/mobile fallback below. */
      }
    }
    overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setExpanded(true)
  }
  onMount(() => {
    const change = () => setNative(document.fullscreenElement === element())
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && expanded()) {
        event.preventDefault()
        collapse()
      }
    }
    document.addEventListener('fullscreenchange', change)
    document.addEventListener('keydown', key)
    onCleanup(() => {
      document.removeEventListener('fullscreenchange', change)
      document.removeEventListener('keydown', key)
      if (document.fullscreenElement === element()) void document.exitFullscreen().catch(() => {})
      collapse()
    })
  })
  return { active: () => native() || expanded(), toggle }
}
