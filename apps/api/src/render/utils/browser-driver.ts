/**
 * The agent's hands on the recorded browser.
 *
 * `pitch demo browser` steps arrive here as typed operations (parsed in
 * .pi/lib/browser-command.ts) and run on the Playwright context this worker
 * already holds over CDP — the same one the capture records. There is no
 * second client, no subprocess and no shell: a click is a mouse glide and a
 * `locator.click`, bounded by one action timeout.
 *
 * Refs are Playwright's own aria refs (`page.ariaSnapshot({ mode: 'ai' })`,
 * `locator('aria-ref=e53')`), so a snapshot's `e53` is what the next step clicks.
 *
 * Pure browser work: no DB, no storage. Screenshots are written only inside
 * the workspace.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Dialog, Locator, Page } from 'playwright'
import type { BrowserOp } from '../../../../../.pi/lib/browser-command.ts'
import { chunkTypedText, type ElementBox } from '../../../../../.pi/lib/demo-core.ts'
import { resolveSymlinks } from '../../../../../.pi/lib/paths.ts'

/** How long one action may wait for its element before it is reported as failed. */
const ACTION_TIMEOUT_MS = 15_000
/** How long a navigation may take before it is reported as failed. */
const NAVIGATION_TIMEOUT_MS = 45_000

export interface BrowserResult {
  /** What the agent reads. */
  text: string
  /** The element's box, for ops that act on one (viewport CSS pixels). */
  box?: ElementBox
  url: string
}

export interface BrowserDriver {
  run: (op: BrowserOp) => Promise<BrowserResult>
  /** Box of a ref or CSS selector on the current page, or null when it has none. */
  box: (target: { ref?: string; selector?: string }) => Promise<ElementBox | null>
  viewport: () => Promise<{ width: number; height: number }>
  /** Run page JS (a function's source) on the page or on one element. */
  evaluate: (fn: string, ref?: string) => Promise<unknown>
  page: () => Page
}

/**
 * A function whose source is `src`. Playwright sends a function to the page
 * by its source text, over CDP — so this runs on pages whose CSP forbids
 * eval, where a string expression would not.
 */
function pageFunction(src: string): () => unknown {
  const fn = () => undefined
  fn.toString = () => src
  return fn
}

/** Element geometry plus where a cursor should land (the text of a big card, not its middle). */
function measure(el: Element): ElementBox {
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  let ax = cx
  let ay = cy
  if (r.width > innerWidth * 0.35 && r.height > innerHeight * 0.25) {
    let best: DOMRect | null = null
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rr = range.getBoundingClientRect()
      if (rr.width < 20 || rr.height < 8 || rr.width > innerWidth) continue
      if (rr.bottom < 0 || rr.top > innerHeight) continue
      if (!best || rr.top < best.top) best = rr
    }
    if (best) {
      ax = best.left + best.width / 2
      ay = best.top + best.height / 2
    }
  }
  return {
    x: r.left,
    y: r.top,
    w: r.width,
    h: r.height,
    cx,
    cy,
    ax,
    ay,
    hand: getComputedStyle(el).cursor === 'pointer',
  }
}

/**
 * Scroll an element to the centre of its scroll container with an eased
 * animation, so the recording shows the page travel instead of a jump.
 * Resolves once the last frame is painted; false when it was already in view.
 */
