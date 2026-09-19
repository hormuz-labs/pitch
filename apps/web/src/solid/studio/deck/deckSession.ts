// Shared state for one deck-editor bridge session. DeckEditor creates it,
// owns the iframe and the message listener, and hands the session down to the
// chrome (toolbar, panels, slides bar) so every part reads the same bridge
// state and posts through the same channel. Tests drive handleBridgeMessage
// directly with protocol messages.
import { createSignal } from 'solid-js'

export interface DeckRect {
  x: number
  y: number
  w: number
  h: number
}
export interface DeckSelStyles {
  color: string
  fontSize: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  align: string
  blockTag: string
  borderColor?: string
  bulletColor?: string
}
export interface DeckSel {
  kind: 'text' | 'image' | 'chart' | 'block'
  surfaceTone?: DeckSurfaceTone
  /** iframe-viewport px (multiply by the preview scale for screen coords). */
  rect: DeckRect
  slideIndex: number
  styles: DeckSelStyles
}
export interface DeckSlideMeta {
  index: number
  title: string
  thumbSrcDoc?: string
}
export interface DeckChartState {
  labels: string[]
  data: number[]
  backgroundColor: string
  borderColor: string
}
export type DeckSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'
export type DeckSurfaceTone = 'light' | 'dark'

export interface DeckSession {
  post: (msg: Record<string, unknown>) => void
  ready: () => boolean
  setReady: (v: boolean) => void
  sel: () => DeckSel | null
  setSel: (sel: DeckSel | null) => void
  slides: () => DeckSlideMeta[]
  setSlides: (slides: DeckSlideMeta[]) => void
  activeSlide: () => number
  setActiveSlide: (index: number) => void
  surfaceTone: () => DeckSurfaceTone
  setSurfaceTone: (tone: DeckSurfaceTone) => void
  chart: () => DeckChartState | null
  setChart: (chart: DeckChartState | null) => void
  saveStatus: () => DeckSaveStatus
  setSaveStatus: (status: DeckSaveStatus) => void
  /** Last deck_html reply (payload of deck_serialize). */
  html: () => { html: string; slides: { index: number; title: string }[] } | null
  setHtml: (html: string, slides: { index: number; title: string }[]) => void
}

export function createDeckSession(post: (msg: Record<string, unknown>) => void): DeckSession {
  const [ready, setReady] = createSignal(false)
  const [sel, setSel] = createSignal<DeckSel | null>(null)
  const [slides, setSlides] = createSignal<DeckSlideMeta[]>([])
  const [activeSlide, setActiveSlide] = createSignal(1)
  const [surfaceTone, setSurfaceTone] = createSignal<DeckSurfaceTone>('light')
  const [chart, setChart] = createSignal<DeckChartState | null>(null)
  const [saveStatus, setSaveStatus] = createSignal<DeckSaveStatus>('idle')
  const [html, setHtmlState] = createSignal<{
    html: string
    slides: { index: number; title: string }[]
  } | null>(null)
  return {
    post,
    ready,
    setReady,
    sel,
    setSel,
    slides,
    setSlides,
    activeSlide,
    setActiveSlide,
    surfaceTone,
    setSurfaceTone,
    chart,
    setChart,
    saveStatus,
    setSaveStatus,
    html,
    setHtml: (html, slides) => setHtmlState({ html, slides }),
  }
}

/**
 * Apply one bridge → parent message to the session. Returns true when the
 * message was a deck protocol message (caller may still react to specifics —
 * DeckEditor triggers a capture after deck_ready and finishes saves on
 * deck_html).
 */
export function handleBridgeMessage(session: DeckSession, data: any): boolean {
  if (!data || typeof data !== 'object') return false
  switch (data.type) {
    case 'deck_ready':
      session.setReady(true)
      return true
    case 'deck_select':
      session.setSel(data.sel ?? null)
      if (data.sel?.surfaceTone === 'dark' || data.sel?.surfaceTone === 'light')
        session.setSurfaceTone(data.sel.surfaceTone)
      return true
    case 'deck_selbox': {
      const current = session.sel()
      if (current && data.rect) session.setSel({ ...current, rect: data.rect })
      return true
    }
    case 'deck_dirty':
      // A mutation landed. Never interrupt an in-flight save; the bridge also
      // fires dirty right before its deck_html reply.
      if (session.saveStatus() !== 'saving') session.setSaveStatus('dirty')
      return true
    case 'deck_slides':
      session.setSlides(Array.isArray(data.slides) ? data.slides : [])
      return true
    case 'deck_active_slide':
      if (typeof data.index === 'number') session.setActiveSlide(data.index)
      if (data.surfaceTone === 'dark' || data.surfaceTone === 'light')
        session.setSurfaceTone(data.surfaceTone)
      return true
    case 'deck_chart':
      session.setChart(data.chart ?? null)
      return true
    case 'deck_html':
      if (typeof data.html === 'string') session.setHtml(data.html, data.slides ?? [])
      return true
  }
  return false
}

/** What chrome outside the editor (the export menu) may ask of a live editor. */
export interface DeckEditorHandle {
  /** Save NOW if dirty (awaiting the whole serialize → saveDeck roundtrip). */
  flushSave: () => Promise<void>
}

/** Live deck editors, keyed by project id. DeckEditor registers on mount. */
const liveEditors = new Map<string, DeckEditorHandle>()

export function registerDeckEditor(id: string, handle: DeckEditorHandle): () => void {
  liveEditors.set(id, handle)
  return () => {
    if (liveEditors.get(id) === handle) liveEditors.delete(id)
  }
}

export function deckEditorFor(id: string | undefined): DeckEditorHandle | undefined {
  return id ? liveEditors.get(id) : undefined
}
