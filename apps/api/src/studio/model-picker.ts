/**
 * The composer's model menu is a short allowlist. Google exposes dozens of ids;
 * the product runs Google models and opt-in GPT models below.
 *
 * Override with STUDIO_MODELS (comma-separated `provider/id` specs).
 */

export const GEMINI_38_FLASH_SPEC = 'google/gemini-3.8-flash'
export const GEMINI_31_PRO_SPEC = 'google/gemini-3.1-pro-preview'
export const GEMMA_4_31B_SPEC = 'google/gemma-4-31b-it'
export const GEMMA_4_26B_SPEC = 'google/gemma-4-26b-a4b-it'

export const GPT_54_SPEC = 'openai/gpt-5.4'
export const GPT_54_MINI_SPEC = 'openai/gpt-5.4-mini'
export const AZURE_GPT_55_SPEC = 'azure-apim/gpt-5.5'
export const AZURE_LUNA_SPEC = 'azure-apim/gpt-5.6-luna'
export const AZURE_TERRA_SPEC = 'azure-apim/gpt-5.6-terra'
export const AZURE_SOL_SPEC = 'azure-apim/gpt-5.6-sol'
export const AZURE_GPT_6_LUNA_SPEC = 'azure-apim/gpt-6-luna'
export const AZURE_GPT_6_SOL_SPEC = 'azure-apim/gpt-6-sol'
export const AZURE_ASTRA_SPEC = 'azure-apim/gpt-6-astra'

/** Menu order. The first runnable entry is also the studio default. */
export const DEFAULT_STUDIO_MODELS = [
  GEMINI_38_FLASH_SPEC,
  GEMINI_31_PRO_SPEC,
  GEMMA_4_31B_SPEC,
  GEMMA_4_26B_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
  AZURE_GPT_55_SPEC,
  AZURE_LUNA_SPEC,
  AZURE_TERRA_SPEC,
  AZURE_SOL_SPEC,
  AZURE_GPT_6_LUNA_SPEC,
  AZURE_GPT_6_SOL_SPEC,
  AZURE_ASTRA_SPEC,
] as const

export const DEFAULT_STUDIO_MODEL = GEMINI_38_FLASH_SPEC

/** Relative credit price for a turn, independent of the provider's token price. */
export const DEFAULT_MODEL_CREDIT_MULTIPLIERS: Record<string, number> = {
  [GEMINI_38_FLASH_SPEC]: 1,
  [GEMINI_31_PRO_SPEC]: 2,
  [GEMMA_4_31B_SPEC]: 1,
  [GEMMA_4_26B_SPEC]: 0.75,
  [GPT_54_MINI_SPEC]: 1,
  [GPT_54_SPEC]: 2,
  [AZURE_GPT_55_SPEC]: 1.5,
  [AZURE_LUNA_SPEC]: 0.75,
  [AZURE_TERRA_SPEC]: 1,
  [AZURE_SOL_SPEC]: 1,
  [AZURE_GPT_6_LUNA_SPEC]: 0.75,
  [AZURE_GPT_6_SOL_SPEC]: 1,
  [AZURE_ASTRA_SPEC]: 2,
}

/** Display names; the public pricing table quotes these (tests/model-credit-rates.test.ts). */
export const STUDIO_MODEL_LABELS: Record<string, string> = {
  [GEMINI_38_FLASH_SPEC]: 'Gemini 3.8 Flash',
  [GEMINI_31_PRO_SPEC]: 'Gemini 3.1 Pro',
  [GEMMA_4_31B_SPEC]: 'Gemma 4 31B',
  [GEMMA_4_26B_SPEC]: 'Gemma 4 26B',
  [GPT_54_SPEC]: 'GPT-5.4',
  [GPT_54_MINI_SPEC]: 'GPT-5.4 mini',
  [AZURE_GPT_55_SPEC]: 'GPT-5.5',
  [AZURE_LUNA_SPEC]: 'Luna',
  [AZURE_TERRA_SPEC]: 'Terra',
  [AZURE_SOL_SPEC]: 'Sol',
  [AZURE_GPT_6_LUNA_SPEC]: 'GPT-6 Luna',
  [AZURE_GPT_6_SOL_SPEC]: 'GPT-6 Sol',
  [AZURE_ASTRA_SPEC]: 'Astra',
}

