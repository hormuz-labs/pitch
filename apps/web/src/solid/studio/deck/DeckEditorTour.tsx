import { ChevronLeft, ChevronRight, MousePointer2, Plus, Presentation } from 'lucide-solid'
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { Portal } from 'solid-js/web'

export const DECK_TOUR_STORAGE_KEY = 'pitch.deck-editor-tour.v2'

type TourRect = { left: number; top: number; width: number; height: number }

type TourStep = {
  target: string
  eyebrow: string
  title: string
  body: string
  icon: (props: { size: number }) => JSX.Element
}

const STEPS: TourStep[] = [
  {
    target: 'canvas',
    eyebrow: 'Edit on the slide',
    title: 'Click anything to change it',
    body: 'Edit text in place. Select images, charts, or blocks to move, resize, format, or delete them. Changes save automatically.',
    icon: props => <MousePointer2 {...props} />,
  },
  {
    target: 'insert',
    eyebrow: 'Build the page',
    title: 'Add content from here',
    body: 'Insert headings, lists, callouts, tables, charts, QR codes, and other reusable blocks into the active slide.',
    icon: props => <Plus {...props} />,
  },
  {
    target: 'slides',
    eyebrow: 'Organize the deck',
    title: 'Every slide stays within reach',
    body: 'Jump between slides, add a layout, drag to reorder, change a background, or remove a slide from the strip.',
    icon: props => <Presentation {...props} />,
  },
  {
    target: 'select',
    eyebrow: 'Ask for precise changes',
    title: 'Point at an element for the chat',
    body: 'Turn on Select, click an element, then describe the change in chat. Press I anytime to switch between editing and targeting.',
    icon: props => <MousePointer2 {...props} />,
  },
]

export function deckTourComplete(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? window.localStorage).getItem(DECK_TOUR_STORAGE_KEY) === 'done'
  } catch {
    return false
  }
}

export function rememberDeckTour(storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? window.localStorage).setItem(DECK_TOUR_STORAGE_KEY, 'done')
  } catch {
    // Storage can be unavailable in private browsing; completing the tour still works.
  }
}

