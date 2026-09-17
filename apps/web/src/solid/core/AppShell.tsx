import { A, useLocation, useNavigate } from '@solidjs/router'
import { AppWindow, FileText, PanelLeftClose, PanelLeftOpen, Plus, Shield, X } from 'lucide-solid'
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  useContext,
} from 'solid-js'
import tabLogo from '../../assets/tabLogoB.svg'
import { api, isApiError } from '../../lib/api'
import { captureRefFromUrl, getRefCode } from '../../lib/referral'
import { listProjects, type Project } from '../../lib/studio-api'
import type { UserProfile } from '../../types'
import { DiscordOfferModal } from '../account/DiscordOfferModal'
import { OnboardingSurvey } from '../account/OnboardingSurvey'
import { SettingsModal, type SettingsSection } from '../account/SettingsView'
import { SidebarAccountMenu } from '../account/SidebarAccountMenu'
import { PitchWordmark } from '../public/brand'
import { useAuth, useUser } from './auth'

interface AppShellContextValue {
  isMobile: Accessor<boolean>
  toggleSidebar: () => void
  openSettings: (section?: SettingsSection) => void
}

const AppShellContext = createContext<AppShellContextValue>()

export function useAppShell(): AppShellContextValue {
  return (
    useContext(AppShellContext) ?? {
      isMobile: () => false,
      toggleSidebar: () => undefined,
      openSettings: () => undefined,
    }
  )
}

const routeKey = (path: string) => {
  if (path.startsWith('/p/')) return 'studio'
  if (path.startsWith('/sessions')) return 'sessions'
  if (path.startsWith('/chats')) return 'chats'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/settings')) return 'settings'
  if (path.startsWith('/api-keys')) return 'api-keys'
  if (path.startsWith('/pricing') || path.startsWith('/account/pricing')) return 'pricing'
  if (path.startsWith('/affiliate')) return 'affiliate'
  return 'new'
}

