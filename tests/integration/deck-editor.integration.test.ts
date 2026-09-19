/**
 * Deck editor bridge, end to end in real Chromium.
 *
 * A REAL workspace (a tmp dir with a 3-slide deck.html, one slide carrying a
 * Chart.js canvas + inline init script) is served over HTTP by the REAL server
 * code — serveWorkspaceFile from apps/api/src/worker/files.ts — with the
 * repo's engine/ mounted at /files/engine, so the injected ../../engine/js/...
 * script tags resolve exactly as they do in production.
 *
 * The bridge posts outbound messages only to window.parent (deck-editor.js
 * guards `parent !== window`), so — exactly like the Solid chrome in
 * production — the deck runs inside a same-origin harness iframe; the harness
 * buffers every bridge message into window.__msgs. Commands go back in with
 * iframe.contentWindow.postMessage.
 *
 * Chart.js is hermetic: the CDN URL the bridge lazy-loads is routed to a
 * minimal stub implementing the exact surface the bridge touches
 * (constructor, getChart, .data, .update()).
 *
 * Skipped where Chromium cannot launch (the studio image ships none).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { type Browser, chromium, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serveWorkspaceFile } from '../../apps/api/src/worker/files'

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../engine')

/** Minimal Chart.js stand-in for the exact API the bridge calls. */
const CHART_STUB = `
class Chart {
  constructor(el, config) { el.__chart = this; this.config = config; this.data = config.data; this.__updates = 0; }
  static getChart(el) { return el.__chart || null; }
  update() { this.__updates += 1; }
}
window.Chart = Chart;
`

const CHART_CONFIG = {
  type: 'bar',
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [
      {
        label: 'Series 1',
        data: [12, 19, 8, 15],
        backgroundColor: '#6366f1',
        borderColor: '#4f46e5',
        borderWidth: 2,
      },
    ],
  },
  options: { responsive: true },
}

