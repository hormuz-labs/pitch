import { useNavigate } from '@solidjs/router'
import { Code, CreditCard, ExternalLink, Mail, User, Webhook, X } from 'lucide-solid'
import { createSignal, For, onMount, Show, Suspense } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { useAuth, useClerk, useUser } from '../core/auth'
import { ApiKeysView } from './ApiKeysView'
import { McpGuide, McpSettingsPanel } from './McpPanels'
import { Select, Switch } from './primitives'
import { AccountSection } from './settings/AccountSection'
import { BuyCreditsSection } from './settings/BuyCreditsSection'
import { DiscordConnectionSection } from './settings/DiscordConnectionSection'
import { NotificationsSection } from './settings/NotificationsSection'
import { PlansSection } from './settings/PlansSection'
import { ProfileSection } from './settings/ProfileSection'
import { RewardsSection } from './settings/RewardsSection'
import { SocialSection } from './settings/SocialSection'
import { UsageSection } from './settings/UsageSection'
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
    <div class="settings-page absolute inset-0 flex h-full w-full flex-col md:flex-row">
      <aside class="w-full shrink-0 border-b bg-[var(--bg-surface)] p-4 md:w-64 md:border-b-0 md:border-r md:p-6">
        <h2 class="mb-6 hidden text-xl font-bold md:block">Settings</h2>
        <div class="md:hidden">
          <Select
            label="Settings section"
            value={tab()}
            options={tabs}
            onChange={value => setTab(value as Tab)}
            class="h-10 w-full appearance-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-sunken)] px-3 pr-9 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--border-default)]"
          />
        </div>
        <nav class="hidden flex-col gap-2 md:flex">
          <For each={tabs}>
            {item => (
              <button
                class={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${tab() === item.value ? 'bg-[var(--interactive-bg)] text-[var(--interactive-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-raised)]'}`}
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
  | 'profile'
  | 'notifications'
  | 'plans'
  | 'usage'
  | 'credits'
  | 'rewards'
  | 'connections'
  | 'mcp'
  | 'api'
  | 'support'
  | 'account'

interface NavItem {
  value: SettingsSection
  label: string
}
interface NavGroup {
  label?: string
  items: NavItem[]
}
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Personal',
    items: [
      { value: 'profile', label: 'Profile' },
      { value: 'notifications', label: 'Notifications' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { value: 'plans', label: 'Plans & Billing' },
      { value: 'usage', label: 'Usage & credits' },
      { value: 'credits', label: 'Buy credits' },
      { value: 'rewards', label: 'Rewards' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { value: 'connections', label: 'Discord & socials' },
      { value: 'mcp', label: 'MCP' },
      { value: 'api', label: 'API' },
    ],
  },
  {
    items: [
      { value: 'support', label: 'Help & support' },
      { value: 'account', label: 'Account' },
    ],
  },
]
const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap(group => group.items)

export function SettingsModal(props: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onClose: () => void
}) {
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
            <h2>Settings</h2>
            <p>Manage your account, preferences, and billing.</p>
          </div>
          <button onClick={props.onClose} aria-label="Close settings" title="Close settings">
            <X size={18} />
          </button>
        </header>
        <div class="settings-dialog__body">
          <nav class="settings-nav" aria-label="Settings sections">
            <For each={NAV_GROUPS}>
              {group => (
                <div class="settings-nav__group">
                  <Show when={group.label}>{label => <span>{label().toUpperCase()}</span>}</Show>
                  <For each={group.items}>
                    {item => (
                      <button
                        class={props.section === item.value ? 'is-active' : ''}
                        aria-current={props.section === item.value ? 'page' : undefined}
                        onClick={() => props.onSectionChange(item.value)}
                      >
                        {item.label}
                      </button>
                    )}
                  </For>
                </div>
              )}
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
                <For each={ALL_ITEMS}>
                  {item => <option value={item.value}>{item.label}</option>}
                </For>
              </select>
            </div>
            {/* Sections that read a createResource (usage, buy credits) suspend while
                it loads. Without a boundary here that reached the app-root Suspense,
                whose full-screen fallback blanked the whole app for a frame. */}
            <Suspense fallback={<p class="settings-empty">Loading…</p>}>
              <Show when={props.section === 'profile'}>
                <ProfileSection />
              </Show>
              <Show when={props.section === 'notifications'}>
                <NotificationsSection />
              </Show>
              <Show when={props.section === 'plans'}>
                <PlansSection />
              </Show>
              <Show when={props.section === 'usage'}>
                <UsageSection />
              </Show>
              <Show when={props.section === 'credits'}>
                <BuyCreditsSection openUsage={() => props.onSectionChange('usage')} />
              </Show>
              <Show when={props.section === 'rewards'}>
                <RewardsSection />
              </Show>
              <Show when={props.section === 'connections'}>
                {/* The welcome reward is claimed here: connect Discord, join,
                  claim. The follow links below it grant nothing. */}
                <DiscordConnectionSection />
                <SocialSection />
              </Show>
              <Show when={props.section === 'mcp'}>
                <McpSettingsPanel openApi={() => props.onSectionChange('api')} />
              </Show>
              <Show when={props.section === 'api'}>
                <ApiKeysView embedded />
              </Show>
              <Show when={props.section === 'support'}>
                <section class="settings-card settings-support-panel">
                  <div class="settings-support-panel__heading">
                    <strong>Help &amp; support</strong>
                    <small>Get help, share feedback, or reach the Pitch team.</small>
                    <a class="settings-primary" href="mailto:support@trypitch.co">
                      <Mail size={14} />
                      Contact support
                    </a>
                  </div>
                  <div class="settings-support">
                    <a href="https://discord.gg/a4SBW36mD" target="_blank" rel="noreferrer">
                      <span>
                        <strong>Join our Discord</strong>
                        <small>Chat with the community and get fast answers.</small>
                      </span>
                      <ExternalLink size={14} />
                    </a>
                    <a href="/docs" target="_blank" rel="noopener">
                      <span>
                        <strong>Read the documentation</strong>
                        <small>Find guides for the API, MCP, and studio.</small>
                      </span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <p class="settings-support-panel__footer">
                    Prefer email? Reach us at{' '}
                    <a href="mailto:support@trypitch.co">support@trypitch.co</a>.
                  </p>
                </section>
              </Show>
              <Show when={props.section === 'account'}>
                <AccountSection onClose={props.onClose} />
              </Show>
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  )
}
