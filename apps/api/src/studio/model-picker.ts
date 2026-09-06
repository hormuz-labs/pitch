/**
 * The composer's model menu is a short allowlist. OpenRouter and Google both
 * expose dozens of ids; the product only runs the four below.
 *
 * Override with STUDIO_MODELS (comma-separated `provider/id` specs).
 */

export const GLM_FLASH_SPEC = 'openrouter/z-ai/glm-5.3-flash'
export const KIMI_SPEC = 'openrouter/moonshotai/kimi-k3'
export const GEMINI_31_PRO_SPEC = 'google/gemini-3.1-pro-preview'
export const GEMINI_38_FLASH_SPEC = 'google/gemini-3.8-flash'

/** Menu order. The first runnable entry is also the studio default. */
export const DEFAULT_STUDIO_MODELS = [
  KIMI_SPEC,
  GLM_FLASH_SPEC,
  GEMINI_31_PRO_SPEC,
  GEMINI_38_FLASH_SPEC,
] as const

export const DEFAULT_STUDIO_MODEL = GEMINI_38_FLASH_SPEC

const LABELS: Record<string, string> = {
  [KIMI_SPEC]: 'Kimi K3',
  [GLM_FLASH_SPEC]: 'GLM 5.3 Flash',
  [GEMINI_31_PRO_SPEC]: 'Gemini 3.1 Pro',
  [GEMINI_38_FLASH_SPEC]: 'Gemini 3.8 Flash',
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
    if (seen.has(spec)) continue
    seen.add(spec)
    out.push(spec)
  }
  return out
}

/** @deprecated use studioModelSpecs */
export const extraStudioModelSpecs = studioModelSpecs

export function assembleStudioPicker(
  available: Iterable<{ provider: string; id: string; name?: string }>,
  opts: { specs: string[]; defaultSpec?: string },
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
    if (!row || seen.has(spec)) return false
    seen.add(spec)
    out.push(row)
    return true
  }

  if (opts.defaultSpec) push(opts.defaultSpec)
  for (const spec of opts.specs) push(spec)
  return out
}
