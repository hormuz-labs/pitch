import { describe, expect, it } from 'vitest'
import {
  assembleStudioPicker,
  DEFAULT_STUDIO_MODELS,
  GEMINI_31_PRO_SPEC,
  GEMINI_38_FLASH_SPEC,
  GLM_FLASH_SPEC,
  KIMI_SPEC,
  parseModelSpec,
  studioModelSpecs,
} from '../apps/api/src/studio/model-picker.js'

const model = (provider: string, id: string, name: string) => ({ provider, id, name })

describe('parseModelSpec', () => {
  it('splits on the first slash so OpenRouter ids may contain more', () => {
    expect(parseModelSpec(GLM_FLASH_SPEC)).toEqual({
      provider: 'openrouter',
      id: 'z-ai/glm-5.3-flash',
    })
    expect(parseModelSpec(KIMI_SPEC)).toEqual({
      provider: 'openrouter',
      id: 'moonshotai/kimi-k3',
    })
    expect(parseModelSpec(GEMINI_38_FLASH_SPEC)).toEqual({
      provider: 'google',
      id: 'gemini-3.8-flash',
    })
  })
})

describe('studioModelSpecs', () => {
  it('defaults to Kimi, GLM, Gemini 3.1 Pro, and Gemini 3.8 Flash', () => {
    expect(studioModelSpecs(undefined)).toEqual([...DEFAULT_STUDIO_MODELS])
  })

  it('keeps a configured allowlist in order', () => {
    expect(studioModelSpecs(`${KIMI_SPEC}, ${GLM_FLASH_SPEC}`)).toEqual([KIMI_SPEC, GLM_FLASH_SPEC])
  })
})

describe('assembleStudioPicker', () => {
  const catalog = [
    model('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash'),
    model('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'),
    model('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash'),
    model('openrouter', 'z-ai/glm-5.3-flash', 'Z.ai: GLM 5.3 Flash'),
    model('openrouter', 'moonshotai/kimi-k3', 'MoonshotAI: Kimi K3'),
    model('openrouter', 'openai/gpt-4o', 'GPT-4o'),
  ]

  it('lists only the allowlist, with short labels, and ignores the rest', () => {
    const out = assembleStudioPicker(catalog, {
      defaultSpec: GEMINI_38_FLASH_SPEC,
      specs: [...DEFAULT_STUDIO_MODELS],
    })
    expect(out).toEqual([
      { spec: GEMINI_38_FLASH_SPEC, label: 'Gemini 3.8 Flash' },
      { spec: KIMI_SPEC, label: 'Kimi K3' },
      { spec: GLM_FLASH_SPEC, label: 'GLM 5.3 Flash' },
      { spec: GEMINI_31_PRO_SPEC, label: 'Gemini 3.1 Pro' },
    ])
  })

  it('drops allowlist entries that are not authenticated', () => {
    const out = assembleStudioPicker(
      catalog.filter(m => m.provider === 'google'),
      { specs: [...DEFAULT_STUDIO_MODELS] },
    )
    expect(out.map(m => m.spec)).toEqual([GEMINI_31_PRO_SPEC, GEMINI_38_FLASH_SPEC])
  })
})
