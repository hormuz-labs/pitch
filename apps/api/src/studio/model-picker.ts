import { COMPUTE_USD_PER_SEC, CREDIT_USD } from '../projects/rates.js'

/**
 * The composer's model menu is a short allowlist. Google exposes dozens of ids;
 * the product runs Google models and shared gateway/Azure or opt-in OpenAI models below.
 *
 * Override with STUDIO_MODELS (comma-separated `provider/id` specs).
 */

export const GEMINI_38_FLASH_SPEC = 'google/gemini-3.8-flash'
export const GEMINI_4_ARGON_SPEC = 'google/gemini-4-argon'
export const GEMINI_31_PRO_SPEC = 'google/gemini-3.1-pro-preview'

export const GPT_54_SPEC = 'openai/gpt-5.4'
export const GPT_54_MINI_SPEC = 'openai/gpt-5.4-mini'
export const AZURE_GPT_55_SPEC = 'azure-apim/gpt-5.5'
export const AZURE_LUNA_SPEC = 'azure-apim/gpt-5.6-luna'
export const AZURE_TERRA_SPEC = 'azure-apim/gpt-5.6-terra'
export const AZURE_SOL_SPEC = 'azure-apim/gpt-5.6-sol'
export const AZURE_GPT_6_SOL_SPEC = 'azure-apim/gpt-6-sol'
export const AZURE_GPT_61_SOL_SPEC = 'azure-apim/gpt-6.1-sol'
export const AZURE_ASTRA_SPEC = 'azure-apim/gpt-6-astra'

/** Menu order. The first runnable entry is also the studio default. */
export const DEFAULT_STUDIO_MODELS = [
  GEMINI_38_FLASH_SPEC,
  GEMINI_4_ARGON_SPEC,
  GEMINI_31_PRO_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
  AZURE_GPT_55_SPEC,
  AZURE_LUNA_SPEC,
  AZURE_TERRA_SPEC,
  AZURE_SOL_SPEC,
  AZURE_GPT_6_SOL_SPEC,
  AZURE_GPT_61_SOL_SPEC,
  AZURE_ASTRA_SPEC,
] as const

export const DEFAULT_STUDIO_MODEL = GEMINI_38_FLASH_SPEC

/** Relative credit price for a turn, independent of the provider's token price. */
export const DEFAULT_MODEL_CREDIT_MULTIPLIERS: Record<string, number> = {
  [GEMINI_38_FLASH_SPEC]: 1,
  [GEMINI_4_ARGON_SPEC]: 2,
  [GEMINI_31_PRO_SPEC]: 2,
  [GPT_54_MINI_SPEC]: 1,
  [GPT_54_SPEC]: 2,
  [AZURE_GPT_55_SPEC]: 1.5,
  [AZURE_LUNA_SPEC]: 0.75,
  [AZURE_TERRA_SPEC]: 1,
  [AZURE_SOL_SPEC]: 1,
  [AZURE_GPT_6_SOL_SPEC]: 1,
  [AZURE_GPT_61_SOL_SPEC]: 1,
  [AZURE_ASTRA_SPEC]: 2,
}

/** Display names; the public pricing table quotes these (tests/model-credit-rates.test.ts). */
export const STUDIO_MODEL_LABELS: Record<string, string> = {
  [GEMINI_38_FLASH_SPEC]: 'Gemini 3.8 Flash',
  [GEMINI_4_ARGON_SPEC]: 'Gemini 4 Argon',
  [GEMINI_31_PRO_SPEC]: 'Gemini 3.1 Pro',
  [GPT_54_SPEC]: 'GPT-5.4',
  [GPT_54_MINI_SPEC]: 'GPT-5.4 mini',
  [AZURE_GPT_55_SPEC]: 'GPT-5.5',
  [AZURE_LUNA_SPEC]: 'Luna',
  [AZURE_TERRA_SPEC]: 'Terra',
  [AZURE_SOL_SPEC]: 'Sol',
  [AZURE_GPT_6_SOL_SPEC]: 'GPT-6 Sol',
  [AZURE_GPT_61_SOL_SPEC]: 'GPT-6.1 Sol',
  [AZURE_ASTRA_SPEC]: 'Astra',
}

