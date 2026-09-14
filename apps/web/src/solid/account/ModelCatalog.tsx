import { Check, Search } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'

export interface CatalogModel {
  spec: string
  label: string
  estimatedCredits: number
}

type Filter = 'All' | 'Fast' | 'Low cost' | 'Premium' | 'Open-weight'

const filters: Filter[] = ['All', 'Fast', 'Low cost', 'Premium', 'Open-weight']

const description = (model: CatalogModel) => {
  const name = model.label.toLowerCase()
  if (name.includes('astra')) return 'Highest-capability reasoning for demanding productions.'
  if (name.includes('sol')) return 'Advanced planning and polished video production.'
  if (name.includes('terra')) return 'Balanced quality and speed for everyday production.'
  if (name.includes('luna')) return 'Fast, economical drafts and lightweight edits.'
  if (name.includes('gemma')) return 'Open-weight creative model for flexible production.'
  if (name.includes('pro') || name === 'gpt-5.5' || name === 'gpt-5.4')
    return 'Detailed planning for complex, multi-step projects.'
  return 'Quick multimodal drafts and everyday projects.'
}

const matchesFilter = (model: CatalogModel, filter: Filter) => {
  const name = model.label.toLowerCase()
  if (filter === 'All') return true
  if (filter === 'Fast') return /flash|mini|luna|terra/.test(name)
  if (filter === 'Low cost') return model.estimatedCredits <= 125
  if (filter === 'Premium') return /astra|sol|pro|gpt-5\.5|gpt-5\.4$/.test(name)
  return name.includes('gemma')
}

export function ModelCatalog(props: {
  models: CatalogModel[]
  selected?: string | null
  onSelect: (spec: string) => void
  itemRole?: 'menuitemradio' | 'option'
}) {
  const [query, setQuery] = createSignal('')
  const [filter, setFilter] = createSignal<Filter>('All')
  const selected = () => props.models.find(model => model.spec === props.selected)
  const visible = createMemo(() => {
    const search = query().trim().toLowerCase()
    return props.models.filter(
      model =>
        matchesFilter(model, filter()) &&
        (!search || `${model.label} ${description(model)}`.toLowerCase().includes(search)),
    )
  })
  const row = (model: CatalogModel) => (
    <button
      type="button"
      class="model-catalog-row"
      role={props.itemRole ?? 'menuitemradio'}
      aria-checked={model.spec === props.selected}
      aria-selected={model.spec === props.selected}
      onClick={() => props.onSelect(model.spec)}
    >
      <span class="model-catalog-copy">
        <span class="model-catalog-name">
          <strong>{model.label}</strong>
          <span class="model-catalog-cost">{model.estimatedCredits.toLocaleString()} credits</span>
        </span>
        <small>{description(model)}</small>
      </span>
      <Show when={model.spec === props.selected}>
        <Check class="model-catalog-check" size={17} />
      </Show>
    </button>
  )

  return (
    <div class="model-catalog">
      <label class="model-catalog-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search all models..."
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
        />
      </label>
      <div class="model-catalog-filters" aria-label="Filter models">
        <For each={filters}>
          {value => (
            <button
              type="button"
              classList={{ 'is-active': filter() === value }}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          )}
        </For>
      </div>
      <div class="model-catalog-scroll">
        <Show when={!query() && filter() === 'All' && selected()}>
          {model => (
            <section class="model-catalog-group">
              <h3>Recently used</h3>
              {row(model())}
            </section>
          )}
        </Show>
        <section class="model-catalog-group">
          <h3>{query() || filter() !== 'All' ? 'Results' : 'All models'}</h3>
          <Show
            when={visible().length}
            fallback={<p class="model-catalog-empty">No models found.</p>}
          >
            <For each={visible()}>{row}</For>
          </Show>
        </section>
      </div>
    </div>
  )
}
