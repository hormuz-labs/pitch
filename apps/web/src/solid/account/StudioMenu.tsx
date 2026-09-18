import { ChevronRight } from 'lucide-solid'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import '../../styles/studio-menu.css'

/** Small, anchored studio menus shared by the composer and sidebar. */
export function StudioMenu(props: {
  label: string
  trigger: JSX.Element
  children: JSX.Element
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  width?: number
  triggerClass?: string
  onOpen?: () => void
}) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ left: 0, top: 0 })
  let trigger!: HTMLButtonElement
  let content: HTMLDivElement | undefined
  const expand = () => {
    if (open()) return
    setOpen(true)
    props.onOpen?.()
  }
  const close = (focus = false) => {
    setOpen(false)
    if (focus) trigger.focus()
  }
  const items = () =>
    [
      ...(content?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ??
        []),
    ].filter(item => !item.hasAttribute('disabled') && item.getClientRects().length)
  createEffect(() => {
    if (!open()) return
    let observer: ResizeObserver | undefined
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(props.width ?? 224, window.innerWidth - 24)
    setPosition({
      left: Math.max(
        12,
        Math.min(
          window.innerWidth - width - 12,
          props.align === 'end' ? rect.right - width : rect.left,
        ),
      ),
      top: rect.bottom + 5,
    })
    queueMicrotask(() => {
      if (!content || !open()) return
      const place = () => {
        if (!content) return
        const height = content.offsetHeight
        const above =
          props.side === 'top' ||
          (rect.bottom + height + 8 > window.innerHeight && rect.top > height)
        setPosition(current => ({
          ...current,
          top: Math.max(
            8,
            Math.min(
              window.innerHeight - height - 8,
              above ? rect.top - height - 5 : rect.bottom + 5,
            ),
          ),
        }))
      }
      place()
      observer = new ResizeObserver(place)
      observer.observe(content)
      content.focus({ preventScroll: true })
    })
    onCleanup(() => observer?.disconnect())
  })
  onMount(() => {
    const outside = (event: PointerEvent) => {
      if (
        open() &&
        !trigger.contains(event.target as Node) &&
        !content?.contains(event.target as Node)
      )
        close()
    }
    const dismiss = () => close()
    const scroll = (event: Event) => {
      if (open() && !content?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', dismiss)
    onCleanup(() => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', dismiss)
    })
  })
  return (
    <>
      <button
        ref={trigger}
        type="button"
        class={props.triggerClass}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => (open() ? close() : expand())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            expand()
            queueMicrotask(() => items()[0]?.focus())
          }
        }}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={content}
            class="studio-menu"
            role="menu"
            aria-label={props.label}
            tabindex={-1}
            data-lenis-prevent
            style={{
              left: `${position().left}px`,
              top: `${position().top}px`,
              width: `${Math.min(props.width ?? 224, window.innerWidth - 24)}px`,
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close(true)
              }
              if (event.key === 'Tab') close(true)
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const options = items()
                const current = options.indexOf(document.activeElement as HTMLElement)
                const next =
                  event.key === 'Home' || (current < 0 && event.key === 'ArrowDown')
                    ? 0
                    : event.key === 'End' || (current < 0 && event.key === 'ArrowUp')
                      ? options.length - 1
                      : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) %
                        options.length
                options[next]?.focus()
              }
            }}
            onClick={event => {
              const item = (event.target as Element).closest(
                '[role="menuitem"], [role="menuitemradio"]',
              )
              if (item && !item.hasAttribute('data-keep-open')) close(true)
            }}
          >
            {props.children}
          </div>
        </Portal>
      </Show>
    </>
  )
}

export function StudioSubmenu(props: {
  label: string
  icon?: JSX.Element
  value?: string
  children: JSX.Element
}) {
  const [open, setOpen] = createSignal(false)
  const [left, setLeft] = createSignal(false)
  let root!: HTMLDivElement
  let leaveTimer = 0
  const expand = () => {
    window.clearTimeout(leaveTimer)
    setLeft(root.getBoundingClientRect().right + 190 > window.innerWidth)
    setOpen(true)
  }
  onCleanup(() => window.clearTimeout(leaveTimer))
  return (
    <div
      ref={root}
      class="studio-submenu"
      onMouseEnter={() => {
        if (window.innerWidth > 520 && window.matchMedia('(hover: hover)').matches) expand()
      }}
      onMouseLeave={() => {
        if (window.innerWidth > 520) leaveTimer = window.setTimeout(() => setOpen(false), 120)
      }}
    >
      <button
        type="button"
        role="menuitem"
        data-keep-open
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => (window.innerWidth <= 520 && open() ? setOpen(false) : expand())}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            expand()
            queueMicrotask(() => root.querySelector<HTMLElement>('[role="menu"] button')?.focus())
          }
        }}
      >
        {props.icon}
        <span>{props.label}</span>
        <Show when={props.value}>
          <small>{props.value}</small>
        </Show>
        <ChevronRight size={14} />
      </button>
      <Show when={open()}>
        <div
          role="menu"
          aria-label={props.label}
          class={`studio-submenu__panel ${left() ? 'opens-left' : ''}`}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              setOpen(false)
              root.querySelector('button')?.focus()
            }
          }}
        >
          {props.children}
        </div>
      </Show>
    </div>
  )
}
