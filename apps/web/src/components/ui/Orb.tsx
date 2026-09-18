import { For } from 'solid-js'
import styles from './Orb.module.css'

const STAGE = 28
const N = 3
const PITCH = 6
const cells = Array.from({ length: N * N }, (_, i) => {
  const x = i % N
  const y = Math.floor(i / N)
  return {
    left: `${x * PITCH}px`,
    top: `${y * PITCH}px`,
    delay: `${((x + y) / (2 * (N - 1))) * 1500}ms`,
    mid: x === 1 && y === 1,
  }
})

export interface OrbProps {
  size?: number
  label?: string
  decorative?: boolean
}

/** S2: a soft diagonal wave across a fixed 3×3 lattice. */
export function Orb(props: OrbProps) {
  return (
    <span
      class={styles.glyph}
      role={props.decorative ? undefined : 'img'}
      aria-label={props.decorative ? undefined : (props.label ?? 'Processing…')}
      aria-hidden={props.decorative ? true : undefined}
      style={{
        width: `${props.size ?? 20}px`,
        height: `${props.size ?? 20}px`,
        '--orb-k': (props.size ?? 20) / STAGE,
      }}
    >
      <span class={styles.lattice}>
        <For each={cells}>
          {cell => (
            <span
              class={styles.cell}
              data-mid={cell.mid ? '' : undefined}
              style={{ left: cell.left, top: cell.top, 'animation-delay': cell.delay }}
            />
          )}
        </For>
      </span>
    </span>
  )
}
