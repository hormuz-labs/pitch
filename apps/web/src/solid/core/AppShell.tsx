import { useLocation, useNavigate } from '@solidjs/router'
import { PanelLeftOpen } from 'lucide-solid'
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  useContext,
} from 'solid-js'
import { api, isApiError } from '../../lib/api'
import { captureRefFromUrl, getRefCode } from '../../lib/referral'
import { deleteProject, listProjects, type Project, patchProject } from '../../lib/studio-api'
import type { UserProfile } from '../../types'
import { DiscordOfferModal } from '../account/DiscordOfferModal'
import { OnboardingSurvey } from '../account/OnboardingSurvey'
import { SettingsModal, type SettingsSection } from '../account/SettingsView'
import { useAuth, useUser } from './auth'
import {
  readProjectNotifications,
  reconcileProjectNotifications,
  writeProjectNotifications,
} from './projectNotifications'
import { Sidebar } from './Sidebar'

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

export function AppShell(props: ParentProps) {
  const auth = useAuth()
  const { userAccessor } = useUser()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = createSignal(
    window.innerWidth < 1024 || routeKey(location.pathname) === 'studio',
  )
  const [projects, setProjects] = createSignal<Project[]>([])
  const [projectsLoading, setProjectsLoading] = createSignal(true)
  const [projectNotifications, setProjectNotifications] = createSignal(
    readProjectNotifications(localStorage),
  )
  const [isAdmin, setIsAdmin] = createSignal(false)
  const [discordPromoOpen, setDiscordPromoOpen] = createSignal(false)
  const [settingsSection, setSettingsSection] = createSignal<SettingsSection | null>(null)
  const pendingProjectPins = new Map<string, string | null>()
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
      if (token) {
        const next = await listProjects(token)
        setProjects(
          next.map(project =>
            pendingProjectPins.has(project.id)
              ? { ...project, pinnedAt: pendingProjectPins.get(project.id) ?? null }
              : project,
          ),
        )
        setProjectNotifications(current => {
          const updated = reconcileProjectNotifications(current, next, selectedProjectId())
          writeProjectNotifications(localStorage, updated)
          return updated
        })
      }
    } catch {
      // History must not make primary navigation unavailable.
    } finally {
      setProjectsLoading(false)
    }
  }

  const renameProject = async (project: Project, title: string) => {
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Not signed in')
      const updated = await patchProject(token, project.id, { title })
      setProjects(rows => rows.map(row => (row.id === project.id ? { ...row, ...updated } : row)))
      window.dispatchEvent(new Event('pitch:projects-changed'))
      return true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not rename chat')
      return false
    }
  }

  const toggleProjectPin = async (project: Project) => {
    const previousPinnedAt = project.pinnedAt
    const pinnedAt = previousPinnedAt ? null : new Date().toISOString()
    pendingProjectPins.set(project.id, pinnedAt)
    setProjects(rows => rows.map(row => (row.id === project.id ? { ...row, pinnedAt } : row)))
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Not signed in')
      const updated = await patchProject(token, project.id, { pinnedAt })
      if (pendingProjectPins.get(project.id) !== pinnedAt) return
      pendingProjectPins.delete(project.id)
      setProjects(rows => rows.map(row => (row.id === project.id ? { ...row, ...updated } : row)))
      window.dispatchEvent(new Event('pitch:projects-changed'))
    } catch (error) {
      if (pendingProjectPins.get(project.id) !== pinnedAt) return
      pendingProjectPins.delete(project.id)
      setProjects(rows =>
        rows.map(row => (row.id === project.id ? { ...row, pinnedAt: previousPinnedAt } : row)),
      )
      window.alert(error instanceof Error ? error.message : 'Could not update pin')
    }
  }

  const removeProject = async (project: Project) => {
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Not signed in')
      await deleteProject(token, project.id)
      setProjects(rows => rows.filter(row => row.id !== project.id))
      if (selectedProjectId() === project.id) navigate('/new')
      window.dispatchEvent(new Event('pitch:projects-changed'))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete chat')
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

  createEffect(
    on(selectedKey, (route, previousRoute) => {
      if (route === 'studio' && previousRoute !== 'studio') setCollapsed(true)
    }),
  )

  createEffect(() => {
    const id = selectedProjectId()
    if (!id) return
    setProjectNotifications(current => {
      const updated = reconcileProjectNotifications(current, projects(), id)
      writeProjectNotifications(localStorage, updated)
      return updated
    })
  })

  createEffect(() => {
    if (!projects().some(project => project.busy)) return
    const timer = window.setInterval(() => void loadProjects(), 3000)
    onCleanup(() => window.clearInterval(timer))
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
              unreadProjectIds={new Set(projectNotifications().unread)}
              selectedKey={selectedKey()}
              selectedProjectId={selectedProjectId()}
              close={() => setCollapsed(true)}
              toggle={() => setCollapsed(value => !value)}
              openSettings={openSettings}
              renameProject={renameProject}
              toggleProjectPin={toggleProjectPin}
              deleteProject={removeProject}
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
            unreadProjectIds={new Set(projectNotifications().unread)}
            selectedKey={selectedKey()}
            selectedProjectId={selectedProjectId()}
            close={() => setCollapsed(true)}
            toggle={() => setCollapsed(value => !value)}
            openSettings={openSettings}
            renameProject={renameProject}
            toggleProjectPin={toggleProjectPin}
            deleteProject={removeProject}
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
