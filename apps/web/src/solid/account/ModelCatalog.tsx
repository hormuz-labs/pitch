import { Check } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'

export interface CatalogModel {
  spec: string
  label: string
  estimatedCredits: number
}

export type ModelTier = 'low' | 'medium' | 'high' | 'max' | 'ultra'

export interface TierDefinition {
  tier: ModelTier
  label: 'Low' | 'Medium' | 'High' | 'Max' | 'Ultra'
  description: string
  candidates: readonly string[]
}

export const MODEL_TIERS: readonly TierDefinition[] = [
  {
    tier: 'low',
    label: 'Low',
    description: 'Fast, economical drafts and lightweight edits.',
    candidates: ['azure-apim/gpt-5.6-luna', 'openai/gpt-5.4-mini', 'google/gemini-3.8-flash'],
  },
  {
    tier: 'medium',
    label: 'Medium',
    description: 'Balanced speed and quality for everyday production.',
    candidates: ['azure-apim/gpt-5.6-terra', 'openai/gpt-5.4-mini', 'google/gemini-3.8-flash'],
  },
  {
    tier: 'high',
    label: 'High',
    description: 'Detailed planning for complex, multi-step projects.',
    candidates: [
      'google/gemini-3.8-flash',
      'azure-apim/gpt-5.5',
      'openai/gpt-5.4',
      'azure-apim/gpt-5.6-terra',
      'google/gemini-3.1-pro-preview',
    ],
  },
  {
    tier: 'max',
    label: 'Max',
    description: 'Advanced reasoning and polished video production.',
    candidates: [
      'azure-apim/gpt-6.1-sol',
      'azure-apim/gpt-6-sol',
      'azure-apim/gpt-5.6-sol',
      'azure-apim/gpt-5.5',
      'openai/gpt-5.4',
      'google/gemini-3.8-flash',
    ],
  },
  {
    tier: 'ultra',
    label: 'Ultra',
    description: 'Maximum capability for demanding films and demos.',
    candidates: [
      'azure-apim/gpt-6-astra',
      'azure-apim/gpt-5.5',
      'azure-apim/gpt-6.1-sol',
      'google/gemini-3.8-flash',
    ],
  },
]

const SPEC_DEFAULT_TIER: Record<string, ModelTier> = {
  'azure-apim/gpt-5.6-luna': 'low',
  'openai/gpt-5.4-mini': 'medium',
  'azure-apim/gpt-5.6-terra': 'medium',
  'google/gemini-3.8-flash': 'high',
  'google/gemini-3.1-pro-preview': 'high',
  'openai/gpt-5.4': 'high',
  'azure-apim/gpt-5.5': 'max',
  'azure-apim/gpt-5.6-sol': 'max',
  'azure-apim/gpt-6-sol': 'max',
  'azure-apim/gpt-6.1-sol': 'max',
  'azure-apim/gpt-6-astra': 'ultra',
}

export interface PackagedTierModel {
  tier: ModelTier
  label: 'Low' | 'Medium' | 'High' | 'Max' | 'Ultra'
  description: string
  spec: string
  estimatedCredits: number
}

const [lastPickedTier, setLastPickedTier] = createSignal<ModelTier | null>(null)

