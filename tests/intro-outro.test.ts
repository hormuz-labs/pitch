import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findProductLogo,
  normalizeBrowserHeaderMode,
  planTitleCards,
} from '../apps/api/src/render/utils/intro-outro'

describe('title-card assembly plan', () => {
  it('adds no card time when a PDF storyboard leaves intro and outro disabled', () => {
    const plan = planTitleCards({
      productName: 'Demo',
      productUrl: undefined,
      duration: 2.5,
      titleCards: {
        intro: { enabled: false, title: '', subtitle: '' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
    })

    expect(plan).toEqual({
      intro: { enabled: false, title: '', subtitle: '' },
      outro: { enabled: false, title: '', subtitle: '' },
      contentStartSec: 0,
      totalCardDurationSec: 0,
    })
  })

  it('keeps automatic branded cards for regular URL demos', () => {
    const plan = planTitleCards({
      productName: 'Acme',
      productUrl: 'acme.com',
      duration: 2.5,
    })

    expect(plan).toEqual({
      intro: { enabled: true, title: 'Acme', subtitle: '' },
      outro: { enabled: true, title: 'Thank you for watching', subtitle: 'acme.com' },
      contentStartSec: 2.5,
      totalCardDurationSec: 5,
    })
  })
})

describe('demo branding inputs', () => {
  it('maps the legacy default browser header to light chrome', () => {
    expect(normalizeBrowserHeaderMode('default')).toBe('light')
    expect(normalizeBrowserHeaderMode('dark')).toBe('dark')
    expect(normalizeBrowserHeaderMode('unexpected')).toBe('none')
  })

  it('finds a captured product logo in any supported image format', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-logo-'))
    const svg = path.join(directory, 'product_logo.svg')
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    try {
      expect(findProductLogo(directory)).toBe(svg)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
