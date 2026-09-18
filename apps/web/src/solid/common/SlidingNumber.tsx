import { For } from 'solid-js'

export function SlidingNumber(props: { number: number; class?: string }) {
  const value = () => Math.max(0, Math.round(props.number))
  const parts = () => value().toLocaleString('en-US').split('')
  return (
    <span
      class={`sliding-number${props.class ? ` ${props.class}` : ''}`}
      aria-label={String(value())}
      style={{
        height: '1em',
        display: 'inline-flex',
        'align-items': 'flex-start',
        overflow: 'hidden',
      }}
    >
      <For each={parts()}>
        {part =>
          part === ',' ? (
            <span class="sliding-number__separator" aria-hidden="true">
              ,
            </span>
          ) : (
            <span
              class="sliding-number__digit"
              aria-hidden="true"
              style={{ position: 'relative', width: '.62em', height: '1em', overflow: 'hidden' }}
            >
              <span
                class="sliding-number__track"
                style={{
                  position: 'absolute',
                  inset: '0 auto auto 0',
                  width: '100%',
                  height: '10em',
                  transform: `translateY(-${Number(part) * 10}%)`,
                }}
              >
                <For each={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}>{digit => <span>{digit}</span>}</For>
              </span>
            </span>
          )
        }
      </For>
    </span>
  )
}
