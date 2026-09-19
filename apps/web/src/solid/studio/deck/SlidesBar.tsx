import { ChevronDown, Plus, Trash2 } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import type { ProjectStore } from '../useProject'
import { createSlideHTML, SLIDE_TEMPLATES } from './blocks'
import type { DeckSession, DeckSlideMeta } from './deckSession'

const SLIDE_BACKGROUNDS = ['#ffffff', '#000000', '#0f172a', '#1f2937', '#6366f1', '#f3f4f6']
const THUMB_WIDTH = 138

/** One slide thumbnail: live srcDoc render when the bridge sent one, else the
 * server-rendered thumbnail from the project description. */
function SlideThumb(props: { store: ProjectStore; slide: DeckSlideMeta }) {
  const [loaded, setLoaded] = createSignal(false)
  const imgSrc = () => props.store.thumbnailUrl(props.slide.index)
  return (
    <div class="scene-thumb deck-slide-thumb">
      <Show
        when={props.slide.thumbSrcDoc}
        fallback={
          <>
            <span class="scene-thumb-fallback" aria-hidden="true">
              {props.slide.index}
            </span>
            <Show when={imgSrc()}>
              {url => (
                <img
                  src={url()}
                  alt={props.slide.title || `Slide ${props.slide.index}`}
                  width="1280"
                  height="720"
                  classList={{ 'is-loaded': loaded() }}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(false)}
                />
              )}
            </Show>
          </>
        }
      >
        {srcDoc => (
          <iframe
            class="deck-slide-thumb-frame"
            srcdoc={srcDoc()}
            title={props.slide.title || `Slide ${props.slide.index}`}
            sandbox=""
            tabIndex={-1}
            scrolling="no"
            style={{
              width: '1280px',
              height: '720px',
              transform: `scale(${THUMB_WIDTH / 1280})`,
              'transform-origin': '0 0',
              border: '0',
              'pointer-events': 'none',
            }}
          />
        )}
      </Show>
    </div>
  )
}

/**
 * Deck slide strip rendered at the bottom of the deck editor. Drives the
 * bridge (scroll / insert / reorder / background / delete); indices are
 * 1-based per the bridge protocol.
 */
export function SlidesBar(props: { session: DeckSession; store: ProjectStore }) {
  const session = props.session
  const [addOpen, setAddOpen] = createSignal(false)
  const [dragFrom, setDragFrom] = createSignal<number | null>(null)
  const [dropTarget, setDropTarget] = createSignal<number | null>(null)
  let addWrap: HTMLDivElement | undefined

  const slides = createMemo<DeckSlideMeta[]>(() => {
    const live = session.slides()
    if (live.length) return live
    return (props.store.project?.description.slides ?? []).map(x => ({
      index: x.index,
      title: x.title ?? `Slide ${x.index}`,
    }))
  })

  const addSlide = (template: (typeof SLIDE_TEMPLATES)[number]) => {
    session.post({
      type: 'deck_insert_slide',
      html: createSlideHTML(template.id),
      after: session.activeSlide(),
    })
    setAddOpen(false)
  }
  const reorder = (to: number) => {
    const from = dragFrom()
    setDragFrom(null)
    setDropTarget(null)
    if (from == null || from === to) return
    session.post({ type: 'deck_slide_op', op: 'reorder', from, to })
  }
  const setBackground = (index: number, color: string) =>
    session.post({ type: 'deck_slide_op', op: 'background', index, color })
  const remove = (index: number) => session.post({ type: 'deck_slide_op', op: 'delete', index })

  return (
    <div class="deck-slides-bar" data-deck-tour="slides" onPointerDown={e => e.stopPropagation()}>
      <div class="timeline-header deck-slides-bar__header">
        <h2>Slides</h2>
        <span class="timeline-meta">{slides().length} slides</span>
        <div class="deck-slides-add" ref={addWrap}>
          <button
            type="button"
            class="deck-slides-add-btn"
            aria-haspopup="menu"
            aria-expanded={addOpen()}
            onClick={() => setAddOpen(v => !v)}
          >
            <Plus size={13} />
            <span>Add slide</span>
            <ChevronDown size={12} />
          </button>
          <Show when={addOpen()}>
            <div
              class="deck-slides-add-menu"
              role="menu"
              aria-label="Add slide"
              onKeyDown={e => {
                if (e.key === 'Escape') setAddOpen(false)
              }}
            >
              <For each={SLIDE_TEMPLATES}>
                {template => (
                  <button
                    type="button"
                    role="menuitem"
                    class="deck-slides-add-item"
                    onClick={() => addSlide(template)}
                  >
                    {template.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
      <Show when={slides().length} fallback={<div class="timeline-empty">No slides yet.</div>}>
        <div class="strip deck-slides-strip deck-editor-scrollable">
          <For each={slides()}>
            {slide => (
              <div
                class={`scene-card deck-slide-card${slide.index === session.activeSlide() ? ' selected' : ''}${dropTarget() === slide.index ? ' deck-slide-drop' : ''}`}
                draggable
                onDragStart={e => {
                  setDragFrom(slide.index)
                  e.dataTransfer?.setData('text/plain', String(slide.index))
                }}
                onDragOver={e => {
                  if (dragFrom() == null) return
                  e.preventDefault()
                  setDropTarget(slide.index)
                }}
                onDragLeave={() => {
                  if (dropTarget() === slide.index) setDropTarget(null)
                }}
                onDrop={e => {
                  e.preventDefault()
                  reorder(slide.index)
                }}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDropTarget(null)
                }}
              >
                <button
                  type="button"
                  class="deck-slide-select"
                  aria-label={`Go to slide ${slide.index}: ${slide.title || `Slide ${slide.index}`}`}
                  aria-current={slide.index === session.activeSlide() ? 'true' : undefined}
                  onClick={() => session.post({ type: 'deck_scroll_to', index: slide.index })}
                >
                  <SlideThumb store={props.store} slide={slide} />
                  <span class="scene-card-label">
                    <span class="scene-name">
                      {slide.title?.slice(0, 18) || `Slide ${slide.index}`}
                    </span>
                    <span class="scene-time">{slide.index}</span>
                  </span>
                </button>
                <div
                  class="deck-slide-tools"
                  onClick={e => e.stopPropagation()}
                  onDragStart={e => e.stopPropagation()}
                >
                  <For each={SLIDE_BACKGROUNDS}>
                    {color => (
                      <button
                        type="button"
                        class="deck-slide-bg-dot"
                        style={{ background: color }}
                        title={`Slide background ${color}`}
                        aria-label={`Set slide ${slide.index} background ${color}`}
                        onClick={() => setBackground(slide.index, color)}
                      />
                    )}
                  </For>
                  <label class="deck-slide-bg-custom" title="Custom background color">
                    <input
                      type="color"
                      aria-label={`Custom background for slide ${slide.index}`}
                      value="#ffffff"
                      onChange={e => setBackground(slide.index, e.currentTarget.value)}
                    />
                  </label>
                  <button
                    type="button"
                    class="deck-slide-delete"
                    title={
                      slides().length <= 1 ? 'A deck needs at least one slide' : 'Delete slide'
                    }
                    aria-label={`Delete slide ${slide.index}`}
                    disabled={slides().length <= 1}
                    onClick={() => remove(slide.index)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