/** One-line descriptions for the public pricing table. */
export const STUDIO_MODEL_DETAILS: Record<string, string> = {
  [GEMINI_38_FLASH_SPEC]: 'Fast multimodal production',
  [GEMINI_4_ARGON_SPEC]: 'Frontier multimodal reasoning and production',
  [GEMINI_31_PRO_SPEC]: 'Complex multimodal projects',
  [GPT_54_MINI_SPEC]: 'Fast everyday production',
  [GPT_54_SPEC]: 'Complex planning and execution',
  [AZURE_GPT_55_SPEC]: 'Deep planning and complex production',
  [AZURE_LUNA_SPEC]: 'Fast drafts and lightweight edits',
  [AZURE_TERRA_SPEC]: 'Everyday production work',
  [AZURE_SOL_SPEC]: 'Advanced production work',
  [AZURE_GPT_6_SOL_SPEC]: 'Next-generation everyday production',
  [AZURE_GPT_61_SOL_SPEC]: 'Newest advanced production work',
  [AZURE_ASTRA_SPEC]: 'Highest-capability production work',
}

export interface PublicModelRate {
  spec: string
  name: string
  detail: string
  /** Typical credits for one generation. */
  credits: number
  unit: 'typical generation'
  /** 'all' runs on every account; 'request' needs model access switched on. */
  access: 'all' | 'request'
}

/**
 * The pricing page's model table, computed from the same allowlist, token
 * prices, multipliers and margin the studio bills with (env overrides
 * included), so a price change here is a price change there. `prices` comes
 * from the model runtime (session.ts studioModelPrices); a model missing from
 * it is quoted at FALLBACK_TOKEN_PRICE.
 */
export function publicModelRates(
  specs = studioModelSpecs(),
  prices: Record<string, TokenPrice | undefined> = {},
  access: StudioModelAccess = {},
): PublicModelRate[] {
  return specs.map(spec => {
    return {
      spec,
      name: STUDIO_MODEL_LABELS[spec] ?? parseModelSpec(spec).id,
      detail: STUDIO_MODEL_DETAILS[spec] ?? '',
      credits: estimatedModelCredits(spec, { price: prices[spec] }).total,
      unit: 'typical generation',
      access: canUseStudioModel(spec, false, access) ? 'all' : 'request',
    }
  })
}

export interface PickerModel {
  spec: string
  label: string
  creditMultiplier: number
  estimatedCredits: number
  harnessCredits: number
}

/** A model's token price in USD per million tokens, as the runtime bills it. */
export interface TokenPrice {
  input: number
  output: number
}

/**
 * What one typical turn uses: tokens (priced per model) plus machine time (the
 * same on every model). 50k in / 12.5k out is $0.25 at a $2/$12 model, the
 * reference the older flat 100-credit base assumed. Calibrate it from real
 * projects with STUDIO_TYPICAL_TURN, e.g. {"inputTokens":80000}.
 */
export interface TypicalTurn {
  inputTokens: number
  outputTokens: number
  computeSeconds: number
}

export const DEFAULT_TYPICAL_TURN: TypicalTurn = {
  inputTokens: 50_000,
  outputTokens: 12_500,
  computeSeconds: 30,
}

/** Quoted for a model the runtime has no price for, so it is never shown as free. */
export const FALLBACK_TOKEN_PRICE: TokenPrice = { input: 2, output: 12 }

export function typicalTurn(raw = process.env.STUDIO_TYPICAL_TURN): TypicalTurn {
  if (!raw?.trim()) return DEFAULT_TYPICAL_TURN
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const turn = { ...DEFAULT_TYPICAL_TURN }
    for (const key of Object.keys(turn) as (keyof TypicalTurn)[]) {
      const value = parsed[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) turn[key] = value
    }
    return turn
  } catch {
    return DEFAULT_TYPICAL_TURN
  }
}

/** A runtime model's `cost` (per million tokens) as a TokenPrice, if it has one. */
export function tokenPriceOf(model: { cost?: { input?: unknown; output?: unknown } } | undefined) {
  const input = Number(model?.cost?.input)
  const output = Number(model?.cost?.output)
  return Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0
    ? { input, output }
    : undefined
}

export const DEFAULT_PLATFORM_MARGIN = 1.25
export function platformMargin(raw = process.env.STUDIO_PLATFORM_MARGIN): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_PLATFORM_MARGIN
}

