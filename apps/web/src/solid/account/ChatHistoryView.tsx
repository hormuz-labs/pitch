import { useNavigate } from '@solidjs/router'
import { Pencil, Search, Trash2 } from 'lucide-solid'
import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { deleteProject, listProjects, type Project } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Loading } from './primitives'
import '../../styles/chat-history.css'

export function ChatHistoryView() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = createSignal<Project[]>([])
  const [query, setQuery] = createSignal('')
  const [loading, setLoading] = createSignal(true)
  const [selected, setSelected] = createSignal<string | null>(null)

  const remove = async (project: Project) => {
    if (!window.confirm(`Delete “${project.title || 'Untitled project'}”?`)) return
    const token = await getToken()
    if (!token) return
    await deleteProject(token, project.id)
    setProjects(current => current.filter(item => item.id !== project.id))
    window.dispatchEvent(new Event('pitch:projects-changed'))
  }

  onMount(async () => {
    try {
      const token = await getToken()
      if (token) setProjects(await listProjects(token))
    } finally {
      setLoading(false)
    }
  })

  const groups = createMemo(() => {
    const search = query().trim().toLowerCase()
    const rows = projects()
      .filter(project =>
        search ? `${project.title} ${project.prompt}`.toLowerCase().includes(search) : true,
      )
      .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    const now = new Date().getFullYear()
    const grouped = new Map<string, Project[]>()
    for (const project of rows) {
      const year = new Date(project.lastActivityAt).getFullYear()
      const label = year === now ? 'This year' : String(year)
      grouped.set(label, [...(grouped.get(label) ?? []), project])
    }
    return [...grouped]
  })

  return (
    <div class="chat-history-page">
      <div class="chat-history-inner">
        <header class="chat-history-header">
          <h1>Chat History</h1>
          <label class="chat-history-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search chat history"
              value={query()}
              onInput={event => setQuery(event.currentTarget.value)}
            />
          </label>
        </header>
        <Show when={!loading()} fallback={<Loading />}>
          <Show when={groups().length} fallback={<p class="chat-history-empty">No chats found.</p>}>
            <For each={groups()}>
              {([label, rows]) => (
                <section class="chat-history-group">
                  <h2>{label}</h2>
                  <For each={rows}>
                    {project => (
                      <div
                        class={`chat-history-entry${selected() === project.id ? ' is-selected' : ''}`}
                      >
                        <button
                          type="button"
                          class="chat-history-select"
                          aria-label={`Select ${project.title || 'chat'}`}
                          aria-pressed={selected() === project.id}
                          onClick={() =>
                            setSelected(current => (current === project.id ? null : project.id))
                          }
                        />
                        <button
                          type="button"
                          class="chat-history-row"
                          onClick={() => navigate(`/p/${project.id}`)}
                        >
                          <span class="chat-history-row__heading">
                            <strong>{project.title || 'Untitled project'}</strong>
                            <time>
                              {new Date(project.lastActivityAt).toLocaleDateString(undefined, {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </time>
                          </span>
                          <span class="chat-history-row__preview">
                            {project.prompt || 'Open this chat to continue working on the project.'}
                          </span>
                          <Show when={project.thumbnailUrl}>
                            {src => (
                              <span class="chat-history-row__asset">
                                <img src={src()} alt="" loading="lazy" />
                                <span>{project.outputs.length || 1} project asset</span>
                              </span>
                            )}
                          </Show>
                        </button>
                        <div class="chat-history-row__actions">
                          <button
                            type="button"
                            aria-label="Open chat"
                            onClick={() => navigate(`/p/${project.id}`)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete chat"
                            onClick={() => void remove(project)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </section>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  )
}
