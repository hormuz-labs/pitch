import { Plus } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { studio } from '../client'
import { InspectButton, SelectToggle } from '../previews/PlaybackControls'
import type { ProjectStore } from '../useProject'
import { BlocksPanel } from './BlocksPanel'
import { ChartPanel } from './ChartPanel'
import { DeckEditorTour } from './DeckEditorTour'
import { DeckToolbar } from './DeckToolbar'
import { createDeckSession, handleBridgeMessage, registerDeckEditor } from './deckSession'
import { fitScale } from './fitScale'
import { SlidesBar } from './SlidesBar'

const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
const AUTOSAVE_DELAY_MS = 500
const SERIALIZE_TIMEOUT_MS = 5000
type ResizeHandle = (typeof RESIZE_HANDLES)[number]

/**
 * Interactive deck editor: the DeckPreview chrome (scale-to-fit, inspect mode
 * for agent targeting, busy overlay) plus in-place editing driven by the
 * in-iframe bridge (engine/js/deck-editor.js) over postMessage. Owns the
 * bridge session; the toolbar, insert panel, chart panel and slides bar are
 * dumb chrome on top of it.
 */
export function DeckEditor(props: { store: ProjectStore; src: string }) {
  const s = props.store
  let frame: HTMLIFrameElement | undefined, stage: HTMLDivElement | undefined
  const [scale, setScale] = createSignal(0.5),
    [frameReady, setFrameReady] = createSignal(false),
    [loadVersion, setLoadVersion] = createSignal(0),
    [height, setHeight] = createSignal(720),
    [insertOpen, setInsertOpen] = createSignal(false),
    [chartOpen, setChartOpen] = createSignal(false)
  const session = createDeckSession(msg => frame?.contentWindow?.postMessage(msg, '*'))
  const post = session.post

  // Self-save suppression: saving writes deck.html and the SSE refetch would
  // reload the iframe (losing selection). The description does not change on
  // save, but guard anyway — hold the old src for ~2s after a successful save.
  let lastSaveAt = 0
  let heldSrc = props.src
  const src = createMemo(() => {
    const next = props.src
    if (next !== heldSrc && Date.now() - lastSaveAt < 2000) return heldSrc
    heldSrc = next
    return next
  })

  const resize = () => {
    const r = stage?.getBoundingClientRect()
    if (r && r.width > 0 && r.height > 0) {
      // Fit one whole slide on both axes; the stacked document scrolls inside
      // the iframe, which keeps the full stage height.
      setScale(fitScale(r.width, r.height))
      setHeight(r.height)
      if (frameReady()) {
        post({ type: 'deck_scroll_to', index: session.activeSlide() || 1 })
      }
    }
  }

  createEffect(() => {
    loadVersion()
    if (frameReady()) {
      post({ type: 'deck_edit_mode', enabled: !s.inspectMode })
      post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale: scale() })
    }
  })
  createEffect(() => {
    loadVersion()
    if (frameReady())
      post({ type: 'studio_set_marks', marks: s.targets.map(t => t.mark).filter(x => x != null) })
  })
  createEffect(() => {
    loadVersion()
    if (frameReady() && s.selectedSlide) post({ type: 'studio_scroll_to', index: s.selectedSlide })
  })
  // deck_ready (including after every iframe reload) → capture the slide strip.
  createEffect(() => {
    if (session.ready() && frameReady()) {
      post({ type: 'deck_edit_mode', enabled: !s.inspectMode })
      post({ type: 'deck_capture_slides' })
    }
  })

  // ── autosave ──────────────────────────────────────────────────────────────
  // deck_dirty marks the deck dirty and briefly debounces (reset by further
  // edits); the save itself is serialize → saveDeck. One follow-up save may
  // queue behind an in-flight one; failures stay dirty and retry on the next
  // deck_dirty — never in a loop.
  let awaitingHtml = false
  let saving = false
  let dirtySinceSerialize = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let captureTimer: ReturnType<typeof setTimeout> | undefined
  let serializeTimer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null
  let resolveInFlight: (() => void) | null = null
  let rejectInFlight: ((reason: Error) => void) | null = null

  const settleSave = (error?: Error) => {
    const resolve = resolveInFlight
    const reject = rejectInFlight
    resolveInFlight = null
    rejectInFlight = null
    inFlight = null
    if (error) reject?.(error)
    else resolve?.()
  }

  const queueAutosave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(attemptSave, AUTOSAVE_DELAY_MS)
  }
  // Style-only edits don't change slide structure, so the bridge does not
  // repost deck_slides; re-request a capture once edits settle (1s).
  const queueCapture = () => {
    clearTimeout(captureTimer)
    captureTimer = setTimeout(() => post({ type: 'deck_capture_slides' }), 1000)
  }
  const onDirty = () => {
    dirtySinceSerialize = true
    queueAutosave()
    queueCapture()
  }
  function attemptSave() {
    if (!dirtySinceSerialize) return
    if (saving) return // in flight — the settle handler queues one follow-up
    saving = true
    dirtySinceSerialize = false
    awaitingHtml = true
    session.setSaveStatus('saving')
    inFlight = new Promise<void>((resolve, reject) => {
      resolveInFlight = resolve
      rejectInFlight = reject
    })
    // Autosave has no caller awaiting this promise. Mark rejection handled;
    // flushSave still awaits the original promise and receives the error.
    void inFlight.catch(() => {})
    post({ type: 'deck_serialize' })
    clearTimeout(serializeTimer)
    serializeTimer = setTimeout(() => {
      if (!awaitingHtml) return
      awaitingHtml = false
      saving = false
      dirtySinceSerialize = true
      session.setSaveStatus('dirty')
      settleSave(new Error('The deck editor did not answer the save request'))
    }, SERIALIZE_TIMEOUT_MS)
  }
  const finishSave = async () => {
    if (!awaitingHtml) return
    awaitingHtml = false
    clearTimeout(serializeTimer)
    const payload = session.html()
    let ok = false
    let failure: Error | undefined
    try {
      if (!payload || !s.id) throw new Error('nothing to save')
      await studio.saveDeck(await s.getToken(), s.id, payload.html)
      lastSaveAt = Date.now()
      ok = true
    } catch (reason) {
      // Stay dirty; autosave retries on the next deck_dirty, never in a loop.
      dirtySinceSerialize = true
      session.setSaveStatus('dirty')
      failure = reason instanceof Error ? reason : new Error('Could not save the deck')
    } finally {
      saving = false
      settleSave(failure)
    }
    // Edits that landed while this save was in flight queue one follow-up.
    if (ok && dirtySinceSerialize) {
      session.setSaveStatus('dirty')
      queueAutosave()
    } else if (ok) {
      session.setSaveStatus('saved')
      clearTimeout(statusTimer)
      statusTimer = setTimeout(() => {
        if (session.saveStatus() === 'saved') session.setSaveStatus('idle')
      }, 3000)
    }
  }
  const save = () => {
    clearTimeout(saveTimer)
    attemptSave()
  }
  // Export flow: save NOW if dirty and await the roundtrip, so a PDF rendered
  // right after cannot lag the editor. Clean deck → resolves immediately.
  const flushSave = async () => {
    clearTimeout(saveTimer)
    attemptSave()
    while (inFlight) {
      await Promise.race([
        inFlight,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Saving the deck timed out')), 20000),
        ),
      ])
      if (!dirtySinceSerialize) break
      clearTimeout(saveTimer)
      attemptSave()
    }
  }

  onMount(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (stage) ro.observe(stage)
    const msg = (e: MessageEvent) => {
      if (e.source !== frame?.contentWindow) return
      const data = e.data
      if (data?.type === 'studio_element_selected') {
        s.addTarget(data.element)
        return
      }
      if (!handleBridgeMessage(session, data)) return
      if (data.type === 'deck_html') void finishSave()
      else if (data.type === 'deck_dirty') onDirty()
    }
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
        return
      }
      if (/input|textarea/i.test(document.activeElement?.tagName ?? '')) return
      if (/^i$/i.test(e.key)) s.setInspectMode(!s.inspectMode)
      else if (e.key === 'Escape') s.setInspectMode(false)
    }
    addEventListener('message', msg)
    addEventListener('keydown', key)
    const unregister = s.id ? registerDeckEditor(s.id, { flushSave }) : undefined
    onCleanup(() => {
      unregister?.()
      ro.disconnect()
      removeEventListener('message', msg)
      removeEventListener('keydown', key)
      clearTimeout(saveTimer)
      clearTimeout(statusTimer)
      clearTimeout(captureTimer)
      clearTimeout(serializeTimer)
      if (inFlight) settleSave(new Error('The deck editor was closed before saving'))
    })
  })
  const toggle = () => s.setInspectMode(!s.inspectMode)

  // ── selection overlay geometry (iframe px × scale, relative to .deck-preview) ──
  const selBox = createMemo(() => {
    const sel = session.sel()
    if (!sel || s.inspectMode) return null
    const k = scale()
    const w = sel.rect.w * k,
      h = sel.rect.h * k
    return { left: sel.rect.x * k, top: sel.rect.y * k, w, h }
  })
  const toolbarPos = createMemo(() => {
    const box = selBox()
    if (!box) return null
    const maxLeft = 1280 * scale()
    const below = box.top < 56
    return {
      left: Math.max(140, Math.min(maxLeft - 140, box.left + box.w / 2)),
      top: below ? box.top + box.h + 10 : box.top - 10,
      below,
    }
  })

  // ── drag / resize / rotate — deltas are cumulative from start, doc px ───────
  const beginPointerDrag = (
    e: PointerEvent,
    onMove: (ev: PointerEvent) => void,
    onEnd?: () => void,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget as HTMLElement
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* unsupported (tests) */
    }
    const move = (ev: PointerEvent) => onMove(ev)
    const up = () => {
      try {
        target.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      onEnd?.()
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  const startMove = (e: PointerEvent) => {
    if (!session.sel()) return
    const sx = e.clientX,
      sy = e.clientY
    post({ type: 'deck_drag', phase: 'start', dx: 0, dy: 0 })
    beginPointerDrag(
      e,
      ev =>
        post({
          type: 'deck_drag',
          phase: 'move',
          dx: (ev.clientX - sx) / scale(),
          dy: (ev.clientY - sy) / scale(),
        }),
      () => post({ type: 'deck_drag', phase: 'end', dx: 0, dy: 0 }),
    )
  }
  const startResize = (handle: ResizeHandle) => (e: PointerEvent) => {
    if (!session.sel()) return
    const sx = e.clientX,
      sy = e.clientY
    post({ type: 'deck_resize', handle, phase: 'start', dx: 0, dy: 0 })
    beginPointerDrag(
      e,
      ev =>
        post({
          type: 'deck_resize',
          handle,
          phase: 'move',
          dx: (ev.clientX - sx) / scale(),
          dy: (ev.clientY - sy) / scale(),
        }),
      () => post({ type: 'deck_resize', handle, phase: 'end', dx: 0, dy: 0 }),
    )
  }
  const startRotate = (e: PointerEvent) => {
    const sel = session.sel()
    if (!sel || !frame) return
    const host = frame.getBoundingClientRect()
    const k = scale()
    const cx = host.left + (sel.rect.x + sel.rect.w / 2) * k,
      cy = host.top + (sel.rect.y + sel.rect.h / 2) * k
    beginPointerDrag(e, ev => {
      const deg = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90)
      post({ type: 'deck_rotate', deg })
    })
  }

  return (
    <div class="deck-editor">
      <div class="deck-editor-stage" ref={stage} data-deck-tour="canvas">
        <div
          class={`deck-preview${s.inspectMode ? ' inspect-active' : ''}`}
          data-slide-tone={session.sel()?.surfaceTone ?? session.surfaceTone()}
          style={{ width: `${1280 * scale()}px`, height: `${height()}px` }}
        >
          <div
            class="deck-preview-viewport"
            style={{ width: `${1280 * scale()}px`, height: `${height()}px` }}
          >
            <iframe
              ref={frame}
              src={src()}
              title="Deck editor"
              onLoad={() => {
                session.setReady(false)
                session.setSel(null)
                setChartOpen(false)
                setFrameReady(true)
                setLoadVersion(value => value + 1)
              }}
              style={{
                width: '1280px',
                height: `${height() / scale()}px`,
                transform: `scale(${scale()})`,
                'transform-origin': '0 0',
                border: '0',
                background: '#fff',
              }}
            />
          </div>
          <Show when={selBox()}>
            {box => (
              <>
                <div
                  class="deck-editor-selbox"
                  style={{
                    left: `${box().left}px`,
                    top: `${box().top}px`,
                    width: `${box().w}px`,
                    height: `${box().h}px`,
                  }}
                >
                  <div
                    class="deck-editor-move deck-editor-move-n"
                    data-handle="move"
                    onPointerDown={startMove}
                  />
                  <div class="deck-editor-move deck-editor-move-s" onPointerDown={startMove} />
                  <div class="deck-editor-move deck-editor-move-e" onPointerDown={startMove} />
                  <div class="deck-editor-move deck-editor-move-w" onPointerDown={startMove} />
                  <For each={RESIZE_HANDLES}>
                    {handle => (
                      <div
                        class={`deck-editor-handle deck-editor-handle-${handle}`}
                        data-handle={handle}
                        onPointerDown={startResize(handle)}
                      />
                    )}
                  </For>
                </div>
                <div
                  class="deck-editor-rotate"
                  title="Rotate"
                  style={{ left: `${box().left + box().w / 2}px`, top: `${box().top}px` }}
                  onPointerDown={startRotate}
                />
              </>
            )}
          </Show>
          <Show when={toolbarPos()}>
            {pos => (
              <div
                class={`deck-editor-toolbar-wrap${pos().below ? ' is-below' : ''}`}
                style={{ left: `${pos().left}px`, top: `${pos().top}px` }}
              >
                <DeckToolbar
                  session={session}
                  chartOpen={chartOpen()}
                  onToggleChart={() => setChartOpen(v => !v)}
                />
              </div>
            )}
          </Show>
          <Show when={chartOpen() && session.sel()?.kind === 'chart'}>
            <ChartPanel session={session} onClose={() => setChartOpen(false)} />
          </Show>
          <Show when={insertOpen()}>
            <BlocksPanel session={session} onClose={() => setInsertOpen(false)} />
          </Show>
          <SelectToggle active={s.inspectMode} onClick={toggle} data-deck-tour="select" />
          <Show
            when={s.inspectMode}
            fallback={
              <div class="preview-inspect-banner deck-editor-edit-banner">
                <span class="preview-inspect-banner__text">
                  Editing — click to select, drag to move
                </span>
                <span class="preview-inspect-banner__hint">
                  {' '}
                  · saves automatically · <kbd>I</kbd> to target the chat
                </span>
              </div>
            }
          >
            <div class="preview-inspect-banner">
              <span class="preview-inspect-pulse" />
              <span class="preview-inspect-banner__text">
                Click anything on a slide to add it to your prompt
              </span>
              <span class="preview-inspect-banner__hint">
                {' '}
                · <kbd>esc</kbd>
              </span>
            </div>
          </Show>
          <Show when={s.busy}>
            <div class="preview-updating">
              <span class="spinner" /> {s.status}
            </div>
          </Show>
          <div class="deck-preview-toolbar">
            <span
              class={`deck-editor-save-pill is-${session.saveStatus()}`}
              role="status"
              aria-live="polite"
            >
              {session.saveStatus() === 'saving'
                ? 'Saving…'
                : session.saveStatus() === 'dirty'
                  ? 'Editing…'
                  : 'Saved'}
            </span>
            <button
              type="button"
              class="preview-btn"
              data-deck-tour="insert"
              title="Insert block"
              aria-label="Insert block"
              aria-pressed={insertOpen()}
              onClick={() => setInsertOpen(v => !v)}
            >
              <Plus size={18} />
            </button>
            <InspectButton active={s.inspectMode} onClick={toggle} data-deck-tour="select" />
          </div>
        </div>
      </div>
      <SlidesBar session={session} store={s} />
      <DeckEditorTour ready={frameReady()} />
    </div>
  )
}
