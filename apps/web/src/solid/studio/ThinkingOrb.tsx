import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs/engine'
import { useTheme } from '../core/theme'
import type { AgentActivity } from './agent-activity'

/** Solid adapter for the official thinking-orbs canvas renderer. */
export function ThinkingOrb(props: { state: AgentActivity; size: 64 }) {
  const theme = useTheme()
  const [reduced, setReduced] = createSignal(false)
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    onCleanup(() => media.removeEventListener('change', update))
  })

  createEffect(() => {
    const size = props.size
    const dark = theme.theme() === 'dark'
    const staticFrame = reduced()
    const { mode, speed, opts } = resolvePreset(props.state, size)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      MODE_DRAWS[mode](
        ctx,
        size,
        staticFrame ? 0.6 : (performance.now() / 1000) * speed,
        dark,
        opts,
      )
    }
    paint()
    if (staticFrame) return

    let raf = 0
    let visible = true
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const loop = () => {
      paint()
      raf = requestAnimationFrame(loop)
    }
    const update = () => {
      if (!visible || document.hidden) stop()
      else if (!raf) raf = requestAnimationFrame(loop)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      update()
    })
    observer.observe(canvas)
    document.addEventListener('visibilitychange', update)
    update()
    onCleanup(() => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    })
  })

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{
        width: `var(--thinking-orb-size, ${props.size}px)`,
        height: `var(--thinking-orb-size, ${props.size}px)`,
        display: 'block',
      }}
    />
  )
}