function fixtureDeck(): string {
  const slide = (inner: string) =>
    `<div class="slide" style="width:1280px;height:720px;position:relative;overflow:hidden">` +
    `<div class="content" style="padding:80px;height:100%;box-sizing:border-box;position:relative;z-index:10">${inner}</div></div>`
  const chartInit =
    `<script>(function(){function go(){var el=document.getElementById('chart_1');` +
    `if(el&&window.Chart){new window.Chart(el, ${JSON.stringify(CHART_CONFIG)});}else{setTimeout(go,60);}}go();})();</script>`
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>fixture deck</title>
<style>
:root{--primary:#6366f1;--accent:#111827;--secondary:#6b7280;--bg:#ffffff}
body{font-family:sans-serif;background:#f3f4f6}
.slide{background:var(--bg);margin:0 auto 32px}
h1{font-size:56px;color:var(--accent)}
li::marker{color:var(--primary)}
</style>
</head>
<body>
${slide('<h1>Alpha Title</h1><p>First slide body.</p>')}
${slide('<h1>Beta List</h1><ul><li>Point one</li><li>Point two</li></ul>')}
${slide(`<h1>Gamma Data</h1><div data-pitch-block="1" data-chart="1" style="position:relative;width:600px;height:340px;margin:16px 0;"><canvas id="chart_1"></canvas></div>${chartInit}`)}
</body>
</html>
`
}

// createSlideHTML('title-content') shape (apps/web/src/solid/studio/deck/blocks.ts)
const NEW_SLIDE_HTML =
  `<div class="slide" style="width:1280px;height:720px;position:relative;overflow:hidden;">` +
  `<div class="content" style="padding:80px;height:100%;box-sizing:border-box;">` +
  `<h1>Slide title</h1><p style="font-size:22px;line-height:1.6;">Add your content here.</p></div></div>`

const CALLOUT_HTML =
  `<div style="padding:16px 20px;border-left:4px solid #6366f1;background:#eef2ff;border-radius:8px;margin:16px 0;">` +
  `<p style="margin:0;">Callout note</p></div>`

const BOX_HTML = `<div id="box" style="width:300px;height:120px;background:#fde68a;border-radius:8px;"></div>`

const chromiumLaunches = await (async () => {
  try {
    const b = await chromium.launch()
    await b.close()
    return true
  } catch {
    return false
  }
})()
const describeLive = chromiumLaunches ? describe : describe.skip
if (!chromiumLaunches)
  console.warn('skipping deck-editor integration tests — chromium will not launch here')

describeLive('deck editor bridge e2e (real server injection, real Chromium)', () => {
  let wsDir: string
  let server: Server
  let base: string
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    wsDir = mkdtempSync(path.join(tmpdir(), 'deck-editor-it-'))

    const app = express()
    // Same mount shape as apps/api/src/routes/files.ts: workspace under
    // /files/projects/<internal>, engine at /files/engine.
    app.use('/files/projects/ws', (req, res, next) => serveWorkspaceFile(wsDir, req, res, next))
    app.use('/files/engine', express.static(ENGINE_DIR))
    // Same-origin parent frame, like the Solid chrome: buffers bridge messages.
    app.get('/harness', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body>
<script>window.__msgs=[];window.addEventListener('message',function(e){if(e.data&&e.data.type)window.__msgs.push(e.data)})</script>
<iframe id="deck" src="/files/projects/ws/deck.html?studio=1&edit=1" style="width:1400px;height:920px;border:0;display:block"></iframe>
</body></html>`)
    })
    server = app.listen(0)
    await new Promise<void>(r => server.on('listening', () => r()))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    await page.route('**/chart.umd.min.js', route =>
      route.fulfill({ contentType: 'application/javascript', body: CHART_STUB }),
    )
  })

  beforeEach(() => {
    writeFileSync(path.join(wsDir, 'deck.html'), fixtureDeck())
  })

  afterAll(async () => {
    await browser?.close().catch(() => {})
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    }
    rmSync(wsDir, { recursive: true, force: true })
  })

  // ── harness helpers ─────────────────────────────────────────────────────────

  async function openEditor() {
    await page.goto(`${base}/harness`)
    await waitMsg('deck_ready')
  }

  function deckFrame(): Frame {
    const f = page.frames().find(fr => fr.url().includes('/files/projects/ws/deck.html'))
    if (!f) throw new Error('deck frame not found')
    return f
  }

  async function msgs(): Promise<any[]> {
    return page.evaluate(() => (window as any).__msgs)
  }

  async function mark(): Promise<number> {
    return (await msgs()).length
  }

  async function waitMsg(
    type: string,
    opts: { after?: number; pred?: (m: any) => boolean; timeout?: number } = {},
  ): Promise<any> {
    const { after = 0, pred = () => true, timeout = 10000 } = opts
    const deadline = Date.now() + timeout
    for (;;) {
      const m = (await msgs()).slice(after).find(x => x.type === type && pred(x))
      if (m) return m
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`)
      await new Promise(r => setTimeout(r, 50))
    }
  }

  async function send(data: Record<string, unknown>) {
    await page.evaluate(d => {
      const f = document.getElementById('deck') as HTMLIFrameElement
      f.contentWindow?.postMessage(d, '*')
    }, data)
  }

  async function deckEval<T>(fn: () => T): Promise<T> {
    return deckFrame().evaluate(fn)
  }

  async function slideCount(): Promise<number> {
    return deckEval(() => document.querySelectorAll('.slide').length)
  }

  async function slideTitles(): Promise<string[]> {
    return deckEval(() =>
      Array.from(document.querySelectorAll('.slide')).map(
        s => s.querySelector('h1')?.textContent?.trim() ?? '',
      ),
    )
  }

  /** Click the first h1 of slide n (1-based) and wait for its deck_select. */
  async function clickText(selector: string): Promise<any> {
    const after = await mark()
    await page.frameLocator('#deck').locator(selector).first().click()
    return waitMsg('deck_select', { after, pred: m => m.sel != null })
  }

  /** Put a real document selection inside an element so execCommand has a range. */
  async function selectAllText(selector: string) {
    await deckFrame().evaluate(sel => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`no element ${sel}`)
      const range = document.createRange()
      range.selectNodeContents(el)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(range)
    }, selector)
  }

  // ── injection ───────────────────────────────────────────────────────────────

  describe('script injection', () => {
    it('injects inspector + deck-editor with the right relative depth when studio=1&edit=1', async () => {
      const res = await page.request.get(`${base}/files/projects/ws/deck.html?studio=1&edit=1`)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html).toContain('window.STUDIO_INSPECTOR={container:".slide"}')
      expect(html).toContain('src="../../engine/js/inspector.js"')
      expect(html).toContain('src="../../engine/js/deck-editor.js"')
      // injected before </body>, after the deck's own markup
      expect(html.indexOf('engine/js/inspector.js')).toBeGreaterThan(html.indexOf('Gamma Data'))
    })

    it('injects only the inspector with studio=1 and nothing without params', async () => {
      const inspectOnly = await (
        await page.request.get(`${base}/files/projects/ws/deck.html?studio=1`)
      ).text()
      expect(inspectOnly).toContain('engine/js/inspector.js')
      expect(inspectOnly).not.toContain('deck-editor.js')
      const plain = await (await page.request.get(`${base}/files/projects/ws/deck.html`)).text()
      expect(plain).not.toContain('engine/js/')
      expect(plain).not.toContain('STUDIO_INSPECTOR')
    })

    it('loads the bridge and lib over the injected relative paths and posts deck_ready', async () => {
      await openEditor()
      // deck-editor.js derives deck-editor-lib.js from its own URL; both must
      // have loaded from /files/engine/js/ for DeckEditorLib to exist.
      const libLoaded = await deckEval(
        () => typeof (window as any).DeckEditorLib?.cleanDeckHtml === 'function',
      )
      expect(libLoaded).toBe(true)
      await waitMsg('deck_active_slide', { pred: m => m.index === 1 })
      expect(await slideCount()).toBe(3)
      const ids = await deckEval(() =>
        Array.from(document.querySelectorAll('.slide')).map(s => s.id),
      )
      expect(ids).toEqual(['slide-node-1', 'slide-node-2', 'slide-node-3'])
    })
  })

  // ── selection ───────────────────────────────────────────────────────────────

  describe('selection', () => {
    it('purges inspector boxes accidentally persisted in an older saved deck', async () => {
      const polluted = fixtureDeck().replace(
        '</body>',
        `<div id="studio-inspect-overlay"><div id="studio-inspect-label">stale hover</div></div>
         <div data-studio-box="1"><div>1</div></div>
         <div data-studio-box="1"><div>2</div></div></body>`,
      )
      writeFileSync(path.join(wsDir, 'deck.html'), polluted)

      await openEditor()

      expect(await deckEval(() => document.querySelectorAll('[data-studio-box]').length)).toBe(0)
      expect(
        await deckEval(
          () =>
            Array.from(
              document.querySelectorAll<HTMLElement>(
                '#studio-inspect-overlay, #studio-inspect-label, [data-studio-box]',
              ),
            ).filter(node => getComputedStyle(node).display !== 'none').length,
        ),
      ).toBe(0)
    })

    it('reports the local slide tone so floating controls can use opposite contrast', async () => {
      await openEditor()
      expect((await msgs()).find(m => m.type === 'deck_active_slide')?.surfaceTone).toBe('light')
      await send({ type: 'deck_slide_op', op: 'background', index: 1, color: '#080b14' })
      const selected = await clickText('#slide-node-1 h1')
      expect(selected.sel.surfaceTone).toBe('dark')
    })

    it('shows numbered target marks only while Select mode is active', async () => {
      await openEditor()
      await send({ type: 'deck_edit_mode', enabled: false })
      await send({ type: 'studio_toggle_inspect', enabled: true, scale: 0.5 })
      const after = await mark()
      await page.frameLocator('#deck').locator('#slide-node-1 h1').click()
      const picked = await waitMsg('studio_element_selected', { after })
      await send({ type: 'studio_set_marks', marks: [picked.element.mark] })

      await expect
        .poll(() =>
          deckEval(() => {
            const target = document.querySelector('#slide-node-1 h1')?.getBoundingClientRect()
            const box = document.querySelector<HTMLElement>('[data-studio-box="1"]')
            const marked = box?.getBoundingClientRect()
            return {
              display: box?.style.display,
              aligned:
                !!target &&
                !!marked &&
                Math.abs(target.left - marked.left) < 1 &&
                Math.abs(target.top - marked.top) < 1 &&
                Math.abs(target.width - marked.width) < 1 &&
                Math.abs(target.height - marked.height) < 1,
            }
          }),
        )
        .toEqual({ display: 'block', aligned: true })

      await send({ type: 'studio_toggle_inspect', enabled: false, scale: 0.5 })
      await expect
        .poll(() =>
          deckEval(
            () => document.querySelector<HTMLElement>('[data-studio-box="1"]')?.style.display,
          ),
        )
        .toBe('none')
    })

    it('clicking an h1 selects it as text on slide 1 with populated styles', async () => {
      await openEditor()
      const m = await clickText('#slide-node-1 h1')
      expect(m.sel.kind).toBe('text')
      expect(m.sel.slideIndex).toBe(1)
      expect(m.sel.rect.w).toBeGreaterThan(0)
      expect(m.sel.styles.blockTag).toBe('h1')
      expect(m.sel.styles.fontSize).toBe('56px')
      expect(m.sel.styles.color).toBeTruthy()
    })

    it('clicking empty slide space deselects (deck_select null)', async () => {
      await openEditor()
      await clickText('#slide-node-1 h1')
      const after = await mark()
      await page
        .frameLocator('#deck')
        .locator('#slide-node-1')
        .click({ position: { x: 600, y: 700 } })
      const m = await waitMsg('deck_select', { after, pred: x => x.sel === null })
      expect(m.sel).toBeNull()
    })

    it('ignores clicks when edit mode is off', async () => {
      await openEditor()
      await send({ type: 'deck_edit_mode', enabled: false })
      const editable = await deckEval(() =>
        document.querySelector('#slide-node-1 h1')?.getAttribute('contenteditable'),
      )
      expect(editable).toBe('false')
      const after = await mark()
      await page.frameLocator('#deck').locator('#slide-node-1 h1').click()
      await new Promise(r => setTimeout(r, 400))
      const selects = (await msgs())
        .slice(after)
        .filter(m => m.type === 'deck_select' && m.sel != null)
      expect(selects).toEqual([])
    })
  })

  // ── text editing ────────────────────────────────────────────────────────────

  describe('text editing', () => {
    it('deck_exec bold really emboldens the selected text (styleWithCSS)', async () => {
      await openEditor()
      await clickText('#slide-node-1 p')
      await selectAllText('#slide-node-1 p')
      await send({ type: 'deck_exec', cmd: 'bold' })
      await waitMsg('deck_dirty')
      const html = await deckEval(() => document.querySelector('#slide-node-1 p')?.innerHTML ?? '')
      expect(html).toMatch(/font-weight:\s*(bold|[6-9]00)|<(b|strong)>/i)
      const weight = await deckEval(
        () =>
          getComputedStyle(
            document.querySelector('#slide-node-1 p')!.firstElementChild ??
              document.querySelector('#slide-node-1 p')!,
          ).fontWeight,
      )
      expect(parseInt(weight, 10)).toBeGreaterThanOrEqual(600)
    })

    it('deck_exec formatBlock H2 turns the h1 into an h2', async () => {
      await openEditor()
      await clickText('#slide-node-1 h1')
      await selectAllText('#slide-node-1 h1')
      await send({ type: 'deck_exec', cmd: 'formatBlock', value: 'H2' })
      await waitMsg('deck_dirty')
      await page.waitForFunction(() => {
        const f = document.getElementById('deck') as HTMLIFrameElement
        return f.contentDocument?.querySelector('#slide-node-1 h2')?.textContent === 'Alpha Title'
      })
      expect(await deckEval(() => document.querySelectorAll('#slide-node-1 h1').length)).toBe(0)
    })

    it('deck_style fontSize sets the inline style on the selected element', async () => {
      await openEditor()
      await clickText('#slide-node-1 h1')
      await send({ type: 'deck_style', style: { fontSize: '40px' } })
      await waitMsg('deck_dirty')
      const fontSize = await deckEval(
        () => (document.querySelector('#slide-node-1 h1') as HTMLElement)?.style.fontSize,
      )
      expect(fontSize).toBe('40px')
    })

    it('deck_style with a --custom property sets it verbatim on an li', async () => {
      await openEditor()
      await clickText('#slide-node-2 li')
      await send({ type: 'deck_style', style: { '--primary': '#ff0000' } })
      await waitMsg('deck_dirty')
      const v = await deckEval(() =>
        (document.querySelector('#slide-node-2 li') as HTMLElement)?.style.getPropertyValue(
          '--primary',
        ),
      )
      expect(v).toBe('#ff0000')
    })
  })

  // ── insertion ───────────────────────────────────────────────────────────────

  describe('insertion', () => {
    it('deck_insert_html appends a tagged block into the active slide content', async () => {
      await openEditor()
      const after = await mark()
      await send({ type: 'deck_insert_html', html: CALLOUT_HTML })
      await waitMsg('deck_slides', { after })
      const found = await deckEval(() => {
        const el = document.querySelector('#slide-node-1 .content [data-pitch-block="1"]')
        return { present: !!el, text: el?.textContent ?? '' }
      })
      expect(found.present).toBe(true)
      expect(found.text).toContain('Callout note')
    })

    it('deck_insert_slide adds a slide, retags every slide and reposts deck_slides', async () => {
      await openEditor()
      const after = await mark()
      await send({ type: 'deck_insert_slide', html: NEW_SLIDE_HTML, after: 1 })
      const m = await waitMsg('deck_slides', { after })
      expect(await slideCount()).toBe(4)
      expect(await slideTitles()).toEqual(['Alpha Title', 'Slide title', 'Beta List', 'Gamma Data'])
      const ids = await deckEval(() =>
        Array.from(document.querySelectorAll('.slide')).map(s => s.id),
      )
      expect(ids).toEqual(['slide-node-1', 'slide-node-2', 'slide-node-3', 'slide-node-4'])
      expect(m.slides).toHaveLength(4)
      expect(m.slides[1].title).toBe('Slide title')
      // the new slide is wired: its h1 is editable
      const editable = await deckEval(() =>
        document.querySelector('#slide-node-2 h1')?.getAttribute('contenteditable'),
      )
      expect(editable).toBe('true')
    })
  })

  // ── slide ops ───────────────────────────────────────────────────────────────

  describe('slide ops', () => {
    it('reorder 1 → 3 reorders the DOM and retags', async () => {
      await openEditor()
      const after = await mark()
      await send({ type: 'deck_slide_op', op: 'reorder', from: 1, to: 3 })
      await waitMsg('deck_slides', { after })
      expect(await slideTitles()).toEqual(['Beta List', 'Gamma Data', 'Alpha Title'])
      const ids = await deckEval(() =>
        Array.from(document.querySelectorAll('.slide')).map(s => s.id),
      )
      expect(ids).toEqual(['slide-node-1', 'slide-node-2', 'slide-node-3'])
    })

    it('background op sets an inline background-color on that slide', async () => {
      await openEditor()
      await send({ type: 'deck_slide_op', op: 'background', index: 2, color: '#123456' })
      await waitMsg('deck_dirty')
      const bg = await deckEval(
        () => (document.querySelectorAll('.slide')[1] as HTMLElement).style.backgroundColor,
      )
      expect(bg.replace(/\s/g, '')).toMatch(/#123456|rgb\(18,52,86\)/)
    })

    it('delete removes a slide, and the last slide is never deleted', async () => {
      await openEditor()
      let after = await mark()
      await send({ type: 'deck_slide_op', op: 'delete', index: 1 })
      await waitMsg('deck_slides', { after })
      expect(await slideTitles()).toEqual(['Beta List', 'Gamma Data'])

      after = await mark()
      await send({ type: 'deck_slide_op', op: 'delete', index: 1 })
      await waitMsg('deck_slides', { after })
      expect(await slideCount()).toBe(1)

      // refused: deleting the only slide is a no-op
      after = await mark()
      await send({ type: 'deck_slide_op', op: 'delete', index: 1 })
      await new Promise(r => setTimeout(r, 400))
      expect(await slideCount()).toBe(1)
      expect((await msgs()).slice(after).some(m => m.type === 'deck_slides')).toBe(false)
    })

    it('deck_scroll_to scrolls the deck and reports the active slide', async () => {
      await openEditor()
      const after = await mark()
      await send({ type: 'deck_scroll_to', index: 3 })
      await waitMsg('deck_active_slide', { after, pred: m => m.index === 3 })
      const scrolled = await deckEval(() => window.scrollY > 100)
      expect(scrolled).toBe(true)
    })
  })

  // ── layer / manipulation ────────────────────────────────────────────────────

  describe('layering and manipulation', () => {
    it('front → drag → resize → rotate → inline round-trips a block', async () => {
      await openEditor()
      await send({ type: 'deck_insert_html', html: BOX_HTML })
      await waitMsg('deck_slides')

      const after = await mark()
      await page.frameLocator('#deck').locator('#box').click()
      const sel = await waitMsg('deck_select', { after, pred: m => m.sel != null })
      expect(sel.sel.kind).toBe('block')

      // front: absolute, z-index 50, reparented onto the slide
      await send({ type: 'deck_layer', mode: 'front' })
      await waitMsg('deck_dirty')
      const floated = await deckEval(() => {
        const el = document.getElementById('box') as HTMLElement
        const cs = getComputedStyle(el)
        return {
          position: cs.position,
          zIndex: cs.zIndex,
          parentIsSlide: el.parentElement?.classList.contains('slide') ?? false,
          left: parseFloat(el.style.left),
          top: parseFloat(el.style.top),
          width: el.style.width,
        }
      })
      expect(floated.position).toBe('absolute')
      expect(floated.zIndex).toBe('50')
      expect(floated.parentIsSlide).toBe(true)

      // drag: deltas are cumulative document px from phase start
      await send({ type: 'deck_drag', phase: 'start' })
      await send({ type: 'deck_drag', phase: 'move', dx: 50, dy: 30 })
      await send({ type: 'deck_drag', phase: 'end', dx: 50, dy: 30 })
      const moved = await deckEval(() => {
        const el = document.getElementById('box') as HTMLElement
        return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) }
      })
      expect(moved.left).toBeCloseTo(floated.left + 50, 0)
      expect(moved.top).toBeCloseTo(floated.top + 30, 0)

      // resize east: width grows by the delta
      await send({ type: 'deck_resize', handle: 'e', phase: 'start' })
      await send({ type: 'deck_resize', handle: 'e', phase: 'move', dx: 40, dy: 0 })
      await send({ type: 'deck_resize', handle: 'e', phase: 'end', dx: 40, dy: 0 })
      const width = await deckEval(() =>
        parseFloat((document.getElementById('box') as HTMLElement).style.width),
      )
      expect(width).toBeCloseTo(300 + 40, 0)

      // rotate
      await send({ type: 'deck_rotate', deg: 15 })
      const transform = await deckEval(
        () => (document.getElementById('box') as HTMLElement).style.transform,
      )
      expect(transform).toBe('rotate(15deg)')

      // inline: back in flow inside .content, absolute styles cleared
      await send({ type: 'deck_layer', mode: 'inline' })
      await waitMsg('deck_dirty')
      const inlined = await deckEval(() => {
        const el = document.getElementById('box') as HTMLElement
        return {
          position: getComputedStyle(el).position,
          inContent: el.parentElement?.classList.contains('content') ?? false,
          stylePosition: el.style.position,
          zIndex: el.style.zIndex,
        }
      })
      expect(inlined.position).not.toBe('absolute')
      expect(inlined.stylePosition).toBe('')
      expect(inlined.zIndex).toBe('')
      expect(inlined.inContent).toBe(true)
    })
  })

  // ── charts ──────────────────────────────────────────────────────────────────

  describe('charts', () => {
    it('chart get/set mutates the live chart, calls update() and rewrites the init script', async () => {
      await openEditor()
      // Clicking the canvas selects its data-chart wrapper and triggers a chart read.
      const after = await mark()
      await page.frameLocator('#deck').locator('#chart_1').click()
      const sel = await waitMsg('deck_select', { after, pred: m => m.sel != null })
      expect(sel.sel.kind).toBe('chart')
      const chartMsg = await waitMsg('deck_chart', { after })
      expect(chartMsg.chart.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
      expect(chartMsg.chart.data).toEqual([12, 19, 8, 15])
      expect(chartMsg.chart.backgroundColor).toBe('#6366f1')

      const setAfter = await mark()
      await send({
        type: 'deck_chart_set',
        patch: { labels: ['A', 'B', 'C'], data: [3, 7, 5], backgroundColor: '#ff0000' },
      })
      const updated = await waitMsg('deck_chart', { after: setAfter })
      expect(updated.chart.labels).toEqual(['A', 'B', 'C'])
      expect(updated.chart.data).toEqual([3, 7, 5])
      expect(updated.chart.backgroundColor).toBe('#ff0000')

      // live stub mutated, update() called
      const live = await deckEval(() => {
        const c = (document.getElementById('chart_1') as any).__chart
        return {
          data: c.data.datasets[0].data,
          labels: c.data.labels,
          updates: c.__updates,
          bg: c.data.datasets[0].backgroundColor,
        }
      })
      expect(live.data).toEqual([3, 7, 5])
      expect(live.labels).toEqual(['A', 'B', 'C'])
      expect(live.updates).toBeGreaterThanOrEqual(1)
      expect(live.bg).toBe('#ff0000')

      // the inline init script text was rewritten — the change survives a reload
      const script = await deckEval(() => {
        const s = Array.from(document.querySelectorAll('script:not([src])')).find(n =>
          (n.textContent ?? '').includes('chart_1'),
        )
        return s?.textContent ?? ''
      })
      expect(script).toContain('"labels":["A","B","C"]')
      expect(script).toContain('"data":[3,7,5]')
      expect(script).toContain('"backgroundColor":"#ff0000"')

      // and it survives serialization into the saved html
      const serAfter = await mark()
      await send({ type: 'deck_serialize' })
      const ser = await waitMsg('deck_html', { after: serAfter })
      expect(ser.html).toContain('"data":[3,7,5]')
      expect(ser.html).toContain('"labels":["A","B","C"]')
    })

    it('deck_chart_get re-reads the selected chart on demand', async () => {
      await openEditor()
      const after = await mark()
      await page.frameLocator('#deck').locator('#chart_1').click()
      await waitMsg('deck_chart', { after })
      const getAfter = await mark()
      await send({ type: 'deck_chart_get' })
      const m = await waitMsg('deck_chart', { after: getAfter })
      expect(m.chart.data).toEqual([12, 19, 8, 15])
    })
  })

  // ── serialize / save round-trip ─────────────────────────────────────────────

  describe('save round-trip', () => {
    it('serialized html is editor-clean and a fresh render shows every edit', async () => {
      await openEditor()
      // three edits: bold the paragraph, recolor slide 2, insert a callout
      await clickText('#slide-node-1 p')
      await selectAllText('#slide-node-1 p')
      await send({ type: 'deck_exec', cmd: 'bold' })
      await waitMsg('deck_dirty')
      await send({ type: 'deck_slide_op', op: 'background', index: 2, color: '#123456' })
      await send({ type: 'deck_insert_html', html: CALLOUT_HTML })
      await waitMsg('deck_slides')

      // Reproduce editor-only inspector nodes that previously leaked into PDF.
      await deckEval(() => {
        const hover = document.createElement('div')
        hover.id = 'studio-inspect-overlay'
        hover.innerHTML = '<div>h1</div>'
        document.body.appendChild(hover)
        const mark = document.createElement('div')
        mark.dataset.studioBox = '1'
        mark.innerHTML = '<div>1</div>'
        document.body.appendChild(mark)
      })

      const after = await mark()
      await send({ type: 'deck_serialize' })
      const m = await waitMsg('deck_html', { after })
      const html: string = m.html

      // nothing editor-owned survives the save
      expect(html).not.toContain('pitch-editor-style')
      expect(html).not.toContain('selected-for-styling')
      expect(html).not.toContain('contenteditable')
      expect(html).not.toContain('spellcheck')
      expect(html).not.toContain('engine/js/')
      expect(html).not.toContain('STUDIO_INSPECTOR')
      expect(html).not.toContain('studio-inspect-overlay')
      expect(html).not.toContain('data-studio-box')
      expect(html).toContain('id="slide-node-3"')
      expect(m.slides).toHaveLength(3)

      // the edits are in the saved document
      expect(html).toMatch(/font-weight:\s*(bold|[6-9]00)|<(b|strong)>/i)
      expect(html.replace(/\s/g, '')).toMatch(/background-color:\s*(#123456|rgb\(18,52,86\))/)
      expect(html).toContain('Callout note')

      // the money test: write it back, serve it WITHOUT edit=1, and the
      // pristine document — what export/render would use — carries every edit.
      writeFileSync(path.join(wsDir, 'deck.html'), html)
      await page.goto(`${base}/files/projects/ws/deck.html`)
      const pristine = await page.evaluate(() => {
        const p = document.querySelector('#slide-node-1 p')
        const bold = p?.querySelector('span[style*="font-weight"], b, strong')
        const slide2 = document.querySelectorAll('.slide')[1] as HTMLElement
        const callout = document.querySelector('#slide-node-1 .content [data-pitch-block="1"]')
        return {
          boldWeight: bold ? getComputedStyle(bold).fontWeight : null,
          slide2Bg: slide2?.style.backgroundColor ?? '',
          calloutText: callout?.textContent ?? '',
          editorScripts: document.querySelectorAll('script[src*="engine/js"]').length,
        }
      })
      expect(pristine.boldWeight).not.toBeNull()
      expect(parseInt(pristine.boldWeight ?? '0', 10)).toBeGreaterThanOrEqual(600)
      expect(pristine.slide2Bg.replace(/\s/g, '')).toMatch(/#123456|rgb\(18,52,86\)/)
      expect(pristine.calloutText).toContain('Callout note')
      expect(pristine.editorScripts).toBe(0)
    })
  })

  // ── capture ─────────────────────────────────────────────────────────────────

  describe('capture', () => {
    it('deck_capture_slides returns a self-contained srcdoc per slide', async () => {
      await openEditor()
      const after = await mark()
      await send({ type: 'deck_capture_slides' })
      const m = await waitMsg('deck_slides', { after })
      expect(m.slides).toHaveLength(3)
      expect(m.slides.map((s: any) => s.index)).toEqual([1, 2, 3])
      expect(m.slides.map((s: any) => s.title)).toEqual(['Alpha Title', 'Beta List', 'Gamma Data'])
      for (const s of m.slides) {
        expect(s.thumbSrcDoc.length).toBeGreaterThan(200)
        // slide markup AND the theme <style> are inside every srcdoc
        expect(s.thumbSrcDoc).toContain('class="slide"')
        expect(s.thumbSrcDoc).toContain('--primary:#6366f1')
        // editor chrome is not captured
        expect(s.thumbSrcDoc).not.toContain('pitch-editor-style')
        expect(s.thumbSrcDoc).not.toContain('contenteditable')
      }
      expect(m.slides[0].thumbSrcDoc).toContain('Alpha Title')
      expect(m.slides[2].thumbSrcDoc).toContain('chart_1')
    })
  })
})
