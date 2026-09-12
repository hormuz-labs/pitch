import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  FolderOpen,
  Mail,
  RefreshCw,
  Search,
  Send,
  Shield,
  Users as UsersIcon,
  Wallet,
  X,
} from 'lucide-solid'
import { createMemo, createSignal, For, type JSX, onMount, Show } from 'solid-js'
import { api } from '../../lib/api'
import type { Project } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Dialog, Loading, Select } from './primitives'
import '../../styles/admin.css'

type Tab = 'users' | 'newsletter' | 'onboarding' | 'projects' | 'affiliates'
type AdminProject = Project & { userEmail?: string | null; userName?: string | null }
const tabs: [Tab, string][] = [
  ['users', 'Users'],
  ['newsletter', 'Email list'],
  ['onboarding', 'Onboarding'],
  ['projects', 'Projects'],
  ['affiliates', 'Affiliates'],
]
const descriptions: Record<Tab, string> = {
  users: 'Manage the people creating with Pitch.',
  newsletter: 'Keep your audience in the loop.',
  onboarding: 'Understand who is joining and what they want to create.',
  projects: 'The latest 300 projects across Pitch.',
  affiliates: 'Your partners and the audience they bring.',
}
const number = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function Badge(props: { children: JSX.Element; tone?: string }) {
  return (
    <span class="admin-badge" data-tone={props.tone}>
      {props.children}
    </span>
  )
}