/**
 * Typical credits for one turn on `spec`, priced the way billing prices it
 * (projects/usage.ts): the turn's tokens at this model's real token price and
 * credit rate, plus machine time that costs the same on every model, times
 * the margin. The built-in skill rate and generated footage are not included:
 * they depend on what the turn does, not on the model. An estimate, never a
 * charge or a gate.
 */
export function estimatedModelCredits(
  spec: string,
  opts: {
    price?: TokenPrice
    multipliers?: Record<string, number>
    turn?: TypicalTurn
  } = {},
): { total: number; harness: number } {
  const price = opts.price ?? FALLBACK_TOKEN_PRICE
  const turn = opts.turn ?? typicalTurn()
  const tokenUsd = (turn.inputTokens * price.input + turn.outputTokens * price.output) / 1_000_000
  const billableUsd =
    (tokenUsd * modelCreditMultiplier(spec, opts.multipliers ?? modelCreditMultipliers()) +
      turn.computeSeconds * COMPUTE_USD_PER_SEC) *
    platformMargin()
  // Rounded to a cent of credit first so float noise cannot tip a whole credit.
  const credits = Math.ceil(Math.round((billableUsd / CREDIT_USD) * 100) / 100)
  return { total: credits, harness: credits }
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

export type StudioModelTier = 'low' | 'medium' | 'high' | 'max' | 'ultra'

export interface StudioTierConfig {
  tier: StudioModelTier
  label: 'Low' | 'Medium' | 'High' | 'Max' | 'Ultra'
  description: string
  /** Ordered primary → fallback models for this tier. */
  models: readonly string[]
}

export const STUDIO_MODEL_TIERS: readonly StudioTierConfig[] = [
  {
    tier: 'low',
    label: 'Low',
    description: 'Fast, economical drafts and lightweight edits.',
    models: [AZURE_LUNA_SPEC, GEMINI_38_FLASH_SPEC, GPT_54_MINI_SPEC],
  },
  {
    tier: 'medium',
    label: 'Medium',
    description: 'Balanced speed and quality for everyday production.',
    models: [GEMINI_38_FLASH_SPEC, AZURE_TERRA_SPEC, GPT_54_MINI_SPEC],
  },
  {
    tier: 'high',
    label: 'High',
    description: 'Detailed planning for complex, multi-step projects.',
    models: [GEMINI_4_ARGON_SPEC, AZURE_TERRA_SPEC, GPT_54_SPEC, GEMINI_38_FLASH_SPEC],
  },
  {
    tier: 'max',
    label: 'Max',
    description: 'Advanced reasoning and polished video production.',
    models: [
      AZURE_GPT_61_SOL_SPEC,
      AZURE_GPT_6_SOL_SPEC,
      AZURE_SOL_SPEC,
      AZURE_GPT_55_SPEC,
      GEMINI_4_ARGON_SPEC,
      GPT_54_SPEC,
    ],
  },
  {
    tier: 'ultra',
    label: 'Ultra',
    description: 'Maximum capability for demanding films and demos.',
    models: [AZURE_ASTRA_SPEC, AZURE_GPT_55_SPEC, AZURE_GPT_61_SOL_SPEC, GEMINI_4_ARGON_SPEC],
  },
]

const PRIMARY_TIER_BY_SPEC: Record<string, StudioModelTier> = {
  [AZURE_LUNA_SPEC]: 'low',
  [GEMINI_38_FLASH_SPEC]: 'medium',
  [GPT_54_MINI_SPEC]: 'medium',
  [AZURE_TERRA_SPEC]: 'medium',
  [GEMINI_4_ARGON_SPEC]: 'high',
  [GEMINI_31_PRO_SPEC]: 'high',
  [GPT_54_SPEC]: 'high',
  [AZURE_GPT_55_SPEC]: 'max',
  [AZURE_SOL_SPEC]: 'max',
  [AZURE_GPT_6_SOL_SPEC]: 'max',
  [AZURE_GPT_61_SOL_SPEC]: 'max',
  [AZURE_ASTRA_SPEC]: 'ultra',
}

export function tierForModelSpec(spec: string): StudioModelTier {
  const normalized = spec.trim().toLowerCase()
  if (['low', 'medium', 'high', 'max', 'ultra'].includes(normalized)) {
    return normalized as StudioModelTier
  }
  return PRIMARY_TIER_BY_SPEC[spec] ?? 'high'
}

export function resolveTierModelSpec(
  tier: StudioModelTier,
  availableSpecs: Iterable<string>,
): string | null {
  const set = new Set(availableSpecs)
  const config = STUDIO_MODEL_TIERS.find(item => item.tier === tier)
  if (!config) return null
  for (const candidate of config.models) {
    if (set.has(candidate)) return candidate
  }
  return null
}

/**
 * Primary + automatic fallback within the same tier: when `failedSpec` hits a
 * rate limit, timeout or provider error, return the next runnable model in that
 * tier's pool that has not been tried yet in this turn.
 */
export function fallbackStudioModel(
  failedSpec: string,
  runnableSpecs: Iterable<string>,
  triedSpecs: ReadonlySet<string> = new Set(),
): string | null {
  const runnable = new Set(runnableSpecs)
  const tier = tierForModelSpec(failedSpec)
  const config = STUDIO_MODEL_TIERS.find(item => item.tier === tier)
  if (!config) return null
  for (const candidate of config.models) {
    if (candidate === failedSpec || triedSpecs.has(candidate)) continue
    if (runnable.has(candidate)) return candidate
  }
  return null
}

export interface StudioModelAccess {
  bifrostEnabled?: boolean
  azureEnabled?: boolean
}

/** Shared gateway/Azure access is automatic; direct OpenAI retains the account gate. */
export function canUseStudioModel(
  spec: string,
  gptEnabled = false,
  access: StudioModelAccess = {},
): boolean {
  const { provider } = parseModelSpec(spec)
  if (provider === 'google') return true
  if (provider === 'azure-apim' && access.azureEnabled) return true
  if (['openai', 'azure-apim'].includes(provider) && access.bifrostEnabled) return true
  if (provider === 'openai' || provider === 'azure-apim') return gptEnabled
  return false
}

/** Explicit picks must be allowed; obsolete saved picks can safely fall back. */
export function selectStudioModel(
  models: PickerModel[],
  requested?: string,
  saved?: string,
): string {
  const availableSpecs = models.map(m => m.spec)
  const resolveInput = (value?: string): string | undefined => {
    if (value === undefined) return undefined
    const lower = value.trim().toLowerCase()
    if (['low', 'medium', 'high', 'max', 'ultra'].includes(lower)) {
      return resolveTierModelSpec(lower as StudioModelTier, availableSpecs) ?? undefined
    }
    return value
  }
  const resolvedRequested = resolveInput(requested)
  if (
    requested !== undefined &&
    (!resolvedRequested || !models.some(m => m.spec === resolvedRequested))
  ) {
    throw Object.assign(new Error('This model is not available for your account'), { status: 403 })
  }
  const resolvedSaved = resolveInput(saved)
  const spec =
    resolvedRequested ?? models.find(m => m.spec === resolvedSaved)?.spec ?? models[0]?.spec
  if (!spec) throw Object.assign(new Error('No studio models are available'), { status: 503 })
  return spec
}

export function assembleStudioPicker(
  available: Iterable<{
    provider: string
    id: string
    name?: string
    cost?: { input?: unknown; output?: unknown }
  }>,
  opts: {
    specs: string[]
    defaultSpec?: string
    gptEnabled?: boolean
    bifrostEnabled?: boolean
    azureEnabled?: boolean
    creditMultipliers?: Record<string, number>
  },
): PickerModel[] {
  const bySpec = new Map<string, PickerModel>()
  for (const m of available) {
    const spec = `${m.provider}/${m.id}`
    if (!bySpec.has(spec)) {
      const estimate = estimatedModelCredits(spec, {
        price: tokenPriceOf(m),
        multipliers: opts.creditMultipliers,
      })
      bySpec.set(spec, {
        spec,
        label: STUDIO_MODEL_LABELS[spec] || m.name || m.id,
        creditMultiplier: modelCreditMultiplier(spec, opts.creditMultipliers),
        estimatedCredits: estimate.total,
        harnessCredits: estimate.harness,
      })
    }
  }

  const out: PickerModel[] = []
  const seen = new Set<string>()
  const push = (spec: string): boolean => {
    const row = bySpec.get(spec)
    if (!row || seen.has(spec) || !opts.specs.includes(spec)) return false
    if (!canUseStudioModel(spec, opts.gptEnabled, opts)) return false
    seen.add(spec)
    out.push(row)
    return true
  }

  if (opts.defaultSpec) push(opts.defaultSpec)
  for (const spec of opts.specs) push(spec)
  return out
}
