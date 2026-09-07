/**
 * Which parts of a screenshot become parallax layers, and the shots.js field
 * the tool prints for them. The browser side only measures; this is the
 * decision.
 */
import { describe, expect, it } from 'vitest'
import { guessDepth, layersSnippet, planLayers } from '../.pi/scripts/launch-video/lib/layers.mjs'

const vp = { viewport: { w: 1920, h: 1080 } }

describe('planLayers', () => {
  it('drops tiny, off-screen, full-viewport and nested candidates', () => {
    const plan = planLayers(
      [
        { i: 0, rect: { x: 0, y: 0, w: 1920, h: 1080 }, tag: 'div', ancestors: [] },
        {
          i: 1,
          rect: { x: 0, y: 0, w: 1920, h: 72 },
          tag: 'header',
          position: 'sticky',
          ancestors: [],
        },
        { i: 2, rect: { x: 10, y: 10, w: 40, h: 20 }, tag: 'span', ancestors: [] },
        { i: 3, rect: { x: 0, y: 2000, w: 400, h: 300 }, tag: 'aside', ancestors: [] },
        {
          i: 4,
          rect: { x: 660, y: 240, w: 600, h: 500 },
          tag: 'div',
          role: 'dialog',
          ancestors: [],
        },
        { i: 5, rect: { x: 700, y: 300, w: 200, h: 100 }, tag: 'button', ancestors: [4] },
      ],
      vp,
    )
    expect(plan.map(p => p.i)).toEqual([1, 4])
    expect(plan[0].depth).toBe(1)
    expect(plan[1].depth).toBe(2)
  })
  it('clips a layer that hangs off the viewport and orders top-left first', () => {
    const plan = planLayers(
      [
        {
          i: 0,
          rect: { x: 1700, y: 100, w: 400, h: 300 },
          tag: 'div',
          cls: 'toast',
          ancestors: [],
        },
        { i: 1, rect: { x: -50, y: 0, w: 300, h: 1080 }, tag: 'aside', ancestors: [] },
      ],
      vp,
    )
    expect(plan.map(p => p.i)).toEqual([1, 0])
    expect(plan[0].rect).toEqual({ x: 0, y: 0, w: 250, h: 1080 })
    expect(plan[1].rect).toEqual({ x: 1700, y: 100, w: 220, h: 300 })
  })
  it('keeps a child whose parent was dropped for size', () => {
    const plan = planLayers(
      [
        { i: 0, rect: { x: 0, y: 0, w: 1920, h: 1080 }, tag: 'main', ancestors: [] },
        {
          i: 1,
          rect: { x: 100, y: 100, w: 500, h: 400 },
          tag: 'div',
          cls: 'card modal',
          ancestors: [0],
        },
      ],
      vp,
    )
    expect(plan.map(p => p.i)).toEqual([1])
  })
  it('caps the count', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      i,
      rect: { x: 0, y: i * 100, w: 300, h: 90 },
      tag: 'div',
      ancestors: [],
    }))
    expect(planLayers(many, vp)).toHaveLength(6)
  })
})

describe('guessDepth', () => {
  it('puts overlays nearest and page chrome one step up', () => {
    expect(guessDepth({ role: 'dialog' })).toBe(2)
    expect(guessDepth({ cls: 'Popover__panel' })).toBe(2)
    expect(guessDepth({ tag: 'header', position: 'sticky' })).toBe(1)
    expect(guessDepth({ tag: 'div' })).toBe(1)
  })
})

describe('layersSnippet', () => {
  it('prints the ui-frame fields with rounded rects', () => {
    const s = layersSnippet({
      w: 1920,
      h: 1080,
      base: 'assets/harvested/app.png',
      items: [
        {
          src: 'assets/harvested/app.layer-1.png',
          x: 0.4,
          y: 0,
          w: 1919.6,
          h: 72.2,
          depth: 1,
          hint: 'header sticky',
        },
      ],
    })
    expect(s).toContain('src: "assets/harvested/app.png"')
    expect(s).toContain('w: 1920, h: 1080')
    expect(s).toContain(
      '{ src: "assets/harvested/app.layer-1.png", x: 0, y: 0, w: 1920, h: 72, depth: 1 },  // header sticky',
    )
  })
})
