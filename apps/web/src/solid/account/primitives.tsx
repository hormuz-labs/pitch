import { ChevronDown } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'

export function Dialog(props: {
  open: boolean
  title: string
  onClose: () => void
  children: JSX.Element
  class?: string
}) {
  let dialog!: HTMLDivElement
  createEffect(() => {
    if (!props.open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => dialog.querySelector<HTMLElement>('[autofocus],input,button')?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
      if (event.key !== 'Tab') return
      const nodes = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter(node => !node.hasAttribute('disabled'))
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    onCleanup(() => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = overflow
      previous?.focus()
    })
  })
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
        onMouseDown={event => event.target === event.currentTarget && props.onClose()}
      >
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          class={
            props.class ??
            'w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 text-[var(--text-primary)] shadow-2xl'
          }
        >
          {props.children}
        </div>
      </div>
    </Show>
  )
}

export function Popover(props: {
  label: string
  trigger: JSX.Element
  children: JSX.Element
  class?: string
}) {
  const [open, setOpen] = createSignal(false)
  let root!: HTMLDivElement
  onMount(() => {
    const pointer = (event: PointerEvent) =>
      open() && !root.contains(event.target as Node) && setOpen(false)
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key)
    onCleanup(() => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', key)
    })
  })
  return (
    <div class="relative" ref={root}>
      <button
        type="button"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen(value => !value)}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <div
          role="menu"
          class={
            props.class ??
            'absolute right-0 top-full z-50 mt-2 min-w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl'
          }
          onClick={event => {
            if ((event.target as Element).closest('[role="menuitem"]')) setOpen(false)
          }}
        >
          {props.children}
        </div>
      </Show>
    </div>
  )
}

export function Select(props: {
  value: string
  label: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  class?: string
}) {
  return (
    <label class="relative block">
      <span class="sr-only">{props.label}</span>
      <select
        value={props.value}
        onChange={event => props.onChange(event.currentTarget.value)}
        class={
          props.class ??
          'h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10'
        }
        style={{ appearance: 'none', '-webkit-appearance': 'none', '-moz-appearance': 'none' }}
      >
        <For each={props.options}>
          {option => <option value={option.value}>{option.label}</option>}
        </For>
      </select>
      <ChevronDown
        aria-hidden="true"
        class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />
    </label>
  )
}

export function Switch(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      class={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${props.checked ? 'bg-gray-900' : 'bg-gray-200'}`}
    >
      <span
        class={`h-5 w-5 rounded-full bg-white shadow transition-transform ${props.checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

export function CopyButton(props: { value: string; label?: string }) {
  const [copied, setCopied] = createSignal(false)
  const copy = async () => {
    await navigator.clipboard.writeText(props.value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      class="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied() ? 'Copied' : (props.label ?? 'Copy')}
    </button>
  )
}

export const Loading = (props: { label?: string }) => (
  <div role="status" class="flex min-h-40 items-center justify-center gap-2 text-sm text-gray-500">
    <span class="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-800" />
    {props.label}
  </div>
)
