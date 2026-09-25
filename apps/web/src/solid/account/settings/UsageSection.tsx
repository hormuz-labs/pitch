import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../../../lib/api'
import { formatCredits, PLANS } from '../../../lib/plans'
import { useAuth } from '../../core/auth'

interface DayUsage {
  date: string
  studio: number
  api: number
}
interface Summary {
  balance: number
  activeSubscription: null | { planKey: string }
  transactions: Array<{ id: string; delta: number; description: string; createdAt: string }>
}

const RANGE_DAYS = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 } as const
type RangeKey = keyof typeof RANGE_DAYS

const toISODate = (d: Date) => d.toISOString().slice(0, 10)
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

export function UsageSection() {
  const { getToken } = useAuth()
  const [range, setRange] = createSignal<RangeKey>('30D')
  const [from, setFrom] = createSignal(toISODate(new Date(Date.now() - 29 * 86_400_000)))
  const [to, setTo] = createSignal(toISODate(new Date()))

  const applyRange = (key: RangeKey) => {
    setRange(key)
    setTo(toISODate(new Date()))
    setFrom(toISODate(new Date(Date.now() - (RANGE_DAYS[key] - 1) * 86_400_000)))
  }

  const [days] = createResource(
    () => `${from()}|${to()}`,
    async () => {
      const token = await getToken()
      if (!token) return [] as DayUsage[]
      return api.get<DayUsage[]>(`/credits/usage/daily?from=${from()}&to=${to()}`, token)
    },
  )
  const [summary] = createResource(async () => {
    const token = await getToken()
    if (!token) return null
    return api.get<Summary>('/credits', token)
  })

  const maxTotal = createMemo(() => {
    const rows = days()
    if (!rows?.length) return 0
    return Math.max(1, ...rows.map(row => row.studio + row.api))
  })
  const rangeTotal = createMemo(() => {
    const rows = days()
    if (!rows?.length) return { studio: 0, api: 0 }
    return rows.reduce(
      (acc, row) => ({ studio: acc.studio + row.studio, api: acc.api + row.api }),
      { studio: 0, api: 0 },
    )
  })
  const activity = createMemo(() =>
    (summary()?.transactions ?? []).filter(
      tx => tx.createdAt.slice(0, 10) >= from() && tx.createdAt.slice(0, 10) <= to(),
    ),
  )
  const totalUsed = createMemo(() => rangeTotal().studio + rangeTotal().api)
  const dateTicks = createMemo(() => {
    const rows = days() ?? []
    if (!rows.length) return []
    const indexes = [
      0,
      Math.floor((rows.length - 1) / 3),
      Math.floor(((rows.length - 1) * 2) / 3),
      rows.length - 1,
    ]
    return [...new Set(indexes)].map(index => rows[index])
  })

  return (
    <>
      <section class="settings-card settings-usage-summary">
        <div>
          <span>Plan</span>
          <strong>
            {(() => {
              const key = summary()?.activeSubscription?.planKey.replace('_annual', '')
              return key ? (PLANS.find(plan => plan.key === key)?.name ?? key) : 'No active plan'
            })()}
          </strong>
        </div>
        <div>
          <span>Available</span>
          <strong>{formatCredits(summary()?.balance ?? 0)} credits</strong>
        </div>
      </section>

      <p class="settings-usage-note">Credit usage is grouped by UTC day.</p>

      <section class="settings-card settings-usage-card">
        <div class="settings-usage-controls">
          <div>
            <h4>Daily credit usage</h4>
            <p>Pick any date range. Every UTC day remains its own bar.</p>
          </div>
          <div class="settings-billing-cycle" role="tablist">
            <For each={Object.keys(RANGE_DAYS) as RangeKey[]}>
              {key => (
                <button
                  type="button"
                  class={range() === key ? 'is-active' : ''}
                  onClick={() => applyRange(key)}
                >
                  {key}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="settings-usage-daterange">
          <label>
            From
            <input
              type="date"
              value={from()}
              onInput={event => setFrom(event.currentTarget.value)}
            />
          </label>
          <label>
            To
            <input type="date" value={to()} onInput={event => setTo(event.currentTarget.value)} />
          </label>
        </div>
        <div class="settings-chart-summary">
          <span>
            <strong>
              {shortDate(from())} – {shortDate(to())}
            </strong>
            <small>{formatCredits(totalUsed())} credits used in this range</small>
          </span>
          <span class="settings-chart-summary__totals">
            <b>
              <i class="is-studio" />
              Studio {formatCredits(rangeTotal().studio)}
            </b>
            <b>
              <i class="is-api" />
              API {formatCredits(rangeTotal().api)}
            </b>
          </span>
        </div>
        <div class="settings-chart-frame">
          <div class="settings-chart" role="img" aria-label="Daily credit usage">
            <For each={days()}>
              {day => {
                const total = day.studio + day.api
                return (
                  <div
                    class="settings-chart__col"
                    title={`${shortDate(day.date)}: ${formatCredits(total)} credits`}
                  >
                    <div
                      class="settings-chart__bar"
                      style={{ height: `${total ? Math.max(4, (total / maxTotal()) * 100) : 0}%` }}
                    >
                      <Show when={day.api > 0}>
                        <span
                          class="settings-chart__segment settings-chart__segment--api"
                          style={{ height: `${(day.api / Math.max(1, total)) * 100}%` }}
                        />
                      </Show>
                      <Show when={day.studio > 0}>
                        <span
                          class="settings-chart__segment settings-chart__segment--studio"
                          style={{ height: `${(day.studio / Math.max(1, total)) * 100}%` }}
                        />
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
            <Show when={days.loading}>
              <span class="settings-chart-empty">Loading usage…</span>
            </Show>
            <Show when={!days.loading && totalUsed() === 0}>
              <span class="settings-chart-empty">No credits used in this range</span>
            </Show>
          </div>
          <div class="settings-chart__dates">
            <For each={dateTicks()}>{day => <span>{shortDate(day.date)}</span>}</For>
          </div>
        </div>
        <div class="settings-chart__footer">
          <div class="settings-chart__legend">
            <span>
              <i class="is-studio" />
              Studio
            </span>
            <span>
              <i class="is-api" />
              API
            </span>
          </div>
          <small>{days()?.length ?? 0} daily bars · UTC</small>
        </div>
      </section>

      <section class="settings-card settings-activity">
        <h4>Exact credit activity</h4>
        <Show
          when={activity().length}
          fallback={<p class="settings-empty">No activity in this range.</p>}
        >
          <For each={activity()}>
            {tx => (
              <div>
                <span>
                  <strong>{tx.description}</strong>
                  <small>{new Date(tx.createdAt).toLocaleString()}</small>
                </span>
                <b class={tx.delta > 0 ? 'is-positive' : ''}>
                  {tx.delta > 0 ? '+' : ''}
                  {formatCredits(tx.delta)}
                </b>
              </div>
            )}
          </For>
        </Show>
      </section>
    </>
  )
}