function smoothScrollToCentre(el: Element): Promise<boolean> {
  const scroller = (node: Element): Element | null => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(auto|scroll|overlay)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p
    }
    return null
  }
  return new Promise(resolve => {
    const c = scroller(el)
    const r = el.getBoundingClientRect()
    let start: number
    let target: number
    let viewH: number
    let set: (v: number) => void
    if (c) {
      const cr = c.getBoundingClientRect()
      viewH = c.clientHeight
      start = c.scrollTop
      target = r.top - cr.top + c.scrollTop + r.height / 2 - viewH / 2
      target = Math.max(0, Math.min(c.scrollHeight - c.clientHeight, target))
      set = v => {
        c.scrollTop = v
      }
    } else {
      viewH = innerHeight
      start = scrollY
      target = r.top + scrollY + r.height / 2 - viewH / 2
      target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, target))
      set = v => scrollTo(0, v)
    }
    const delta = target - start
    if (Math.abs(delta) < viewH * 0.08) return resolve(false)
    const duration = Math.min(900, Math.max(450, Math.abs(delta) * 0.9))
    const t0 = performance.now()
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      set(start + delta * ease(p))
      if (p < 1) requestAnimationFrame(frame)
      else requestAnimationFrame(() => resolve(true))
    }
    requestAnimationFrame(frame)
  })
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function createBrowserDriver(context: BrowserContext, workspaceDir: string): BrowserDriver {
  let current: Page | null = null
  let dialogPolicy: { accept: boolean; text?: string } | null = null
  let lastDialog = ''

  const onDialog = (dialog: Dialog) => {
    const policy = dialogPolicy
    dialogPolicy = null
    lastDialog = `${dialog.type()} "${dialog.message()}" was ${policy?.accept ? 'accepted' : 'dismissed'}`
    void (policy?.accept ? dialog.accept(policy.text) : dialog.dismiss()).catch(() => {})
  }
  const adopt = (page: Page) => {
    if ((page as any).__pitchDriver) return
    ;(page as any).__pitchDriver = true
    page.setDefaultTimeout(ACTION_TIMEOUT_MS)
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS)
    page.on('dialog', onDialog)
  }
  context.pages().forEach(adopt)
  context.on('page', adopt)

  const page = (): Page => {
    const pages = context.pages()
    if (current && !current.isClosed()) return current
    current = pages[pages.length - 1] ?? null
    if (!current) throw new Error('The browser has no open page.')
    return current
  }
  const locate = (ref: string): Locator => page().locator(`aria-ref=${ref}`)

  const box = async (target: { ref?: string; selector?: string }) => {
    const loc = target.ref ? locate(target.ref) : page().locator(target.selector!).first()
    try {
      const b = await loc.evaluate(measure, undefined, { timeout: 5_000 })
      return b.w > 0 && b.h > 0 ? b : null
    } catch {
      return null
    }
  }

  const bringIntoView = async (ref: string): Promise<boolean> => {
    const loc = locate(ref)
    await loc.waitFor({ state: 'visible' })
    return loc.evaluate(smoothScrollToCentre)
  }

  /** Move the real mouse to the element with eased travel, as a hand would. */
  const glide = async (ref: string): Promise<ElementBox> => {
    const p = page()
    await bringIntoView(ref)
    const b = await box({ ref })
    if (!b) throw new Error(`${ref} has no visible box. Take a fresh snapshot.`)
    const end = { x: b.ax, y: b.ay }
    const start = await p.evaluate(
      () => (window as any).__pitchPointerPosition ?? { x: 32, y: innerHeight - 32 },
    )
    const distance = Math.hypot(end.x - start.x, end.y - start.y)
    if (distance >= 2) {
      const duration = Math.min(1100, Math.max(350, distance * 0.7))
      const steps = Math.ceil(duration / (1000 / 60))
      await p.mouse.move(start.x, start.y)
      const began = Date.now()
      for (let i = 1; i <= steps; i++) {
        await sleep(Math.max(0, began + (duration * i) / steps - Date.now()))
        const t = i / steps
        const eased = t * t * (3 - 2 * t)
        await p.mouse.move(start.x + (end.x - start.x) * eased, start.y + (end.y - start.y) * eased)
      }
      await sleep(100)
    }
    return b
  }

  const insideWorkspace = (rel: string): string => {
    if (path.isAbsolute(rel)) throw new Error('Screenshot paths are workspace-relative.')
    const abs = path.resolve(workspaceDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const root = resolveSymlinks(workspaceDir)
    const real = resolveSymlinks(abs)
    if (!real.startsWith(`${root}${path.sep}`))
      throw new Error(`"${rel}" is outside the workspace.`)
    return abs
  }

  const describe = async (p: Page) => {
    const title = await p.title().catch(() => '')
    // A data: or blob: URL can be the whole document; the agent needs a label.
    const url = p.url().length > 200 ? `${p.url().slice(0, 120)}…` : p.url()
    return `Page: ${title ? `${title} — ` : ''}${url}`
  }

  const run = async (op: BrowserOp): Promise<BrowserResult> => {
    const done = async (text: string, extra: Partial<BrowserResult> = {}) => {
      const p = page()
      const dialog = lastDialog ? `\nDialog: ${lastDialog}.` : ''
      lastDialog = ''
      return { text: `${text}${dialog}\n${await describe(p)}`, url: p.url(), ...extra }
    }
    const p = page()
    switch (op.op) {
      case 'snapshot': {
        const target = op.selector ? p.locator(op.selector).first() : p
        const tree = await target.ariaSnapshot({ mode: 'ai' })
        return { text: `${await describe(p)}\n${tree}`, url: p.url() }
      }
      case 'click':
      case 'dblclick':
      case 'hover':
      case 'check':
      case 'uncheck': {
        const b = await glide(op.ref)
        const loc = locate(op.ref)
        if (op.op === 'click') await loc.click({ button: op.button })
        else if (op.op === 'dblclick') await loc.dblclick({ button: op.button })
        else if (op.op === 'hover') await loc.hover()
        else if (op.op === 'check') await loc.check()
        else await loc.uncheck()
        return done(`${op.op} ${op.ref} done.`, { box: b })
      }
      case 'fill': {
        const loc = locate(op.ref)
        const b = await glide(op.ref)
        await loc.click()
        await loc.fill('')
        // Short values type character by character; long ones reveal in a few
        // chunks, so the viewer sees the entry without waiting on it.
        for (const chunk of chunkTypedText(op.text)) await p.keyboard.type(chunk, { delay: 35 })
        if (op.submit) await p.keyboard.press('Enter')
        return done(`Typed "${op.text}" into ${op.ref}${op.submit ? ' and submitted' : ''}.`, {
          box: b,
        })
      }
      case 'select': {
        const b = await glide(op.ref)
        const chosen = await locate(op.ref).selectOption(op.values)
        return done(`Selected ${chosen.join(', ')} in ${op.ref}.`, { box: b })
      }
      case 'type':
        await p.keyboard.type(op.text, { delay: 35 })
        return done(`Typed "${op.text}".`)
      case 'press':
        await p.keyboard.press(op.key)
        return done(`Pressed ${op.key}.`)
      case 'goto':
        await p.goto(op.url, { waitUntil: 'domcontentloaded' })
        return done(`Opened ${op.url}.`)
      case 'back':
        await p.goBack({ waitUntil: 'domcontentloaded' })
        return done('Went back.')
      case 'forward':
        await p.goForward({ waitUntil: 'domcontentloaded' })
        return done('Went forward.')
      case 'reload':
        await p.reload({ waitUntil: 'domcontentloaded' })
        return done('Reloaded.')
      case 'scroll': {
        // Wheel in small steps so the page travels on camera.
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(op.dy), Math.abs(op.dx)) / 60))
        for (let i = 0; i < steps; i++) {
          await p.mouse.wheel(op.dx / steps, op.dy / steps)
          await sleep(16)
        }
        await sleep(150)
        return done(`Scrolled ${op.dy}px${op.dx ? ` and ${op.dx}px across` : ''}.`)
      }
      case 'focus': {
        const moved = await bringIntoView(op.ref)
        return done(moved ? `Scrolled ${op.ref} into view.` : `${op.ref} was already in view.`)
      }
      case 'eval': {
        const value = await evaluate(op.fn, op.ref)
        return done(`Result: ${JSON.stringify(value) ?? 'undefined'}`)
      }
      case 'screenshot': {
        const file = insideWorkspace(op.file)
        if (op.ref) await locate(op.ref).screenshot({ path: file })
        else await p.screenshot({ path: file })
        return done(`Saved ${path.relative(workspaceDir, file)}.`)
      }
      case 'wait':
        await sleep(op.ms)
        return done(`Waited ${op.ms}ms.`)
      case 'tab-list': {
        const lines = await Promise.all(
          context
            .pages()
            .map(
              async (tab, i) =>
                `${i}${tab === p ? ' (current)' : ''}: ${await tab.title().catch(() => '')} — ${tab.url()}`,
            ),
        )
        return { text: lines.join('\n'), url: p.url() }
      }
      case 'tab-new': {
        const tab = await context.newPage()
        current = tab
        await tab.bringToFront()
        if (op.url) await tab.goto(op.url, { waitUntil: 'domcontentloaded' })
        return done(`Opened tab ${context.pages().indexOf(tab)}.`)
      }
      case 'tab-select':
      case 'tab-close': {
        const pages = context.pages()
        const index = op.index ?? pages.indexOf(p)
        const tab = pages[index]
        if (!tab) throw new Error(`No tab ${index}; there are ${pages.length}. Use tab-list.`)
        if (op.op === 'tab-close') {
          if (pages.length === 1) throw new Error('Cannot close the last tab.')
          await tab.close()
          current = null
          await page().bringToFront()
          return done(`Closed tab ${index}.`)
        }
        current = tab
        await tab.bringToFront()
        return done(`Selected tab ${index}.`)
      }
      case 'dialog':
        dialogPolicy = { accept: op.accept, ...(op.text !== undefined ? { text: op.text } : {}) }
        return done(`The next dialog will be ${op.accept ? 'accepted' : 'dismissed'}.`)
    }
  }

  const evaluate = async (fn: string, ref?: string) =>
    ref ? locate(ref).evaluate(pageFunction(fn)) : page().evaluate(pageFunction(fn))

  return {
    run,
    box,
    viewport: () => page().evaluate(() => ({ width: innerWidth, height: innerHeight })),
    evaluate,
    page,
  }
}
