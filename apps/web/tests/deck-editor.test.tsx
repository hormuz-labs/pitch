import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeckEditor } from '../src/solid/studio/deck/DeckEditor'
import { deckEditorFor } from '../src/solid/studio/deck/deckSession'
import { fitScale, SLIDE_H, SLIDE_W } from '../src/solid/studio/deck/fitScale'
import type { ProjectStore } from '../src/solid/studio/useProject'

const { saveDeckMock } = vi.hoisted(() => ({ saveDeckMock: vi.fn() }))
vi.mock('../src/solid/studio/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/solid/studio/client')>()
  return { ...actual, studio: { ...actual.studio, saveDeck: saveDeckMock } }
})

function makeStore() {
  const [inspectMode, setInspectMode] = createSignal(false)
  return {
    id: 'p1',
    get inspectMode() {
      return inspectMode()
    },
    setInspectMode,
    targets: [],
    selectedSlide: null,
    busy: false,
    status: '',
    addTarget: vi.fn(),
    refresh: vi.fn(async () => {}),
    getToken: vi.fn(async () => 'tok'),
    project: null,
    thumbnailUrl: () => null,
  } as unknown as ProjectStore
}

function setup() {
  const store = makeStore()
  render(() => <DeckEditor store={store} src="/files/p1/deck.html?token=t&studio=1&edit=1" />)
  const frame = document.querySelector('iframe') as HTMLIFrameElement
  const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage')
  fireEvent.load(frame)
  const fromBridge = (data: Record<string, unknown>) =>
    window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }))
  const posts = () => postSpy.mock.calls.map(c => c[0] as any)
  return { store, frame, postSpy, fromBridge, posts }
}

