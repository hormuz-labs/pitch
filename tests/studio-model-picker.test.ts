import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AZURE_ASTRA_SPEC,
  AZURE_GPT_6_SOL_SPEC,
  AZURE_GPT_55_SPEC,
  AZURE_GPT_61_SOL_SPEC,
  AZURE_LUNA_SPEC,
  AZURE_SOL_SPEC,
  AZURE_TERRA_SPEC,
  assembleStudioPicker,
  DEFAULT_STUDIO_MODELS,
  DEFAULT_TYPICAL_TURN,
  estimatedModelCredits,
  GEMINI_31_PRO_SPEC,
  GEMINI_38_FLASH_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
  modelCreditMultiplier,
  modelCreditMultipliers,
  parseModelSpec,
  platformMargin,
  selectStudioModel,
  studioModelSpecs,
  tokenPriceOf,
  typicalTurn,
} from '../apps/api/src/studio/model-picker.js'

const model = (
  provider: string,
  id: string,
  name: string,
  cost?: { input: number; output: number },
) => ({ provider, id, name, ...(cost ? { cost } : {}) })

describe('parseModelSpec', () => {
  it('splits provider and model id', () => {
    expect(parseModelSpec(GPT_54_SPEC)).toEqual({
      provider: 'openai',
      id: 'gpt-5.4',
    })
    expect(parseModelSpec(GEMINI_38_FLASH_SPEC)).toEqual({
      provider: 'google',
      id: 'gemini-3.8-flash',
    })
    expect(parseModelSpec(AZURE_GPT_61_SOL_SPEC)).toEqual({
      provider: 'azure-apim',
      id: 'gpt-6.1-sol',
    })
  })
})

describe('studioModelSpecs', () => {
  it('defaults to Google and direct GPT models', () => {
    expect(studioModelSpecs(undefined)).toEqual([...DEFAULT_STUDIO_MODELS])
  })

  it('rejects OpenRouter even when configured explicitly', () => {
    expect(studioModelSpecs(`openrouter/moonshotai/kimi-k3,${GPT_54_SPEC}`)).toEqual([GPT_54_SPEC])
  })

  it('keeps a configured allowlist in order', () => {
    expect(studioModelSpecs(`${GEMINI_31_PRO_SPEC}, ${GEMINI_38_FLASH_SPEC}`)).toEqual([
      GEMINI_31_PRO_SPEC,
      GEMINI_38_FLASH_SPEC,
    ])
  })

  it('every menu model defined in .pi/models.json reads images', () => {
    // The agent sees uploads, screenshots and review frames through `read`;
    // pi drops the image for a model whose input lacks it.
    const config = JSON.parse(readFileSync('.pi/models.json', 'utf8')) as {
      providers: Record<string, { models: { id: string; input: string[] }[] }>
    }
    const defined = Object.entries(config.providers).flatMap(([provider, p]) =>
      p.models.map(m => ({ spec: `${provider}/${m.id}`, input: m.input })),
    )
    for (const spec of DEFAULT_STUDIO_MODELS) {
      const entry = defined.find(m => m.spec === spec)
      if (entry) expect(entry.input, spec).toContain('image')
    }
    for (const entry of defined) expect(DEFAULT_STUDIO_MODELS, entry.spec).toContain(entry.spec)
  })
})

