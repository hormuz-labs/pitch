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

/** Menu order. The first runnable entry is also the studio default. */
export const DEFAULT_STUDIO_MODELS = [
  GEMINI_38_FLASH_SPEC,
  GEMINI_31_PRO_SPEC,
  GEMMA_4_31B_SPEC,
  GEMMA_4_26B_SPEC,
  GPT_54_MINI_SPEC,
  GPT_54_SPEC,
] as const

export const DEFAULT_STUDIO_MODEL = GEMINI_38_FLASH_SPEC

const LABELS: Record<string, string> = {
  [GEMINI_38_FLASH_SPEC]: 'Gemini 3.8 Flash',
  [GEMINI_31_PRO_SPEC]: 'Gemini 3.1 Pro',
  [GEMMA_4_31B_SPEC]: 'Gemma 4 31B',
  [GEMMA_4_26B_SPEC]: 'Gemma 4 26B',
  [GPT_54_SPEC]: 'GPT-5.4',
  [GPT_54_MINI_SPEC]: 'GPT-5.4 mini',
}

export interface PickerModel {
  spec: string
  label: string
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
    if (seen.has(spec) || !['google', 'openai'].includes(parseModelSpec(spec).provider)) continue
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
  return provider === 'google' || (provider === 'openai' && gptEnabled)
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
  opts: { specs: string[]; defaultSpec?: string; gptEnabled?: boolean },
): PickerModel[] {
  const bySpec = new Map<string, PickerModel>()
  for (const m of available) {
    const spec = `${m.provider}/${m.id}`
    if (!bySpec.has(spec)) {
      bySpec.set(spec, { spec, label: LABELS[spec] || m.name || m.id })
    }
  }

  const out: PickerModel[] = []
  const seen = new Set<string>()
  const push = (spec: string): boolean => {
    const row = bySpec.get(spec)
    if (
      !row ||
      seen.has(spec) ||
      !opts.specs.includes(spec) ||
      !canUseStudioModel(spec, opts.gptEnabled)
    )
      return false
    seen.add(spec)
    out.push(row)
    return true
  }

  if (opts.defaultSpec) push(opts.defaultSpec)
  for (const spec of opts.specs) push(spec)
  return out
}
