import { useLocation, useNavigate } from '@solidjs/router'
import {
  AppWindow,
  ChevronRight,
  Gift,
  History,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Plus,
  Search,
  Settings,
  Shield,
  UserRound,
  X,
} from 'lucide-solid'
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
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
import { OnboardingSurvey } from '../account/OnboardingSurvey'
import { SettingsModal, type SettingsSection } from '../account/SettingsView'
import { PitchWordmark } from '../public/brand'
import { useAuth, useClerk, useUser } from './auth'

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
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/settings')) return 'settings'
  if (path.startsWith('/api-keys')) return 'api-keys'
  if (path.startsWith('/pricing') || path.startsWith('/account/pricing')) return 'pricing'
  return 'new'
}

function Sidebar(props: {
  collapsed: boolean
  isMobile: boolean
  isAdmin: boolean
  projects: Project[]
  selectedKey: string
  selectedProjectId?: string
  close: () => void
  toggle: () => void
  openSettings: (section?: SettingsSection) => void
}) {
  const navigate = useNavigate()
  const clerk = useClerk()
  const { userAccessor } = useUser()
  const [query, setQuery] = createSignal('')
  const [railQuery, setRailQuery] = createSignal('')
  const [historyOpen, setHistoryOpen] = createSignal(false)
  const go = (path: string) => {
    navigate(path)
    props.close()
  }
  const visibleProjects = createMemo(() => {
    const value = query().trim().toLowerCase()
    return props.projects
      .filter(project => !value || project.title.toLowerCase().includes(value))
      .slice(0, 30)
  })
  const groups = createMemo(() => {
    if (query().trim()) return []
    const today = new Date().setHours(0, 0, 0, 0)
    const week = 7 * 24 * 60 * 60 * 1000
    const result: Array<{ label: string; items: Project[] }> = [
      { label: 'Today', items: [] },
      { label: 'This week', items: [] },
      { label: 'Older', items: [] },
    ]
    for (const project of visibleProjects()) {
      const updated = new Date(project.updatedAt).getTime()
      result[updated >= today ? 0 : updated >= today - week ? 1 : 2].items.push(project)
    }
    return result.filter(group => group.items.length)
  })
  const railProjects = createMemo(() => {
    const value = railQuery().trim().toLowerCase()
    return props.projects
      .filter(project => !value || project.title.toLowerCase().includes(value))
      .slice(0, 8)
  })
  const user = userAccessor
  const displayName = () => user()?.fullName || user()?.firstName || 'Pitch creator'
  const email = () => user()?.primaryEmailAddress?.emailAddress ?? ''

  const chat = (project: Project, rail = false) => (
    <button
      type="button"
      class={
        rail
          ? undefined
          : `conversation-sidebar__chat${project.id === props.selectedProjectId ? ' is-active' : ''}`
      }
      onClick={() => go(`/p/${project.id}`)}
      title={project.title}
    >
      <MessageSquare size={13} />
      <span>{project.title || 'Untitled project'}</span>
      <Show when={project.busy}>
        <i aria-label="Working" />
      </Show>
    </button>
  )

  return (
    <>
      <Show when={!props.collapsed}>
        <button
          type="button"
          aria-label="Close navigation"
          class={
            props.isMobile
              ? 'fixed inset-0 z-40 border-0 bg-black/20 backdrop-blur-[6px]'
              : 'conversation-sidebar__scrim'
          }
          onClick={props.close}
        />
      </Show>
      <aside
        class={`conversation-sidebar flex shrink-0 flex-col${props.isMobile ? ' fixed inset-y-0 left-0 z-50 transition-transform duration-200' : ''}${props.collapsed ? (props.isMobile ? ' -translate-x-full' : ' is-collapsed') : ''}`}
      >
        <div class="conversation-sidebar__brand">
          <button type="button" class="conversation-sidebar__wordmark" onClick={() => go('/new')}>
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
          <button
            type="button"
            class={`conversation-sidebar__new${props.selectedKey === 'new' ? ' is-active' : ''}`}
            onClick={() => go('/new')}
          >
            <Plus size={17} />
            <span>New chat</span>
          </button>
          <button
            type="button"
            class={`conversation-sidebar__row${props.selectedKey === 'sessions' ? ' is-active' : ''}`}
            onClick={() => go('/sessions')}
          >
            <AppWindow size={16} />
            <span>Browser sessions</span>
          </button>
          <button
            type="button"
            class="conversation-sidebar__row"
            onClick={() => props.openSettings('mcp')}
          >
            <PlugZap size={16} />
            <span>API / MCP</span>
          </button>
          <button
            type="button"
            class="conversation-sidebar__row"
            onClick={() => props.openSettings('account')}
          >
            <Settings size={16} />
            <span>Settings</span>
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

        <div class="conversation-sidebar__search">
          <Search size={14} />
          <input
            aria-label="Search chats"
            placeholder="Search chats…"
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
          />
        </div>
        <div class="conversation-sidebar__history">
          <Show
            when={visibleProjects().length}
            fallback={
              <span class="conversation-sidebar__empty">
                {query() ? 'No matching chats' : 'Your projects will appear here'}
              </span>
            }
          >
            <Show
              when={!query().trim()}
              fallback={
                <>
                  <p class="conversation-sidebar__section-title">Recent chats</p>
                  <For each={visibleProjects()}>{project => chat(project)}</For>
                </>
              }
            >
              <For each={groups()}>
                {group => (
                  <div class="conversation-sidebar__group">
                    <p class="conversation-sidebar__section-title">{group.label}</p>
                    <For each={group.items}>{project => chat(project)}</For>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <div class="conversation-sidebar__footer">
          <button
            type="button"
            class="conversation-sidebar__invite"
            onClick={() => props.openSettings('rewards')}
          >
            <Gift size={16} />
            <span>
              <strong>Invite a friend</strong>
              <small>Earn credits when they sign up</small>
            </span>
            <ChevronRight size={14} />
          </button>
          <div class="conversation-sidebar__account">
            <Show
              when={user()?.imageUrl}
              fallback={<UserRound size={28} class="rounded-full bg-white p-1.5" />}
            >
              {src => <img src={src()} alt="" class="h-7 w-7 rounded-full object-cover" />}
            </Show>
            <button type="button" onClick={() => void clerk.openUserProfile()}>
              <strong>{displayName()}</strong>
              <span>{email()}</span>
            </button>
            <button
              type="button"
              class="ml-auto rounded-md p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
              onClick={() => void clerk.signOut({ redirectUrl: '/' })}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <Show when={!props.isMobile}>
        <aside class="conversation-sidebar__rail" aria-label="Quick navigation">
          <button
            type="button"
            onClick={props.toggle}
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
          <button type="button" onClick={() => go('/new')} aria-label="New chat" title="New chat">
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={() => go('/sessions')}
            aria-label="Browser sessions"
            title="Browser sessions"
          >
            <AppWindow size={16} />
          </button>
          <button
            type="button"
            onClick={() => props.openSettings('mcp')}
            aria-label="API and MCP"
            title="API / MCP"
          >
            <PlugZap size={16} />
          </button>
          <div
            class="conversation-sidebar__rail-pop"
            onMouseEnter={() => setHistoryOpen(true)}
            onMouseLeave={() => {
              setHistoryOpen(false)
              setRailQuery('')
            }}
            onFocusIn={() => setHistoryOpen(true)}
            onFocusOut={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setHistoryOpen(false)
            }}
          >
            <button
              type="button"
              onClick={props.toggle}
              aria-label="Recent chats"
              title="Recent chats"
            >
              <History size={16} />
            </button>
            <Show when={historyOpen()}>
              <div class="conversation-sidebar__rail-history">
                <p>History</p>
                <div class="conversation-sidebar__rail-history-list">
                  <Show
                    when={railProjects().length}
                    fallback={
                      <span class="conversation-sidebar__rail-history-empty">No chats yet</span>
                    }
                  >
                    <For each={railProjects()}>{project => chat(project, true)}</For>
                  </Show>
                </div>
                <div class="conversation-sidebar__rail-history-search">
                  <Search size={12} />
                  <input
                    aria-label="Search all chats"
                    placeholder="Search all chats"
                    value={railQuery()}
                    onInput={event => setRailQuery(event.currentTarget.value)}
                  />
                </div>
              </div>
            </Show>
          </div>
          <span />
          <button
            type="button"
            onClick={() => props.openSettings('account')}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <Show when={props.isAdmin}>
            <button type="button" onClick={() => go('/admin')} aria-label="Admin" title="Admin">
              <Shield size={16} />
            </button>
          </Show>
        </aside>
      </Show>
    </>
  )
}

export function AppShell(props: ParentProps) {
  const auth = useAuth()
  const { userAccessor } = useUser()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = createSignal(true)
  const [projects, setProjects] = createSignal<Project[]>([])
  const [isAdmin, setIsAdmin] = createSignal(false)
  const [settingsSection, setSettingsSection] = createSignal<SettingsSection | null>(null)
  const selectedKey = createMemo(() => routeKey(location.pathname))
  const selectedProjectId = createMemo(() =>
    location.pathname.startsWith('/p/') ? location.pathname.split('/')[2] : undefined,
  )
  const openSettings = (section: SettingsSection = 'account') => {
    setSettingsSection(section)
    if (isMobile()) setCollapsed(true)
  }
  const context: AppShellContextValue = {
    isMobile,
    toggleSidebar: () => setCollapsed(value => !value),
    openSettings,
  }

  const loadProjects = async () => {
    try {
      const token = await auth.getToken()
      if (token) setProjects(await listProjects(token))
    } catch {
      // History must not make primary navigation unavailable.
    }
  }

  onMount(() => {
    captureRefFromUrl()
    const resize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      setCollapsed(mobile)
    }
    const newChat = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      navigate('/new')
      if (isMobile()) setCollapsed(true)
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
        if (!sessionStorage.getItem(key)) await sync()
        try {
          const profile = await api.get<UserProfile>('/users/me', token)
          if (!cancelled) setIsAdmin(profile.role === 'admin')
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
        class="app-shell-bg flex h-screen w-screen overflow-hidden"
        style={{ 'background-color': '#ededed' }}
      >
        <OnboardingSurvey />
        <Show when={settingsSection()}>
          {section => (
            <SettingsModal
              section={section()}
              onSectionChange={setSettingsSection}
              onClose={() => setSettingsSection(null)}
            />
          )}
        </Show>
        <Sidebar
          collapsed={collapsed()}
          isMobile={isMobile()}
          isAdmin={isAdmin()}
          projects={projects()}
          selectedKey={selectedKey()}
          selectedProjectId={selectedProjectId()}
          close={() => setCollapsed(true)}
          toggle={() => setCollapsed(value => !value)}
          openSettings={openSettings}
        />
        <Show when={isMobile() && collapsed()}>
          <button
            type="button"
            class="fixed top-3 left-3 z-[64] grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white/90 text-stone-700 shadow-sm backdrop-blur"
            onClick={() => setCollapsed(false)}
            aria-label="Open navigation"
          >
            <PanelLeftOpen size={18} />
          </button>
        </Show>
        <div class="app-shell-panel flex min-w-0 flex-1 flex-col overflow-hidden border-l border-gray-200 bg-white">
          <main
            class={`app-shell-main relative flex-1 overflow-x-hidden bg-white${studio() ? ' overflow-hidden' : ' overflow-y-auto'}${selectedKey() === 'new' ? ' new-shell-main' : ''}`}
          >
            {props.children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
