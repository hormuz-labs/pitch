import { describe, expect, it } from 'vitest'
import {
  AZURE_ASTRA_SPEC,
  AZURE_GPT_55_SPEC,
  AZURE_LUNA_SPEC,
  AZURE_SOL_SPEC,
  AZURE_TERRA_SPEC,
  assembleStudioPicker,
  DEFAULT_STUDIO_MODELS,
  estimatedModelCredits,
  GEMINI_31_PRO_SPEC,
  GEMINI_38_FLASH_SPEC,
  GEMMA_4_26B_SPEC,
  GEMMA_4_31B_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
  modelCreditMultiplier,
  modelCreditMultipliers,
  parseModelSpec,
  platformMargin,
  selectStudioModel,
  studioModelSpecs,
} from '../apps/api/src/studio/model-picker.js'

const model = (provider: string, id: string, name: string) => ({ provider, id, name })

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
    expect(parseModelSpec(GEMMA_4_31B_SPEC)).toEqual({
      provider: 'google',
      id: 'gemma-4-31b-it',
    })
    expect(parseModelSpec(GEMMA_4_26B_SPEC)).toEqual({
      provider: 'google',
      id: 'gemma-4-26b-a4b-it',
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
    expect(studioModelSpecs(`${GEMMA_4_31B_SPEC}, ${GEMINI_38_FLASH_SPEC}`)).toEqual([
      GEMMA_4_31B_SPEC,
      GEMINI_38_FLASH_SPEC,
    ])
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

  it('adds duration-priced video cost to the harness estimate', () => {
    expect(estimatedModelCredits(AZURE_SOL_SPEC, 15, { [AZURE_SOL_SPEC]: 1 })).toEqual({
      total: 1250,
      harness: 125,
      video: 1250,
    })
    expect(estimatedModelCredits(AZURE_ASTRA_SPEC, 30, { [AZURE_ASTRA_SPEC]: 2 })).toEqual({
      total: 2500,
      harness: 250,
      video: 2500,
    })
    expect(estimatedModelCredits(AZURE_ASTRA_SPEC, 60, { [AZURE_ASTRA_SPEC]: 2 }).total).toBe(5000)
  })
})

describe('assembleStudioPicker', () => {
  const catalog = [
    model('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash'),
    model('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'),
    model('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash'),
    model('google', 'gemma-4-31b-it', 'Gemma 4 31B IT'),
    model('google', 'gemma-4-26b-a4b-it', 'Gemma 4 26B A4B IT'),
    model('openrouter', 'z-ai/glm-5.3-flash', 'Z.ai: GLM 5.3 Flash'),
    model('openrouter', 'moonshotai/kimi-k3', 'MoonshotAI: Kimi K3'),
    model('openrouter', 'openai/gpt-4o', 'GPT-4o'),
    model('openai', 'gpt-5.4', 'GPT-5.4'),
    model('openai', 'gpt-5.4-mini', 'GPT-5.4 mini'),
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
        estimatedCredits: 125,
        harnessCredits: 125,
      },
      {
        spec: GEMINI_31_PRO_SPEC,
        label: 'Gemini 3.1 Pro',
        creditMultiplier: 2,
        estimatedCredits: 250,
        harnessCredits: 250,
      },
      {
        spec: GEMMA_4_31B_SPEC,
        label: 'Gemma 4 31B',
        creditMultiplier: 1,
        estimatedCredits: 125,
        harnessCredits: 125,
      },
      {
        spec: GEMMA_4_26B_SPEC,
        label: 'Gemma 4 26B',
        creditMultiplier: 0.75,
        estimatedCredits: 94,
        harnessCredits: 94,
      },
      {
        spec: GPT_54_MINI_SPEC,
        label: 'GPT-5.4 mini',
        creditMultiplier: 1,
        estimatedCredits: 125,
        harnessCredits: 125,
      },
      {
        spec: GPT_54_SPEC,
        label: 'GPT-5.4',
        creditMultiplier: 2,
        estimatedCredits: 250,
        harnessCredits: 250,
      },
    ])
  })

  it('drops allowlist entries that are not authenticated', () => {
    const out = assembleStudioPicker(
      catalog.filter(m => m.id === 'gemini-3.8-flash' || m.id === 'gemma-4-31b-it'),
      { specs: [...DEFAULT_STUDIO_MODELS] },
    )
    expect(out.map(m => m.spec)).toEqual([GEMINI_38_FLASH_SPEC, GEMMA_4_31B_SPEC])
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
    expect(out.map(m => m.spec)).toEqual([
      GEMINI_38_FLASH_SPEC,
      GEMINI_31_PRO_SPEC,
      GEMMA_4_31B_SPEC,
      GEMMA_4_26B_SPEC,
    ])
  })

  it('gates Azure models behind gptEnabled', () => {
    const azure = [
      model('azure-apim', 'gpt-5.5', 'GPT-5.5'),
      model('azure-apim', 'gpt-5.6-luna', 'Luna'),
      model('azure-apim', 'gpt-5.6-terra', 'Terra'),
      model('azure-apim', 'gpt-5.6-sol', 'Sol'),
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
    expect(selectStudioModel(allowed, GEMMA_4_31B_SPEC)).toBe(GEMMA_4_31B_SPEC)
    expect(() => selectStudioModel([])).toThrow('No studio models')
  })
})
