import { useNavigate } from '@solidjs/router'
import type { LucideProps } from 'lucide-solid'
import {
  BarChart3,
  CircleHelp,
  Code,
  Coins,
  CreditCard,
  ExternalLink,
  Gift,
  KeyRound,
  Mail,
  MessageCircle,
  User,
  Webhook,
  X,
} from 'lucide-solid'
import { type Component, createEffect, createSignal, For, onMount, Show } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { useAuth, useClerk, useUser } from '../core/auth'
import { ApiKeysView } from './ApiKeysView'
import { McpGuide, McpSettingsPanel } from './McpPanels'
import { Select, Switch } from './primitives'
import '../../styles/settings-modal.css'

interface Summary {
  balance: number
  activeSubscription: null | {
    planKey: string
    status: string
    creditsPerCycle: number
    currentPeriodStart: string
    currentPeriodEnd: string
  }
  transactions: Array<{
    id: string
    delta: number
    type: string
    description: string
    createdAt: string
  }>
  subscriptions?: any[]
  topUps?: any[]
  usage?: {
    usd: number
    projects: Array<{ id: string; title: string; creditsCharged: number; updatedAt: string }>
  }
}
type Tab = 'profile' | 'billing' | 'api' | 'webhooks'
const tabs = [
  { value: 'profile', label: 'My Profile' },
  { value: 'billing', label: 'Billing & Credits' },
  { value: 'api', label: 'API & MCP' },
  { value: 'webhooks', label: 'Webhooks' },
]

export function SettingsView() {
  const { getToken } = useAuth()
  const clerk = useClerk()
  const { userAccessor: user } = useUser()
  const [tab, setTab] = createSignal<Tab>('profile')
  const [summary, setSummary] = createSignal<Summary | null>(null)
  const [loading, setLoading] = createSignal(false)
  const load = async () => {
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setSummary(await response.json())
    } finally {
      setLoading(false)
    }
  }
  onMount(() => void load())
  return (
    <div class="settings-page absolute inset-0 flex h-full w-full flex-col bg-[#fafafa] md:flex-row">
      <aside class="w-full shrink-0 border-b bg-white p-4 md:w-64 md:border-b-0 md:border-r md:p-6">
        <h2 class="mb-6 hidden text-xl font-bold md:block">Settings</h2>
        <div class="md:hidden">
          <Select
            label="Settings section"
            value={tab()}
            options={tabs}
            onChange={value => setTab(value as Tab)}
            class="h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10"
          />
        </div>
        <nav class="hidden flex-col gap-2 md:flex">
          <For each={tabs}>
            {item => (
              <button
                class={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${tab() === item.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setTab(item.value as Tab)}
              >
                {item.value === 'profile' ? (
                  <User size={16} />
                ) : item.value === 'billing' ? (
                  <CreditCard size={16} />
                ) : item.value === 'api' ? (
                  <Code size={16} />
                ) : (
                  <Webhook size={16} />
                )}{' '}
                {item.label}
              </button>
            )}
          </For>
        </nav>
      </aside>
      <main class="flex-1 overflow-y-auto p-4 md:p-8">
        <div class="mx-auto max-w-5xl">
          <Show when={tab() === 'profile'}>
            <section class="rounded-2xl border bg-white p-6 shadow-sm">
              <div class="flex items-center gap-4">
                <Show
                  when={user()?.imageUrl}
                  fallback={
                    <span class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white">
                      {user()?.firstName?.[0] ?? 'P'}
                    </span>
                  }
                >
                  {src => <img src={src()} alt="" class="h-14 w-14 rounded-full" />}
                </Show>
                <div>
                  <h1 class="text-xl font-bold">{user()?.fullName || 'Pitch creator'}</h1>
                  <p class="text-sm text-gray-500">{user()?.primaryEmailAddress?.emailAddress}</p>
                </div>
              </div>
              <button
                class="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
                onClick={() => void clerk.openUserProfile?.()}
              >
                Manage profile
              </button>
              <div class="mt-6 border-t pt-5">
                <h2 class="font-semibold">Notifications</h2>
                <label class="mt-3 flex items-center justify-between text-sm">
                  <span>Email completion and account updates</span>
                  <Switch checked={true} onChange={() => {}} label="Email notifications" />
                </label>
              </div>
            </section>
          </Show>
          <Show when={tab() === 'billing'}>
            <Billing summary={summary()} loading={loading()} />
          </Show>
          <Show when={tab() === 'api'}>
            <McpGuide />
            <ApiKeysView embedded />
          </Show>
          <Show when={tab() === 'webhooks'}>
            <WebhookManager />
          </Show>
        </div>
      </main>
    </div>
  )
}

