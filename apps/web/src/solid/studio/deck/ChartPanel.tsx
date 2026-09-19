import { X } from 'lucide-solid'
import { createEffect, For, onMount, Show } from 'solid-js'
import type { DeckSession } from './deckSession'

const colorInputValue = (color: string | undefined, fallback: string) =>
  color?.startsWith('#') && color.length === 7 ? color : fallback

/**
 * Chart data popover. Mirrors the last deck_chart message; every edit posts a
 * deck_chart_set patch and the bridge replies with the new deck_chart state.
 */
export function ChartPanel(props: { session: DeckSession; onClose: () => void }) {
  const session = props.session
  const chart = () => session.chart()

  onMount(() => {
    if (!chart()) session.post({ type: 'deck_chart_get' })
  })
  createEffect(() => {
    if (chart() === null) session.post({ type: 'deck_chart_get' })
  })

  const setLabel = (index: number, label: string) => {
    const c = chart()
    if (!c) return
    const labels = c.labels.slice()
    labels[index] = label
    session.setChart({ ...c, labels })
    session.post({ type: 'deck_chart_set', patch: { labels } })
  }
  const setValue = (index: number, value: number) => {
    const c = chart()
    if (!c) return
    const data = c.data.slice()
    data[index] = Number.isFinite(value) ? value : 0
    session.setChart({ ...c, data })
    session.post({ type: 'deck_chart_set', patch: { data } })
  }
  const setColors = (patch: { backgroundColor?: string; borderColor?: string }) => {
    const c = chart()
    if (!c) return
    session.setChart({ ...c, ...patch })
    session.post({ type: 'deck_chart_set', patch })
  }

  return (
    <div class="deck-editor-chart deck-editor-scrollable" role="dialog" aria-label="Chart data">
      <div class="deck-editor-chart-head">
        <span class="deck-editor-chart-title">Chart</span>
        <button
          type="button"
          class="deck-editor-tool"
          title="Done"
          aria-label="Close chart editor"
          onClick={props.onClose}
        >
          <X size={14} />
        </button>
      </div>
      <Show when={chart()} fallback={<p class="deck-editor-chart-empty">Reading chart data…</p>}>
        {c => (
          <>
            <div class="deck-editor-chart-colors">
              <label class="deck-editor-chart-color">
                <span>Fill</span>
                <input
                  type="color"
                  aria-label="Chart fill color"
                  value={colorInputValue(c().backgroundColor, '#3b82f6')}
                  onChange={e => setColors({ backgroundColor: e.currentTarget.value })}
                />
              </label>
              <label class="deck-editor-chart-color">
                <span>Border</span>
                <input
                  type="color"
                  aria-label="Chart border color"
                  value={colorInputValue(c().borderColor, '#2563eb')}
                  onChange={e => setColors({ borderColor: e.currentTarget.value })}
                />
              </label>
            </div>
            <div class="deck-editor-chart-rows deck-editor-scrollable">
              <For each={c().data}>
                {(value, i) => (
                  <div class="deck-editor-chart-row">
                    <input
                      type="text"
                      class="deck-editor-chart-label"
                      aria-label={`Label ${i() + 1}`}
                      placeholder="Label"
                      value={c().labels[i()] ?? ''}
                      onInput={e => setLabel(i(), e.currentTarget.value)}
                    />
                    <input
                      type="number"
                      class="deck-editor-chart-value"
                      aria-label={`Value ${i() + 1}`}
                      value={value}
                      onInput={e => setValue(i(), Number.parseFloat(e.currentTarget.value))}
                    />
                  </div>
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
