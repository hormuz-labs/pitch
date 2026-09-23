import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  TriangleAlert,
  Users as UsersIcon,
  Video,
  Wallet,
  X,
} from 'lucide-solid'
import { createMemo, createSignal, For, type JSX, onMount, Show } from 'solid-js'
import { api } from '../../lib/api'
import { saveBlob } from '../../lib/save-blob'
import type { Project } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { adminStudio, type ReviewDownload } from '../studio/client'
import { Dialog, Loading, Select } from './primitives'
import '../../styles/admin.css'

export type Tab = 'users' | 'newsletter' | 'onboarding' | 'projects' | 'affiliates'

export interface AdminProject extends Project {
  userEmail?: string | null
  userName?: string | null
  finalVideoUrl?: string | null
  isRefunded?: boolean
  usageUsd?: number
  workspaceVersion?: number
  workerId?: string | null
}

export interface AdminProjectDetail extends AdminProject {
  user?: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    imageUrl?: string | null
    role: string
    createdAt: string
  }
  userPrompts?: Array<{ text: string; at: number }>
  entries?: Array<{
    id: string
    role: string
    text?: string
    tool?: { name: string; status: 'running' | 'done' | 'error' }
    ask?: any
    at: number
  }>
  activeModel?: string | null
  renderJobs?: Array<{
    id: string
    action: string
    params: Record<string, any>
    status: string
    stage?: string | null
    progress: number
    result?: any
    error?: string | null
    renderer?: string | null
    attempts: number
    createdAt: string
    startedAt?: string | null
    finishedAt?: string | null
  }>
  creditTransactions?: Array<{
    id: string
    delta: number
    type: string
    description: string
    createdAt: string
  }>
}

export interface AdminUserDetail {
  user: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    imageUrl?: string | null
    username?: string | null
    discordUserId?: string | null
    role: string
    gptEnabled: boolean
    createdAt: string
    updatedAt: string
    onboardingSkippedAt?: string | null
    onboardingSurvey?: {
      creationGoal?: string
      role?: string
      teamSize?: string
      monthlyVolume?: string
      discoverySource?: string
      completedAt?: string
    } | null
  }
  credits: {
    remaining: number
    lifetimeBought: number
  }
  subscription?: any
  subscriptions?: any[]
  topUps?: any[]
  transactions?: Array<{
    id: string
    delta: number
    type: string
    description: string
    projectId?: string | null
    createdAt: string
  }>
  projects?: AdminProject[]
  affiliate?: {
    id: string
    code: string
    status: string
    createdAt: string
    totalClicks: number
    totalSignups: number
    totalConversions: number
    creditsEarned: number
    videosEarned: number
    totalRevenue: number
  } | null
}

const tabs: [Tab, string][] = [
  ['users', 'Users'],
  ['projects', 'Projects / Jobs'],
  ['onboarding', 'Onboarding'],
  ['newsletter', 'Email list'],
  ['affiliates', 'Affiliates'],
]

const descriptions: Record<Tab, string> = {
  users: 'Manage creators, inspect balances, adjust credits, and view history.',
  projects: 'Inspect generation jobs, view prompts, watch final videos, and track renders.',
  onboarding: 'Understand who is joining and what they want to create.',
  newsletter: 'Keep your audience in the loop.',
  affiliates: 'Your partners and the audience they bring.',
}

const number = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'

const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

