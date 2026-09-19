import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Regression test for the SlidesBar blank-thumbnail bug report: boots the
// in-iframe bridge (engine/js/deck-editor.js + deck-editor-lib.js) against the
// representative copy of the deck shape that failed for the user and
// asserts the message flow the parent depends on: deck_ready, then a
// deck_capture_slides reply carrying a non-empty thumbSrcDoc per slide.
//
// happy-dom does not execute <script> elements (neither inline nor srcdoc),
// so the bridge is eval'd inside the iframe's window — equivalent to the
// external <script> load, minus document.currentScript (the lib is eval'd
// first, so window.DeckEditorLib is present and the bridge takes its primary
// init path).

const deckHtml = readFileSync(
  resolve(process.cwd(), 'apps/web/tests/fixtures/deck-editor-regression.html'),
  'utf8',
)
const bridgeLib = readFileSync(resolve(process.cwd(), 'engine/js/deck-editor-lib.js'), 'utf8')
const bridge = readFileSync(resolve(process.cwd(), 'engine/js/deck-editor.js'), 'utf8')

function bootDeck() {
  const frame = document.createElement('iframe')
  frame.srcdoc = deckHtml
  document.body.appendChild(frame)
  const win = frame.contentWindow as any
  expect(win).toBeTruthy()
  const received: any[] = []
  // happy-dom's iframe→parent postMessage sets e.source to an object that is
  // not the exposed contentWindow, so no source filter here (one iframe only).
  const onMsg = (e: MessageEvent) => received.push(e.data)
  addEventListener('message', onMsg)
  win.eval(bridgeLib)
  win.eval(bridge)
  const post = (msg: Record<string, unknown>) => win.postMessage(msg, '*')
  return { frame, win, received, post }
}

describe('deck bridge booted on a representative generated deck', () => {
  it('the deck document parses with slides and inline styles', () => {
    const frame = document.createElement('iframe')
    frame.srcdoc = deckHtml
    document.body.appendChild(frame)
    const doc = frame.contentDocument!
    expect(doc.querySelectorAll('.slide').length).toBeGreaterThanOrEqual(11)
    expect(doc.querySelectorAll('head style').length).toBeGreaterThanOrEqual(1)
  })

  it('hides the iframe scrollbars without disabling scrolling', async () => {
    const { win, received } = bootDeck()
    await vi.waitFor(() => expect(received.some(m => m.type === 'deck_ready')).toBe(true))
    const editorStyle = win.document.getElementById('pitch-editor-style')?.textContent ?? ''
    expect(editorStyle).toContain('overflow-y: auto')
    expect(editorStyle).toContain('scrollbar-width: none')
    expect(editorStyle).toContain('::-webkit-scrollbar')
  })

  it('posts deck_ready and answers deck_capture_slides with thumbnails per slide', async () => {
    const { received, post } = bootDeck()
    await vi.waitFor(() => expect(received.some(m => m.type === 'deck_ready')).toBe(true), {
      timeout: 5000,
    })
    post({ type: 'deck_capture_slides' })
    await vi.waitFor(() => expect(received.some(m => m.type === 'deck_slides')).toBe(true), {
      timeout: 5000,
    })
    const msg = received.find(m => m.type === 'deck_slides')
    expect(msg.slides.length).toBeGreaterThanOrEqual(11)
    for (const slide of msg.slides) {
      expect(typeof slide.thumbSrcDoc).toBe('string')
      expect(slide.thumbSrcDoc.length).toBeGreaterThan(1000)
      // The thumbnail document carries the deck's inline styles and the slide
      expect(slide.thumbSrcDoc).toContain('<style>')
      expect(slide.thumbSrcDoc).toContain('class="slide')
      // The override style keeps thumbs flat and inert
      expect(slide.thumbSrcDoc).toContain('pointer-events:none')
      // Editor-only chrome must not leak into thumbs
      expect(slide.thumbSrcDoc).not.toContain('pitch-editor-style')
      expect(slide.thumbSrcDoc).not.toContain('contenteditable')
    }
    expect(msg.slides[0].index).toBe(1)
    expect(msg.slides[0].title.length).toBeGreaterThan(0)
  })

  it('serializes the deck back out (deck_serialize → deck_html)', async () => {
    const { received, post } = bootDeck()
    await vi.waitFor(() => expect(received.some(m => m.type === 'deck_ready')).toBe(true), {
      timeout: 5000,
    })
    post({ type: 'deck_serialize' })
    await vi.waitFor(() => expect(received.some(m => m.type === 'deck_html')).toBe(true), {
      timeout: 5000,
    })
    const msg = received.find(m => m.type === 'deck_html')
    expect(msg.html).toContain('<!DOCTYPE html>')
    expect(msg.html).toContain('class="slide')
    expect(msg.slides.length).toBeGreaterThanOrEqual(11)
    // The file on disk carries previously-baked inspector/bridge script tags
    // (incl. an absolute deck-editor-lib.js src with an auth token). Saving
    // must strip every one of them.
    expect(msg.html).not.toContain('engine/js/')
    expect(msg.html).not.toContain('STUDIO_INSPECTOR')
    expect(msg.html).not.toContain('pitch-editor-style')
    expect(msg.html).not.toContain('contenteditable')
  })
})
