import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('motion runtime diagnostics', () => {
  it('exposes plural selectors to custom shot factories', () => {
    const source = readFileSync('engine/js/factories.js', 'utf8')
    const window: Record<string, any> = {}
    vm.runInNewContext(source, { window })

    const first = {}
    const second = {}
    const matches = window.ShotKit.qsa({ querySelectorAll: () => [first, second] }, '.item')
    expect(matches).toHaveLength(2)
    expect(matches[0]).toBe(first)
    expect(matches[1]).toBe(second)
  })

  it('aims a cursor at the element it clicks, from the laid-out page', () => {
    const source = readFileSync('engine/js/factories.js', 'utf8')
    const window: Record<string, any> = {}
    const rect = (left: number, top: number, width: number, height: number) => ({
      getBoundingClientRect: () => ({ left, top, width, height }),
    })
    // The stage drawn at half size: page pixels are twice the screen's.
    const document = { getElementById: () => rect(0, 0, 960, 540) }
    const gsap = { getProperty: (el: any, axis: string) => el.at[axis] }
    vm.runInNewContext(source, { window, document, gsap })

    const cursor = { ...rect(400, 300, 12, 12), at: { x: 30, y: 0 } }
    const button = rect(100, 200, 100, 20)
    expect(window.ShotKit.aim(cursor, button)).toEqual({ x: 30 - 500, y: -180 })
    expect(window.ShotKit.aim(cursor, button, { at: [0, 0], tip: [0.5, 0.5] })).toEqual({
      x: 30 - 612,
      y: -212,
    })
  })

  it('surfaces compiler boot exceptions instead of only timing out', () => {
    const compiler = readFileSync('engine/js/compiler.js', 'utf8')
    const check = readFileSync('.pi/scripts/launch-video/cues.mjs', 'utf8')

    expect(compiler).toContain('window.__BOOT_ERROR =')
    expect(check).toContain('window.__READY === true || Boolean(window.__BOOT_ERROR)')
    expect(check).toContain('compiler: $' + '{readiness.bootError}')
  })

  it('documents the runtime assumptions that caused the failed recovery', () => {
    const agent = readFileSync('.pi/AGENT.md', 'utf8')
    const schema = readFileSync('engine/schema.md', 'utf8')

    expect(agent).toContain('python3')
    expect(agent).toContain('/tmp` is fresh for every bash call')
    expect(agent).toContain('is not a transaction')
    expect(schema).toContain('`h(html)` returns the first root element')
    expect(schema).toContain('`qsa(root, selector)` returns an array')
  })
})