/** One-line descriptions for the public pricing table. */
export const STUDIO_MODEL_DETAILS: Record<string, string> = {
  [GEMINI_38_FLASH_SPEC]: 'Fast multimodal production',
  [GEMINI_31_PRO_SPEC]: 'Complex multimodal projects',
  [GEMMA_4_31B_SPEC]: 'Creative open-weight model',
  [GEMMA_4_26B_SPEC]: 'Efficient open-weight model',
  [GPT_54_MINI_SPEC]: 'Fast everyday production',
  [GPT_54_SPEC]: 'Complex planning and execution',
  [AZURE_GPT_55_SPEC]: 'Deep planning and complex production',
  [AZURE_LUNA_SPEC]: 'Fast drafts and lightweight edits',
  [AZURE_TERRA_SPEC]: 'Everyday production work',
  [AZURE_SOL_SPEC]: 'Advanced video generation',
  [AZURE_GPT_6_LUNA_SPEC]: 'Next-generation fast drafts',
  [AZURE_GPT_6_SOL_SPEC]: 'Next-generation everyday production',
  [AZURE_ASTRA_SPEC]: 'Highest-capability video generation',
}

export interface PublicModelRate {
  spec: string
  name: string
  detail: string
  /** Typical credits for one generation; video models: up to 30 seconds. */
  credits: number
  unit: 'typical generation' | 'up to 30 seconds'
  /** 'all' runs on every account; 'request' needs model access switched on. */
  access: 'all' | 'request'
}

/**
 * The pricing page's model table, computed from the same allowlist, multipliers,
 * margin and video prices the studio bills with (env overrides included), so a
 * price change here is a price change there. Needs no model runtime.
 */
export function publicModelRates(specs = studioModelSpecs()): PublicModelRate[] {
  return specs.map(spec => {
    const estimate = estimatedModelCredits(spec)
    return {
      spec,
      name: STUDIO_MODEL_LABELS[spec] ?? parseModelSpec(spec).id,
      detail: STUDIO_MODEL_DETAILS[spec] ?? '',
      credits: estimate.total,
      unit: estimate.video ? 'up to 30 seconds' : 'typical generation',
      access: canUseStudioModel(spec, false) ? 'all' : 'request',
    }
  })
}

export interface PickerModel {
  spec: string
  label: string
  creditMultiplier: number
  estimatedCredits: number
  harnessCredits: number
  videoCreditsPer30Seconds?: number
}

export const BASE_GENERATION_CREDITS = 100
export const DEFAULT_PLATFORM_MARGIN = 1.25
export const DEFAULT_VIDEO_MODEL_COSTS_USD_30S: Record<string, number> = {
  [AZURE_SOL_SPEC]: 7,
  [AZURE_ASTRA_SPEC]: 10,
}
export const DEFAULT_VIDEO_MODEL_CREDITS_30S: Record<string, number> = {
  [AZURE_SOL_SPEC]: 1250,
  [AZURE_ASTRA_SPEC]: 2500,
}

export function platformMargin(raw = process.env.STUDIO_PLATFORM_MARGIN): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_PLATFORM_MARGIN
}

export function videoModelCosts(
  raw = process.env.STUDIO_VIDEO_MODEL_COSTS_USD_30S,
): Record<string, number> {
  if (!raw?.trim()) return DEFAULT_VIDEO_MODEL_COSTS_USD_30S
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const configured: Record<string, number> = {}
    for (const [spec, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) configured[spec] = value
    }
    return { ...DEFAULT_VIDEO_MODEL_COSTS_USD_30S, ...configured }
  } catch {
    return DEFAULT_VIDEO_MODEL_COSTS_USD_30S
  }
}

export function videoModelCredits(
  raw = process.env.STUDIO_VIDEO_MODEL_CREDITS_30S,
): Record<string, number> {
  if (!raw?.trim()) return DEFAULT_VIDEO_MODEL_CREDITS_30S
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const configured: Record<string, number> = {}
    for (const [spec, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        configured[spec] = Math.ceil(value)
      }
    }
    return { ...DEFAULT_VIDEO_MODEL_CREDITS_30S, ...configured }
  } catch {
    return DEFAULT_VIDEO_MODEL_CREDITS_30S
  }
}

export function videoGenerationCredits(
  spec: string,
  durationSeconds: number,
  prices = videoModelCredits(),
): number {
  const per30 = prices[spec]
  return per30 ? Math.ceil(per30 * (Math.max(30, durationSeconds) / 30)) : 0
}

/** Provider cost for the selected final duration, with a 30-second minimum. */
export function videoGenerationCostUsd(
  spec: string,
  durationSeconds: number,
  costs = videoModelCosts(),
): number {
  const per30 = costs[spec]
  if (!per30) return 0
  return per30 * (Math.max(30, durationSeconds) / 30)
}

