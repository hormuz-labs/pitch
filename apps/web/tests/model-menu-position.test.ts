import { describe, expect, it } from 'vitest'
import { modelMenuLeft } from '../src/solid/studio/modelMenuPosition'

describe('modelMenuLeft', () => {
  it('aligns a desktop menu to the trigger while preserving the viewport gutter', () => {
    expect(modelMenuLeft({ right: 820 } as DOMRect, 1024)).toBe(400)
  })

  it('keeps the menu inside a narrow mobile viewport', () => {
    expect(modelMenuLeft({ right: 350 } as DOMRect, 375)).toBe(12)
  })

  it('accounts for a shifted visual viewport', () => {
    expect(modelMenuLeft({ right: 390 } as DOMRect, 360, 40)).toBe(52)
  })
})
