/**
 * The pricing page reads its model table from GET /pricing/models, which is
 * computed from the same allowlist, multipliers and margin the studio
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

  it("quotes the credits the studio actually bills, at the runtime's token prices", () => {
    const prices = { 'azure-apim/gpt-6-astra': { input: 10, output: 50 } }
    for (const rate of publicModelRates(undefined, prices)) {
      expect(rate.credits).toBe(
        estimatedModelCredits(rate.spec, { price: (prices as any)[rate.spec] }).total,
      )
      expect(rate.name).toBe(STUDIO_MODEL_LABELS[rate.spec])
    }
    const astra = publicModelRates(undefined, prices).find(rate => rate.name === 'Astra')
    expect(astra?.credits).toBe(1155)
  })

  it('marks as on request exactly the models a new account cannot pick', () => {
    for (const rate of publicModelRates())
      expect(rate.access === 'all').toBe(canUseStudioModel(rate.spec, false))
  })

  it('prices every model per typical generation, with no per-length surcharge', () => {
    // Sol and Astra are chat models; generated footage is metered per clip.
    const rates = publicModelRates()
    expect(rates.every(rate => rate.unit === 'typical generation')).toBe(true)
    // With no runtime prices every model is quoted at the fallback price, so
    // only the credit rate separates them.
    const byName = Object.fromEntries(rates.map(rate => [rate.name, rate.credits]))
    expect(byName.Sol).toBe(byName.Terra)
    expect(byName.Astra).toBe(byName['Gemini 3.1 Pro'])
  })

  it('follows a deployment that narrows the allowlist', () => {
    const only = ['google/gemini-3.8-flash']
    expect(publicModelRates(only).map(rate => rate.spec)).toEqual(only)
  })
})