export function packageModelTiers(models: readonly CatalogModel[]): PackagedTierModel[] {
  if (!models.length) return []
  const bySpec = new Map(models.map(model => [model.spec, model]))
  const claimed = new Set<string>()
  const assigned = new Map<ModelTier, CatalogModel>()

  // Pass 1: assign each tier its highest-priority unclaimed candidate.
  for (const def of MODEL_TIERS) {
    const unclaimed = def.candidates.find(spec => bySpec.has(spec) && !claimed.has(spec))
    if (unclaimed) {
      const chosen = bySpec.get(unclaimed)!
      claimed.add(chosen.spec)
      assigned.set(def.tier, chosen)
    }
  }

  // Pass 2: for any tier whose primary wasn't in `models`, fall back to any
  // available candidate in that tier's pool, or the closest model in `models`.
  const sorted = [...models].sort((a, b) => a.estimatedCredits - b.estimatedCredits)
  return MODEL_TIERS.map((def, index) => {
    const direct = assigned.get(def.tier)
    if (direct) {
      return {
        tier: def.tier,
        label: def.label,
        description: def.description,
        spec: direct.spec,
        estimatedCredits: direct.estimatedCredits,
      }
    }
    const candidateSpec = def.candidates.find(spec => bySpec.has(spec))
    const fallback =
      (candidateSpec ? bySpec.get(candidateSpec) : undefined) ??
      sorted[Math.min(index, sorted.length - 1)] ??
      models[0]
    return {
      tier: def.tier,
      label: def.label,
      description: def.description,
      spec: fallback.spec,
      estimatedCredits: fallback.estimatedCredits,
    }
  })
}

export function tierLabelForModel(
  models: readonly CatalogModel[],
  selected?: string | null,
): string {
  const packaged = packageModelTiers(models)
  const picked = lastPickedTier()
  if (picked) {
    const pickedRow = packaged.find(item => item.tier === picked)
    if (pickedRow && (!selected || pickedRow.spec === selected || selected === picked)) {
      return pickedRow.label
    }
  }
  if (!selected) return 'High'
  const byTierId = MODEL_TIERS.find(item => item.tier === selected)
  if (byTierId) return byTierId.label
  const mappedTier = SPEC_DEFAULT_TIER[selected]
  if (mappedTier) {
    const def = MODEL_TIERS.find(item => item.tier === mappedTier)
    if (def) return def.label
  }
  const direct = packaged.find(item => item.spec === selected)
  if (direct) return direct.label
  return 'High'
}

export function ModelCatalog(props: {
  models: CatalogModel[]
  selected?: string | null
  onSelect: (spec: string) => void
  itemRole?: 'menuitemradio' | 'option'
}) {
  const tiers = createMemo(() => packageModelTiers(props.models))
  const activeTier = createMemo<ModelTier>(() => {
    const list = tiers()
    const picked = lastPickedTier()
    if (picked) {
      const pickedRow = list.find(item => item.tier === picked)
      if (
        pickedRow &&
        (!props.selected || pickedRow.spec === props.selected || props.selected === picked)
      ) {
        return picked
      }
    }
    if (!props.selected) return 'high'
    if (MODEL_TIERS.some(item => item.tier === props.selected)) {
      return props.selected as ModelTier
    }
    const mapped = SPEC_DEFAULT_TIER[props.selected]
    if (mapped) return mapped
    return list.find(item => item.spec === props.selected)?.tier ?? 'high'
  })

  return (
    <div class="model-catalog">
      <div class="model-catalog-scroll">
        <section class="model-catalog-group">
          <h3>Capability level</h3>
          <Show
            when={tiers().length}
            fallback={<p class="model-catalog-empty">No models available.</p>}
          >
            <For each={tiers()}>
              {item => {
                const selected = () => activeTier() === item.tier
                return (
                  <button
                    type="button"
                    class="model-catalog-row"
                    role={props.itemRole ?? 'menuitemradio'}
                    aria-checked={selected()}
                    aria-selected={selected()}
                    onClick={() => {
                      setLastPickedTier(item.tier)
                      props.onSelect(item.spec)
                    }}
                  >
                    <span class="model-catalog-copy">
                      <span class="model-catalog-name">
                        <strong>{item.label}</strong>
                        <span class="model-catalog-cost">
                          {item.estimatedCredits.toLocaleString()} credits
                        </span>
                      </span>
                      <small>{item.description}</small>
                    </span>
                    <Show when={selected()}>
                      <Check class="model-catalog-check" size={17} />
                    </Show>
                  </button>
                )
              }}
            </For>
          </Show>
        </section>
      </div>
    </div>
  )
}
