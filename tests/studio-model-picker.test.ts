import { describe, expect, it } from 'vitest'
import {
  assembleStudioPicker,
  DEFAULT_STUDIO_MODELS,
  GEMINI_31_PRO_SPEC,
  GEMINI_38_FLASH_SPEC,
  GEMMA_4_26B_SPEC,
  GEMMA_4_31B_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
  parseModelSpec,
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
    })
    expect(out).toEqual([
      { spec: GEMINI_38_FLASH_SPEC, label: 'Gemini 3.8 Flash' },
      { spec: GEMINI_31_PRO_SPEC, label: 'Gemini 3.1 Pro' },
      { spec: GEMMA_4_31B_SPEC, label: 'Gemma 4 31B' },
      { spec: GEMMA_4_26B_SPEC, label: 'Gemma 4 26B' },
    ])
  })

  it('drops allowlist entries that are not authenticated', () => {
    const out = assembleStudioPicker(
      catalog.filter(m => m.id === 'gemini-3.8-flash' || m.id === 'gemma-4-31b-it'),
      { specs: [...DEFAULT_STUDIO_MODELS] },
    )
    expect(out.map(m => m.spec)).toEqual([GEMINI_38_FLASH_SPEC, GEMMA_4_31B_SPEC])
  })

  it('allows GPT only after an admin enables the account', () => {
    const out = assembleStudioPicker(catalog, {
      specs: [...DEFAULT_STUDIO_MODELS],
      gptEnabled: true,
    })
    expect(out.slice(-2).map(m => m.spec)).toEqual([GPT_54_MINI_SPEC, GPT_54_SPEC])
  })

  it('cannot bypass entitlement or the allowlist via STUDIO_MODEL', () => {
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
      }).some(m => m.spec === GPT_54_SPEC),
    ).toBe(false)
  })

  it('rejects explicit forbidden picks and replaces revoked or removed saved models', () => {
    const allowed = assembleStudioPicker(catalog, { specs: [...DEFAULT_STUDIO_MODELS] })
    expect(() => selectStudioModel(allowed, GPT_54_SPEC)).toThrow('not available')
    expect(selectStudioModel(allowed, undefined, GPT_54_SPEC)).toBe(GEMINI_38_FLASH_SPEC)
    expect(selectStudioModel(allowed, undefined, 'openrouter/moonshotai/kimi-k3')).toBe(
      GEMINI_38_FLASH_SPEC,
    )
    expect(selectStudioModel(allowed, GEMMA_4_31B_SPEC)).toBe(GEMMA_4_31B_SPEC)
    expect(() => selectStudioModel([])).toThrow('No studio models')
  })
})
