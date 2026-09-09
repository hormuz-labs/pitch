import { For, type JSX, onCleanup, onMount } from 'solid-js'

const BLOCKS = [
  [30, 38],
  [30, 61],
  [30, 84],
  [30, 107],
  [30, 130],
  [63, 38],
  [63, 84],
  [96, 38],
  [96, 61],
  [96, 84],
  [146, 38],
  [146, 130],
  [179, 38],
  [179, 61],
  [179, 84],
  [179, 107],
  [179, 130],
  [212, 38],
  [212, 130],
  [262, 38],
  [295, 38],
  [295, 61],
  [295, 84],
  [295, 107],
  [295, 130],
  [328, 38],
  [378, 38],
  [378, 61],
  [378, 84],
  [378, 107],
  [378, 130],
  [411, 38],
  [411, 130],
  [444, 38],
  [444, 130],
  [494, 38],
  [494, 61],
  [494, 84],
  [494, 107],
  [494, 130],
  [527, 84],
  [560, 38],
  [560, 61],
  [560, 84],
  [560, 107],
  [560, 130],
] as const

export function PitchWordmark(props: {
  class?: string
  className?: string
  style?: JSX.CSSProperties
}) {
  return (
    <svg
      class={props.class ?? props.className}
      style={props.style}
      width="96"
      height="30"
      viewBox="20 20 580 140"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pitch"
      role="img"
    >
      <For each={BLOCKS}>
        {([x, y]) => <rect fill="currentColor" x={x} y={y} width="28" height="18" rx="3" />}
      </For>
    </svg>
  )
}

export function PitchLogoAnimation(props: {
  startAnimation?: boolean
  color?: string
  loop?: boolean
  onComplete?: () => void
}) {
  let svg!: SVGSVGElement
  const timers: number[] = []
  onMount(() => {
    if (props.startAnimation === false) {
      svg.querySelectorAll('.pitch-block').forEach(block => block.classList.add('visible'))
      return
    }
    const blocks = [...svg.querySelectorAll('.pitch-block')]
    const run = () => {
      blocks.forEach(block => block.classList.remove('visible'))
      let max = 0
      blocks.forEach((block, index) => {
        const delay = index * 60
        max = delay
        timers.push(window.setTimeout(() => block.classList.add('visible'), delay))
      })
      const done = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : max + 280
      timers.push(window.setTimeout(() => props.onComplete?.(), done))
      if (props.loop) timers.push(window.setTimeout(run, done + 720))
    }
    run()
  })
  onCleanup(() => timers.forEach(clearTimeout))
  return (
    <div class="flex flex-col items-center">
      <style>{`.pitch-block{opacity:0;transform:translateX(-14px);transition:opacity .25s ease,transform .25s ease}.pitch-block.visible{opacity:1;transform:translateX(0)}`}</style>
      <svg
        ref={svg}
        class="pitch overflow-visible cursor-pointer"
        width="100%"
        height="100%"
        viewBox="20 20 580 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <For each={BLOCKS}>
          {([x, y]) => (
            <rect
              class="pitch-block"
              fill={props.color ?? 'var(--logo-fill, #111111)'}
              x={x}
              y={y}
              width="28"
              height="18"
              rx="3"
            />
          )}
        </For>
      </svg>
    </div>
  )
}

const MARK_BLOCKS: { x: number; y: number; w: number; h: number }[] = []
;[[0, 1, 2], [0, 2], [0, 1, 2], [0], [0]].forEach((cols, row) =>
  cols.forEach(col =>
    MARK_BLOCKS.push({ x: [53, 86, 119][col], y: [45, 68, 91, 114, 137][row], w: 28, h: 18 }),
  ),
)
const GLYPHS = [
  ['.', '▵', '▴', '▲'],
  ['.', '·', '•', '●'],
  ['.', ':', '+', '#'],
  ['.', '·', '*', '✳'],
]

export function PitchAsciiMark(props: { size?: number; class?: string }) {
  let canvas!: HTMLCanvasElement
  onMount(() => {
    const size = props.size ?? 320
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const scale = (size / 200) * 1.42,
      offset = (size - 200 * scale) / 2,
      cells = Math.ceil(size / 13)
    let frame = 0,
      running = false
    const draw = (seconds: number) => {
      ctx.clearRect(0, 0, size, size)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '12px ui-monospace, Menlo, monospace'
      ctx.fillStyle = getComputedStyle(canvas).color
      const phase = ((seconds % 9) / 9) * Math.PI * 2
      for (let j = 0; j < cells; j++)
        for (let i = 0; i < cells; i++) {
          const cx = i * 13 + 6.5,
            cy = j * 13 + 6.5,
            px = (cx - offset) / scale,
            py = (cy - offset) / scale
          let distance = Infinity
          for (const b of MARK_BLOCKS)
            distance = Math.min(
              distance,
              Math.hypot(
                Math.max(b.x - px, 0, px - b.x - b.w),
                Math.max(b.y - py, 0, py - b.y - b.h),
              ),
            )
          const core = distance <= 0 ? 1 : Math.max(0, 1 - distance / 5) ** 2.2 * 0.75
          const noise = (Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1
          const value =
            Math.sqrt(core) *
              (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(px * 0.05 + py * 0.032 - phase * 2))) -
            Math.abs(noise) * 0.18 * (1 - core)
          if (value < 0.1) continue
          const family =
            GLYPHS[
              (((Math.atan2(py - 100, px - 100) + phase > 0
                ? Math.floor((Math.atan2(py - 100, px - 100) + phase) / (Math.PI / 2))
                : 0) %
                4) +
                4) %
                4
            ]
          ctx.globalAlpha = Math.min(1, 0.48 + value * 1.05)
          ctx.fillText(family[Math.min(3, Math.max(0, Math.floor(value * 4.2)))], cx, cy)
        }
      ctx.globalAlpha = 1
    }
    const tick = (time: number) => {
      draw(time / 1000)
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (!running) {
        running = true
        frame = requestAnimationFrame(tick)
      }
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }
    draw(0)
    const observer = new IntersectionObserver(([entry]) =>
      entry.isIntersecting && !document.hidden ? start() : stop(),
    )
    observer.observe(canvas)
    onCleanup(() => {
      stop()
      observer.disconnect()
    })
  })
  const size = () => props.size ?? 320
  return (
    <canvas
      ref={canvas}
      class={props.class}
      style={{ width: `${size()}px`, height: `${size()}px`, display: 'block' }}
      aria-hidden="true"
    />
  )
}
