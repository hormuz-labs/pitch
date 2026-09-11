import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { api } from '../../lib/api'
import type { Project } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Dialog, Loading, Select } from './primitives'

type Tab = 'users' | 'newsletter' | 'onboarding' | 'projects' | 'affiliates'
type AdminProject = Project & { userEmail?: string | null; userName?: string | null }
const tabs: [Tab, string][] = [
  ['users', 'Users'],
  ['newsletter', 'Email list'],
  ['onboarding', 'Onboarding'],
  ['projects', 'Projects'],
  ['affiliates', 'Affiliates'],
]
const unwrap = (value: any): AdminProject[] => {
  const projects: AdminProject[] = Array.isArray(value)
    ? value
    : Array.isArray(value?.projects)
      ? value.projects
      : []
  return projects.map(project => ({
    ...project,
    status: project.status !== 'working' && project.outputs.length ? 'ready' : project.status,
  }))
}
export function AdminView() {
  const { getToken } = useAuth()
  const [data, setData] = createSignal<any>(null)
  const [projects, setProjects] = createSignal<AdminProject[]>([])
  const [analytics, setAnalytics] = createSignal<any>(null)
  const [newsletter, setNewsletter] = createSignal<any>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [tab, setTab] = createSignal<Tab>('users')
  const [search, setSearch] = createSignal('')
  const [flow, setFlow] = createSignal('all')
  const [selected, setSelected] = createSignal<AdminProject | null>(null)
  const request = async <T,>(path: string) => {
    const token = await getToken()
    if (!token) throw new Error('Not authenticated')
    return api.get<T>(path, token)
  }
  const refreshNewsletter = async () => setNewsletter(await request('/admin/newsletter'))
  onMount(async () => {
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load admin dashboard')
    } finally {
      setLoading(false)
    }
  })
  const filteredProjects = createMemo(() =>
    projects().filter(
      project =>
        (flow() === 'all' || project.flow === flow()) &&
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
    <Show when={!loading()} fallback={<Loading label="Loading admin portal..." />}>
      <Show when={!error()} fallback={<div class="p-8 text-center text-red-600">{error()}</div>}>
        <div class="flex h-full flex-col overflow-hidden">
          <header class="border-b px-6 py-5">
            <h1 class="text-xl font-bold">Admin Portal</h1>
            <p class="text-xs text-gray-400">Platform overview · system health · deep insights</p>
          </header>
          <main class="flex-1 overflow-y-auto p-5">
            <div class="mx-auto max-w-[1400px] space-y-5">
              <Stats stats={data()?.stats} />
              <section class="overflow-hidden rounded-2xl border bg-white">
                <nav class="flex overflow-x-auto border-b px-4">
                  <For each={tabs}>
                    {item => (
                      <button
                        class={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${tab() === item[0] ? 'border-gray-900 font-semibold' : 'border-transparent text-gray-500'}`}
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
                <Show when={tab() === 'users' || tab() === 'projects'}>
                  <div class="flex gap-3 border-b p-3">
                    <input
                      class="min-w-52 flex-1 rounded-xl border bg-gray-50 p-2 text-sm"
                      placeholder="Search..."
                      value={search()}
                      onInput={event => setSearch(event.currentTarget.value)}
                    />
                    <Show when={tab() === 'projects'}>
                      <Select
                        label="Flow"
                        value={flow()}
                        options={[
                          'all',
                          'studio',
                          'launch-video',
                          'demo-video',
                          'deck',
                          'recording-edit',
                        ].map(value => ({ value, label: value }))}
                        onChange={setFlow}
                      />
                    </Show>
                  </div>
                </Show>
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
            </div>
          </main>
          <Dialog
            open={!!selected()}
            title="Project details"
            onClose={() => setSelected(null)}
            class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 class="text-lg font-bold">{selected()?.title || 'Untitled project'}</h2>
            <p class="mt-1 text-xs text-gray-400">{selected()?.id}</p>
            <dl class="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="text-gray-400">Owner</dt>
                <dd>{selected()?.userEmail}</dd>
              </div>
              <div>
                <dt class="text-gray-400">Status</dt>
                <dd>{selected()?.status}</dd>
              </div>
              <div>
                <dt class="text-gray-400">Credits</dt>
                <dd>{selected()?.creditsCharged}</dd>
              </div>
              <div>
                <dt class="text-gray-400">Outputs</dt>
                <dd>{selected()?.outputs.length}</dd>
              </div>
            </dl>
            <p class="mt-5 rounded-lg bg-gray-50 p-3 text-sm">{selected()?.prompt}</p>
          </Dialog>
        </div>
      </Show>
    </Show>
  )
}

function Stats(props: { stats: any }) {
  const success = () =>
    props.stats?.totalProjects
      ? Math.round(
          ((props.stats.totalProjects - props.stats.failedProjects) / props.stats.totalProjects) *
            100,
        )
      : 0
  return (
    <Show when={props.stats}>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <For
          each={[
            ['Total Users', props.stats.totalUsers],
            ['Revenue', `$${(props.stats.totalRevenue ?? 0).toFixed(0)}`],
            ['Projects', props.stats.totalProjects],
            ['Success Rate', `${success()}%`],
          ]}
        >
          {card => (
            <article class="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-4 text-white">
              <p class="text-[10px] uppercase text-white/70">{card[0]}</p>
              <strong class="text-2xl">{card[1]}</strong>
            </article>
          )}
        </For>
        <article class="col-span-2 rounded-xl border bg-white p-3 lg:col-span-4">
          <p class="text-[10px] uppercase text-gray-400">Active sessions</p>
          <strong class="text-xl">{props.stats.activeSessions ?? 0}</strong>
        </article>
      </div>
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
    <div class="overflow-x-auto">
      <Show when={error()}>
        <p role="alert" class="p-3 text-red-600">
          {error()}
        </p>
      </Show>
      <table class="w-full min-w-[700px] text-left text-sm">
        <thead class="bg-gray-50 text-xs uppercase text-gray-400">
          <tr>
            <th class="p-3">User</th>
            <th>Role</th>
            <th>GPT access</th>
            <th>Plan</th>
            <th>Joined</th>
            <th>Credits left</th>
            <th>Projects</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={props.users}
            fallback={
              <tr>
                <td colSpan="7" class="p-12 text-center">
                  No users found
                </td>
              </tr>
            }
          >
            {user => (
              <tr class="border-t">
                <td class="p-3">
                  <b>{`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}</b>
                  <p class="text-xs text-gray-400">{user.email}</p>
                </td>
                <td>{user.role}</td>
                <td>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!user.gptEnabled}
                    aria-label={`GPT access for ${user.email}`}
                    disabled={saving() !== null}
                    class="rounded-lg border px-3 py-1 text-xs disabled:opacity-50"
                    onClick={() => void toggleGpt(user)}
                  >
                    {saving() === user.id ? 'Saving…' : user.gptEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td>{user.subscription?.planKey ?? 'Free'}</td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td>{user.creditsRemaining}</td>
                <td>
                  <button
                    class="text-indigo-600"
                    onClick={() => {
                      const project = props.projects.find(item => item.userId === user.id)
                      if (project) props.onProject(project)
                    }}
                  >
                    {props.projects.filter(item => item.userId === user.id).length} projects
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
    <div class="overflow-x-auto">
      <table class="w-full min-w-[800px] text-left text-sm">
        <thead class="bg-gray-50 text-xs uppercase text-gray-400">
          <tr>
            <th class="p-3">Project</th>
            <th>Flow</th>
            <th>User</th>
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
                <td colSpan="6" class="p-12 text-center">
                  No projects found
                </td>
              </tr>
            }
          >
            {project => (
              <tr
                class="cursor-pointer border-t hover:bg-indigo-50"
                onClick={() => props.onSelect(project)}
              >
                <td class="p-3">
                  <b>{project.title || 'Untitled'}</b>
                  <p class="text-xs text-gray-400">{project.id.slice(-8)}</p>
                </td>
                <td>{project.flow}</td>
                <td>{project.userEmail}</td>
                <td>{project.status}</td>
                <td>{project.creditsCharged}</td>
                <td>{new Date(project.createdAt).toLocaleString()}</td>
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
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr>
            <th class="p-3">User</th>
            <th>Goal</th>
            <th>Role</th>
            <th>Team size</th>
            <th>Volume</th>
            <th>Discovery</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {user => {
              const survey = user.onboardingSurvey
              return (
                <tr class="border-t">
                  <td class="p-3">{user.email}</td>
                  <td>{survey.creationGoal}</td>
                  <td>{survey.role}</td>
                  <td>{survey.teamSize}</td>
                  <td>{survey.monthlyVolume}</td>
                  <td>{survey.discoverySource}</td>
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
    <div class="grid gap-4 p-5 md:grid-cols-3">
      <For
        each={props.data?.affiliates ?? []}
        fallback={<p class="text-sm text-gray-500">No affiliates yet.</p>}
      >
        {affiliate => (
          <article class="rounded-xl border p-4">
            <b>{affiliate.user?.email ?? affiliate.code}</b>
            <p class="text-sm text-gray-500">Code: {affiliate.code}</p>
            <p class="mt-2 text-xs">
              {affiliate.totalClicks ?? 0} clicks · {affiliate.totalConversions ?? 0} conversions
            </p>
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
  const send = async (event: SubmitEvent) => {
    event.preventDefault()
    const ids = (props.audience?.subscribers ?? [])
      .filter((item: any) => item.status === 'subscribed')
      .map((item: any) => item.id)
    if (!ids.length || !confirm(`Send this update to ${ids.length} contacts?`)) return
    const token = await getToken()
    if (!token) return
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
  }
  const add = async (event: SubmitEvent) => {
    event.preventDefault()
    const token = await getToken()
    if (!token) return
    await api.post('/admin/newsletter/subscribers', token, { email: email() })
    setEmail('')
    await props.refresh()
  }
  return (
    <div class="grid lg:grid-cols-2">
      <form class="space-y-3 border-r p-5" onSubmit={send}>
        <h2 class="font-bold">Send a product update</h2>
        <input
          required
          class="w-full rounded-lg border p-2 text-sm"
          placeholder="Subject"
          value={subject()}
          onInput={event => setSubject(event.currentTarget.value)}
        />
        <textarea
          required
          rows="8"
          class="w-full rounded-lg border p-2 text-sm"
          placeholder="Message"
          value={message()}
          onInput={event => setMessage(event.currentTarget.value)}
        />
        <button class="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          Send to subscribers
        </button>
        <p class="text-sm">{result()}</p>
      </form>
      <div class="p-5">
        <h2 class="font-bold">Audience ({props.audience?.subscribed ?? 0})</h2>
        <form class="my-3 flex gap-2" onSubmit={add}>
          <input
            required
            type="email"
            class="flex-1 rounded-lg border p-2 text-sm"
            placeholder="Email"
            value={email()}
            onInput={event => setEmail(event.currentTarget.value)}
          />
          <button class="rounded-lg border px-3 text-sm">Add</button>
        </form>
        <div class="max-h-96 overflow-auto">
          <For each={props.audience?.subscribers ?? []}>
            {contact => (
              <div class="border-t py-2 text-sm">
                <b>{contact.email}</b>
                <span class="float-right text-xs text-gray-400">{contact.status}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