describe('DeckEditor', () => {
  beforeEach(() => window.localStorage.setItem('pitch.deck-editor-tour.v1', 'done'))

  it('posts deck_capture_slides when the bridge reports deck_ready', () => {
    const { fromBridge, posts } = setup()
    expect(posts().some(m => m.type === 'deck_capture_slides')).toBe(false)
    fromBridge({ type: 'deck_ready' })
    expect(posts().some(m => m.type === 'deck_capture_slides')).toBe(true)
    // Edit mode is (re)asserted on every ready
    expect(posts().some(m => m.type === 'deck_edit_mode' && m.enabled === true)).toBe(true)
  })

  it('posts deck_edit_mode on load (edit is the default mode)', () => {
    const { posts } = setup()
    expect(posts()).toContainEqual({ type: 'deck_edit_mode', enabled: true })
    expect(posts()).toContainEqual({ type: 'studio_toggle_inspect', enabled: false, scale: 0.5 })
  })

  it('marks the deck dirty on deck_dirty', () => {
    const { fromBridge } = setup()
    fromBridge({ type: 'deck_ready' })
    fromBridge({ type: 'deck_dirty' })
    expect(screen.getByRole('status').textContent).toBe('Editing…')
  })

  it('switches floating editor chrome to the opposite tone of a dark slide', () => {
    const { fromBridge } = setup()
    fromBridge({ type: 'deck_active_slide', index: 1, surfaceTone: 'dark' })
    expect(document.querySelector('.deck-preview')?.getAttribute('data-slide-tone')).toBe('dark')
    fromBridge({ type: 'deck_active_slide', index: 2, surfaceTone: 'light' })
    expect(document.querySelector('.deck-preview')?.getAttribute('data-slide-tone')).toBe('light')
  })

  describe('autosave', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      saveDeckMock.mockResolvedValue({ ok: true, slides: 2 })
    })
    afterEach(() => {
      vi.useRealTimers()
      saveDeckMock.mockReset()
    })

    const serializes = (posts: () => any[]) =>
      posts().filter(m => m.type === 'deck_serialize').length
    const deckHtml = { type: 'deck_html', html: '<!DOCTYPE html><html></html>', slides: [] }

    it('debounces dirty into a save: serialize → deck_html → saveDeck → saved', async () => {
      const { store, fromBridge, posts } = setup()
      fromBridge({ type: 'deck_ready' })
      fromBridge({ type: 'deck_dirty' })
      expect(screen.getByRole('status').textContent).toBe('Editing…')
      vi.advanceTimersByTime(499)
      expect(serializes(posts)).toBe(0)
      vi.advanceTimersByTime(1)
      expect(serializes(posts)).toBe(1)
      expect(screen.getByRole('status').textContent).toBe('Saving…')
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(saveDeckMock).toHaveBeenCalledOnce())
      expect(saveDeckMock).toHaveBeenCalledWith('tok', 'p1', '<!DOCTYPE html><html></html>')
      expect(store.refresh).not.toHaveBeenCalled()
      expect(screen.getByRole('status').textContent).toBe('Saved')
    })

    it('coalesces repeated dirty messages into one save', async () => {
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(300)
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(300)
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(500)
      expect(serializes(posts)).toBe(1)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(saveDeckMock).toHaveBeenCalledOnce())
    })

    it('queues one follow-up save for edits that land during an in-flight save', async () => {
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(500)
      expect(serializes(posts)).toBe(1)
      // Edit again while the first save is still in flight
      fromBridge({ type: 'deck_dirty' })
      // Still inside the bridge-response timeout: no second serialization yet.
      vi.advanceTimersByTime(4999)
      expect(serializes(posts)).toBe(1)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(saveDeckMock).toHaveBeenCalledOnce())
      expect(screen.getByRole('status').textContent).toBe('Editing…')
      // The follow-up is debounced, then runs once
      vi.advanceTimersByTime(500)
      expect(serializes(posts)).toBe(2)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(saveDeckMock).toHaveBeenCalledTimes(2))
      // Nothing dirty anymore — no third save
      vi.advanceTimersByTime(10000)
      expect(serializes(posts)).toBe(2)
    })

    it('⌘S flushes immediately, skipping the debounce', async () => {
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      expect(serializes(posts)).toBe(1)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(saveDeckMock).toHaveBeenCalledOnce())
      expect(screen.getByRole('status').textContent).toBe('Saved')
    })

    it('does nothing when clean — no autosave, and ⌘S is a no-op', () => {
      const { posts } = setup()
      vi.advanceTimersByTime(10000)
      fireEvent.keyDown(window, { key: 's', metaKey: true })
      vi.advanceTimersByTime(10000)
      expect(serializes(posts)).toBe(0)
      expect(saveDeckMock).not.toHaveBeenCalled()
      expect(screen.getByRole('status').textContent).toBe('Saved')
    })

    it('a failed save stays dirty and retries on the next deck_dirty, without looping', async () => {
      saveDeckMock.mockRejectedValueOnce(new Error('nope'))
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(500)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Editing…'))
      // No retry loop without new edits
      vi.advanceTimersByTime(30000)
      expect(serializes(posts)).toBe(1)
      expect(saveDeckMock).toHaveBeenCalledTimes(1)
      // The next edit re-triggers autosave and this one succeeds
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(1500)
      expect(serializes(posts)).toBe(2)
      fromBridge(deckHtml)
      await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'))
    })

    it('returns to editing when the iframe never answers deck_serialize', () => {
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(1500)
      expect(serializes(posts)).toBe(1)
      expect(screen.getByRole('status').textContent).toBe('Saving…')

      vi.advanceTimersByTime(5000)
      expect(screen.getByRole('status').textContent).toBe('Editing…')

      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      expect(serializes(posts)).toBe(2)
    })

    it('re-requests slide thumbnails once edits settle (style edits change no structure)', () => {
      const { fromBridge, posts } = setup()
      const captures = () => posts().filter(m => m.type === 'deck_capture_slides').length
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(999)
      expect(captures()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(captures()).toBe(1)
      // Coalesced like the autosave debounce
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(500)
      fromBridge({ type: 'deck_dirty' })
      vi.advanceTimersByTime(1000)
      expect(captures()).toBe(2)
    })
  })

  describe('flushSave (export flow)', () => {
    beforeEach(() => {
      saveDeckMock.mockResolvedValue({ ok: true, slides: 2 })
    })
    afterEach(() => {
      saveDeckMock.mockReset()
    })
    const deckHtml = { type: 'deck_html', html: '<!DOCTYPE html><html></html>', slides: [] }

    it('registers a live handle per project and unregisters on unmount', () => {
      const store = makeStore()
      const view = render(() => (
        <DeckEditor store={store} src="/files/p1/deck.html?token=t&studio=1&edit=1" />
      ))
      expect(deckEditorFor('p1')).toBeTruthy()
      view.unmount()
      expect(deckEditorFor('p1')).toBeUndefined()
    })

    it('saves immediately when dirty and resolves only after saveDeck lands', async () => {
      const { fromBridge, posts } = setup()
      fromBridge({ type: 'deck_dirty' })
      const flush = deckEditorFor('p1')!.flushSave()
      // No debounce: serialize goes out right away
      expect(posts().filter(m => m.type === 'deck_serialize')).toHaveLength(1)
      let settled = false
      void flush.then(() => (settled = true))
      fromBridge(deckHtml)
      await flush
      expect(saveDeckMock).toHaveBeenCalledWith('tok', 'p1', '<!DOCTYPE html><html></html>')
      expect(settled).toBe(true)
      expect(screen.getByRole('status').textContent).toBe('Saved')
    })

    it('resolves without serializing when the deck is clean', async () => {
      const { posts } = setup()
      await deckEditorFor('p1')!.flushSave()
      expect(posts().filter(m => m.type === 'deck_serialize')).toHaveLength(0)
      expect(saveDeckMock).not.toHaveBeenCalled()
    })
  })

  describe('fitScale', () => {
    it('fits width when the stage is wide and tall', () => {
      expect(fitScale(2560, 2000)).toBe(1) // capped: never upscales
      expect(fitScale(640, 2000)).toBe(0.5) // 640/1280
    })
    it('fits height when the stage is short — one full slide stays visible', () => {
      expect(fitScale(1600, 400)).toBeCloseTo(400 / 720)
      expect(fitScale(1600, 400) * SLIDE_H).toBeLessThanOrEqual(400)
    })
    it('clamps to 0.1 on a tiny stage and to 0.5 when unmeasured', () => {
      expect(fitScale(50, 50)).toBe(0.1)
      expect(fitScale(0, 0)).toBe(0.5)
      expect(fitScale(1280, 0)).toBe(0.5)
    })
    it('never exceeds the stage on either axis', () => {
      for (const [w, h] of [
        [800, 300],
        [300, 800],
        [1280, 720],
        [4000, 100],
      ] as const) {
        const k = fitScale(w, h)
        expect(k * SLIDE_W).toBeLessThanOrEqual(w)
        expect(k * SLIDE_H).toBeLessThanOrEqual(h)
      }
    })
  })

  it('fits one full slide into the stage without horizontal overflow', () => {
    const rect = { width: 1600, height: 400, top: 0, left: 0, right: 1600, bottom: 400 }
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return (
          this.classList?.contains('deck-editor-stage')
            ? rect
            : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
        ) as DOMRect
      })
    try {
      const { frame } = setup()
      const k = fitScale(1600, 400) // 400/720 ≈ 0.556
      expect(frame.style.transform).toBe(`scale(${k})`)
      // The iframe is one slide tall in document px so one slide fills the stage
      expect(frame.style.height).toBe(`${400 / k}px`)
      const preview = document.querySelector('.deck-preview') as HTMLElement
      expect(preview.style.height).toBe('400px')
      // Scaled width fits the stage — no horizontal scrollbar
      expect(Number.parseFloat(preview.style.width)).toBeCloseTo(SLIDE_W * k)
      expect(SLIDE_W * k).toBeLessThanOrEqual(1600)
    } finally {
      spy.mockRestore()
    }
  })

  it('toggling select mode posts deck_edit_mode off + studio_toggle_inspect on', () => {
    const { postSpy, posts } = setup()
    postSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(posts()).toContainEqual({ type: 'deck_edit_mode', enabled: false })
    expect(posts()).toContainEqual({ type: 'studio_toggle_inspect', enabled: true, scale: 0.5 })
    expect(document.querySelector('.deck-preview')!.className).toContain('inspect-active')
  })

  it('shows the floating toolbar at the scaled selection rect', () => {
    const { fromBridge } = setup()
    fromBridge({
      type: 'deck_select',
      sel: {
        kind: 'text',
        rect: { x: 100, y: 100, w: 200, h: 40 },
        slideIndex: 1,
        styles: {
          color: '#111111',
          fontSize: '20px',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          align: 'left',
          blockTag: 'p',
        },
      },
    })
    const wrap = document.querySelector('.deck-editor-toolbar-wrap') as HTMLElement
    expect(wrap).toBeTruthy()
    // scale is 0.5 (happy-dom reports a zero-size stage, so resize() is a no-op)
    expect(wrap.style.left).toBe('140px') // (100 + 200/2) × 0.5 = 100, clamped to the 140px floor
    expect(wrap.style.top).toBe('80px') // near the top edge → placed below the selection
    expect(wrap.className).toContain('is-below')
    expect(screen.getByRole('toolbar', { name: 'Deck element tools' })).toBeTruthy()
    // Selection overlay with move bars + 8 handles
    expect(document.querySelector('.deck-editor-selbox')).toBeTruthy()
    expect(document.querySelectorAll('.deck-editor-handle')).toHaveLength(8)
    expect(document.querySelector('.deck-editor-rotate')).toBeTruthy()
  })

  it('toolbar actions reach the bridge', () => {
    const { fromBridge, posts } = setup()
    fromBridge({
      type: 'deck_select',
      sel: {
        kind: 'block',
        rect: { x: 40, y: 300, w: 120, h: 60 },
        slideIndex: 1,
        styles: {
          color: '',
          fontSize: '',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          align: 'left',
          blockTag: 'div',
        },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete element' }))
    expect(posts().at(-1)).toEqual({ type: 'deck_delete_el' })
  })

  it('dragging a move bar posts cumulative unscaled deltas', () => {
    const { fromBridge, posts } = setup()
    fromBridge({
      type: 'deck_select',
      sel: {
        kind: 'block',
        rect: { x: 40, y: 300, w: 120, h: 60 },
        slideIndex: 1,
        styles: {
          color: '',
          fontSize: '',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          align: 'left',
          blockTag: 'div',
        },
      },
    })
    const bar = document.querySelector('.deck-editor-move-n') as HTMLElement
    fireEvent.pointerDown(bar, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 30, clientY: 26, pointerId: 1 })
    fireEvent.pointerUp(bar, { pointerId: 1 })
    const drags = posts().filter(m => m.type === 'deck_drag')
    expect(drags[0]).toEqual({ type: 'deck_drag', phase: 'start', dx: 0, dy: 0 })
    // screen (20, 16) ÷ scale 0.5 → document (40, 32), cumulative from start
    expect(drags[1]).toEqual({ type: 'deck_drag', phase: 'move', dx: 40, dy: 32 })
    expect(drags[2]).toEqual({ type: 'deck_drag', phase: 'end', dx: 0, dy: 0 })
  })

  it('deck_slides feeds the slides bar', () => {
    const { fromBridge } = setup()
    fromBridge({
      type: 'deck_slides',
      slides: [
        { index: 1, title: 'First', thumbSrcDoc: '<html/>' },
        { index: 2, title: 'Second', thumbSrcDoc: '<html/>' },
      ],
    })
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('2 slides')).toBeTruthy()
  })

  it('ignores messages that did not come from the deck iframe', () => {
    const { posts } = setup()
    const before = posts().length
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'deck_ready' } }))
    expect(posts()).toHaveLength(before)
  })

  it('the insert panel posts deck_insert_html through the bridge', () => {
    const { fromBridge, posts } = setup()
    fromBridge({ type: 'deck_ready' })
    fireEvent.click(screen.getByRole('button', { name: 'Insert block' }))
    fireEvent.click(screen.getByRole('button', { name: 'Divider' }))
    expect(posts().at(-1)?.type).toBe('deck_insert_html')
    expect(posts().at(-1)?.html).toContain('<hr')
  })
})