function EmptyState(props: { title: string; description: string }) {
  return (
    <div class="admin-empty">
      <span class="admin-empty__icon">
        <FolderOpen size={21} />
      </span>
      <h3>{props.title}</h3>
      <p>{props.description}</p>
    </div>
  )
}
const unwrap = (value: any): AdminProject[] => {
  const projects: AdminProject[] = Array.isArray(value)
    ? value
    : Array.isArray(value?.projects)
      ? value.projects
      : []
  return projects
}
export function AdminView() {
  const { getToken } = useAuth()
  const [data, setData] = createSignal<any>(null)
  const [projects, setProjects] = createSignal<AdminProject[]>([])
  const [analytics, setAnalytics] = createSignal<any>(null)
  const [newsletter, setNewsletter] = createSignal<any>(null)
  const [loading, setLoading] = createSignal(true)
  const [refreshing, setRefreshing] = createSignal(false)
  const [updatedAt, setUpdatedAt] = createSignal<Date | null>(null)
  const [error, setError] = createSignal('')
  const [tab, setTab] = createSignal<Tab>('users')
  const [search, setSearch] = createSignal('')
  const [status, setStatus] = createSignal('all')
  const [selected, setSelected] = createSignal<AdminProject | null>(null)
  const request = async <T,>(path: string) => {
    const token = await getToken()
    if (!token) throw new Error('Not authenticated')
    return api.get<T>(path, token)
  }
  const refreshNewsletter = async () => setNewsletter(await request('/admin/newsletter'))
  const refresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      const [dashboard, projectRows, stats, audience] = await Promise.all([
        request<any>('/admin/dashboard'),
        request<any>('/admin/projects'),
        request<any>('/admin/analytics'),
        request<any>('/admin/newsletter'),
      ])
      setData(dashboard)
      setProjects(unwrap(projectRows))
      setAnalytics(stats)
      setNewsletter(audience)
      setUpdatedAt(new Date())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load admin dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  onMount(() => void refresh())
  const filteredProjects = createMemo(() =>
    projects().filter(
      project =>
        (status() === 'all' || project.status === status()) &&
        (!search() ||
          [project.title, project.userEmail, project.status].some(value =>
            value?.toLowerCase().includes(search().toLowerCase()),
          )),
    ),
  )
  const filteredUsers = createMemo(() =>
    (data()?.users ?? []).filter(
      (user: any) =>
        !search() ||
        [user.email, user.firstName, user.lastName].some(value =>
          value?.toLowerCase().includes(search().toLowerCase()),
        ),
    ),
  )
  return (
    <div class="admin-page">
      <div class="admin-container">
        <header class="admin-header">
          <div>
            <div class="admin-eyebrow">
              <Shield size={13} /> Workspace <ChevronRight size={12} /> Admin
            </div>
            <h1>Your platform, at a glance.</h1>
            <p>A little perspective on everything happening at Pitch.</p>
          </div>
          <div class="admin-header__actions">
            <Show when={updatedAt()}>
              <span class="admin-updated">
                Updated{' '}
                {updatedAt()?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
            </Show>
            <button
              type="button"
              class="admin-button"
              disabled={refreshing()}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} classList={{ 'admin-spinning': refreshing() }} />
              {refreshing() ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>
        <Show when={error()}>
          <p class="admin-alert" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={!loading()} fallback={<Loading label="Loading your platform…" />}>
          <Show when={data()}>
            <Stats stats={data()?.stats} />
            <section class="admin-workspace" aria-label="Platform management">
              <nav class="admin-tabs" aria-label="Admin sections">
                <For each={tabs}>
                  {item => (
                    <button
                      type="button"
                      class="admin-tab"
                      aria-current={tab() === item[0] ? 'page' : undefined}
                      onClick={() => {
                        setTab(item[0])
                        setSearch('')
                      }}
                    >
                      {item[1]}
                    </button>
                  )}
                </For>
              </nav>
              <div class="admin-section-header">
                <div>
                  <h2>
                    {tabs.find(item => item[0] === tab())?.[1]}
                    <Show when={tab() === 'users' || tab() === 'projects'}>
                      <span class="admin-count">
                        {number(
                          tab() === 'users' ? filteredUsers().length : filteredProjects().length,
                        )}
                      </span>
                    </Show>
                  </h2>
                  <p>{descriptions[tab()]}</p>
                </div>
                <Show when={tab() === 'users' || tab() === 'projects'}>
                  <div class="admin-toolbar">
                    <label class="admin-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        type="search"
                        aria-label={tab() === 'users' ? 'Search users' : 'Search projects'}
                        placeholder={
                          tab() === 'users' ? 'Search name or email…' : 'Search projects…'
                        }
                        value={search()}
                        onInput={event => setSearch(event.currentTarget.value)}
                      />
                    </label>
                    <Show when={tab() === 'projects'}>
                      <Select
                        label="Project status"
                        class="admin-select"
                        value={status()}
                        options={[
                          { value: 'all', label: 'All statuses' },
                          { value: 'working', label: 'Working' },
                          { value: 'ready', label: 'Ready' },
                          { value: 'empty', label: 'Empty' },
                          { value: 'failed', label: 'Failed' },
                        ]}
                        onChange={setStatus}
                      />
                    </Show>
                  </div>
                </Show>
              </div>
              <Show when={tab() === 'users'}>
                <Users
                  users={filteredUsers()}
                  projects={projects()}
                  onProject={setSelected}
                  onGptAccess={(id, gptEnabled) =>
                    setData((current: any) => ({
                      ...current,
                      users: current.users.map((user: any) =>
                        user.id === id ? { ...user, gptEnabled } : user,
                      ),
                    }))
                  }
                />
              </Show>
              <Show when={tab() === 'projects'}>
                <Projects projects={filteredProjects()} onSelect={setSelected} />
              </Show>
              <Show when={tab() === 'newsletter'}>
                <Newsletter audience={newsletter()} refresh={refreshNewsletter} />
              </Show>
              <Show when={tab() === 'onboarding'}>
                <Onboarding users={data()?.users ?? []} />
              </Show>
              <Show when={tab() === 'affiliates'}>
                <Affiliates data={analytics()} />
              </Show>
            </section>
            <footer class="admin-footer">
              <Shield size={12} /> Pitch administration <span>Workspace overview</span>
            </footer>
          </Show>
        </Show>
      </div>
      <Dialog
        open={!!selected()}
        title="Project details"
        onClose={() => setSelected(null)}
        class="admin-dialog"
      >
        <div class="admin-dialog__header">
          <span class="admin-eyebrow">
            <FolderOpen size={14} /> Project details
          </span>
          <button
            type="button"
            class="admin-icon-button"
            aria-label="Close project details"
            onClick={() => setSelected(null)}
          >
            <X size={18} />
          </button>
        </div>
        <h2>{selected()?.title || 'Untitled project'}</h2>
        <p class="admin-project-id">{selected()?.id}</p>
        <dl class="admin-details">
          <div>
            <dt>Owner</dt>
            <dd>{selected()?.userEmail || 'Unknown owner'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={selected()?.status}>{selected()?.status}</Badge>
            </dd>
          </div>
          <div>
            <dt>Credits used</dt>
            <dd>{number(selected()?.creditsCharged)}</dd>
          </div>
          <div>
            <dt>Outputs</dt>
            <dd>{selected()?.outputs.length}</dd>
          </div>
        </dl>
        <div class="admin-prompt">
          <h3>Original prompt</h3>
          <p>{selected()?.prompt || 'This project was started with an upload.'}</p>
        </div>
      </Dialog>
    </div>
  )
}

function Stats(props: { stats: any }) {
  return (
    <Show when={props.stats}>
      <section class="admin-stats" aria-label="Platform overview">
        <For
          each={[
            {
              label: 'Total users',
              value: number(props.stats.totalUsers),
              note: 'People on Pitch',
              icon: UsersIcon,
            },
            {
              label: 'Top-up revenue',
              value:
                typeof props.stats.totalRevenue === 'number'
                  ? props.stats.totalRevenue.toLocaleString(undefined, {
                      style: 'currency',
                      currency: 'USD',
                    })
                  : '—',
              note: 'All-time credit purchases',
              icon: Wallet,
            },
            {
              label: 'Projects',
              value: number(props.stats.totalProjects),
              note: 'Across all workspaces',
              icon: FolderOpen,
            },
            {
              label: 'Recorded errors',
              value: number(props.stats.failedProjects),
              note: 'Projects with a saved error',
              icon: Activity,
            },
          ]}
        >
          {card => (
            <article class="admin-stat">
              <div class="admin-stat__label">
                <p>{card.label}</p>
                <card.icon size={16} strokeWidth={1.5} />
              </div>
              <strong>{card.value}</strong>
              <p class="admin-stat__note">{card.note}</p>
            </article>
          )}
        </For>
        <Show when={typeof props.stats.activeSessions === 'number'}>
          <div class="admin-activity">
            <span>
              <Activity size={14} />
              <strong>{number(props.stats.activeSessions)}</strong> running agent tasks
            </span>
            <span>This server · at last refresh</span>
          </div>
        </Show>
      </section>
    </Show>
  )
}
function Users(props: {
  users: any[]
  projects: AdminProject[]
  onProject: (project: AdminProject) => void
  onGptAccess: (id: string, enabled: boolean) => void
}) {
  const { getToken } = useAuth()
  const [saving, setSaving] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')
  const toggleGpt = async (user: any) => {
    setSaving(user.id)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const result = await api.patch<{ gptEnabled: boolean }>(
        `/admin/users/${encodeURIComponent(user.id)}/gpt-access`,
        token,
        { gptEnabled: !user.gptEnabled },
      )
      props.onGptAccess(user.id, result.gptEnabled)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update GPT access')
    } finally {
      setSaving(null)
    }
  }
  return (
    <div class="admin-table-wrap">
      <Show when={error()}>
        <p role="alert" class="admin-alert">
          {error()}
        </p>
      </Show>
      <table class="admin-table" aria-label="Users">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th title="Saved permission to use configured OpenAI models; not model availability">
              OpenAI permission
            </th>
            <th>Subscription</th>
            <th>Joined</th>
            <th>Credits left</th>
            <th title="Count within the latest 300 projects returned by the server">
              Recent projects
            </th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.users}
            fallback={
              <tr>
                <td colSpan="7">
                  <EmptyState
                    title="No users found"
                    description="Try a different name or email address."
                  />
                </td>
              </tr>
            }
          >
            {user => (
              <tr>
                <td>
                  <div class="admin-person">
                    <span class="admin-avatar" aria-hidden="true">
                      {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                      {user.lastName?.[0]?.toUpperCase()}
                    </span>
                    <div class="admin-cell-copy">
                      <strong>
                        {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                      </strong>
                      <p>{user.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge>{user.role}</Badge>
                </td>
                <td>
                  <Show when={typeof user.gptEnabled === 'boolean'} fallback="—">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!user.gptEnabled}
                      aria-label={`OpenAI model permission for ${user.email}`}
                      title="Controls eligibility for configured OpenAI models. Availability also depends on server configuration."
                      disabled={saving() !== null}
                      class="admin-access"
                      onClick={() => void toggleGpt(user)}
                    >
                      <span class="admin-switch">
                        <span>
                          <Show when={user.gptEnabled}>
                            <Check size={9} />
                          </Show>
                        </span>
                      </span>
                      <span>
                        {saving() === user.id
                          ? 'Saving…'
                          : user.gptEnabled
                            ? 'Allowed'
                            : 'Not allowed'}
                      </span>
                    </button>
                  </Show>
                </td>
                <td class="admin-capitalize">
                  <Show when={user.subscription} fallback="None">
                    <div class="admin-cell-copy">
                      <strong>{user.subscription?.planKey || '—'}</strong>
                      <small>{user.subscription?.status || '—'}</small>
                    </div>
                  </Show>
                </td>
                <td class="admin-nowrap">{date(user.createdAt)}</td>
                <td class="admin-numeric">{number(user.creditsRemaining)}</td>
                <td>
                  <button
                    type="button"
                    class="admin-text-button"
                    disabled={!props.projects.some(item => item.userId === user.id)}
                    onClick={() => {
                      const project = props.projects.find(item => item.userId === user.id)
                      if (project) props.onProject(project)
                    }}
                  >
                    {number(props.projects.filter(item => item.userId === user.id).length)}
                    <ArrowUpRight size={13} />
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
function Projects(props: { projects: AdminProject[]; onSelect: (project: AdminProject) => void }) {
  return (
    <div class="admin-table-wrap">
      <table class="admin-table" aria-label="Projects">
        <thead>
          <tr>
            <th>Project</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Credits</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.projects}
            fallback={
              <tr>
                <td colSpan="5">
                  <EmptyState
                    title="No projects found"
                    description="Try another search or choose a different status."
                  />
                </td>
              </tr>
            }
          >
            {project => (
              <tr>
                <td>
                  <button
                    type="button"
                    class="admin-project-button"
                    onClick={() => props.onSelect(project)}
                  >
                    <span class="admin-project-icon">
                      <FolderOpen size={17} />
                    </span>
                    <span class="admin-cell-copy">
                      <strong>{project.title || 'Untitled project'}</strong>
                      <small>{project.id.slice(-8)}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                </td>
                <td>{project.userEmail || 'Unknown owner'}</td>
                <td>
                  <Badge tone={project.status}>{project.status}</Badge>
                </td>
                <td class="admin-numeric">{number(project.creditsCharged)}</td>
                <td class="admin-nowrap">{date(project.createdAt)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
function Onboarding(props: { users: any[] }) {
  const rows = () => props.users.filter(user => user.onboardingSurvey)
  return (
    <div class="admin-table-wrap">
      <table class="admin-table" aria-label="Onboarding responses">
        <thead>
          <tr>
            <th>User</th>
            <th>Goal</th>
            <th>Role</th>
            <th>Team size</th>
            <th>Volume</th>
            <th>Discovery</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={rows()}
            fallback={
              <tr>
                <td colSpan="6">
                  <EmptyState
                    title="Getting to know your users"
                    description="Onboarding responses will appear here as people join."
                  />
                </td>
              </tr>
            }
          >
            {user => {
              const survey = user.onboardingSurvey
              return (
                <tr>
                  <td>{user.email}</td>
                  <td>{survey.creationGoal || '—'}</td>
                  <td>{survey.role || '—'}</td>
                  <td>{survey.teamSize || '—'}</td>
                  <td>{survey.monthlyVolume || '—'}</td>
                  <td>{survey.discoverySource || '—'}</td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}
function Affiliates(props: { data: any }) {
  return (
    <div class="admin-affiliates">
      <For
        each={props.data?.affiliates ?? []}
        fallback={
          <EmptyState
            title="Good things grow together"
            description="Affiliate partners and referral activity will appear here."
          />
        }
      >
        {affiliate => (
          <article class="admin-affiliate">
            <span class="admin-project-icon">
              <UsersIcon size={18} />
            </span>
            <h3>{affiliate.user?.email ?? affiliate.code}</h3>
            <p>
              Referral code <Badge>{affiliate.code}</Badge>
            </p>
            <dl>
              <div>
                <dt>Clicks</dt>
                <dd>{number(affiliate.totalClicks)}</dd>
              </div>
              <div>
                <dt>Conversions</dt>
                <dd>{number(affiliate.totalConversions)}</dd>
              </div>
            </dl>
          </article>
        )}
      </For>
    </div>
  )
}
function Newsletter(props: { audience: any; refresh: () => Promise<void> }) {
  const { getToken } = useAuth()
  const [subject, setSubject] = createSignal('')
  const [message, setMessage] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [result, setResult] = createSignal('')
  const [error, setError] = createSignal('')
  const [sending, setSending] = createSignal(false)
  const [adding, setAdding] = createSignal(false)
  const send = async (event: SubmitEvent) => {
    event.preventDefault()
    if (sending()) return
    const ids = (props.audience?.subscribers ?? [])
      .filter((item: any) => item.status === 'subscribed')
      .map((item: any) => item.id)
    if (!ids.length || !confirm(`Send this update to ${ids.length} contacts?`)) return
    setSending(true)
    setError('')
    setResult('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const response = await api.post<{ sent: number; failed: number }>(
        '/admin/newsletter/send',
        token,
        {
          subject: subject(),
          message: message(),
          ctaLabel: 'See what is new at Pitch',
          ctaUrl: 'https://trypitch.co',
          recipientIds: ids,
        },
      )
      setResult(`Sent ${response.sent}; ${response.failed} failed.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to send update')
    } finally {
      setSending(false)
    }
  }
  const add = async (event: SubmitEvent) => {
    event.preventDefault()
    if (adding()) return
    setAdding(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      await api.post('/admin/newsletter/subscribers', token, { email: email() })
      setEmail('')
      await props.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to add subscriber')
    } finally {
      setAdding(false)
    }
  }
  return (
    <div class="admin-newsletter">
      <Show when={error()}>
        <p class="admin-alert" role="alert">
          {error()}
        </p>
      </Show>
      <form class="admin-newsletter__compose" onSubmit={send}>
        <div class="admin-form-heading">
          <span class="admin-project-icon">
            <Send size={17} />
          </span>
          <div>
            <h3>Send a product update</h3>
            <p>Something worth sharing with your community.</p>
          </div>
        </div>
        <label class="admin-field">
          <span>Subject</span>
          <input
            required
            class="admin-input"
            placeholder="What’s new at Pitch?"
            value={subject()}
            onInput={event => setSubject(event.currentTarget.value)}
          />
        </label>
        <label class="admin-field">
          <span>Message</span>
          <textarea
            required
            rows="8"
            class="admin-input"
            placeholder="Write something your audience will love…"
            value={message()}
            onInput={event => setMessage(event.currentTarget.value)}
          />
        </label>
        <div class="admin-form-actions">
          <span>{number(props.audience?.subscribed)} subscribed contacts</span>
          <button
            type="submit"
            class="admin-button admin-button--primary"
            disabled={sending() || !props.audience?.subscribed}
          >
            <Send size={14} />
            {sending() ? 'Sending…' : 'Send update'}
          </button>
        </div>
        <Show when={result()}>
          <p class="admin-result" role="status">
            {result()}
          </p>
        </Show>
      </form>
      <div class="admin-newsletter__audience">
        <div class="admin-form-heading">
          <span class="admin-project-icon">
            <Mail size={17} />
          </span>
          <div>
            <h3>
              Your audience <span class="admin-count">{number(props.audience?.subscribed)}</span>
            </h3>
            <p>People who want to hear from you.</p>
          </div>
        </div>
        <form class="admin-add-contact" onSubmit={add}>
          <input
            required
            type="email"
            class="admin-input"
            aria-label="Subscriber email"
            placeholder="Enter an email address"
            value={email()}
            onInput={event => setEmail(event.currentTarget.value)}
          />
          <button type="submit" class="admin-button" disabled={adding()}>
            {adding() ? 'Adding…' : 'Add contact'}
          </button>
        </form>
        <div class="admin-contacts">
          <For
            each={props.audience?.subscribers ?? []}
            fallback={
              <EmptyState
                title="Your audience starts here"
                description="Add a contact to start building your email list."
              />
            }
          >
            {contact => (
              <div class="admin-contact">
                <span>{contact.email}</span>
                <Badge tone={contact.status}>{contact.status}</Badge>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