function Sidebar(props: {
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
      .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
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
    const titleId = createUniqueId()
    let heading!: HTMLElement
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
        <div class="sidebar-recent-project__meta">
          <small>
            <span classList={{ 'is-working': project.busy }}>{projectState(project)}</span>
            <span aria-hidden="true">·</span>
            <time datetime={project.lastActivityAt}>{projectDate(project.lastActivityAt)}</time>
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

export function AppShell(props: ParentProps) {
  const auth = useAuth()
  const { userAccessor } = useUser()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = createSignal(window.innerWidth < 1024)
  const [projects, setProjects] = createSignal<Project[]>([])
  const [projectsLoading, setProjectsLoading] = createSignal(true)
  const [isAdmin, setIsAdmin] = createSignal(false)
  const [discordPromoOpen, setDiscordPromoOpen] = createSignal(false)
  const [settingsSection, setSettingsSection] = createSignal<SettingsSection | null>(null)
  const selectedKey = createMemo(() => routeKey(location.pathname))
  const selectedProjectId = createMemo(() =>
    location.pathname.startsWith('/p/') ? location.pathname.split('/')[2] : undefined,
  )
  const openSettings = (section: SettingsSection = 'profile') => {
    setSettingsSection(section)
    if (isMobile()) setCollapsed(true)
  }
  const context: AppShellContextValue = {
    isMobile,
    toggleSidebar: () => setCollapsed(value => !value),
    openSettings,
  }

  const dismissDiscordPromo = async () => {
    setDiscordPromoOpen(false)
    try {
      const token = await auth.getToken()
      if (token) await api.patch('/users/me', token, { discordPromoSeen: true })
    } catch {
      // Dismissal is best-effort; never trap the user in an announcement.
    }
  }

  const considerDiscordPromo = (profile: UserProfile) => {
    if (profile.discordPromoSeenAt || selectedKey() !== 'new') return
    window.setTimeout(() => {
      if (!document.querySelector('.onboarding-survey') && !settingsSection()) {
        setDiscordPromoOpen(true)
      }
    }, 800)
  }

  const loadProjects = async () => {
    try {
      const token = await auth.getToken()
      if (token) setProjects(await listProjects(token))
    } catch {
      // History must not make primary navigation unavailable.
    } finally {
      setProjectsLoading(false)
    }
  }

  onMount(() => {
    const settings = new URLSearchParams(window.location.search).get('settings')
    if (settings === 'connections') setSettingsSection('connections')
    captureRefFromUrl()
    const resize = () => {
      const mobile = window.innerWidth < 1024
      if (mobile === isMobile()) return
      setIsMobile(mobile)
      if (mobile) setCollapsed(true)
    }
    const newChat = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        navigate('/new')
        window.dispatchEvent(new Event('pitch:new-chat'))
        if (isMobile()) setCollapsed(true)
      } else if (key === 'b') {
        event.preventDefault()
        setCollapsed(value => !value)
      }
    }
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', newChat)
    window.addEventListener('pitch:projects-changed', loadProjects)
    onCleanup(() => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', newChat)
      window.removeEventListener('pitch:projects-changed', loadProjects)
    })
  })

  createEffect(() => {
    location.pathname
    void loadProjects()
  })

  createEffect(() => {
    const user = userAccessor()
    if (!user) return
    setIsAdmin(false)
    let cancelled = false
    const syncAndLoad = async () => {
      const token = await auth.getToken()
      const email = user.primaryEmailAddress?.emailAddress
      if (!token || !email) return
      const key = `user_synced_${user.id}`
      const sync = async () => {
        const profile = await api.post<UserProfile>('/users/sync', token, {
          email,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          refCode: getRefCode() ?? undefined,
        })
        sessionStorage.setItem(key, '1')
        window.dispatchEvent(new Event('pitch:user-synced'))
        window.dispatchEvent(new Event('credits-changed'))
        return profile
      }
      try {
        if (!sessionStorage.getItem(key)) {
          const profile = await sync()
          if (profile && !cancelled) considerDiscordPromo(profile)
        }
        try {
          const profile = await api.get<UserProfile>('/users/me', token)
          if (!cancelled) {
            setIsAdmin(profile.role === 'admin')
            considerDiscordPromo(profile)
          }
        } catch (error) {
          if (!isApiError(error) || error.status !== 404) throw error
          sessionStorage.removeItem(key)
          const profile = await sync()
          if (!cancelled) setIsAdmin(profile.role === 'admin')
        }
      } catch (error) {
        console.error('Failed to sync user profile', error)
      }
    }
    void syncAndLoad()
    onCleanup(() => {
      cancelled = true
    })
  })

  const studio = createMemo(() => selectedKey() === 'studio')
  return (
    <AppShellContext.Provider value={context}>
      <div
        class={`app-shell-bg flex h-screen w-screen overflow-hidden${collapsed() ? ' is-sidebar-collapsed' : ''}${selectedKey() === 'new' ? ' is-new-shell' : ''}`}
      >
        <OnboardingSurvey />
        <Show when={discordPromoOpen()}>
          <DiscordOfferModal
            mode="announcement"
            onClose={() => void dismissDiscordPromo()}
            onClaimReward={() => {
              void dismissDiscordPromo()
              openSettings('connections')
            }}
          />
        </Show>
        <Show when={settingsSection()}>
          {section => (
            <SettingsModal
              section={section()}
              onSectionChange={setSettingsSection}
              onClose={() => setSettingsSection(null)}
            />
          )}
        </Show>
        <Show when={!isMobile()}>
          <div
            class={`conversation-sidebar-frame${collapsed() ? ' is-collapsed' : ' is-expanded'}`}
          >
            <Sidebar
              collapsed={collapsed()}
              isMobile={false}
              isAdmin={isAdmin()}
              projects={projects()}
              projectsLoading={projectsLoading()}
              selectedKey={selectedKey()}
              selectedProjectId={selectedProjectId()}
              close={() => setCollapsed(true)}
              toggle={() => setCollapsed(value => !value)}
              openSettings={openSettings}
            />
          </div>
        </Show>
        <Show when={isMobile()}>
          <Sidebar
            collapsed={collapsed()}
            isMobile
            isAdmin={isAdmin()}
            projects={projects()}
            projectsLoading={projectsLoading()}
            selectedKey={selectedKey()}
            selectedProjectId={selectedProjectId()}
            close={() => setCollapsed(true)}
            toggle={() => setCollapsed(value => !value)}
            openSettings={openSettings}
          />
        </Show>
        <div
          class={`app-shell-panel flex min-w-0 flex-1 flex-col overflow-hidden${studio() ? ' app-shell-panel--studio' : ''}`}
        >
          {/* The collapsed sidebar leaves nothing behind; its opener floats
              inside the page's own corner, so the content gets the full width. */}
          <Show when={collapsed()}>
            <button
              type="button"
              class="conversation-sidebar__open"
              onClick={() => setCollapsed(false)}
              aria-label="Open navigation"
              title="Open navigation (Ctrl+B)"
            >
              <PanelLeftOpen size={18} />
            </button>
          </Show>
          <main
            class={`app-shell-main relative flex-1 overflow-x-hidden${studio() ? ' overflow-hidden' : ' overflow-y-auto'}${selectedKey() === 'new' ? ' new-shell-main' : ''}`}
          >
            {props.children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
