import { useLocation, useNavigate } from '@solidjs/router'
import {
  AppWindow,
  ChevronRight,
  Gift,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Plus,
  Shield,
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
import { SOCIALS } from '../public/LandingFooter'
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
  let historyList: HTMLDivElement | undefined
  const focusHistory = () => historyList?.scrollIntoView({ block: 'center' })
  const go = (path: string) => {
    navigate(path)
    if (props.isMobile) props.close()
  }
  const visibleProjects = createMemo(() => props.projects.slice(0, 30))
  const chat = (project: Project) => (
    <button
      type="button"
      class={`conversation-sidebar__chat${project.id === props.selectedProjectId ? ' is-active' : ''}`}
      onClick={() => go(`/p/${project.id}`)}
      title={`${project.title || 'Untitled project'}${project.busy ? ' (Working)' : ''}`}
      aria-label={`${project.title || 'Untitled project'}${project.busy ? ', working' : ''}`}
    >
      <span>{project.title || 'Untitled project'}</span>
      <Show when={project.busy}>
        <i aria-label="Working" />
      </Show>
    </button>
  )

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
        class={`conversation-sidebar flex shrink-0 flex-col${props.isMobile ? ' fixed inset-y-0 left-0 z-50 transition-transform duration-200' : ''}${props.collapsed ? (props.isMobile ? ' -translate-x-full' : ' is-collapsed') : ''}`}
        aria-hidden={props.collapsed}
        inert={props.collapsed}
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
            <kbd>⌘ K</kbd>
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
          <button type="button" class="conversation-sidebar__row" onClick={focusHistory}>
            <History size={16} />
            <span>History</span>
          </button>
        </nav>

        <div class="conversation-sidebar__projects-head">
          <p class="conversation-sidebar__section-title">Chats</p>
          <button type="button" class="conversation-sidebar__all-chats" onClick={() => go('/chats')}>
            All Chats
          </button>
        </div>
        <div class="conversation-sidebar__history" ref={historyList}>
          <Show
            when={visibleProjects().length}
            fallback={<span class="conversation-sidebar__empty">Your projects will appear here</span>}
          >
            <For each={visibleProjects()}>{project => chat(project)}</For>
          </Show>
        </div>
        <footer class="conversation-sidebar__footer">
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
          <div class="conversation-sidebar__socials" aria-label="Pitch social links">
            <For each={SOCIALS}>
              {social => {
                const Icon = social.icon
                return (
                  <a
                    class="conversation-sidebar__social"
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.label}
                    title={social.label}
                  >
                    {Icon?.({ size: 16 })}
                  </a>
                )
              }}
            </For>
          </div>
        </footer>
      </aside>
    </>
  )
}

function SidebarRail(props: { hidden: boolean; open: () => void }) {
  return (
    <nav
      class={`conversation-sidebar__rail${props.hidden ? ' is-hidden' : ''}`}
      aria-label="Workspace navigation"
      aria-hidden={props.hidden}
      inert={props.hidden}
    >
      <button
        type="button"
        onClick={props.open}
        aria-label="Expand sidebar"
        title="Expand sidebar (Ctrl+B)"
      >
        <PanelLeftOpen />
      </button>
    </nav>
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
        class={`app-shell-bg flex h-screen w-screen overflow-hidden${collapsed() ? ' is-sidebar-collapsed' : ''}${selectedKey() === 'new' ? ' is-new-shell' : ''}`}
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
        <Show when={!isMobile()}>
          <div
            class={`conversation-sidebar-frame${collapsed() ? ' is-collapsed' : ' is-expanded'}`}
          >
            <SidebarRail hidden={!collapsed()} open={() => setCollapsed(false)} />
            <Sidebar
              collapsed={collapsed()}
              isMobile={false}
              isAdmin={isAdmin()}
              projects={projects()}
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
            selectedKey={selectedKey()}
            selectedProjectId={selectedProjectId()}
            close={() => setCollapsed(true)}
            toggle={() => setCollapsed(value => !value)}
            openSettings={openSettings}
          />
          <Show when={collapsed()}>
            <button
              type="button"
              class="conversation-sidebar__open"
              onClick={() => setCollapsed(false)}
              aria-label="Open navigation"
              title="Open navigation"
            >
              <PanelLeftOpen size={18} />
            </button>
          </Show>
        </Show>
        <div
          class={`app-shell-panel flex min-w-0 flex-1 flex-col overflow-hidden${studio() ? ' app-shell-panel--studio' : ''}`}
        >
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
