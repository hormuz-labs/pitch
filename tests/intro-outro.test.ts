import { describe, expect, it } from 'vitest'
import { planTitleCards } from '../apps/api/src/render/utils/intro-outro'

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