function Billing(props: { summary: Summary | null; loading: boolean }) {
  const navigate = useNavigate()
  return (
    <Show when={!props.loading} fallback={<p>Loading billing details...</p>}>
      <div class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
          <section class="rounded-2xl border bg-white p-6">
            <p class="text-xs font-bold uppercase text-gray-400">Available credits</p>
            <div class="mt-3 flex items-center gap-3">
              <img src={pCoinIcon} alt="" class="h-10 w-10" />
              <strong class="text-5xl">{props.summary?.balance ?? '—'}</strong>
            </div>
          </section>
          <section class="rounded-2xl border bg-white p-6">
            <p class="text-xs font-bold uppercase text-gray-400">Current plan</p>
            <h2 class="mt-3 text-2xl font-bold">
              {props.summary?.activeSubscription?.planKey ?? 'No active plan'}
            </h2>
            <p class="text-sm text-gray-500">
              {props.summary?.activeSubscription
                ? `${props.summary.activeSubscription.creditsPerCycle} credits / month`
                : 'Top up or subscribe at any time.'}
            </p>
            <button
              class="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
              onClick={() => navigate('/pricing')}
            >
              Manage plan
            </button>
          </section>
        </div>
        <section class="overflow-hidden rounded-2xl border bg-white">
          <h2 class="border-b px-6 py-4 text-sm font-bold">Transaction history</h2>
          <Show
            when={props.summary?.transactions.length}
            fallback={<p class="p-12 text-center text-sm text-gray-500">No transactions yet</p>}
          >
            <For each={props.summary?.transactions}>
              {transaction => (
                <div class="flex items-center justify-between border-b px-6 py-3 text-sm">
                  <div>
                    <b>{transaction.description}</b>
                    <p class="text-xs text-gray-400">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <strong class={transaction.delta > 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {transaction.delta > 0 ? '+' : ''}
                    {transaction.delta}
                  </strong>
                </div>
              )}
            </For>
          </Show>
        </section>
      </div>
    </Show>
  )
}

interface Endpoint {
  id: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: string
}
function WebhookManager() {
  const { getToken } = useAuth()
  const [endpoints, setEndpoints] = createSignal<Endpoint[]>([])
  const [adding, setAdding] = createSignal(false)
  const [url, setUrl] = createSignal('')
  const [events, setEvents] = createSignal(['job.completed', 'job.failed'])
  const load = async () => {
    const token = await getToken()
    if (!token) return
    const response = await fetch(`${API_URL}/webhooks/endpoints`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.ok) setEndpoints(await response.json())
  }
  onMount(() => void load())
  const request = async (path: string, method: string, body?: unknown) => {
    const token = await getToken()
    if (!token) return
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) throw new Error((await response.json()).error || 'Request failed')
    await load()
  }
  return (
    <div class="space-y-6">
      <section class="rounded-2xl border bg-white p-6">
        <div class="flex justify-between">
          <div>
            <h2 class="text-xl font-bold">Webhook Endpoints</h2>
            <p class="text-sm text-gray-500">
              Receive HTTP POST notifications when projects complete or fail.
            </p>
          </div>
          <button
            class="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white"
            onClick={() => setAdding(value => !value)}
          >
            Add endpoint
          </button>
        </div>
        <Show when={adding()}>
          <form
            class="mt-5 space-y-3 border-t pt-5"
            onSubmit={event => {
              event.preventDefault()
              void request('/webhooks/endpoints', 'POST', { url: url(), events: events() }).then(
                () => {
                  setUrl('')
                  setAdding(false)
                },
              )
            }}
          >
            <input
              required
              type="url"
              class="w-full rounded-xl border p-3 text-sm"
              placeholder="https://your-api.com/webhooks/pitch"
              value={url()}
              onInput={event => setUrl(event.currentTarget.value)}
            />
            <For each={['job.completed', 'job.failed']}>
              {item => (
                <label class="mr-4 text-sm">
                  <input
                    type="checkbox"
                    checked={events().includes(item)}
                    onChange={event =>
                      setEvents(current =>
                        event.currentTarget.checked
                          ? [...current, item]
                          : current.filter(value => value !== item),
                      )
                    }
                  />{' '}
                  {item}
                </label>
              )}
            </For>
            <button class="block rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
              Save endpoint
            </button>
          </form>
        </Show>
      </section>
      <section class="divide-y rounded-2xl border bg-white">
        <For
          each={endpoints()}
          fallback={
            <p class="p-8 text-center text-sm text-gray-500">No webhook endpoints configured.</p>
          }
        >
          {endpoint => (
            <div class="p-5">
              <div class="flex items-center justify-between gap-3">
                <code class="truncate text-sm">{endpoint.url}</code>
                <div class="flex gap-2">
                  <button
                    class="rounded-lg border px-3 py-1 text-xs"
                    onClick={() =>
                      void request(`/webhooks/test`, 'POST', { endpointId: endpoint.id })
                    }
                  >
                    Test
                  </button>
                  <button
                    class="rounded-lg border px-3 py-1 text-xs"
                    onClick={() =>
                      void request(`/webhooks/endpoints/${endpoint.id}`, 'PATCH', {
                        isActive: !endpoint.isActive,
                      })
                    }
                  >
                    {endpoint.isActive ? 'Active' : 'Disabled'}
                  </button>
                  <button
                    class="text-xs text-red-600"
                    onClick={() =>
                      confirm('Delete this webhook endpoint?') &&
                      void request(`/webhooks/endpoints/${endpoint.id}`, 'DELETE')
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p class="mt-2 text-xs text-gray-400">{endpoint.events.join(', ')}</p>
              <code class="mt-2 block rounded bg-gray-50 p-2 text-xs">
                Signing secret: {endpoint.secret}
              </code>
            </div>
          )}
        </For>
      </section>
    </div>
  )
}

export type SettingsSection =
  | 'account'
  | 'usage'
  | 'plans'
  | 'credits'
  | 'rewards'
  | 'mcp'
  | 'api'
  | 'support'
export function SettingsModal(props: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { userAccessor: user } = useUser()
  const [summary, setSummary] = createSignal<Summary | null>(null)
  const [loadingSummary, setLoadingSummary] = createSignal(false)
  const loadSummary = async () => {
    if (summary() || loadingSummary()) return
    setLoadingSummary(true)
    try {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setSummary(await response.json())
    } finally {
      setLoadingSummary(false)
    }
  }
  createEffect(() => {
    if (['usage', 'plans', 'credits'].includes(props.section)) void loadSummary()
  })
  const sections: Array<{ value: SettingsSection; label: string; icon: Component<LucideProps> }> = [
    { value: 'account', label: 'Account', icon: User },
    { value: 'usage', label: 'Usage', icon: BarChart3 },
    { value: 'plans', label: 'Plans & billing', icon: CreditCard },
    { value: 'credits', label: 'Credits', icon: Coins },
    { value: 'rewards', label: 'Rewards', icon: Gift },
    { value: 'mcp', label: 'MCP', icon: Code },
    { value: 'api', label: 'API', icon: KeyRound },
    { value: 'support', label: 'Help & support', icon: CircleHelp },
  ]
  return (
    <div
      class="settings-overlay"
      onMouseDown={event => event.target === event.currentTarget && props.onClose()}
    >
      <div
        class="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pitch settings"
        onKeyDown={event => event.key === 'Escape' && props.onClose()}
      >
        <header class="settings-dialog__header">
          <div>
            <h2>Pitch settings</h2>
            <p>Manage your account, usage, billing and integrations.</p>
          </div>
          <button onClick={props.onClose} aria-label="Close settings" title="Close settings">
            <X size={18} />
          </button>
        </header>
        <div class="settings-dialog__body">
          <nav class="settings-nav" aria-label="Settings sections">
            <For each={sections}>
              {item => {
                const Icon = item.icon
                return (
                  <button
                    class={props.section === item.value ? 'is-active' : ''}
                    aria-current={props.section === item.value ? 'page' : undefined}
                    onClick={() => props.onSectionChange(item.value)}
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                )
              }}
            </For>
          </nav>
          <main class="settings-content">
            <div class="settings-mobile-tabs">
              <label for="settings-section">Settings</label>
              <select
                id="settings-section"
                value={props.section}
                onChange={event =>
                  props.onSectionChange(event.currentTarget.value as SettingsSection)
                }
              >
                <For each={sections}>
                  {item => <option value={item.value}>{item.label}</option>}
                </For>
              </select>
            </div>
            <div class="settings-content__heading">
              <h3>{sections.find(item => item.value === props.section)?.label}</h3>
            </div>
            <Show when={props.section === 'account'}>
              <section class="settings-card">
                <h4>Profile</h4>
                <strong>{user()?.fullName || 'Pitch creator'}</strong>
                <small>{user()?.primaryEmailAddress?.emailAddress}</small>
              </section>
            </Show>
            <Show when={props.section === 'mcp'}>
              <McpSettingsPanel openApi={() => props.onSectionChange('api')} />
            </Show>
            <Show when={props.section === 'api'}>
              <ApiKeysView embedded />
            </Show>
            <Show when={props.section === 'usage'}>
              <SettingsUsage summary={summary()} loading={loadingSummary()} />
            </Show>
            <Show when={props.section === 'plans'}>
              <SettingsPlan
                summary={summary()}
                loading={loadingSummary()}
                openPricing={() => {
                  props.onClose()
                  navigate('/pricing')
                }}
              />
            </Show>
            <Show when={props.section === 'credits'}>
              <SettingsCredits
                summary={summary()}
                loading={loadingSummary()}
                openPricing={() => {
                  props.onClose()
                  navigate('/pricing')
                }}
              />
            </Show>
            <Show when={props.section === 'rewards'}>
              <section class="settings-card">
                <Gift />
                <p>Earn credits by inviting people to Pitch.</p>
                <button
                  class="settings-primary"
                  onClick={() => {
                    props.onClose()
                    navigate('/affiliate')
                  }}
                >
                  Open rewards dashboard
                </button>
              </section>
            </Show>
            <Show when={props.section === 'support'}>
              <section class="settings-card settings-support">
                <a href="mailto:support@trypitch.co">
                  <i>
                    <Mail size={18} />
                  </i>
                  <span>
                    <strong>Email support</strong>
                    <small>Get help from the Pitch team</small>
                  </span>
                  <ExternalLink size={14} />
                </a>
                <a href="https://discord.gg/a4SBW36mD" target="_blank" rel="noreferrer">
                  <i>
                    <MessageCircle size={18} />
                  </i>
                  <span>
                    <strong>Join Discord</strong>
                    <small>Ask questions and meet creators</small>
                  </span>
                  <ExternalLink size={14} />
                </a>
                <a href="/docs" target="_blank" rel="noopener">
                  <i>
                    <Code size={18} />
                  </i>
                  <span>
                    <strong>Documentation</strong>
                    <small>Guides for the API and MCP</small>
                  </span>
                  <ExternalLink size={14} />
                </a>
              </section>
            </Show>
          </main>
        </div>
      </div>
    </div>
  )
}

function SettingsUsage(props: { summary: Summary | null; loading: boolean }) {
  return (
    <Show
      when={!props.loading}
      fallback={<section class="settings-card">Loading usage...</section>}
    >
      <section class="settings-card">
        <h4>Metered usage</h4>
        <strong>${(props.summary?.usage?.usd ?? 0).toFixed(2)}</strong>
        <small>Model and rendering spend across your projects.</small>
      </section>
      <section class="settings-card settings-activity">
        <h4>Project usage</h4>
        <Show
          when={props.summary?.usage?.projects.length}
          fallback={<small>No project usage recorded yet.</small>}
        >
          <For each={props.summary?.usage?.projects}>
            {project => (
              <div>
                <span>
                  <strong>{project.title}</strong>
                  <small>{new Date(project.updatedAt).toLocaleDateString()}</small>
                </span>
                <b>{project.creditsCharged} credits</b>
              </div>
            )}
          </For>
        </Show>
      </section>
    </Show>
  )
}

function SettingsPlan(props: {
  summary: Summary | null
  loading: boolean
  openPricing: () => void
}) {
  return (
    <Show when={!props.loading} fallback={<section class="settings-card">Loading plan...</section>}>
      <section class="settings-card">
        <h4>Current plan</h4>
        <strong>{props.summary?.activeSubscription?.planKey ?? 'No active plan'}</strong>
        <small>
          {props.summary?.activeSubscription
            ? `${props.summary.activeSubscription.creditsPerCycle} credits per billing cycle`
            : 'Choose a subscription or buy a one-time top-up.'}
        </small>
        <button class="settings-primary" onClick={props.openPricing}>
          View plans and billing
        </button>
      </section>
    </Show>
  )
}

function SettingsCredits(props: {
  summary: Summary | null
  loading: boolean
  openPricing: () => void
}) {
  return (
    <Show
      when={!props.loading}
      fallback={<section class="settings-card">Loading credits...</section>}
    >
      <section class="settings-card">
        <h4>Available credits</h4>
        <strong>{props.summary?.balance ?? 0}</strong>
        <small>Credits are used for model work and rendering compute.</small>
        <button class="settings-primary" onClick={props.openPricing}>
          Buy credits
        </button>
      </section>
      <section class="settings-card settings-activity">
        <h4>Recent credit activity</h4>
        <Show
          when={props.summary?.transactions.length}
          fallback={<small>No credit activity yet.</small>}
        >
          <For each={props.summary?.transactions.slice(0, 8)}>
            {transaction => (
              <div>
                <span>
                  <strong>{transaction.description}</strong>
                  <small>{new Date(transaction.createdAt).toLocaleDateString()}</small>
                </span>
                <b class={transaction.delta > 0 ? 'is-positive' : ''}>
                  {transaction.delta > 0 ? '+' : ''}
                  {transaction.delta}
                </b>
              </div>
            )}
          </For>
        </Show>
      </section>
    </Show>
  )
}
