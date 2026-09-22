import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { RECORDING_CURSOR_SCRIPT } from '../apps/api/src/render/utils/recording-cursor.ts'

/** Exercises the browser script's event/coordinate contract without pretending
 * this minimal DOM is evidence of the browser's painted/recorded pixels. */
function environment(child = false) {
  const listeners = new Map<string, ((event: any) => void)[]>()
  const pointer = { style: {} as Record<string, string> }
  const cancel = vi.fn()
  const ring = { animate: vi.fn(() => ({ cancel })) }
  const frames: any[] = []
  const host = {
    style: { cssText: '' },
    isConnected: false,
    setAttribute: vi.fn(),
    showPopover: vi.fn(),
    hidePopover: vi.fn(),
    matches: () => false,
    attachShadow: () => ({
      innerHTML: '',
      querySelector: (selector: string) => (selector === '.pointer' ? pointer : ring),
    }),
  }
  const createElement = vi.fn(() => host)
  const parent = { postMessage: vi.fn() }
  const window: any = {
    parent,
    addEventListener(type: string, callback: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), callback])
    },
  }
  window.top = child ? {} : window
  const context = createContext({
    window,
    document: {
      createElement,
      documentElement: {
        appendChild: () => {
          host.isConnected = true
        },
      },
      querySelectorAll: () => frames,
    },
  })
  const install = () => runInContext(RECORDING_CURSOR_SCRIPT, context)
  install()
  const emit = (type: string, event: any = {}) => {
    for (const listener of listeners.get(type) ?? []) listener(event)
  }
  return { emit, install, pointer, ring, host, createElement, parent, frames, cancel }
}

describe('recorded mouse input', () => {
  it('shows the arrow at the actual hotspot and pulses only on a press, not idle or movement', () => {
    const page = environment()
    expect(page.createElement).not.toHaveBeenCalled()
    page.emit('pointermove', { clientX: 192, clientY: 108, pointerType: 'mouse' })
    expect(page.pointer.style).toEqual({
      visibility: 'visible',
      transform: 'translate(190px,106px)',
    })
    expect(page.ring.animate).not.toHaveBeenCalled()
    page.emit('pointerdown', { clientX: 300, clientY: 240, pointerType: 'mouse' })
    expect(page.pointer.style.transform).toBe('translate(298px,238px)')
    expect(page.ring.animate).toHaveBeenCalledTimes(1)
    page.emit('pointerup', { clientX: 300, clientY: 240, pointerType: 'mouse' })
    expect(page.ring.animate).toHaveBeenCalledTimes(1)
    expect(page.host.style.cssText).toContain('pointer-events:none!important')
    expect(page.host.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true')
  })

  it('hides on exit, resumes on mouse input, ignores touch and installs only once', () => {
    const page = environment()
    page.install()
    page.emit('pointermove', { clientX: 100, clientY: 100, pointerType: 'touch' })
    expect(page.createElement).not.toHaveBeenCalled()
    page.emit('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' })
    expect(page.ring.animate).toHaveBeenCalledTimes(1)
    page.emit('pointerout', { relatedTarget: {} })
    expect(page.pointer.style.visibility).toBe('visible')
    page.emit('pointerout', { relatedTarget: null })
    expect(page.pointer.style.visibility).toBe('hidden')
    page.emit('pointermove', { clientX: 120, clientY: 80 })
    expect(page.pointer.style.visibility).toBe('visible')
    expect(page.createElement).toHaveBeenCalledTimes(1)
    page.emit('blur')
    expect(page.pointer.style.visibility).toBe('hidden')
  })

  it('relays cross-origin frame input to one top-level pointer with border and scale offsets', () => {
    const child = environment(true)
    const page = environment()
    const childWindow = {}
    page.frames.push({
      contentWindow: childWindow,
      clientLeft: 4,
      clientTop: 4,
      offsetWidth: 400,
      offsetHeight: 200,
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 300 }),
    })
    child.emit('pointerdown', { clientX: 20, clientY: 30, pointerType: 'mouse' })
    expect(child.createElement).not.toHaveBeenCalled()
    const data = child.parent.postMessage.mock.calls[0]![0]
    page.emit('message', { source: {}, data })
    expect(page.createElement).not.toHaveBeenCalled()
    page.emit('message', { source: childWindow, data })
    expect(page.pointer.style.transform).toBe('translate(134px,249px)')
    expect(page.ring.animate).toHaveBeenCalledTimes(1)
    page.emit('message', { source: childWindow, data: { ...data, x: NaN } })
    expect(page.ring.animate).toHaveBeenCalledTimes(1)
    child.emit('pointerout', { relatedTarget: null })
    page.emit('message', { source: childWindow, data: child.parent.postMessage.mock.calls[1]![0] })
    expect(page.pointer.style.visibility).toBe('hidden')
  })
})
