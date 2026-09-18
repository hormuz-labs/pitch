import { A, useLocation, useNavigate } from '@solidjs/router'
import {
  AppWindow,
  FileText,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  Shield,
  Trash2,
  X,
} from 'lucide-solid'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import newMessageIcon from '../../assets/new-message.png'
import tabLogo from '../../assets/tabLogoB.svg'
import { Orb } from '../../components/ui/Orb'
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
  unreadProjectIds: ReadonlySet<string>
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
  // Polling returns new objects. Preserve each row so a refresh cannot remove
  // a pressed button before its click fires (or discard focus and rename state).
  const [projects, setProjects] = createStore<Project[]>([])
  createEffect(() => setProjects(reconcile(props.projects, { key: 'id' })))
  const go = (path: string) => {
    navigate(path)
    if (path === '/new') window.dispatchEvent(new Event('pitch:new-chat'))
    if (props.isMobile) props.close()
  }
  const pinnedProjects = createMemo(() =>
    [...projects]
      .filter(project => project.pinnedAt)
      .sort((a, b) => Date.parse(b.pinnedAt!) - Date.parse(a.pinnedAt!)),
  )
  const recentProjects = createMemo(() =>
    [...projects]
      .filter(project => !project.pinnedAt)
      .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
      .slice(0, 7),
  )
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
        <Show when={project.busy || props.unreadProjectIds.has(project.id)}>
          <span
            class={`sidebar-recent-project__state${project.busy ? ' is-working' : ' is-ready'}`}
            role="status"
            aria-label={project.busy ? 'Work in progress' : 'Completed'}
            title={project.busy ? 'Work in progress' : 'Completed'}
          >
            <Show when={project.busy} fallback={<i />}>
              <Orb decorative />
            </Show>
          </span>
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
            <img class="conversation-sidebar__new-icon" src={newMessageIcon} alt="" />
            <span>New chat</span>
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

        <section class="sidebar-recents" aria-label="Chats">
          <div class="conversation-sidebar__history" aria-busy={props.projectsLoading}>
            <Show
              when={!props.projectsLoading}
              fallback={
                <p class="sidebar-recents__empty" role="status">
                  Loading projects…
                </p>
              }
            >
              <Show when={pinnedProjects().length}>
                <section class="sidebar-project-group" aria-label="Pinned chats">
                  <h2 class="conversation-sidebar__section-title">Pinned</h2>
                  <For each={pinnedProjects()}>{recentProject}</For>
                </section>
              </Show>
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
              <Show
                when={recentProjects().length}
                fallback={
                  <Show when={!pinnedProjects().length}>
                    <p class="sidebar-recents__empty">Your recent chats will appear here.</p>
                  </Show>
                }
              >
                <For each={recentProjects()}>{recentProject}</For>
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
