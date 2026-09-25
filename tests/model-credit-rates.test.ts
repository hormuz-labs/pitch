/**
 * The pricing page reads its model table from GET /pricing/models, which is
 * computed from the same allowlist, multipliers and video prices the studio
 * bills with. These pin that contract so the page cannot quote a price the
 * studio does not charge.
 */
import { describe, expect, it } from 'vitest'
import {
  canUseStudioModel,
  estimatedModelCredits,
  publicModelRates,
  STUDIO_MODEL_LABELS,
  studioModelSpecs,
} from '../apps/api/src/studio/model-picker.js'

describe('public model rates', () => {
  it('lists every model in the studio allowlist, in menu order', () => {
    expect(publicModelRates().map(rate => rate.spec)).toEqual(studioModelSpecs())
  })

  it('quotes the credits the studio actually bills', () => {
    for (const rate of publicModelRates()) {
      expect(rate.credits).toBe(estimatedModelCredits(rate.spec).total)
      expect(rate.name).toBe(STUDIO_MODEL_LABELS[rate.spec])
    }
  })

  it('marks as on request exactly the models a new account cannot pick', () => {
    for (const rate of publicModelRates())
      expect(rate.access === 'all').toBe(canUseStudioModel(rate.spec, false))
  })

  it('prices video models per 30 seconds', () => {
    const video = publicModelRates().filter(rate => rate.unit === 'up to 30 seconds')
    expect(video.map(rate => rate.name).sort()).toEqual(['Astra', 'Sol'])
  })

  it('follows a deployment that narrows the allowlist', () => {
    const only = ['google/gemini-3.8-flash']
    expect(publicModelRates(only).map(rate => rate.spec)).toEqual(only)
  })
})