const dateTime = (value?: string | number | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

const flowName = (flow?: string) => {
  if (!flow) return 'Job'
  switch (flow) {
    case 'launch-video':
      return 'Launch film'
    case 'demo-video':
      return 'Demo video'
    case 'deck':
      return 'Slide deck'
    case 'recording-edit':
      return 'Recording edit'
    case 'generated-video':
      return 'Generated video'
    default:
      return flow
  }
}

function Badge(props: { children: JSX.Element; tone?: string; title?: string }) {
  return (
    <span class="admin-badge" data-tone={props.tone} title={props.title}>
      {props.children}
    </span>
  )
}

function CopyChip(props: { text: string; label?: string; prefix?: string }) {
  const [copied, setCopied] = createSignal(false)
  const copy = (e: MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(props.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      type="button"
      class="admin-id-chip"
      title={props.label ? `${props.label}: ${props.text}` : `Copy ${props.text}`}
      onClick={copy}
    >
      <span>
        {props.prefix ? `${props.prefix}: ` : ''}
        {props.text.length > 20 ? `${props.text.slice(0, 10)}…${props.text.slice(-6)}` : props.text}
      </span>
      <Show when={copied()} fallback={<Copy size={11} />}>
        <Check size={11} style={{ color: 'var(--success)' }} />
      </Show>
    </button>
  )
}

function CopyBtn(props: { text: string; label?: string; class?: string }) {
  const [copied, setCopied] = createSignal(false)
  const copy = (e: MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(props.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      type="button"
      class={props.class || 'admin-button admin-button--sm'}
      onClick={copy}
      title={`Copy ${props.label || 'text'}`}
    >
      <Show when={copied()} fallback={<Copy size={12} />}>
        <Check size={12} style={{ color: 'var(--success)' }} />
      </Show>
      {copied() ? 'Copied' : props.label || 'Copy'}
    </button>
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
  const list: AdminProject[] = Array.isArray(value)
    ? value
    : Array.isArray(value?.projects)
      ? value.projects
      : []
  return list
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
  const [flowFilter, setFlowFilter] = createSignal('all')

  // Modals state
  const [selectedProject, setSelectedProject] = createSignal<AdminProject | null>(null)
  const [projectDetail, setProjectDetail] = createSignal<AdminProjectDetail | null>(null)
  const [loadingProject, setLoadingProject] = createSignal(false)
  const [projectDialogTab, setProjectDialogTab] = createSignal<
    'video' | 'prompts' | 'transcript' | 'execution'
  >('video')

  const [selectedUser, setSelectedUser] = createSignal<any | null>(null)
  const [userDetail, setUserDetail] = createSignal<AdminUserDetail | null>(null)
  const [loadingUser, setLoadingUser] = createSignal(false)
  const [userDialogTab, setUserDialogTab] = createSignal<
    'overview' | 'projects' | 'ledger' | 'survey' | 'affiliate'
  >('overview')

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

  const openProject = async (
    project: AdminProject | { id: string },
    defaultTab: 'video' | 'prompts' = 'video',
  ) => {
    const found = projects().find(p => p.id === project.id) || (project as AdminProject)
    setSelectedProject(found)
    setProjectDialogTab(defaultTab)
    setLoadingProject(true)
    try {
      const detail = await request<AdminProjectDetail>(
        `/admin/projects/${encodeURIComponent(project.id)}`,
      )
      setProjectDetail(detail)
    } catch (err) {
      console.error('Failed to load project details', err)
    } finally {
      setLoadingProject(false)
    }
  }

  const openUser = async (
    userOrId: any | string,
    defaultTab: 'overview' | 'projects' = 'overview',
  ) => {
    const id = typeof userOrId === 'string' ? userOrId : userOrId.id
    const found =
      (data()?.users ?? []).find((u: any) => u.id === id) ||
      (typeof userOrId === 'object' ? userOrId : { id })
    setSelectedUser(found)
    setUserDialogTab(defaultTab)
    setLoadingUser(true)
    try {
      const detail = await request<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`)
      setUserDetail(detail)
    } catch (err) {
      console.error('Failed to load user details', err)
    } finally {
      setLoadingUser(false)
    }
  }

  const handleFailProject = async (projectId: string, reason: string) => {
    const token = await getToken()
    if (!token) return
    await api.post(`/admin/projects/${encodeURIComponent(projectId)}/fail`, token, { reason })
    setProjects(list =>
      list.map(p =>
        p.id === projectId ? { ...p, status: 'failed', isRefunded: true, lastError: reason } : p,
      ),
    )
    if (projectDetail()?.id === projectId) {
      setProjectDetail(curr =>
        curr ? { ...curr, status: 'failed', isRefunded: true, lastError: reason } : null,
      )
    }
    if (selectedProject()?.id === projectId) {
      setSelectedProject(curr =>
        curr ? { ...curr, status: 'failed', isRefunded: true, lastError: reason } : null,
      )
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    const token = await getToken()
    if (!token) return
    await api.delete(`/admin/projects/${encodeURIComponent(projectId)}`, token)
    setProjects(list => list.filter(p => p.id !== projectId))
    if (selectedProject()?.id === projectId) {
      setSelectedProject(null)
      setProjectDetail(null)
    }
  }

  const handleAdjustCredits = (userId: string, newBalance: number, tx: any) => {
    setData((curr: any) => ({
      ...curr,
      users: (curr?.users ?? []).map((u: any) =>
        u.id === userId ? { ...u, creditsRemaining: newBalance } : u,
      ),
    }))
    if (userDetail()?.user.id === userId) {
      setUserDetail(curr =>
        curr
          ? {
              ...curr,
              credits: { ...curr.credits, remaining: newBalance },
              transactions: [tx, ...(curr.transactions ?? [])],
            }
          : null,
      )
    }
  }

  const handleToggleGpt = (userId: string, gptEnabled: boolean) => {
    setData((curr: any) => ({
      ...curr,
      users: (curr?.users ?? []).map((u: any) => (u.id === userId ? { ...u, gptEnabled } : u)),
    }))
    if (userDetail()?.user.id === userId) {
      setUserDetail(curr => (curr ? { ...curr, user: { ...curr.user, gptEnabled } } : null))
    }
  }

  const filteredProjects = createMemo(() =>
    projects().filter(project => {
      const matchesStatus =
        status() === 'all'
          ? true
          : status() === 'has-video'
            ? Boolean(project.finalVideoUrl)
            : project.status === status()
      const matchesFlow = flowFilter() === 'all' || project.flow === flowFilter()
      const q = search().toLowerCase().trim()
      const matchesSearch =
        !q ||
        [
          project.title,
          project.id,
          project.userEmail,
          project.userName,
          project.prompt,
          project.flow,
          project.status,
        ].some(value => value?.toLowerCase().includes(q))
      return matchesStatus && matchesFlow && matchesSearch
    }),
  )

  const filteredUsers = createMemo(() =>
    (data()?.users ?? []).filter((user: any) => {
      const q = search().toLowerCase().trim()
      return (
        !q ||
        [
          user.email,
          user.firstName,
          user.lastName,
          user.id,
          user.username,
          user.discordUserId,
        ].some(value => value?.toLowerCase().includes(q))
      )
    }),
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
            <p>Comprehensive user analytics, video jobs, prompts, and system telemetry.</p>
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

        <Show when={!loading()} fallback={<Loading label="Loading platform telemetry…" />}>
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
                          tab() === 'users'
                            ? 'Search name, email, ID…'
                            : 'Search title, prompt, owner, ID…'
                        }
                        value={search()}
                        onInput={event => setSearch(event.currentTarget.value)}
                      />
                    </label>

                    <Show when={tab() === 'projects'}>
                      <Select
                        label="Status"
                        class="admin-select"
                        value={status()}
                        options={[
                          { value: 'all', label: 'All statuses' },
                          { value: 'has-video', label: 'Has video' },
                          { value: 'ready', label: 'Ready' },
                          { value: 'working', label: 'Working' },
                          { value: 'empty', label: 'Empty' },
                          { value: 'failed', label: 'Failed' },
                        ]}
                        onChange={setStatus}
                      />
                      <Select
                        label="Flow"
                        class="admin-select"
                        value={flowFilter()}
                        options={[
                          { value: 'all', label: 'All flows' },
                          { value: 'launch-video', label: 'Launch film' },
                          { value: 'demo-video', label: 'Demo video' },
                          { value: 'deck', label: 'Slide deck' },
                          { value: 'recording-edit', label: 'Recording edit' },
                          { value: 'generated-video', label: 'Generated video' },
                        ]}
                        onChange={setFlowFilter}
                      />
                    </Show>
                  </div>
                </Show>
              </div>

              <Show when={tab() === 'users'}>
                <UsersTab
                  users={filteredUsers()}
                  projects={projects()}
                  onSelectUser={openUser}
                  onToggleGpt={handleToggleGpt}
                />
              </Show>

              <Show when={tab() === 'projects'}>
                <ProjectsTab
                  projects={filteredProjects()}
                  onSelectProject={openProject}
                  onSelectUser={openUser}
                />
              </Show>

              <Show when={tab() === 'newsletter'}>
                <Newsletter audience={newsletter()} refresh={refreshNewsletter} />
              </Show>

              <Show when={tab() === 'onboarding'}>
                <Onboarding users={data()?.users ?? []} onSelectUser={openUser} />
              </Show>

              <Show when={tab() === 'affiliates'}>
                <Affiliates data={analytics()} onSelectUser={openUser} />
              </Show>
            </section>

            <footer class="admin-footer">
              <Shield size={12} /> Pitch administration <span>Workspace telemetry</span>
            </footer>
          </Show>
        </Show>
      </div>

      {/* User Details Modal */}
      <UserDetailDialog
        open={Boolean(selectedUser())}
        user={selectedUser()}
        detail={userDetail()}
        loading={loadingUser()}
        activeTab={userDialogTab()}
        onTabChange={setUserDialogTab}
        onClose={() => {
          setSelectedUser(null)
          setUserDetail(null)
        }}
        onToggleGpt={handleToggleGpt}
        onAdjustCredits={handleAdjustCredits}
        onOpenProject={openProject}
      />

      {/* Project / Job Details Modal */}
      <ProjectDetailDialog
        open={Boolean(selectedProject())}
        project={selectedProject()}
        detail={projectDetail()}
        loading={loadingProject()}
        activeTab={projectDialogTab()}
        onTabChange={setProjectDialogTab}
        onClose={() => {
          setSelectedProject(null)
          setProjectDetail(null)
        }}
        onOpenUser={openUser}
        onFailProject={handleFailProject}
        onDeleteProject={handleDeleteProject}
      />
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
              label: 'Projects / Jobs',
              value: number(props.stats.totalProjects),
              note: 'Across all workspaces',
              icon: FolderOpen,
            },
            {
              label: 'Recorded errors',
              value: number(props.stats.failedProjects),
              note: 'Projects with saved error',
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

function UsersTab(props: {
  users: any[]
  projects: AdminProject[]
  onSelectUser: (user: any, tab?: 'overview' | 'projects') => void
  onToggleGpt: (id: string, enabled: boolean) => void
}) {
  const { getToken } = useAuth()
  const [savingGpt, setSavingGpt] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')

  const toggleGpt = async (user: any, e: MouseEvent) => {
    e.stopPropagation()
    setSavingGpt(user.id)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const result = await api.patch<{ gptEnabled: boolean }>(
        `/admin/users/${encodeURIComponent(user.id)}/gpt-access`,
        token,
        { gptEnabled: !user.gptEnabled },
      )
      props.onToggleGpt(user.id, result.gptEnabled)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update GPT access')
    } finally {
      setSavingGpt(null)
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
            <th>OpenAI & Azure GPT</th>
            <th>Subscription</th>
            <th>Joined</th>
            <th>Credits left</th>
            <th>Projects / Jobs</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.users}
            fallback={
              <tr>
                <td colSpan="8">
                  <EmptyState
                    title="No users found"
                    description="Try a different name, email, or user ID."
                  />
                </td>
              </tr>
            }
          >
            {user => {
              const userProjects = () => props.projects.filter(p => p.userId === user.id)
              return (
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
                        <CopyChip text={user.id} prefix="ID" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={user.role === 'admin' ? 'ready' : undefined}>{user.role}</Badge>
                  </td>
                  <td>
                    <Show when={typeof user.gptEnabled === 'boolean'} fallback="—">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!user.gptEnabled}
                        aria-label={`OpenAI & Azure GPT model permission for ${user.email}`}
                        title="Controls eligibility for OpenAI and Azure GPT models (GPT-5.4, GPT-5.5, Sol, Astra, etc.)"
                        disabled={savingGpt() !== null}
                        class="admin-access"
                        onClick={e => void toggleGpt(user, e)}
                      >
                        <span class="admin-switch">
                          <span>
                            <Show when={user.gptEnabled}>
                              <Check size={9} />
                            </Show>
                          </span>
                        </span>
                        <span>
                          {savingGpt() === user.id
                            ? 'Saving…'
                            : user.gptEnabled
                              ? 'Allowed'
                              : 'Off'}
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
                  <td class="admin-numeric">
                    <strong>{number(user.creditsRemaining)}</strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="admin-text-button"
                      onClick={() => props.onSelectUser(user, 'projects')}
                      title="View all jobs for this user"
                    >
                      <span>{number(userProjects().length)} jobs</span>
                      <ArrowUpRight size={13} />
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="admin-button admin-button--sm"
                      onClick={() => props.onSelectUser(user)}
                    >
                      <Eye size={12} />
                      Inspect
                    </button>
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function ProjectsTab(props: {
  projects: AdminProject[]
  onSelectProject: (project: AdminProject, tab?: 'video' | 'prompts') => void
  onSelectUser: (userId: string) => void
}) {
  return (
    <div class="admin-table-wrap">
      <table class="admin-table" aria-label="Projects and Jobs">
        <thead>
          <tr>
            <th>Project / Job</th>
            <th>Owner</th>
            <th>User prompt preview</th>
            <th>Final output</th>
            <th>Status</th>
            <th>Credits</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.projects}
            fallback={
              <tr>
                <td colSpan="8">
                  <EmptyState
                    title="No projects found"
                    description="Try another search or choose a different status or flow."
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
                    onClick={() => props.onSelectProject(project)}
                  >
                    <span class="admin-project-icon">
                      <FolderOpen size={16} />
                    </span>
                    <span class="admin-cell-copy">
                      <strong>{project.title || 'Untitled project'}</strong>
                      <div
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '6px',
                          'margin-top': '3px',
                        }}
                      >
                        <Badge>{flowName(project.flow)}</Badge>
                        <CopyChip text={project.id} />
                      </div>
                    </span>
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    class="admin-owner-btn"
                    title={`Inspect user ${project.userEmail}`}
                    onClick={() => props.onSelectUser(project.userId)}
                  >
                    <strong>{project.userName || project.userEmail || 'Unknown'}</strong>
                    <small>{project.userEmail || project.userId}</small>
                  </button>
                </td>
                <td>
                  <div
                    class="admin-prompt-preview"
                    title={project.prompt || 'Started with upload'}
                    onClick={() => props.onSelectProject(project, 'prompts')}
                  >
                    {project.prompt ? project.prompt : <em>Started with upload</em>}
                  </div>
                </td>
                <td>
                  <Show
                    when={project.finalVideoUrl}
                    fallback={
                      <Show
                        when={project.outputs?.some(o => o.kind === 'pdf')}
                        fallback={
                          <Show
                            when={project.status === 'working'}
                            fallback={<Badge tone={project.status}>{project.status}</Badge>}
                          >
                            <Badge tone="working">Generating…</Badge>
                          </Show>
                        }
                      >
                        <Badge tone="ready">
                          <FileText size={11} /> PDF ready
                        </Badge>
                      </Show>
                    }
                  >
                    <div style={{ display: 'inline-flex', 'align-items': 'center', gap: '5px' }}>
                      <button
                        type="button"
                        class="admin-video-pill"
                        title="Watch final video in details"
                        onClick={() => props.onSelectProject(project, 'video')}
                      >
                        <Play size={11} fill="currentColor" />
                        Watch video
                      </button>
                      <CopyBtn text={project.finalVideoUrl!} label="Link" />
                    </div>
                  </Show>
                </td>
                <td>
                  <Badge tone={project.status}>{project.status}</Badge>
                  <Show when={project.isRefunded}>
                    <Badge tone="failed">Refunded</Badge>
                  </Show>
                </td>
                <td class="admin-numeric">
                  <strong>{number(project.creditsCharged)}</strong>
                  <Show when={typeof project.usageUsd === 'number' && project.usageUsd > 0}>
                    <small
                      style={{ display: 'block', color: 'var(--admin-muted)', 'font-size': '10px' }}
                    >
                      ${project.usageUsd?.toFixed(2)}
                    </small>
                  </Show>
                </td>
                <td class="admin-nowrap">{dateTime(project.createdAt)}</td>
                <td>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                    <button
                      type="button"
                      class="admin-button admin-button--sm"
                      onClick={() => props.onSelectProject(project)}
                    >
                      Details
                    </button>
                    <a
                      href={`/admin/projects/${project.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="admin-button admin-button--sm"
                      title="Open in Studio"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function ProjectDetailDialog(props: {
  open: boolean
  project: AdminProject | null
  detail: AdminProjectDetail | null
  loading: boolean
  activeTab: 'video' | 'prompts' | 'transcript' | 'execution'
  onTabChange: (tab: 'video' | 'prompts' | 'transcript' | 'execution') => void
  onClose: () => void
  onOpenUser: (userId: string) => void
  onFailProject: (projectId: string, reason: string) => Promise<void>
  onDeleteProject: (projectId: string) => Promise<void>
}) {
  const p = () => props.detail || props.project
  const { getToken } = useAuth()
  const [failing, setFailing] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)
  const [downloading, setDownloading] = createSignal<ReviewDownload | null>(null)

  const handleDownload = async (kind: ReviewDownload) => {
    const proj = p()
    if (!proj || downloading()) return
    setDownloading(kind)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const { blob, filename } = await adminStudio.download(token, proj.id, kind)
      saveBlob(blob, filename ?? `pitch-${proj.id}-${kind === 'logs' ? 'logs.json' : 'chat.md'}`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  const handleFail = async () => {
    const proj = p()
    if (!proj) return
    const reason = window.prompt(
      'Enter failure reason (user will be refunded):',
      'Marked failed by an administrator',
    )
    if (!reason) return
    setFailing(true)
    try {
      await props.onFailProject(proj.id, reason)
    } finally {
      setFailing(false)
    }
  }

  const handleDelete = async () => {
    const proj = p()
    if (!proj) return
    if (
      !window.confirm(
        `Permanently delete project "${proj.title || proj.id}"? This cannot be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      await props.onDeleteProject(proj.id)
      props.onClose()
    } finally {
      setDeleting(false)
    }
  }

  const userPrompts = () => {
    const d = props.detail
    if (d?.userPrompts && d.userPrompts.length > 0) return d.userPrompts
    const initial = p()?.prompt?.trim()
    return initial ? [{ text: initial, at: new Date(p()?.createdAt || '').getTime() }] : []
  }

  return (
    <Dialog
      open={props.open}
      title={p()?.title || 'Project details'}
      onClose={props.onClose}
      class="admin-dialog admin-dialog--wide"
    >
      <div class="admin-dialog__topbar">
        <div class="admin-dialog__titles">
          <div class="admin-eyebrow" style={{ 'margin-bottom': '6px' }}>
            <Badge tone="ready">{flowName(p()?.flow)}</Badge>
            <Badge tone={p()?.status}>{p()?.status}</Badge>
            <Show when={p()?.isRefunded}>
              <Badge tone="failed">Refunded</Badge>
            </Show>
          </div>
          <h2>{p()?.title || 'Untitled Project'}</h2>
          <div
            style={{
              display: 'flex',
              'flex-wrap': 'wrap',
              'align-items': 'center',
              gap: '8px',
              'margin-top': '8px',
            }}
          >
            <CopyChip text={p()?.id || ''} prefix="ID" />
            <Show when={p()?.userId}>
              <button
                type="button"
                class="admin-text-button"
                style={{ 'font-size': '11px', padding: '2px 6px' }}
                onClick={() => props.onOpenUser(p()!.userId)}
              >
                Owner: {p()?.userEmail || p()?.userName || p()?.userId}
                <ArrowUpRight size={12} />
              </button>
            </Show>
            <span style={{ color: 'var(--admin-muted)', 'font-size': '11px' }}>
              Created: {dateTime(p()?.createdAt)}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="admin-icon-button"
          aria-label="Close dialog"
          onClick={props.onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div class="admin-action-row">
        <a
          href={`/admin/projects/${p()?.id}`}
          target="_blank"
          rel="noopener noreferrer"
          class="admin-button admin-button--primary admin-button--sm"
        >
          <ExternalLink size={13} />
          Open in Studio
        </a>
        <button
          type="button"
          class="admin-button admin-button--sm"
          disabled={!!downloading()}
          onClick={() => void handleDownload('chat')}
        >
          <Download size={13} />
          {downloading() === 'chat' ? 'Preparing…' : 'Download chat'}
        </button>
        <button
          type="button"
          class="admin-button admin-button--sm"
          disabled={!!downloading()}
          onClick={() => void handleDownload('logs')}
        >
          <Download size={13} />
          {downloading() === 'logs' ? 'Preparing…' : 'Download logs'}
        </button>
        <Show when={p()?.shareSlug}>
          <a
            href={`/share/${p()?.shareSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            class="admin-button admin-button--sm"
          >
            <ExternalLink size={13} />
            Public link (/share/{p()?.shareSlug})
          </a>
        </Show>
        <Show when={p()?.status !== 'failed' && !p()?.isRefunded}>
          <button
            type="button"
            class="admin-button admin-button--danger admin-button--sm"
            disabled={failing()}
            onClick={handleFail}
          >
            <TriangleAlert size={13} />
            {failing() ? 'Refunding…' : 'Mark failed & refund'}
          </button>
        </Show>
        <button
          type="button"
          class="admin-button admin-button--danger admin-button--sm"
          disabled={deleting()}
          onClick={handleDelete}
        >
          <Trash2 size={13} />
          {deleting() ? 'Deleting…' : 'Delete project'}
        </button>
      </div>

      {/* Dialog Subtabs */}
      <nav class="admin-dialog-tabs" aria-label="Project detail sections">
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'video' ? 'page' : undefined}
          onClick={() => props.onTabChange('video')}
        >
          <Video size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Final video & outputs ({p()?.outputs?.length ?? 0})
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'prompts' ? 'page' : undefined}
          onClick={() => props.onTabChange('prompts')}
        >
          <FileText size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          User prompts ({userPrompts().length})
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'transcript' ? 'page' : undefined}
          onClick={() => props.onTabChange('transcript')}
        >
          <Activity size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Activity & transcript ({props.detail?.entries?.length ?? 0})
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'execution' ? 'page' : undefined}
          onClick={() => props.onTabChange('execution')}
        >
          <Shield size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Execution & renders ({props.detail?.renderJobs?.length ?? 0})
        </button>
      </nav>

      <Show when={props.loading}>
        <div style={{ padding: '12px 0' }}>
          <Loading label="Fetching full project transcript and render state…" />
        </div>
      </Show>

      {/* Tab 1: Video & Outputs */}
      <Show when={props.activeTab === 'video'}>
        <Show
          when={p()?.finalVideoUrl}
          fallback={
            <div
              style={{
                padding: '24px',
                'text-align': 'center',
                border: '1px dashed var(--admin-border)',
                'border-radius': '12px',
                margin: '16px 0',
              }}
            >
              <p style={{ margin: '0 0 6px', 'font-size': '14px', 'font-weight': '500' }}>
                No final video URL found for this project
              </p>
              <p style={{ color: 'var(--admin-muted)', 'font-size': '12px', margin: 0 }}>
                {p()?.status === 'working'
                  ? 'This job is currently being generated. Check back shortly.'
                  : p()?.status === 'failed'
                    ? 'Generation failed. See the Execution tab for the error trace.'
                    : 'The project may be an interactive slide deck, audio project, or empty workspace.'}
              </p>
            </div>
          }
        >
          {url => (
            <div class="admin-video-box">
              <video
                controls
                playsinline
                preload="metadata"
                src={url()}
                poster={p()?.thumbnailUrl || undefined}
              />
              <div class="admin-video-url-bar">
                <span class="admin-video-url-text">{url()}</span>
                <CopyBtn text={url()} label="Copy URL" />
                <a
                  href={url()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="admin-button admin-button--sm"
                >
                  <ExternalLink size={12} />
                  Open
                </a>
                <a href={url()} download="" class="admin-button admin-button--sm">
                  <Download size={12} />
                  Download
                </a>
              </div>
            </div>
          )}
        </Show>

        <h3 style={{ 'font-size': '13px', 'font-weight': '600', margin: '20px 0 10px' }}>
          Published outputs ({p()?.outputs?.length ?? 0})
        </h3>
        <div class="admin-outputs-list">
          <For
            each={p()?.outputs ?? []}
            fallback={
              <p style={{ color: 'var(--admin-muted)', 'font-size': '12px', margin: '6px 0' }}>
                No published outputs recorded in project row.
              </p>
            }
          >
            {output => (
              <div class="admin-output-card">
                <div class="admin-output-card__meta">
                  <Badge tone="ready">{output.kind}</Badge>
                  <div>
                    <strong>{output.label || output.kind}</strong>
                    <div style={{ color: 'var(--admin-muted)', 'font-size': '11px' }}>
                      {output.res ? `${output.res} · ` : ''}
                      {dateTime(output.createdAt)}
                    </div>
                  </div>
                </div>
                <div class="admin-output-card__actions">
                  <CopyBtn text={output.url} label="Copy Link" />
                  <a
                    href={output.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="admin-button admin-button--sm"
                  >
                    <ExternalLink size={12} />
                    Open
                  </a>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Tab 2: Prompts */}
      <Show when={props.activeTab === 'prompts'}>
        <div style={{ margin: '16px 0' }}>
          <div
            style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}
          >
            <h3 style={{ 'font-size': '14px', 'font-weight': '600', margin: 0 }}>
              User prompts history
            </h3>
            <span style={{ color: 'var(--admin-muted)', 'font-size': '11px' }}>
              {userPrompts().length} recorded prompt{userPrompts().length === 1 ? '' : 's'}
            </span>
          </div>
          <div class="admin-prompts-list">
            <For
              each={userPrompts()}
              fallback={
                <div
                  style={{
                    padding: '20px',
                    'text-align': 'center',
                    background: 'var(--admin-soft)',
                    'border-radius': '10px',
                  }}
                >
                  <p style={{ margin: 0, color: 'var(--admin-muted)', 'font-size': '12px' }}>
                    This project was started without a prompt (e.g. from an asset upload).
                  </p>
                </div>
              }
            >
              {(prompt, idx) => (
                <div class="admin-prompt-card">
                  <div class="admin-prompt-card__header">
                    <Badge tone="ready">
                      {idx() === 0 ? 'Initial prompt' : `Prompt #${idx() + 1}`}
                    </Badge>
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                      <Clock size={12} />
                      <span>{dateTime(prompt.at)}</span>
                      <CopyBtn text={prompt.text} label="Copy" />
                    </div>
                  </div>
                  <p class="admin-prompt-card__text">{prompt.text}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Tab 3: Transcript & Tools */}
      <Show when={props.activeTab === 'transcript'}>
        <div style={{ margin: '16px 0' }}>
          <h3 style={{ 'font-size': '14px', 'font-weight': '600', margin: '0 0 10px' }}>
            Agent session transcript
          </h3>
          <div class="admin-transcript-feed">
            <For
              each={props.detail?.entries ?? []}
              fallback={
                <p
                  style={{
                    color: 'var(--admin-muted)',
                    'font-size': '12px',
                    'text-align': 'center',
                    padding: '24px 0',
                  }}
                >
                  No session transcript available or session not initialized yet.
                </p>
              }
            >
              {entry => (
                <div class="admin-transcript-entry" data-role={entry.role}>
                  <div class="admin-transcript-entry__header">
                    <span>
                      <Badge
                        tone={
                          entry.role === 'user'
                            ? 'ready'
                            : entry.role === 'tool'
                              ? 'working'
                              : undefined
                        }
                      >
                        {entry.role}
                      </Badge>
                      <Show when={entry.tool}>
                        <span style={{ 'margin-left': '6px' }}>{entry.tool?.name}</span>
                      </Show>
                    </span>
                    <span style={{ 'font-weight': 'normal', 'font-size': '10px' }}>
                      {dateTime(entry.at)}
                    </span>
                  </div>
                  <div style={{ 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' }}>
                    {entry.text || (entry.ask ? JSON.stringify(entry.ask) : '—')}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Tab 4: Execution & Renders */}
      <Show when={props.activeTab === 'execution'}>
        <div style={{ margin: '16px 0' }}>
          <Show when={p()?.lastError}>
            <div class="admin-alert" style={{ 'margin-bottom': '18px' }}>
              <strong>Error recorded:</strong>
              <pre
                style={{
                  margin: '8px 0 0',
                  'font-size': '11px',
                  'white-space': 'pre-wrap',
                  'overflow-wrap': 'anywhere',
                }}
              >
                {p()?.lastError}
              </pre>
            </div>
          </Show>

          <dl class="admin-details" style={{ margin: 0, 'padding-top': '8px' }}>
            <div>
              <dt>Pipeline / Flow</dt>
              <dd>
                {flowName(p()?.flow)} ({p()?.flow})
              </dd>
            </div>
            <div>
              <dt>AI Model</dt>
              <dd>{props.detail?.activeModel || p()?.options?.model || 'Studio default'}</dd>
            </div>
            <div>
              <dt>Credits charged</dt>
              <dd>{number(p()?.creditsCharged)} credits</dd>
            </div>
            <div>
              <dt>USD Spend</dt>
              <dd>
                {typeof p()?.usageUsd === 'number' && p()!.usageUsd! > 0
                  ? `$${p()!.usageUsd!.toFixed(4)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Workspace versions</dt>
              <dd>{p()?.workspaceVersion ?? 0}</dd>
            </div>
            <div>
              <dt>Worker ID</dt>
              <dd>{p()?.workerId || 'None (idle)'}</dd>
            </div>
          </dl>

          <h3 style={{ 'font-size': '13px', 'font-weight': '600', margin: '22px 0 10px' }}>
            Render tier jobs ({props.detail?.renderJobs?.length ?? 0})
          </h3>
          <div class="admin-table-wrap">
            <table class="admin-mini-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Renderer</th>
                  <th>Started</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={props.detail?.renderJobs ?? []}
                  fallback={
                    <tr>
                      <td
                        colSpan="7"
                        style={{
                          'text-align': 'center',
                          color: 'var(--admin-muted)',
                          padding: '16px',
                        }}
                      >
                        No remote render tier jobs recorded for this project.
                      </td>
                    </tr>
                  }
                >
                  {job => (
                    <tr>
                      <td>
                        <strong>{job.action}</strong>
                      </td>
                      <td>
                        <Badge tone={job.status}>{job.status}</Badge>
                      </td>
                      <td>{job.stage || '—'}</td>
                      <td>{job.progress}%</td>
                      <td>{job.renderer || '—'}</td>
                      <td>{date(job.startedAt)}</td>
                      <td>{date(job.finishedAt)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <h3 style={{ 'font-size': '13px', 'font-weight': '600', margin: '22px 0 10px' }}>
            Credit transactions for this project
          </h3>
          <div class="admin-table-wrap">
            <table class="admin-mini-table">
              <thead>
                <tr>
                  <th>Delta</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={props.detail?.creditTransactions ?? []}
                  fallback={
                    <tr>
                      <td
                        colSpan="4"
                        style={{
                          'text-align': 'center',
                          color: 'var(--admin-muted)',
                          padding: '16px',
                        }}
                      >
                        No ledger transactions found for this project.
                      </td>
                    </tr>
                  }
                >
                  {tx => (
                    <tr>
                      <td
                        style={{
                          color: tx.delta >= 0 ? 'var(--success)' : 'inherit',
                          'font-weight': '600',
                        }}
                      >
                        {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                      </td>
                      <td>
                        <Badge>{tx.type}</Badge>
                      </td>
                      <td>{tx.description}</td>
                      <td>{dateTime(tx.createdAt)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>
    </Dialog>
  )
}

function UserDetailDialog(props: {
  open: boolean
  user: any
  detail: AdminUserDetail | null
  loading: boolean
  activeTab: 'overview' | 'projects' | 'ledger' | 'survey' | 'affiliate'
  onTabChange: (tab: 'overview' | 'projects' | 'ledger' | 'survey' | 'affiliate') => void
  onClose: () => void
  onToggleGpt: (userId: string, enabled: boolean) => void
  onAdjustCredits: (userId: string, newBalance: number, tx: any) => void
  onOpenProject: (project: AdminProject) => void
}) {
  const { getToken } = useAuth()
  const u = () => props.detail?.user || props.user
  const [savingGpt, setSavingGpt] = createSignal(false)
  const [error, setError] = createSignal('')

  const toggleGpt = async () => {
    const user = u()
    if (!user) return
    setSavingGpt(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const result = await api.patch<{ gptEnabled: boolean }>(
        `/admin/users/${encodeURIComponent(user.id)}/gpt-access`,
        token,
        { gptEnabled: !user.gptEnabled },
      )
      props.onToggleGpt(user.id, result.gptEnabled)
    } catch (err: any) {
      setError(err?.message || 'Failed to update GPT access')
    } finally {
      setSavingGpt(false)
    }
  }

  const projects = () => props.detail?.projects ?? []
  const transactions = () => props.detail?.transactions ?? []

  return (
    <Dialog
      open={props.open}
      title={u()?.email || 'User details'}
      onClose={props.onClose}
      class="admin-dialog admin-dialog--wide"
    >
      <div class="admin-dialog__topbar">
        <div class="admin-user-header" style={{ border: 'none', padding: 0 }}>
          <span class="admin-user-avatar-lg">
            {(u()?.firstName?.[0] || u()?.email?.[0] || '?').toUpperCase()}
            {u()?.lastName?.[0]?.toUpperCase()}
          </span>
          <div class="admin-user-meta">
            <h2>{`${u()?.firstName ?? ''} ${u()?.lastName ?? ''}`.trim() || u()?.email}</h2>
            <div style={{ color: 'var(--admin-muted)', 'font-size': '13px' }}>{u()?.email}</div>
            <div class="admin-user-chips">
              <CopyChip text={u()?.id || ''} prefix="User ID" />
              <Badge tone={u()?.role === 'admin' ? 'ready' : undefined}>{u()?.role}</Badge>
              <Show when={u()?.discordUserId}>
                <CopyChip text={u()?.discordUserId} prefix="Discord" />
              </Show>
              <span
                style={{ color: 'var(--admin-muted)', 'font-size': '11px', 'margin-left': '4px' }}
              >
                Joined: {date(u()?.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="admin-icon-button"
          aria-label="Close dialog"
          onClick={props.onClose}
        >
          <X size={18} />
        </button>
      </div>

      <Show when={error()}>
        <p class="admin-alert">{error()}</p>
      </Show>

      {/* Subtabs */}
      <nav class="admin-dialog-tabs" aria-label="User detail sections">
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'overview' ? 'page' : undefined}
          onClick={() => props.onTabChange('overview')}
        >
          <CreditCard size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Overview & Credits
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'projects' ? 'page' : undefined}
          onClick={() => props.onTabChange('projects')}
        >
          <FolderOpen size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Projects / Jobs ({projects().length})
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'ledger' ? 'page' : undefined}
          onClick={() => props.onTabChange('ledger')}
        >
          <Activity size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Ledger ({transactions().length})
        </button>
        <button
          type="button"
          class="admin-dialog-tab"
          aria-current={props.activeTab === 'survey' ? 'page' : undefined}
          onClick={() => props.onTabChange('survey')}
        >
          <FileText size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
          Onboarding survey
        </button>
        <Show when={props.detail?.affiliate}>
          <button
            type="button"
            class="admin-dialog-tab"
            aria-current={props.activeTab === 'affiliate' ? 'page' : undefined}
            onClick={() => props.onTabChange('affiliate')}
          >
            <UsersIcon size={13} style={{ display: 'inline', 'margin-right': '5px' }} />
            Affiliate
          </button>
        </Show>
      </nav>

      <Show when={props.loading}>
        <div style={{ padding: '12px 0' }}>
          <Loading label="Loading complete user profile and ledger history…" />
        </div>
      </Show>

      {/* Overview & Credits */}
      <Show when={props.activeTab === 'overview'}>
        <div class="admin-user-stats">
          <div class="admin-stat">
            <div class="admin-stat__label">
              <p>Remaining balance</p>
              <Wallet size={14} />
            </div>
            <strong>
              {number(props.detail?.credits?.remaining ?? props.user?.creditsRemaining)}
            </strong>
            <p class="admin-stat__note">Available credits</p>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">
              <p>Lifetime bought</p>
              <Plus size={14} />
            </div>
            <strong>
              {number(props.detail?.credits?.lifetimeBought ?? props.user?.creditsBought)}
            </strong>
            <p class="admin-stat__note">Purchased & top-ups</p>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">
              <p>Active plan</p>
              <CreditCard size={14} />
            </div>
            <strong style={{ 'font-size': '20px', 'text-transform': 'capitalize' }}>
              {props.detail?.subscription?.planKey || props.user?.subscription?.planKey || 'None'}
            </strong>
            <p class="admin-stat__note">
              Status:{' '}
              {props.detail?.subscription?.status || props.user?.subscription?.status || 'inactive'}
            </p>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">
              <p>OpenAI & Azure GPT</p>
              <Shield size={14} />
            </div>
            <div style={{ 'margin-top': '14px' }}>
              <button
                type="button"
                role="switch"
                aria-checked={!!u()?.gptEnabled}
                aria-label={`OpenAI & Azure GPT access for ${u()?.email}`}
                disabled={savingGpt()}
                class="admin-access"
                onClick={toggleGpt}
              >
                <span class="admin-switch">
                  <span>
                    <Show when={u()?.gptEnabled}>
                      <Check size={9} />
                    </Show>
                  </span>
                </span>
                <span style={{ 'font-weight': '600' }}>
                  {savingGpt() ? 'Saving…' : u()?.gptEnabled ? 'Allowed' : 'Off'}
                </span>
              </button>
            </div>
            <p class="admin-stat__note">OpenAI & Azure GPT model eligibility</p>
          </div>
        </div>

        {/* Credit adjustment tool */}
        <CreditAdjustmentCard
          userId={u()?.id}
          onAdjusted={(newBal, tx) => props.onAdjustCredits(u()?.id, newBal, tx)}
        />

        {/* Top-up purchases */}
        <h3 style={{ 'font-size': '13px', 'font-weight': '600', margin: '20px 0 10px' }}>
          Top-up purchases ({props.detail?.topUps?.length ?? 0})
        </h3>
        <div class="admin-table-wrap">
          <table class="admin-mini-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th>Amount</th>
                <th>Credits</th>
                <th>Payment ID</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={props.detail?.topUps ?? []}
                fallback={
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        'text-align': 'center',
                        color: 'var(--admin-muted)',
                        padding: '16px',
                      }}
                    >
                      No top-up credit purchases recorded.
                    </td>
                  </tr>
                }
              >
                {topUp => (
                  <tr>
                    <td>
                      <strong>{topUp.packKey}</strong>
                    </td>
                    <td>${topUp.amountUsd}</td>
                    <td>+{topUp.credits}</td>
                    <td>
                      <CopyChip text={topUp.dodoPaymentId} />
                    </td>
                    <td>{dateTime(topUp.createdAt)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      {/* Projects / Jobs */}
      <Show when={props.activeTab === 'projects'}>
        <div style={{ margin: '16px 0' }}>
          <div class="admin-table-wrap">
            <table class="admin-mini-table">
              <thead>
                <tr>
                  <th>Job / Title</th>
                  <th>Flow</th>
                  <th>Status</th>
                  <th>User prompt</th>
                  <th>Output</th>
                  <th>Credits</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={projects()}
                  fallback={
                    <tr>
                      <td
                        colSpan="8"
                        style={{
                          'text-align': 'center',
                          color: 'var(--admin-muted)',
                          padding: '20px',
                        }}
                      >
                        No projects created by this user yet.
                      </td>
                    </tr>
                  }
                >
                  {project => (
                    <tr>
                      <td>
                        <strong>{project.title || 'Untitled project'}</strong>
                        <div style={{ 'margin-top': '2px' }}>
                          <CopyChip text={project.id} />
                        </div>
                      </td>
                      <td>
                        <Badge>{flowName(project.flow)}</Badge>
                      </td>
                      <td>
                        <Badge tone={project.status}>{project.status}</Badge>
                      </td>
                      <td>
                        <div class="admin-prompt-preview" title={project.prompt}>
                          {project.prompt || <em>Started with upload</em>}
                        </div>
                      </td>
                      <td>
                        <Show
                          when={project.finalVideoUrl}
                          fallback={
                            <Show when={project.outputs?.length > 0} fallback="—">
                              <Badge tone="ready">{project.outputs.length} outputs</Badge>
                            </Show>
                          }
                        >
                          <span
                            class="admin-video-pill"
                            style={{ 'font-size': '10px', padding: '2px 6px' }}
                          >
                            <Play size={10} fill="currentColor" />
                            Video
                          </span>
                        </Show>
                      </td>
                      <td class="admin-numeric">{number(project.creditsCharged)}</td>
                      <td>{date(project.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          class="admin-button admin-button--sm"
                          onClick={() => props.onOpenProject(project)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      {/* Ledger */}
      <Show when={props.activeTab === 'ledger'}>
        <div style={{ margin: '16px 0' }}>
          <div class="admin-table-wrap">
            <table class="admin-mini-table">
              <thead>
                <tr>
                  <th>Delta</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Project</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={transactions()}
                  fallback={
                    <tr>
                      <td
                        colSpan="5"
                        style={{
                          'text-align': 'center',
                          color: 'var(--admin-muted)',
                          padding: '20px',
                        }}
                      >
                        No credit transactions found.
                      </td>
                    </tr>
                  }
                >
                  {tx => (
                    <tr>
                      <td
                        style={{
                          color: tx.delta >= 0 ? 'var(--success)' : 'inherit',
                          'font-weight': '600',
                        }}
                      >
                        {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                      </td>
                      <td>
                        <Badge>{tx.type}</Badge>
                      </td>
                      <td>{tx.description}</td>
                      <td>
                        <Show when={tx.projectId} fallback="—">
                          <CopyChip text={tx.projectId!} />
                        </Show>
                      </td>
                      <td>{dateTime(tx.createdAt)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      {/* Survey */}
      <Show when={props.activeTab === 'survey'}>
        <div style={{ margin: '16px 0' }}>
          <Show
            when={props.detail?.user?.onboardingSurvey}
            fallback={
              <div
                style={{
                  padding: '24px',
                  'text-align': 'center',
                  background: 'var(--admin-soft)',
                  'border-radius': '12px',
                }}
              >
                <p style={{ margin: 0, color: 'var(--admin-muted)' }}>
                  User has not filled out the onboarding survey or skipped it.
                </p>
              </div>
            }
          >
            {survey => (
              <dl class="admin-details" style={{ margin: 0 }}>
                <div>
                  <dt>Creation goal</dt>
                  <dd>
                    <strong>{survey().creationGoal || '—'}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Role / Profession</dt>
                  <dd>
                    <strong>{survey().role || '—'}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Team size</dt>
                  <dd>{survey().teamSize || '—'}</dd>
                </div>
                <div>
                  <dt>Monthly video volume</dt>
                  <dd>{survey().monthlyVolume || '—'}</dd>
                </div>
                <div>
                  <dt>Discovery source</dt>
                  <dd>{survey().discoverySource || '—'}</dd>
                </div>
                <div>
                  <dt>Completed date</dt>
                  <dd>{date(survey().completedAt)}</dd>
                </div>
              </dl>
            )}
          </Show>
        </div>
      </Show>

      {/* Affiliate */}
      <Show when={props.activeTab === 'affiliate' && props.detail?.affiliate}>
        {aff => (
          <div style={{ margin: '16px 0' }}>
            <div class="admin-stat" style={{ 'margin-bottom': '16px' }}>
              <div class="admin-stat__label">
                <p>Referral code</p>
                <Badge tone="ready">{aff().code}</Badge>
              </div>
              <strong style={{ 'font-size': '24px' }}>{aff().code}</strong>
              <p class="admin-stat__note">Status: {aff().status}</p>
            </div>
            <dl class="admin-details" style={{ margin: 0 }}>
              <div>
                <dt>Total clicks</dt>
                <dd>{number(aff().totalClicks)}</dd>
              </div>
              <div>
                <dt>Total signups</dt>
                <dd>{number(aff().totalSignups)}</dd>
              </div>
              <div>
                <dt>Conversions</dt>
                <dd>{number(aff().totalConversions)}</dd>
              </div>
              <div>
                <dt>Credits earned</dt>
                <dd>{number(aff().creditsEarned)}</dd>
              </div>
              <div>
                <dt>Videos earned</dt>
                <dd>{number(aff().videosEarned)}</dd>
              </div>
              <div>
                <dt>Revenue generated</dt>
                <dd>${aff().totalRevenue?.toFixed(2) || '0.00'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Show>
    </Dialog>
  )
}

function CreditAdjustmentCard(props: {
  userId?: string
  onAdjusted: (newBalance: number, tx: any) => void
}) {
  const { getToken } = useAuth()
  const [amount, setAmount] = createSignal<number>(10)
  const [isDeduction, setIsDeduction] = createSignal(false)
  const [description, setDescription] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [msg, setMsg] = createSignal('')
  const [error, setError] = createSignal('')

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!props.userId || saving()) return
    const amt = Math.floor(amount())
    if (!amt || amt <= 0) {
      setError('Enter a positive integer amount')
      return
    }
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const res = await api.post<{ success: boolean; newBalance: number }>(
        `/admin/users/${encodeURIComponent(props.userId)}/credits`,
        token,
        {
          amount: amt,
          isDeduction: isDeduction(),
          description: description().trim() || undefined,
        },
      )
      setMsg(
        `Successfully ${isDeduction() ? 'deducted' : 'added'} ${amt} credits. New balance: ${res.newBalance}`,
      )
      props.onAdjusted(res.newBalance, {
        id: `adj-${Date.now()}`,
        delta: isDeduction() ? -amt : amt,
        type: 'admin_adjustment',
        description:
          description().trim() ||
          `Manual admin adjustment: ${isDeduction() ? '-' : '+'}${amt} credits`,
        createdAt: new Date().toISOString(),
      })
      setDescription('')
    } catch (err: any) {
      setError(err?.message || 'Failed to adjust credits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form class="admin-adjust-card" onSubmit={submit}>
      <h3>Adjust user credits</h3>
      <Show when={error()}>
        <p class="admin-alert">{error()}</p>
      </Show>
      <Show when={msg()}>
        <p class="admin-result" style={{ color: 'var(--success)', 'margin-bottom': '12px' }}>
          {msg()}
        </p>
      </Show>
      <div class="admin-adjust-grid">
        <label class="admin-field" style={{ margin: 0 }}>
          <span>Action</span>
          <select
            class="admin-input"
            value={isDeduction() ? 'deduct' : 'add'}
            onChange={e => setIsDeduction(e.currentTarget.value === 'deduct')}
          >
            <option value="add">Add (+)</option>
            <option value="deduct">Deduct (-)</option>
          </select>
        </label>
        <label class="admin-field" style={{ margin: 0 }}>
          <span>Credits</span>
          <input
            type="number"
            min="1"
            step="1"
            required
            class="admin-input"
            value={amount()}
            onInput={e => setAmount(Number(e.currentTarget.value))}
          />
        </label>
        <label class="admin-field" style={{ margin: 0 }}>
          <span>Reason / Description</span>
          <input
            type="text"
            class="admin-input"
            placeholder="e.g. Support refund, beta grant..."
            value={description()}
            onInput={e => setDescription(e.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          disabled={saving()}
          class="admin-button admin-button--primary"
          style={{ 'align-self': 'flex-end' }}
        >
          {saving() ? 'Applying…' : isDeduction() ? 'Deduct credits' : 'Add credits'}
        </button>
      </div>
    </form>
  )
}

function Onboarding(props: {
  users: any[]
  onSelectUser: (user: any, tab?: 'overview' | 'projects') => void
}) {
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
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={rows()}
            fallback={
              <tr>
                <td colSpan="7">
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
                  <td>
                    <button
                      type="button"
                      class="admin-owner-btn"
                      onClick={() => props.onSelectUser(user)}
                    >
                      <strong>{user.email}</strong>
                      <small>{date(survey.completedAt)}</small>
                    </button>
                  </td>
                  <td>{survey.creationGoal || '—'}</td>
                  <td>{survey.role || '—'}</td>
                  <td>{survey.teamSize || '—'}</td>
                  <td>{survey.monthlyVolume || '—'}</td>
                  <td>{survey.discoverySource || '—'}</td>
                  <td>
                    <button
                      type="button"
                      class="admin-button admin-button--sm"
                      onClick={() => props.onSelectUser(user, 'overview')}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function Affiliates(props: { data: any; onSelectUser: (userId: string) => void }) {
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
              Referral code <Badge tone="ready">{affiliate.code}</Badge>
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