export function DeckEditorTour(props: { ready: boolean }) {
  const maskId = `deck-tour-${createUniqueId()}`
  const [open, setOpen] = createSignal(false)
  const [step, setStep] = createSignal(0)
  const [spotlight, setSpotlight] = createSignal<TourRect | null>(null)
  const [cardPosition, setCardPosition] = createSignal({ left: 24, top: 24 })
  let card: HTMLDivElement | undefined
  let raf = 0

  const updatePosition = (immediate = false) => {
    const calc = () => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-deck-tour="${STEPS[step()].target}"]`),
      )
      const target =
        targets.find(candidate => {
          const box = candidate.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        }) ?? targets[0]
      if (!target) {
        setSpotlight(null)
        return
      }
      const r = target.getBoundingClientRect()
      const pad = 8
      const next = {
        left: Math.max(8, r.left - pad),
        top: Math.max(8, r.top - pad),
        width: Math.min(window.innerWidth - 16, Math.max(40, r.width + pad * 2)),
        height: Math.min(window.innerHeight - 16, Math.max(40, r.height + pad * 2)),
      }
      setSpotlight(next)

      const isMobile = window.innerWidth <= 640
      const cardWidth = Math.min(352, window.innerWidth - 32)
      const cardHeight = card?.offsetHeight || 220
      if (isMobile) {
        const inUpperHalf = next.top + next.height / 2 < window.innerHeight / 2
        const topPos = inUpperHalf ? window.innerHeight - cardHeight - 16 : 16
        setCardPosition({
          left: 16,
          top: Math.max(16, Math.min(window.innerHeight - cardHeight - 16, topPos)),
        })
        return
      }

      const gap = 18
      let left = next.left + next.width + gap
      let top = next.top
      if (left + cardWidth > window.innerWidth - 16) left = next.left - cardWidth - gap
      if (left < 16) {
        left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, next.left))
        top = next.top + next.height + gap
        if (top + cardHeight > window.innerHeight - 16) top = next.top - cardHeight - gap
      }
      setCardPosition({
        left: Math.max(16, Math.min(window.innerWidth - cardWidth - 16, left)),
        top: Math.max(16, Math.min(window.innerHeight - cardHeight - 16, top)),
      })
    }

    if (immediate) {
      cancelAnimationFrame(raf)
      calc()
    } else {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(calc)
    }
  }

  const finish = () => {
    rememberDeckTour()
    setOpen(false)
    setSpotlight(null)
  }

  const next = () => {
    if (step() === STEPS.length - 1) finish()
    else {
      setStep(value => value + 1)
      updatePosition(true)
    }
  }

  const previous = () => {
    setStep(value => Math.max(0, value - 1))
    updatePosition(true)
  }

  createEffect(() => {
    if (!open() || !props.ready) return
    step()
    updatePosition(true)
    requestAnimationFrame(() => card?.focus())
  })

  onMount(() => {
    if (!deckTourComplete()) {
      setOpen(true)
      updatePosition(true)
    }
    const reposition = () => open() && updatePosition()
    const key = (event: KeyboardEvent) => {
      if (!open()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        next()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previous()
      } else if (event.key === 'Tab' && card) {
        const controls = Array.from(card.querySelectorAll<HTMLElement>('button:not(:disabled)'))
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('keydown', key)
    onCleanup(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('keydown', key)
    })
  })

  return (
    <Show when={open() && props.ready && spotlight()}>
      {rect => {
        const current = () => STEPS[step()]
        return (
          <Portal>
            <div class="deck-tour" data-testid="deck-editor-tour">
              <svg class="deck-tour-shade" aria-hidden="true">
                <defs>
                  <mask id={maskId}>
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={rect().left}
                      y={rect().top}
                      width={rect().width}
                      height={rect().height}
                      rx="14"
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(8, 10, 12, .78)"
                  mask={`url(#${maskId})`}
                />
              </svg>
              <div
                class="deck-tour-ring"
                style={{
                  left: `${rect().left}px`,
                  top: `${rect().top}px`,
                  width: `${rect().width}px`,
                  height: `${rect().height}px`,
                }}
              />
              <div
                ref={card}
                class="deck-tour-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="deck-tour-title"
                tabIndex={-1}
                style={{ left: `${cardPosition().left}px`, top: `${cardPosition().top}px` }}
              >
                <div class="deck-tour-card__topline">
                  <span class="deck-tour-step-icon">{current().icon({ size: 15 })}</span>
                  <span class="deck-tour-eyebrow">{current().eyebrow}</span>
                  <span class="deck-tour-count">
                    {step() + 1} / {STEPS.length}
                  </span>
                </div>
                <h2 id="deck-tour-title">{current().title}</h2>
                <p>{current().body}</p>
                <div
                  class="deck-tour-progress"
                  aria-label={`Step ${step() + 1} of ${STEPS.length}`}
                >
                  <For each={STEPS}>
                    {(_, index) => <span classList={{ active: index() === step() }} />}
                  </For>
                </div>
                <div class="deck-tour-actions">
                  <button type="button" class="deck-tour-skip" onClick={finish}>
                    Skip tour
                  </button>
                  <div class="deck-tour-actions__primary">
                    <button
                      type="button"
                      class="deck-tour-back"
                      disabled={step() === 0}
                      onClick={previous}
                    >
                      <ChevronLeft size={15} /> Back
                    </button>
                    <button type="button" class="deck-tour-next" onClick={next}>
                      {step() === STEPS.length - 1 ? 'Start editing' : 'Next'}
                      <Show when={step() < STEPS.length - 1}>
                        <ChevronRight size={15} />
                      </Show>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Portal>
        )
      }}
    </Show>
  )
}
