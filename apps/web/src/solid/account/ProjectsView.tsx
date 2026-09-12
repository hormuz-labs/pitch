import { useNavigate, useSearchParams } from '@solidjs/router'
import { MoreVertical, Plus, Shapes } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import {
  deleteProject,
  listProjects,
  type Project,
  type ProjectStatus,
  share,
  shareUrl,
  thumbnailUrl,
} from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Dialog, Loading, Popover } from './primitives'

const statusClass: Record<ProjectStatus, string> = {
  working: 'bg-blue-50 text-blue-700',
  ready: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-600',
  empty: 'bg-amber-50 text-amber-700',
}
export const projectPath = (project: Pick<Project, 'id'>) => `/p/${project.id}`

export function ProjectsView(props: {
  searchQuery?: string
  onNotice?: (message: string, type: 'success' | 'error') => void
}) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [projects, setProjects] = createSignal<Project[] | null>(null)
  const [token, setToken] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')
  const [deleting, setDeleting] = createSignal<Project | null>(null)
  const load = async () => {
    try {
      const auth = await getToken()
      if (!auth) return
      setToken(auth)
      setProjects(await listProjects(auth))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load projects')
      setProjects(current => current ?? [])
    }
  }
  let timer: number | undefined
  onMount(() => {
    void load()
    timer = window.setInterval(
      () => projects()?.some(project => project.status === 'working') && void load(),
      6000,
    )
  })
  onCleanup(() => clearInterval(timer))
  const visible = createMemo(() => {
    const query = (props.searchQuery ?? '').trim().toLowerCase()
    const kind = typeof params.kind === 'string' ? params.kind : params.kind?.[0]
    return (projects() ?? []).filter(
      project =>
        (kind !== 'deck' ||
          project.flow === 'deck' ||
          project.options.skill === 'slide-deck' ||
          typeof project.options.template === 'string' ||
          project.outputs.some(output => output.kind === 'pdf')) &&
        (!query ||
          [project.title, project.prompt, project.name].some(value =>
            value.toLowerCase().includes(query),
          )),
    )
  })
  const showingDecks = () =>
    (typeof params.kind === 'string' ? params.kind : params.kind?.[0]) === 'deck'
  const notify = (message: string, type: 'success' | 'error') => props.onNotice?.(message, type)
  const shareProject = async (project: Project) => {
    try {
      const auth = await getToken()
      if (!auth) return
      const updated =
        project.isPublic && project.shareSlug ? project : await share(auth, project.id)
      setProjects(
        rows =>
          rows?.map(row =>
            row.id === project.id ? { ...row, ...updated, status: row.status } : row,
          ) ?? null,
      )
      if (!updated.shareSlug) throw new Error('No share link returned')
      await navigator.clipboard.writeText(shareUrl(updated.shareSlug))
      notify('Share link copied', 'success')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Could not share project', 'error')
    }
  }
  const remove = async () => {
    const project = deleting()
    if (!project) return
    setDeleting(null)
    const snapshot = projects()
    setProjects(rows => rows?.filter(row => row.id !== project.id) ?? null)
    try {
      const auth = await getToken()
      if (!auth) throw new Error('Not signed in')
      await deleteProject(auth, project.id)
      notify('Project deleted', 'success')
    } catch (reason) {
      setProjects(snapshot)
      notify(reason instanceof Error ? reason.message : 'Could not delete project', 'error')
    }
  }
  return (
    <div class="projects-page mx-auto w-full max-w-6xl p-6 md:p-8">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">
            {showingDecks() ? 'Slide decks' : 'Projects'}
          </h1>
          <p class="mt-1 text-sm text-gray-500">
            {showingDecks()
              ? 'Open a deck you have made to keep working on it.'
              : 'Open a project to keep working with the agent.'}
          </p>
        </div>
        <button
          class="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white"
          onClick={() => navigate(showingDecks() ? '/new?flow=deck' : '/new')}
        >
          <Plus size={14} />
          {showingDecks() ? 'New deck' : 'New project'}
        </button>
      </header>
      <Show when={error()}>
        <div
          role="alert"
          class="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600"
        >
          {error()}
        </div>
      </Show>
      <Show when={projects() !== null} fallback={<Loading />}>
        <Show
          when={visible().length}
          fallback={
            <div class="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center text-sm text-gray-500">
              {projects()?.length
                ? showingDecks()
                  ? 'No slide decks yet'
                  : 'Nothing matches'
                : showingDecks()
                  ? 'No slide decks yet'
                  : 'No projects yet'}
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={visible()}>
              {project => {
                const thumb = () =>
                  project.thumbnailUrl ??
                  project.outputs.find(output => output.kind === 'thumbnail')?.url ??
                  (token() && ['ready', 'working'].includes(project.status)
                    ? thumbnailUrl(project.id, 0.5, token()!, Date.parse(project.updatedAt))
                    : null)
                return (
                  <article
                    class="group relative flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
                    onClick={() => navigate(projectPath(project))}
                  >
                    <div class="relative aspect-video overflow-hidden rounded-t-xl bg-gray-100">
                      <Show
                        when={thumb()}
                        fallback={
                          <div class="flex h-full items-center justify-center text-gray-300">
                            <Shapes size={30} />
                          </div>
                        }
                      >
                        {src => <img src={src()} alt="" class="h-full w-full object-cover" />}
                      </Show>
                      <span
                        class={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </div>
                    <div class="flex items-start p-3.5">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold">{project.title || 'Untitled'}</p>
                        <p class="text-[11px] text-gray-400">
                          {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div onClick={event => event.stopPropagation()}>
                        <Popover label="Project menu" trigger={<MoreVertical size={16} />}>
                          <button
                            role="menuitem"
                            class="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100"
                            onClick={() => navigate(projectPath(project))}
                          >
                            Open
                          </button>
                          <button
                            role="menuitem"
                            class="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100"
                            onClick={() => void shareProject(project)}
                          >
                            Share
                          </button>
                          <button
                            role="menuitem"
                            class="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(project)}
                          >
                            Delete
                          </button>
                        </Popover>
                      </div>
                    </div>
                  </article>
                )
              }}
            </For>
          </div>
        </Show>
      </Show>
      <Dialog open={!!deleting()} title="Delete this project?" onClose={() => setDeleting(null)}>
        <h2 class="text-base font-bold">Delete this project?</h2>
        <p class="mt-2 text-sm text-gray-500">
          “{deleting()?.title || 'Untitled'}” and its workspace will be removed.
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            class="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold"
            onClick={() => setDeleting(null)}
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
            onClick={() => void remove()}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  )
}