export function estimatedModelCredits(
  spec: string,
  durationSeconds = 30,
  multipliers = modelCreditMultipliers(),
  costs = videoModelCosts(),
): { total: number; harness: number; video?: number } {
  const margin = platformMargin()
  const harness = Math.ceil(
    BASE_GENERATION_CREDITS * modelCreditMultiplier(spec, multipliers) * margin,
  )
  const providerUsd = videoGenerationCostUsd(spec, durationSeconds, costs)
  if (!providerUsd) return { total: harness, harness }
  const video = videoGenerationCredits(spec, durationSeconds)
  return { total: video, harness, video }
}

export function modelCreditMultipliers(
  raw = process.env.STUDIO_MODEL_CREDIT_MULTIPLIERS,
): Record<string, number> {
  if (!raw?.trim()) return DEFAULT_MODEL_CREDIT_MULTIPLIERS
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const configured: Record<string, number> = {}
    for (const [spec, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) configured[spec] = value
    }
    return { ...DEFAULT_MODEL_CREDIT_MULTIPLIERS, ...configured }
  } catch {
    return DEFAULT_MODEL_CREDIT_MULTIPLIERS
  }
}

export function modelCreditMultiplier(
  spec: string,
  multipliers = modelCreditMultipliers(),
): number {
  return multipliers[spec] ?? 1
}

export function parseModelSpec(spec: string): { provider: string; id: string } {
  const slash = spec.indexOf('/')
  if (slash <= 0) return { provider: 'google', id: spec }
  return { provider: spec.slice(0, slash), id: spec.slice(slash + 1) }
}

/** The allowlist, in menu order. */
export function studioModelSpecs(
  raw = process.env.STUDIO_MODELS,
  fallback = DEFAULT_STUDIO_MODELS.join(','),
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const spec of (raw || fallback)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)) {
    if (
      seen.has(spec) ||
      !['google', 'openai', 'azure-apim'].includes(parseModelSpec(spec).provider)
    )
      continue
    seen.add(spec)
    out.push(spec)
  }
  return out
}

/** @deprecated use studioModelSpecs */
export const extraStudioModelSpecs = studioModelSpecs

/** Entitlement is independent of provider credentials and the deployment allowlist. */
export function canUseStudioModel(spec: string, gptEnabled = false): boolean {
  const { provider } = parseModelSpec(spec)
  if (provider === 'google') return true
  if (provider === 'openai' || provider === 'azure-apim') return gptEnabled
  return false
}

/** Explicit picks must be allowed; obsolete saved picks can safely fall back. */
export function selectStudioModel(
  models: PickerModel[],
  requested?: string,
  saved?: string,
): string {
  if (requested !== undefined && !models.some(m => m.spec === requested)) {
    throw Object.assign(new Error('This model is not available for your account'), { status: 403 })
  }
  const spec = requested ?? models.find(m => m.spec === saved)?.spec ?? models[0]?.spec
  if (!spec) throw Object.assign(new Error('No studio models are available'), { status: 503 })
  return spec
}

export function assembleStudioPicker(
  available: Iterable<{ provider: string; id: string; name?: string }>,
  opts: {
    specs: string[]
    defaultSpec?: string
    gptEnabled?: boolean
    azureEnabled?: boolean
    creditMultipliers?: Record<string, number>
  },
): PickerModel[] {
  const bySpec = new Map<string, PickerModel>()
  for (const m of available) {
    const spec = `${m.provider}/${m.id}`
    if (!bySpec.has(spec)) {
      const estimate = estimatedModelCredits(spec, 30, opts.creditMultipliers)
      bySpec.set(spec, {
        spec,
        label: STUDIO_MODEL_LABELS[spec] || m.name || m.id,
        creditMultiplier: modelCreditMultiplier(spec, opts.creditMultipliers),
        estimatedCredits: estimate.total,
        harnessCredits: estimate.harness,
        ...(estimate.video ? { videoCreditsPer30Seconds: estimate.video } : {}),
      })
    }
  }

  const out: PickerModel[] = []
  const seen = new Set<string>()
  const push = (spec: string): boolean => {
    const row = bySpec.get(spec)
    if (!row || seen.has(spec) || !opts.specs.includes(spec)) return false
    if (!canUseStudioModel(spec, opts.gptEnabled)) return false
    seen.add(spec)
    out.push(row)
    return true
  }

  if (opts.defaultSpec) push(opts.defaultSpec)
  for (const spec of opts.specs) push(spec)
  return out
}
