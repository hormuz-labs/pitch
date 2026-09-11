import { useNavigate } from '@solidjs/router'
import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { listProjects, type Project } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Loading } from './primitives'
import '../../styles/chat-history.css'

export function ChatHistoryView() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = createSignal<Project[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const token = await getToken()
      if (token) setProjects(await listProjects(token))
    } finally {
      setLoading(false)
    }
  })

  const assets = createMemo(() => projects().filter(project => project.thumbnailUrl))

  return (
    <div class="chat-history-page min-h-full px-4 py-6 sm:px-6 lg:px-10">
      <div class="mx-auto max-w-[1100px]">
        <header class="chat-history-header mb-7 border-b pb-7">
          <p class="text-[11px] uppercase tracking-[.16em] text-gray-500">All chats</p>
          <h1 class="text-[34px] font-semibold tracking-[-.04em]">Every project, in one place.</h1>
        </header>
        <Show when={!loading()} fallback={<Loading />}>
          <section class="chat-history-list">
            <Show
              when={projects().length}
              fallback={<p class="chat-history-empty">Your projects will appear here.</p>}
            >
              <For each={projects()}>
                {project => (
                  <button
                    type="button"
                    class="chat-history-row"
                    onClick={() => navigate(`/p/${project.id}`)}
                  >
                    <span>{project.title || 'Untitled project'}</span>
                    <time>{new Date(project.updatedAt).toLocaleDateString()}</time>
                  </button>
                )}
              </For>
            </Show>
          </section>
          <Show when={assets().length}>
            <section class="chat-history-assets">
              <p class="chat-history-assets__title">Generated assets</p>
              <div class="chat-history-assets__grid">
                <For each={assets()}>
                  {project => (
                    <button
                      type="button"
                      class="chat-history-asset"
                      onClick={() => navigate(`/p/${project.id}`)}
                    >
                      <img src={project.thumbnailUrl ?? ''} alt={project.title} loading="lazy" />
                      <span>{project.title || 'Untitled project'}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </Show>
      </div>
    </div>
  )
}
