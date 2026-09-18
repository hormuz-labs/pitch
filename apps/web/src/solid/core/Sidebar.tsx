import { A, useLocation, useNavigate } from '@solidjs/router'
import {
  AppWindow,
  FileText,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Shield,
  Trash2,
  X,
} from 'lucide-solid'
import { createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js'
import tabLogo from '../../assets/tabLogoB.svg'
import type { Project } from '../../lib/studio-api'
import type { SettingsSection } from '../account/SettingsView'
import { SidebarAccountMenu } from '../account/SidebarAccountMenu'
import { StudioMenu } from '../account/StudioMenu'
import { PitchWordmark } from '../public/brand'

export function Sidebar(props: {
  collapsed: boolean
  isMobile: boolean
  isAdmin: boolean
  projects: Project[]
  projectsLoading: boolean
  selectedKey: string
  selectedProjectId?: string
  close: () => void
  toggle: () => void
  openSettings: (section?: SettingsSection) => void
  renameProject: (project: Project, title: string) => Promise<boolean>
  toggleProjectPin: (project: Project) => Promise<void>
  deleteProject: (project: Project) => Promise<void>
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const go = (path: string) => {
    navigate(path)
    if (path === '/new') window.dispatchEvent(new Event('pitch:new-chat'))
    if (props.isMobile) props.close()
  }
  const visibleProjects = createMemo(() =>
    [...props.projects]
      .sort((a, b) => {
        if (a.pinnedAt && !b.pinnedAt) return -1
        if (!a.pinnedAt && b.pinnedAt) return 1
        if (a.pinnedAt && b.pinnedAt) return Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt)
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      })
      .slice(0, 7),
  )
  const projectState = (project: Project) =>
    project.busy
      ? 'Working'
      : project.status === 'ready'
        ? 'Ready'
        : project.status === 'failed'
          ? 'Needs attention'
          : 'Draft'
  const projectDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toDateString() === new Date().toDateString()
      ? 'Today'
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  const recentProject = (project: Project) => {
    const [expanded, setExpanded] = createSignal(false)
    const [clipped, setClipped] = createSignal(false)
    const [renaming, setRenaming] = createSignal(false)
    const [draftTitle, setDraftTitle] = createSignal(project.title || 'Untitled project')
    let cancelRename = false
    const titleId = createUniqueId()
    let heading!: HTMLElement
    let renameInput!: HTMLInputElement
    const startRename = () => {
      cancelRename = false
      setDraftTitle(project.title || 'Untitled project')
      setRenaming(true)
      queueMicrotask(() => {
        renameInput.focus()
        renameInput.select()
      })
    }
    const saveRename = async () => {
      const title = draftTitle().trim()
      if (!title) {
        renameInput.focus()
        return
      }
      if (title === project.title || (await props.renameProject(project, title))) setRenaming(false)
    }
    onMount(() => {
      const observer = new ResizeObserver(() => {
        if (!expanded()) setClipped(heading.scrollWidth > heading.clientWidth)
      })
      observer.observe(heading)
      onCleanup(() => observer.disconnect())
    })
    return (
      <div
        class={`sidebar-recent-project${project.id === props.selectedProjectId ? ' is-active' : ''}`}
      >
        <Show
          when={!renaming()}
          fallback={
            <form
              class="sidebar-recent-project__rename"
              onSubmit={event => {
                event.preventDefault()
                void saveRename()
              }}
            >
              <input
                ref={renameInput}
                value={draftTitle()}
                maxlength={120}
                aria-label="Chat name"
                onInput={event => setDraftTitle(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    cancelRename = true
                    setRenaming(false)
                  }
                }}
                onBlur={() => {
                  if (!cancelRename) void saveRename()
                }}
              />
            </form>
          }
        >
          <button
            type="button"
            class="sidebar-recent-project__open"
            onClick={() => go(`/p/${project.id}`)}
            title={`${project.title || 'Untitled project'}${project.busy ? ' (Working)' : ''}`}
            aria-label={`${project.title || 'Untitled project'}${project.busy ? ', working' : ''}`}
            aria-current={project.id === props.selectedProjectId ? 'page' : undefined}
          >
            <span class="sidebar-recent-project__icon">
              <FileText size={15} />
            </span>
            <span class="sidebar-recent-project__copy">
              <strong ref={heading} id={titleId} classList={{ 'is-expanded': expanded() }}>
                {project.title || 'Untitled project'}
              </strong>
            </span>
          </button>
        </Show>
        <StudioMenu
          label={`Actions for ${project.title || 'Untitled project'}`}
          align="end"
          width={190}
          triggerClass="sidebar-recent-project__actions"
          trigger={<MoreHorizontal size={18} />}
        >
          <button type="button" role="menuitem" onClick={startRename}>
            <Pencil />
            <span>Edit chat name</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void props.toggleProjectPin(project)}
          >
            <Pin />
            <span>{project.pinnedAt ? 'Unpin from top' : 'Pin to top'}</span>
          </button>
          <div class="menu-separator" />
          <button
            type="button"
            role="menuitem"
            class="menu-danger"
            onClick={() => {
              if (window.confirm(`Delete “${project.title || 'Untitled project'}”?`))
                void props.deleteProject(project)
            }}
          >
            <Trash2 />
            <span>Delete</span>
          </button>
        </StudioMenu>
        <div class="sidebar-recent-project__meta">
          <small>
            <span classList={{ 'is-working': project.busy }}>{projectState(project)}</span>
            <span aria-hidden="true">·</span>
            <time datetime={project.updatedAt}>{projectDate(project.updatedAt)}</time>
          </small>
          <Show when={clipped() || expanded()}>
            <button
              type="button"
              class="sidebar-recent-project__more"
              aria-expanded={expanded()}
              aria-controls={titleId}
              onClick={() => setExpanded(value => !value)}
            >
              {expanded() ? 'Read less' : 'Read more'}
            </button>
          </Show>
        </div>
      </div>
    )
  }

  return (
    <>
      <Show when={!props.collapsed && props.isMobile}>
        <button
          type="button"
          aria-label="Close navigation"
          class="conversation-sidebar__scrim"
          onClick={props.close}
        />
      </Show>
      <aside
        class={`conversation-sidebar flex shrink-0 flex-col${props.isMobile ? ' fixed inset-y-0 left-0 z-[80] transition-transform duration-200' : ''}${props.collapsed ? (props.isMobile ? ' -translate-x-full' : ' is-collapsed') : ''}`}
        aria-hidden={props.collapsed}
        inert={props.collapsed}
      >
        <div class="conversation-sidebar__brand">
          <button
            type="button"
            class="conversation-sidebar__wordmark"
            aria-label="Pitch home"
            onClick={() => go('/new')}
          >
            <img src={tabLogo} alt="" />
            <PitchWordmark class="conversation-sidebar__wordmark-svg" />
          </button>
          <button
            type="button"
            class="conversation-sidebar__icon"
            onClick={props.isMobile ? props.close : props.toggle}
            aria-label="Collapse sidebar"
          >
            {props.isMobile ? <X size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav class="conversation-sidebar__primary" aria-label="Primary">
          <A
            href="/new"
            class={`conversation-sidebar__new${location.pathname === '/new' ? ' is-active' : ''}`}
            onClick={() => {
              window.dispatchEvent(new Event('pitch:new-chat'))
              if (props.isMobile) props.close()
            }}
          >
            <Plus size={17} />
            <span>New project</span>
            <kbd>⌘ K</kbd>
          </A>
          <button
            type="button"
            class={`conversation-sidebar__row${props.selectedKey === 'sessions' ? ' is-active' : ''}`}
            onClick={() => go('/sessions')}
          >
            <AppWindow size={16} />
            <span>Browser sessions</span>
          </button>
          <Show when={props.isAdmin}>
            <button
              type="button"
              class={`conversation-sidebar__row${props.selectedKey === 'admin' ? ' is-active' : ''}`}
              onClick={() => go('/admin')}
            >
              <Shield size={16} />
              <span>Admin</span>
            </button>
          </Show>
        </nav>

        <section class="sidebar-recents" aria-label="Recent projects">
          <div class="conversation-sidebar__projects-head">
            <h2 class="conversation-sidebar__section-title">Chats</h2>
            <button
              type="button"
              class="conversation-sidebar__all-chats"
              aria-label="View all chats"
              onClick={() => go('/chats/history')}
            >
              All chats
            </button>
          </div>
          <div class="conversation-sidebar__history" aria-busy={props.projectsLoading}>
            <Show
              when={!props.projectsLoading}
              fallback={
                <p class="sidebar-recents__empty" role="status">
                  Loading projects…
                </p>
              }
            >
              <Show
                when={visibleProjects().length}
                fallback={<p class="sidebar-recents__empty">Your recent chats will appear here.</p>}
              >
                <For each={visibleProjects()}>{recentProject}</For>
              </Show>
            </Show>
          </div>
        </section>
        <footer class="conversation-sidebar__footer">
          <SidebarAccountMenu openSettings={props.openSettings} />
        </footer>
      </aside>
    </>
  )
}