describe('model credit pricing', () => {
  it('uses defaults and allows deployment overrides', () => {
    expect(modelCreditMultiplier(GEMINI_38_FLASH_SPEC)).toBe(1)
    expect(modelCreditMultiplier(GEMINI_31_PRO_SPEC)).toBe(2)
    expect(
      modelCreditMultipliers(`{"${GEMINI_38_FLASH_SPEC}":1.5,"custom/model":3}`),
    ).toMatchObject({ [GEMINI_38_FLASH_SPEC]: 1.5, 'custom/model': 3 })
  })

  it('ignores invalid values and malformed configuration', () => {
    const prices = modelCreditMultipliers('{"custom/free":0,"custom/bad":"2"}')
    expect(modelCreditMultiplier('custom/free', prices)).toBe(1)
    expect(modelCreditMultiplier('custom/bad', prices)).toBe(1)
    expect(modelCreditMultipliers('not json')).toEqual(modelCreditMultipliers(undefined))
  })

  it('uses a 25% platform margin by default and accepts larger overrides', () => {
    expect(platformMargin(undefined)).toBe(1.25)
    expect(platformMargin('1.4')).toBe(1.4)
    expect(platformMargin('0.5')).toBe(1.25)
  })

  // Prices below are the runtime catalog's ($ per million tokens in / out).
  const TERRA = { input: 2, output: 12 }
  const SOL = { input: 4, output: 20 }
  const ASTRA = { input: 10, output: 50 }
  const FREE = { input: 0, output: 0 }

  it("prices a typical turn from the model's real token price, rate and margin", () => {
    // Terra: (50k × $2 + 12.5k × $12) / 1M = $0.25 of tokens × 1
    //        + 30 s × $0.002 = $0.06 of machine time → $0.31 × 1.25 = $0.3875 → 155
    expect(estimatedModelCredits(AZURE_TERRA_SPEC, { price: TERRA })).toEqual({
      total: 155,
      harness: 155,
    })
    // Sol:   $0.45 × 1 + $0.06 = $0.51 × 1.25 → 255
    expect(estimatedModelCredits(AZURE_SOL_SPEC, { price: SOL }).total).toBe(255)
    // Astra: $1.125 × 2 + $0.06 = $2.31 × 1.25 → 1,155
    expect(estimatedModelCredits(AZURE_ASTRA_SPEC, { price: ASTRA }).total).toBe(1155)
  })

  it('ranks models by what their tokens really cost, not by label', () => {
    const terra = estimatedModelCredits(AZURE_TERRA_SPEC, { price: TERRA }).total
    const sol = estimatedModelCredits(AZURE_SOL_SPEC, { price: SOL }).total
    const astra = estimatedModelCredits(AZURE_ASTRA_SPEC, { price: ASTRA }).total
    expect(sol).toBeGreaterThan(terra)
    expect(astra).toBeGreaterThan(sol * 4)
  })

  it('never quotes a model as free: machine time costs the same on every model', () => {
    // $0 tokens still pay 30 s × $0.002 × 1.25 = 30 credits.
    expect(estimatedModelCredits('custom/free', { price: FREE }).total).toBe(30)
  })

  it('quotes an unknown price as a mid-market model, not as free', () => {
    expect(estimatedModelCredits('custom/unknown').total).toBe(
      estimatedModelCredits(AZURE_TERRA_SPEC, { price: TERRA }).total,
    )
  })

  it("follows a deployment's rate and typical-turn overrides", () => {
    expect(
      estimatedModelCredits(AZURE_ASTRA_SPEC, {
        price: ASTRA,
        multipliers: { [AZURE_ASTRA_SPEC]: 1 },
      }).total,
      // $1.125 + $0.06 = $1.185 × 1.25 → 593
    ).toBe(593)
    expect(
      estimatedModelCredits(AZURE_TERRA_SPEC, {
        price: TERRA,
        turn: { inputTokens: 100_000, outputTokens: 25_000, computeSeconds: 0 },
      }).total,
      // $0.50 × 1.25 → 250
    ).toBe(250)
  })

  it('parses STUDIO_TYPICAL_TURN, keeping defaults for missing or bad fields', () => {
    expect(typicalTurn(undefined)).toEqual(DEFAULT_TYPICAL_TURN)
    expect(typicalTurn('{"inputTokens":80000,"outputTokens":-1,"computeSeconds":"x"}')).toEqual({
      ...DEFAULT_TYPICAL_TURN,
      inputTokens: 80_000,
    })
    expect(typicalTurn('not json')).toEqual(DEFAULT_TYPICAL_TURN)
  })

  it("reads a runtime model's cost table, ignoring missing or broken ones", () => {
    expect(tokenPriceOf({ cost: { input: 4, output: 20 } })).toEqual(SOL)
    expect(tokenPriceOf({ cost: { input: 0, output: 0 } })).toEqual(FREE)
    expect(tokenPriceOf({})).toBeUndefined()
    expect(tokenPriceOf({ cost: { input: 'x', output: 1 } })).toBeUndefined()
    expect(tokenPriceOf(undefined)).toBeUndefined()
  })

  it('quotes Sol and Astra per turn in the picker, with no per-30-seconds price', () => {
    const out = assembleStudioPicker(
      [
        model('azure-apim', 'gpt-5.6-sol', 'Sol', SOL),
        model('azure-apim', 'gpt-6-astra', 'Astra', ASTRA),
      ],
      { specs: [AZURE_SOL_SPEC, AZURE_ASTRA_SPEC], gptEnabled: true },
    )
    expect(out.map(m => m.estimatedCredits)).toEqual([255, 1155])
    for (const m of out) expect(m).not.toHaveProperty('videoCreditsPer30Seconds')
  })
})

describe('assembleStudioPicker', () => {
  const catalog = [
    model('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash'),
    model('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', { input: 2, output: 12 }),
    model('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash', { input: 0.75, output: 3.75 }),
    model('openrouter', 'z-ai/glm-5.3-flash', 'Z.ai: GLM 5.3 Flash'),
    model('openrouter', 'moonshotai/kimi-k3', 'MoonshotAI: Kimi K3'),
    model('openrouter', 'openai/gpt-4o', 'GPT-4o'),
    model('openai', 'gpt-5.4', 'GPT-5.4', { input: 2.5, output: 15 }),
    model('openai', 'gpt-5.4-mini', 'GPT-5.4 mini', { input: 0.75, output: 4.5 }),
  ]

  it('lists only the allowlist, with short labels, and ignores the rest', () => {
    const out = assembleStudioPicker(catalog, {
      defaultSpec: GEMINI_38_FLASH_SPEC,
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: true,
    })
    expect(out).toEqual([
      {
        spec: GEMINI_38_FLASH_SPEC,
        label: 'Gemini 3.8 Flash',
        creditMultiplier: 1,
        estimatedCredits: 73,
        harnessCredits: 73,
      },
      {
        spec: GEMINI_31_PRO_SPEC,
        label: 'Gemini 3.1 Pro',
        creditMultiplier: 2,
        estimatedCredits: 280,
        harnessCredits: 280,
      },
      {
        spec: GPT_54_MINI_SPEC,
        label: 'GPT-5.4 mini',
        creditMultiplier: 1,
        estimatedCredits: 77,
        harnessCredits: 77,
      },
      {
        spec: GPT_54_SPEC,
        label: 'GPT-5.4',
        creditMultiplier: 2,
        estimatedCredits: 343,
        harnessCredits: 343,
      },
    ])
  })

  it('drops allowlist entries that are not authenticated', () => {
    const out = assembleStudioPicker(
      catalog.filter(m => m.id === 'gemini-3.8-flash' || m.id === 'gemini-3.1-pro-preview'),
      { specs: [...DEFAULT_STUDIO_MODELS] },
    )
    expect(out.map(m => m.spec)).toEqual([GEMINI_38_FLASH_SPEC, GEMINI_31_PRO_SPEC])
  })

  it('shows direct GPT models when gptEnabled is true', () => {
    const out = assembleStudioPicker(catalog, {
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: true,
    })
    expect(out.slice(-2).map(m => m.spec)).toEqual([GPT_54_MINI_SPEC, GPT_54_SPEC])
  })

  it('hides direct GPT models when gptEnabled is false', () => {
    const out = assembleStudioPicker(catalog, {
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: false,
    })
    expect(out.map(m => m.spec)).toEqual([GEMINI_38_FLASH_SPEC, GEMINI_31_PRO_SPEC])
  })

  it('gates Azure models behind gptEnabled', () => {
    const azure = [
      model('azure-apim', 'gpt-5.5', 'GPT-5.5'),
      model('azure-apim', 'gpt-5.6-luna', 'Luna'),
      model('azure-apim', 'gpt-5.6-terra', 'Terra'),
      model('azure-apim', 'gpt-5.6-sol', 'Sol'),
      model('azure-apim', 'gpt-6-sol', 'GPT-6 Sol'),
      model('azure-apim', 'gpt-6.1-sol', 'GPT-6.1 Sol'),
      model('azure-apim', 'gpt-6-astra', 'Astra'),
    ]
    expect(
      assembleStudioPicker(azure, {
        specs: [...DEFAULT_STUDIO_MODELS],
        gptEnabled: false,
      }),
    ).toEqual([])

    expect(
      assembleStudioPicker(azure, {
        specs: [...DEFAULT_STUDIO_MODELS],
        gptEnabled: true,
      }).map(item => item.spec),
    ).toEqual([
      AZURE_GPT_55_SPEC,
      AZURE_LUNA_SPEC,
      AZURE_TERRA_SPEC,
      AZURE_SOL_SPEC,
      AZURE_GPT_6_SOL_SPEC,
      AZURE_GPT_61_SOL_SPEC,
      AZURE_ASTRA_SPEC,
    ])
  })

  it('shows Azure and direct OpenAI models together when gptEnabled is true', () => {
    const catalog = [
      model('azure-apim', 'gpt-5.6-sol', 'Sol'),
      model('openai', 'gpt-5.4', 'GPT-5.4'),
    ]
    expect(
      assembleStudioPicker(catalog, {
        specs: [AZURE_SOL_SPEC, GPT_54_SPEC],
        gptEnabled: true,
      }).map(item => item.spec),
    ).toEqual([AZURE_SOL_SPEC, GPT_54_SPEC])
  })

  it('gates Azure and OpenAI behind account gptEnabled entitlement', () => {
    const modelsList = [
      model('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash'),
      model('azure-apim', 'gpt-5.6-sol', 'Sol'),
      model('openai', 'gpt-5.4', 'GPT-5.4'),
    ]
    const denied = assembleStudioPicker(modelsList, {
      specs: [GEMINI_38_FLASH_SPEC, AZURE_SOL_SPEC, GPT_54_SPEC],
      gptEnabled: false,
    })
    expect(denied.map(item => item.spec)).toEqual([GEMINI_38_FLASH_SPEC])

    const allowed = assembleStudioPicker(modelsList, {
      specs: [GEMINI_38_FLASH_SPEC, AZURE_SOL_SPEC, GPT_54_SPEC],
      gptEnabled: true,
    })
    expect(allowed.map(item => item.spec)).toEqual([
      GEMINI_38_FLASH_SPEC,
      AZURE_SOL_SPEC,
      GPT_54_SPEC,
    ])
  })

  it('cannot bypass the deployment allowlist or entitlement via STUDIO_MODEL', () => {
    expect(
      assembleStudioPicker(catalog, {
        specs: [GEMINI_38_FLASH_SPEC],
        defaultSpec: GPT_54_SPEC,
        gptEnabled: true,
      }).map(m => m.spec),
    ).toEqual([GEMINI_38_FLASH_SPEC])
    expect(
      assembleStudioPicker(catalog, {
        specs: [...DEFAULT_STUDIO_MODELS],
        defaultSpec: GPT_54_SPEC,
        gptEnabled: false,
      }).some(m => m.spec === GPT_54_SPEC),
    ).toBe(false)
  })

  it('rejects explicit forbidden picks and replaces revoked or removed saved models', () => {
    const denied = assembleStudioPicker(catalog, {
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: false,
    })
    expect(() => selectStudioModel(denied, GPT_54_SPEC)).toThrow('not available')

    const allowed = assembleStudioPicker(catalog, {
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: true,
    })
    expect(selectStudioModel(allowed, GPT_54_SPEC)).toBe(GPT_54_SPEC)
    expect(selectStudioModel(allowed, undefined, GPT_54_SPEC)).toBe(GPT_54_SPEC)
    expect(selectStudioModel(allowed, undefined, 'openrouter/moonshotai/kimi-k3')).toBe(
      GEMINI_38_FLASH_SPEC,
    )
    expect(selectStudioModel(allowed, GEMINI_31_PRO_SPEC)).toBe(GEMINI_31_PRO_SPEC)
    expect(selectStudioModel(allowed, undefined, 'google/gemma-4-31b-it')).toBe(
      GEMINI_38_FLASH_SPEC,
    )
    expect(() => selectStudioModel([])).toThrow('No studio models')
  })
})
