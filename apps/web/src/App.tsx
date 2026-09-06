import { AuthenticateWithRedirectCallback, Show, UserButton, useAuth, useUser } from '@clerk/react'
import {
  type ComponentType,
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import './index.css'
import * as ToastPrimitive from '@radix-ui/react-toast'
import {
  AppWindow,
  ChevronRight,
  Gift,
  History,
  Key,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Plus,
  Search,
  Share2,
  Shield,
  X,
} from 'lucide-react'
import { BiSolidZap } from 'react-icons/bi'
import tabLogoB from './assets/tabLogoB.svg'
import { AnimatedAdminIcon } from './components/AnimatedAdminIcon'
import { AnimatedDashboardIcon } from './components/AnimatedDashboardIcon'
import { AnimatedIcon } from './components/AnimatedIcon'
import { AnimatedSessionsIcon } from './components/AnimatedSessionsIcon'
import { AnimatedSettingsIcon } from './components/AnimatedSettingsIcon'
import { AnimatedShareIcon } from './components/AnimatedShareIcon'
import { AnimatedSupportIcon } from './components/AnimatedSupportIcon'
import { AnimatedVideoIcon } from './components/AnimatedVideoIcon'
import { SOCIALS } from './components/LandingFooter'
import { LoadingCoin } from './components/LoadingCoin'
import { OnboardingSurvey } from './components/OnboardingSurvey'
import { PitchLogoAnimation } from './components/PitchLogoAnimation'
import { PitchWordmark } from './components/PitchWordmark'
import { SettingsModal, type SettingsSection } from './components/SettingsModal'
import { API_URL } from './config'
import { api, isApiError } from './lib/api'
import { captureRefFromUrl, getRefCode } from './lib/referral'
import { isFlowId, listProjects, type Project } from './lib/studio-api'
import { cn } from './lib/utils'
import type { UserProfile } from './types'

// Route-level code splitting — every view loads on demand instead of landing
// in the entry bundle. See vite.config.ts manualChunks for vendor splitting.
const lazyNamed = <T,>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then(m => ({ default: m[key] as ComponentType<any> })))

// The studio is the one view that was NOT split, so its markdown renderer and
// preview code sat in the entry bundle for everyone — including people who
// never open a project. It follows the same rule as every other view now.
const StudioView = lazyNamed(() => import('./studio/StudioView'), 'StudioView')

const AdminView = lazyNamed(() => import('./views/AdminView'), 'AdminView')
const NotFoundView = lazyNamed(() => import('./views/StatusView'), 'NotFoundView')
const AffiliateView = lazyNamed(() => import('./views/AffiliateView'), 'AffiliateView')
const ApiKeysView = lazyNamed(() => import('./views/ApiKeysView'), 'ApiKeysView')
const CheckoutReturnView = lazyNamed(
  () => import('./views/CheckoutReturnView'),
  'CheckoutReturnView',
)
const DocsView = lazyNamed(() => import('./views/DocsView'), 'DocsView')
const LandingView = lazyNamed(() => import('./views/LandingView'), 'LandingView')
const NewProjectView = lazyNamed(() => import('./views/NewProjectView'), 'NewProjectView')
const PricingView = lazyNamed(() => import('./views/PricingView'), 'PricingView')
const ProductView = lazyNamed(() => import('./views/ProductView'), 'ProductView')
const AffiliatesView = lazyNamed(() => import('./views/AffiliatesView'), 'AffiliatesView')
const PublicDemoView = lazyNamed(() => import('./views/PublicDemoView'), 'PublicDemoView')
const PublicPricingView = lazyNamed(() => import('./views/PublicPricingView'), 'PublicPricingView')
const SessionsView = lazyNamed(() => import('./views/SessionsView'), 'SessionsView')
const SettingsView = lazyNamed(() => import('./views/SettingsView'), 'SettingsView')
const TemplatesView = lazyNamed(() => import('./views/TemplatesView'), 'TemplatesView')
const AuthView = lazyNamed(() => import('./views/AuthView'), 'AuthView')
const AboutUs = lazyNamed(() => import('./components/AboutUs'), 'AboutUs')
const Blog = lazyNamed(() => import('./components/Blog'), 'Blog')
const BlogPostView = lazyNamed(() => import('./components/Blog'), 'BlogPostView')
const PrivacyPolicy = lazyNamed(() => import('./components/PrivacyPolicy'), 'PrivacyPolicy')
const TermsOfService = lazyNamed(() => import('./components/TermsOfService'), 'TermsOfService')

// In-shell route loading keeps the coin; full-screen fallbacks (landing and
// other public pages) stay blank so there's no spinner flash before a page's
// own intro (the landing page opens with its stair preloader).
const PageLoader = ({ fullScreen = false }: { fullScreen?: boolean }) =>
  fullScreen ? (
    <div className="h-screen w-screen bg-[#FDFDFD]" />
  ) : (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center">
      <LoadingCoin className="h-10 w-10" />
    </div>
  )

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastVariant = 'error' | 'success' | 'info'
interface ToastEntry {
  id: string
  message: string
  variant: ToastVariant
}
interface ToastCtx {
  toast: (message: string, variant?: ToastVariant) => void
}

/**
 * What a route needs from the shell when it draws its own header.
 *
 * The studio does: its own bar already carries the back link, the title, the
 * status and the actions, so the shell header above it was a second, emptier
 * copy of the same thing. The studio takes over the header and borrows the
 * two shell-owned pieces — the credit balance, and the way into the nav on
 * mobile — through this.
 */
interface AppShellCtx {
  isMobile: boolean
  toggleSidebar: () => void
  openSettings: (section?: SettingsSection) => void
}
const AppShellContext = createContext<AppShellCtx | null>(null)
export const useAppShell = (): AppShellCtx =>
  useContext(AppShellContext) ?? {
    isMobile: false,
    toggleSidebar: () => {},
    openSettings: () => {},
  }

const ToastContext = createContext<ToastCtx | null>(null)
export const useToast = () => {
  const ctx = useContext(ToastContext)
  // Fast Refresh swaps the App module under already-mounted views, and a view
  // holding the old context would otherwise crash the whole tree on the next
  // render. Degrade to a console note; a full reload restores the real one.
  if (!ctx) return { toast: (message: string) => console.warn('[toast]', message) }
  return ctx
}

const toastBorder: Record<ToastVariant, string> = {
  error: 'border-red-100',
  success: 'border-green-100',
  info: 'border-gray-200',
}
const toastIconCls: Record<ToastVariant, string> = {
  error: 'bg-red-50 text-red-500',
  success: 'bg-green-50 text-green-600',
  info: 'bg-gray-100 text-gray-500',
}

function ToastShell({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToasts(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, message, variant }])
  }, [])
  const dismiss = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={4000}>
        {children}
        {toasts.map(t => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={open => {
              if (!open) dismiss(t.id)
            }}
            className={cn(
              'group flex items-start gap-3 rounded-xl border bg-white px-3.5 py-3 shadow-sm',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
              'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out]',
              'data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full',
              toastBorder[t.variant],
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex shrink-0 items-center justify-center rounded-full p-1',
                toastIconCls[t.variant],
              )}
            >
              {t.variant === 'error' && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {t.variant === 'success' && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {t.variant === 'info' && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>
            <ToastPrimitive.Title className="text-xs font-medium leading-snug text-gray-800">
              {t.message}
            </ToastPrimitive.Title>
            <ToastPrimitive.Close className="ml-auto shrink-0 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-700 focus:opacity-100 focus:outline-none group-hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed top-5 right-5 z-[9999] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

// ── Icons (inline SVG micro-set) ──────────────────────────────────────────────

// ── Nav Item ─────────────────────────────────────────────────────────────────
interface NavItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}
const NavItem = ({ icon, label, active, onClick }: NavItemProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-[background-position,color] duration-500 ease-out cursor-pointer border-none outline-none
      ${
        active
          ? 'bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] hover:[background-position:100%_center] text-white shadow-sm'
          : 'text-gray-500 hover:bg-[#e6e6e6] hover:text-gray-800 bg-transparent'
      }`}
  >
    <span className={active ? 'text-white' : 'text-gray-400'}>{icon}</span>
    {label}
  </button>
)

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface LegacySidebarProps {
  selectedKey: string
  navigate: (path: string) => void
  isMobile: boolean
  collapsed: boolean
  onClose: () => void
  isAdmin?: boolean
}
const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const isNewKey = (key: string) => key.startsWith('new-')

export const LegacySidebar = ({
  selectedKey,
  navigate,
  isMobile,
  collapsed,
  onClose,
  isAdmin,
}: LegacySidebarProps) => {
  const { getToken } = useAuth()
  const [plan, setPlan] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(isNewKey(selectedKey))
  const closeAllGroups = () => setNewOpen(false)

  useEffect(() => {
    if (isNewKey(selectedKey)) setNewOpen(true)
  }, [selectedKey])

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const token = await getToken({ skipCache: true })
        if (!token) return
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setPlan(data.activeSubscription?.planKey ?? null)
        }
      } catch {
        // silently fail
      }
    }
    fetchPlan()
    window.addEventListener('credits-changed', fetchPlan)
    return () => window.removeEventListener('credits-changed', fetchPlan)
  }, [getToken])

  const go = (path: string) => {
    navigate(path)
    if (isMobile) onClose()
  }

  const item = (key: string, label: string, path: string, icon: React.ReactNode) => (
    <NavItem
      icon={icon}
      label={label}
      active={selectedKey === key && !newOpen}
      onClick={() => {
        closeAllGroups()
        go(path)
      }}
    />
  )

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && !collapsed && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      )}

      <aside
        className={`
          app-shell-sidebar
          ${isMobile ? 'fixed top-3 left-3 bottom-3 z-50 rounded-2xl' : 'relative rounded-2xl'}
          flex flex-col shrink-0 transition-all duration-200 shadow-sm border border-gray-200
          ${isMobile ? (collapsed ? '-translate-x-[150%]' : 'translate-x-0') : ''}
        `}
        style={{ width: 220, backgroundColor: '#f5f5f5' }}
      >
        {/* Brand */}
        <div className="px-3 h-16 border-b border-gray-200 shrink-0 flex items-center">
          <Link
            to="/"
            className="flex flex-1 items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#e6e6e6] transition-colors cursor-pointer no-underline group mt-1"
          >
            <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0">
              <img
                src={tabLogoB}
                alt="Pitch"
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
              />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <div className="w-[120px] flex items-center pb-1">
                <PitchLogoAnimation startAnimation={true} />
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {item(
            'projects',
            'Projects',
            '/projects',
            <AnimatedDashboardIcon active={selectedKey === 'projects' && !newOpen} />,
          )}
          {item('new', 'New project', '/new', <AnimatedVideoIcon />)}
          {item(
            'templates',
            'Templates',
            '/templates',
            <AnimatedIcon active={selectedKey === 'templates' && !newOpen}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </AnimatedIcon>,
          )}
          {item(
            'sessions',
            'Sessions',
            '/sessions',
            <AnimatedSessionsIcon active={selectedKey === 'sessions' && !newOpen} />,
          )}
          {item(
            'settings',
            'Settings',
            '/settings',
            <AnimatedSettingsIcon active={selectedKey === 'settings' && !newOpen} />,
          )}
          {item(
            'api-keys',
            'API keys',
            '/api-keys',
            <Key className="w-[18px] h-[18px] shrink-0" />,
          )}
          {item(
            'affiliate',
            'Affiliate',
            // The public pitch, the same page a signed-out visitor gets. Your
            // own link and totals are one click on from it, at /affiliate.
            '/affiliates',
            <AnimatedShareIcon active={selectedKey === 'affiliate' && !newOpen} />,
          )}
          {isAdmin &&
            item(
              'admin',
              'Admin',
              '/admin',
              <AnimatedAdminIcon active={selectedKey === 'admin' && !newOpen} />,
            )}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-3 space-y-1.5">
          <NavItem
            icon={<AnimatedSupportIcon active={false} />}
            label="Support"
            active={false}
            onClick={() => {
              closeAllGroups()
              window.location.href = 'mailto:support@trypitch.co'
            }}
          />
          <div className="border-t border-gray-200 my-2 -mx-3" />

          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => go('/pricing')}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white transition-[background-position] duration-500 ease-out cursor-pointer shadow-sm border-none outline-none h-9 bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] hover:bg-transparent hover:[background-position:100%_center] focus-visible:ring-gray-900/20"
              id="upgrade-pro-btn"
            >
              <span
                className="text-sm font-medium text-white whitespace-nowrap"
                style={{ color: '#ffffff' }}
              >
                {plan
                  ? plan === 'starter'
                    ? 'Starter Plan'
                    : (PLAN_LABELS[plan] ?? plan)
                  : 'Upgrade Pro'}
              </span>
              <BiSolidZap className="w-4 h-4 text-gray-300" />
            </button>
            <div className="relative flex items-center justify-center shrink-0 cursor-pointer hover:brightness-95 transition-all w-9 h-9">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: 'w-9 h-9',
                  },
                }}
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

interface SidebarProps {
  selectedKey: string
  selectedProjectId?: string
  navigate: (path: string) => void
  isMobile: boolean
  collapsed: boolean
  onClose: () => void
  onToggle: () => void
  isAdmin?: boolean
  openSettings: (section?: SettingsSection) => void
}

/**
 * The app is a history of conversations, not a dashboard of project cards.
 * Keep that model visible everywhere: starting new work and resuming old work
 * now happen in the same, persistent rail.
 */
const Sidebar = ({
  selectedKey,
  selectedProjectId,
  navigate,
  isMobile,
  collapsed,
  onClose,
  onToggle,
  isAdmin,
  openSettings,
}: SidebarProps) => {
  const { getToken } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectQuery, setProjectQuery] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await getToken()
        if (!token) return
        const nextProjects = await listProjects(token)
        if (cancelled) return
        setProjects(nextProjects)
      } catch {
        // Navigation should remain usable if history or billing is unavailable.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [getToken, selectedKey])

  const go = (path: string) => {
    navigate(path)
    // The drawer floats over the page now; leaving it open after a navigation
    // would keep the destination blurred behind it.
    onClose()
  }
  const normalizedQuery = projectQuery.trim().toLowerCase()
  const visibleProjects = projects
    .filter(project => !normalizedQuery || project.title.toLowerCase().includes(normalizedQuery))
    .slice(0, 30)

  // Recents grouped the way you remember them: what you touched today, this
  // week, and everything before. While searching, one flat list reads better.
  const chatGroups: { label: string; items: typeof visibleProjects }[] = []
  if (!normalizedQuery) {
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const buckets = [
      { label: 'Today', items: [] as typeof visibleProjects },
      { label: 'This week', items: [] as typeof visibleProjects },
      { label: 'Older', items: [] as typeof visibleProjects },
    ]
    for (const project of visibleProjects) {
      const at = new Date(project.updatedAt).getTime()
      buckets[at >= startOfToday ? 0 : at >= startOfToday - weekMs ? 1 : 2].items.push(project)
    }
    chatGroups.push(...buckets.filter(b => b.items.length))
  }

  const chatButton = (project: (typeof visibleProjects)[number]) => (
    <button
      type="button"
      key={project.id}
      className={cn('conversation-sidebar__chat', project.id === selectedProjectId && 'is-active')}
      onClick={() => go(`/p/${project.id}`)}
      title={project.title}
    >
      <MessageSquare size={13} />
      <span>{project.title || 'Untitled project'}</span>
      {project.busy && <i aria-label="Working" />}
    </button>
  )

  // The collapsed rail's hover panel: the same recents, flying out.
  const railQuery = historyQuery.trim().toLowerCase()
  const railChats = projects
    .filter(p => !railQuery || p.title.toLowerCase().includes(railQuery))
    .slice(0, 8)

  useEffect(() => {
    const startNewChat = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      navigate('/new')
      if (isMobile) onClose()
    }
    window.addEventListener('keydown', startNewChat)
    return () => window.removeEventListener('keydown', startNewChat)
  }, [isMobile, navigate, onClose])

  return (
    <>
      {isMobile && !collapsed && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 border-0 bg-black/20 backdrop-blur-[6px]"
          onClick={onClose}
        />
      )}
      {!isMobile && !collapsed && (
        <button
          type="button"
          aria-label="Close navigation"
          className="conversation-sidebar__scrim"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'conversation-sidebar flex shrink-0 flex-col',
          isMobile && 'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
          isMobile && collapsed && '-translate-x-full',
          !isMobile && collapsed && 'is-collapsed',
        )}
      >
        <div className="conversation-sidebar__brand">
          <button
            type="button"
            className="conversation-sidebar__wordmark"
            onClick={() => go('/new')}
          >
            <img src={tabLogoB} alt="" />
            <PitchWordmark className="conversation-sidebar__wordmark-svg" />
          </button>
          <button
            type="button"
            className="conversation-sidebar__icon"
            onClick={isMobile ? onClose : onToggle}
            aria-label="Collapse sidebar"
          >
            {isMobile ? <X size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="conversation-sidebar__primary" aria-label="Primary">
          <button
            type="button"
            className={cn(
              'conversation-sidebar__new',
              selectedKey.startsWith('new') && 'is-active',
            )}
            onClick={() => go('/new')}
          >
            <Plus size={17} />
            <span>New chat</span>
          </button>
          <button
            type="button"
            className={cn('conversation-sidebar__row', selectedKey === 'sessions' && 'is-active')}
            onClick={() => go('/sessions')}
          >
            <AppWindow size={16} />
            <span>Browser sessions</span>
          </button>
          <button
            type="button"
            className="conversation-sidebar__row"
            onClick={() => openSettings('mcp')}
          >
            <PlugZap size={16} />
            <span>API / MCP</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              className={cn('conversation-sidebar__row', selectedKey === 'admin' && 'is-active')}
              onClick={() => go('/admin')}
            >
              <Shield size={16} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        <div className="conversation-sidebar__search">
          <Search size={14} />
          <input
            aria-label="Search chats"
            placeholder="Search chats…"
            value={projectQuery}
            onChange={event => setProjectQuery(event.target.value)}
          />
        </div>

        <div className="conversation-sidebar__history">
          {visibleProjects.length ? (
            normalizedQuery ? (
              <>
                <p className="conversation-sidebar__section-title">Recent chats</p>
                {visibleProjects.map(chatButton)}
              </>
            ) : (
              chatGroups.map(group => (
                <div key={group.label} className="conversation-sidebar__group">
                  <p className="conversation-sidebar__section-title">{group.label}</p>
                  {group.items.map(chatButton)}
                </div>
              ))
            )
          ) : (
            <span className="conversation-sidebar__empty">
              {projectQuery ? 'No matching chats' : 'Your projects will appear here'}
            </span>
          )}
        </div>

        <div className="conversation-sidebar__footer">
          {/* Community social links matching landing footer */}
          <div className="conversation-sidebar__socials">
            {SOCIALS.map(s => {
              const Icon = s.icon
              return (
                <a
                  key={s.label}
                  className={`conversation-sidebar__social conversation-sidebar__social--${s.label.toLowerCase()}`}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                >
                  {Icon ? <Icon size={17} /> : s.label}
                </a>
              )
            })}
          </div>
          <button
            type="button"
            className="conversation-sidebar__invite"
            onClick={() => openSettings('rewards')}
          >
            <Gift size={16} />
            <span>
              <strong>Invite a friend</strong>
              <small>Earn credits when they sign up</small>
            </span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      {!isMobile && (
        <aside className="conversation-sidebar__rail" aria-label="Quick navigation">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
            title={collapsed ? 'Open sidebar' : 'Close sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
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
            onClick={() => openSettings('mcp')}
            aria-label="API and MCP"
            title="API / MCP"
          >
            <PlugZap size={16} />
          </button>
          {isAdmin && (
            <button type="button" onClick={() => go('/admin')} aria-label="Admin" title="Admin">
              <Shield size={16} />
            </button>
          )}
          <div
            className="conversation-sidebar__rail-pop"
            onMouseEnter={() => setHistoryOpen(true)}
            onMouseLeave={() => {
              setHistoryOpen(false)
              setHistoryQuery('')
            }}
            onFocus={() => setHistoryOpen(true)}
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setHistoryOpen(false)
            }}
          >
            <button
              type="button"
              onClick={() => go('/sessions')}
              aria-label="Recent chats"
              title="Recent chats"
              aria-expanded={historyOpen}
            >
              <History size={16} />
            </button>
            {historyOpen && (
              <div className="conversation-sidebar__rail-history">
                <p>History</p>
                <div className="conversation-sidebar__rail-history-list">
                  {railChats.length ? (
                    railChats.map(project => (
                      <button
                        type="button"
                        key={project.id}
                        onClick={() => go(`/p/${project.id}`)}
                        title={project.title}
                      >
                        <MessageSquare size={13} />
                        <span>{project.title || 'Untitled project'}</span>
                        {project.busy && <i aria-label="Working" />}
                      </button>
                    ))
                  ) : (
                    <span className="conversation-sidebar__rail-history-empty">
                      {historyQuery ? 'No matching chats' : 'No chats yet'}
                    </span>
                  )}
                </div>
                <div className="conversation-sidebar__rail-history-search">
                  <Search size={12} />
                  <input
                    aria-label="Search all chats"
                    placeholder="Search all chats"
                    value={historyQuery}
                    onChange={e => setHistoryQuery(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <span />
          {/* Expand sidebar to access community social links */}
          <button
            type="button"
            onClick={() => {
              if (collapsed) onToggle()
            }}
            aria-label="Open social links"
            title="Open social links"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => openSettings('rewards')}
            aria-label="Invite a friend"
            title="Invite a friend"
          >
            <Gift size={16} />
          </button>
        </aside>
      )}
    </>
  )
}

// ── Studio route ──────────────────────────────────────────────────────────────
function StudioRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/new" replace />
  return <StudioView projectId={id} />
}

// ── App Content ───────────────────────────────────────────────────────────────
function AppContent() {
  const { getToken, isLoaded, userId } = useAuth()
  const { user } = useUser()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)

  const navigate = useNavigate()
  const location = useLocation()

  // Responsive
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) setCollapsed(false)
      else setCollapsed(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Capture any `?ref=<CODE>` from the landing URL on first load. The code is
  // persisted in localStorage so it survives Clerk's OAuth round-trip.
  useEffect(() => {
    captureRefFromUrl()
  }, [])

  // Sync user profile to the database once per session (on sign-in, not on every refresh)
  useEffect(() => {
    if (!isLoaded || !userId || !user) return

    const sessionKey = `user_synced_${userId}`
    if (sessionStorage.getItem(sessionKey)) return

    const syncUser = async () => {
      try {
        const primaryEmail = user.primaryEmailAddress?.emailAddress
        if (!primaryEmail) return
        const token = await getToken()
        await api.post('/users/sync', token!, {
          email: primaryEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          refCode: getRefCode() ?? undefined,
        })
        sessionStorage.setItem(sessionKey, '1')
        window.dispatchEvent(new Event('pitch:user-synced'))
        window.dispatchEvent(new Event('credits-changed')) // Trigger credit fetch after sync
      } catch (err) {
        console.error('Failed to sync user profile:', err)
      }
    }

    syncUser()
  }, [isLoaded, userId, user, getToken])

  // Profile → admin flag. A 404 means the DB was wiped or the user is missing:
  // force a re-sync so the row exists before anything else calls the API.
  useEffect(() => {
    if (!isLoaded || !userId) return

    const loadProfile = async () => {
      const token = await getToken()
      if (!token) return
      try {
        const profile = await api.get<UserProfile>('/users/me', token)
        setIsAdmin(profile?.role === 'admin')
      } catch (profileErr) {
        if (isApiError(profileErr) && profileErr.status === 404) {
          sessionStorage.removeItem(`user_synced_${userId}`)
          try {
            const primaryEmail = user?.primaryEmailAddress?.emailAddress
            if (primaryEmail) {
              await api.post('/users/sync', token, {
                email: primaryEmail,
                firstName: user.firstName,
                lastName: user.lastName,
                imageUrl: user.imageUrl,
                refCode: getRefCode() ?? undefined,
              })
              sessionStorage.setItem(`user_synced_${userId}`, '1')
              window.dispatchEvent(new Event('pitch:user-synced'))
              window.dispatchEvent(new Event('credits-changed'))
            }
          } catch (syncErr) {
            console.error('Failed to force sync user:', syncErr)
          }
        } else {
          console.error('Failed to fetch user profile:', profileErr)
        }
      }
    }

    loadProfile()
  }, [
    isLoaded,
    userId,
    getToken,
    user?.primaryEmailAddress?.emailAddress,
    user?.lastName,
    user?.imageUrl,
    user?.firstName,
  ])

  // ── Route → nav key ────────────────────────────────────────────────────────
  const path = location.pathname
  let selectedKey = 'new'
  if (path.startsWith('/new')) {
    const flow = new URLSearchParams(location.search).get('flow')
    selectedKey = isFlowId(flow) ? `new-${flow}` : 'new'
  } else if (path.startsWith('/p/')) {
    selectedKey = 'studio'
  } else if (path.startsWith('/settings')) {
    selectedKey = 'settings'
  } else if (path.startsWith('/api-keys')) {
    selectedKey = 'api-keys'
  } else if (path.startsWith('/sessions')) {
    selectedKey = 'sessions'
  } else if (path.startsWith('/admin')) {
    selectedKey = 'admin'
  } else if (path.startsWith('/pricing')) {
    selectedKey = 'pricing'
  } else if (path.startsWith('/affiliate')) {
    selectedKey = 'affiliate'
  } else if (path.startsWith('/templates')) {
    selectedKey = 'templates'
  }

  const shell = useMemo(
    () => ({
      isMobile,
      toggleSidebar: () => setCollapsed(c => !c),
      openSettings: (section: SettingsSection = 'account') => setSettingsSection(section),
    }),
    [isMobile],
  )

  const isStudio = selectedKey === 'studio'

  // Public share page — rendered before the Clerk-loading gate (same
  // treatment as `/` below) so it's instant for anonymous visitors clicking
  // a shared link, and never nested inside signed-in/signed-out gating.
  if (path.startsWith('/d/')) {
    const slug = path.slice('/d/'.length).split('/')[0]
    return (
      <Suspense fallback={<PageLoader fullScreen />}>
        <PublicDemoView slug={slug} />
      </Suspense>
    )
  }

  if (!isLoaded) return <div className="h-screen w-screen bg-[#FDFDFD]"></div>

  // SSO callback — must be outside SignedIn/SignedOut (user is in transitional auth state)
  if (path === '/sso-callback') {
    return <AuthenticateWithRedirectCallback />
  }

  // Checkout return — full-screen receipt page Dodo redirects to after payment.
  if (path === '/checkout/return') {
    return (
      <>
        <Show when="signed-in">
          <Suspense fallback={<PageLoader fullScreen />}>
            <CheckoutReturnView />
          </Suspense>
        </Show>
        <Show when="signed-out">
          <Navigate to="/sign-in" replace />
        </Show>
      </>
    )
  }

  // Landing page — always shown at /, signed-in users see the Projects CTA
  if (path === '/') {
    return (
      <Suspense fallback={<PageLoader fullScreen />}>
        <LandingView />
      </Suspense>
    )
  }

  // Docs (/docs and /docs/:slug) — standalone, outside the app shell.
  if (path === '/docs' || path.startsWith('/docs/')) {
    const slug = path.slice('/docs'.length).replace(/^\//, '').split('/')[0]
    return (
      <Suspense fallback={<PageLoader fullScreen />}>
        <DocsView slug={slug} />
      </Suspense>
    )
  }

  // The affiliate pitch (/affiliates) — public, outside the shell. The
  // signed-in dashboard with the actual link stays at /affiliate.
  if (path === '/affiliates') {
    return (
      <Suspense fallback={<PageLoader fullScreen />}>
        <AffiliatesView />
      </Suspense>
    )
  }

  // Product pages (/product/:slug) — standalone marketing pages, same
  // treatment as `/`: rendered outside the signed-in/out app shell.
  if (path.startsWith('/product/')) {
    const slug = path.slice('/product/'.length).split('/')[0]
    return (
      <Suspense fallback={<PageLoader fullScreen />}>
        <ProductView slug={slug} />
      </Suspense>
    )
  }

  return (
    <>
      <Show when="signed-in">
        <AppShellContext.Provider value={shell}>
          <div
            className="app-shell-bg flex h-screen w-screen overflow-hidden"
            style={{ backgroundColor: '#ededed' }}
          >
            <OnboardingSurvey />
            {settingsSection && (
              <SettingsModal
                section={settingsSection}
                onSectionChange={setSettingsSection}
                onClose={() => setSettingsSection(null)}
              />
            )}
            <Sidebar
              selectedKey={selectedKey}
              selectedProjectId={path.startsWith('/p/') ? path.split('/')[2] : undefined}
              navigate={p => {
                navigate(p)
                if (isMobile) setCollapsed(true)
              }}
              isMobile={isMobile}
              collapsed={collapsed}
              onClose={() => setCollapsed(true)}
              onToggle={() => setCollapsed(value => !value)}
              isAdmin={isAdmin}
              openSettings={section => setSettingsSection(section ?? 'account')}
            />

            <div
              className="app-shell-panel flex min-w-0 flex-1 flex-col overflow-hidden border-l border-gray-200"
              style={{ backgroundColor: '#ffffff' }}
            >
              <main
                className={cn(
                  'app-shell-main flex-1 overflow-x-hidden bg-white relative',
                  isStudio ? 'overflow-hidden' : 'overflow-y-auto',
                  selectedKey.startsWith('new') && 'new-shell-main',
                )}
              >
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/projects" element={<Navigate to="/new" replace />} />
                    <Route path="/new" element={<NewProjectView />} />
                    <Route path="/p/:id" element={<StudioRoute />} />
                    <Route path="/templates" element={<TemplatesView />} />
                    <Route path="/pricing" element={<PricingView />} />
                    <Route path="/settings" element={<SettingsView />} />
                    <Route path="/api-keys" element={<ApiKeysView />} />
                    <Route path="/sessions" element={<SessionsView />} />
                    <Route path="/affiliate" element={<AffiliateView />} />
                    <Route path="/admin" element={<AdminView />} />
                    <Route path="/about" element={<AboutUs />} />
                    <Route path="/blog" element={<Blog />} />
                    <Route path="/blog/:slug" element={<BlogPostView />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    {/* Old app URLs → the studio. */}
                    <Route path="/dashboard" element={<Navigate to="/new" replace />} />
                    <Route path="/pdf" element={<Navigate to="/new?flow=deck" replace />} />
                    <Route path="/enhance" element={<Navigate to="/new?flow=deck" replace />} />
                    <Route
                      path="/edit"
                      element={<Navigate to="/new?flow=recording-edit" replace />}
                    />
                    <Route
                      path="/launch-video/*"
                      element={<Navigate to="/new?flow=launch-video" replace />}
                    />
                    <Route path="*" element={<NotFoundView />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
          </div>
        </AppShellContext.Provider>
      </Show>
      <Show when="signed-out">
        <Suspense fallback={<PageLoader fullScreen />}>
          <Routes>
            <Route path="/" element={<LandingView />} />
            <Route path="/sign-in" element={<AuthView mode="sign-in" />} />
            <Route path="/sign-up" element={<AuthView mode="sign-up" />} />
            <Route path="/pricing" element={<PublicPricingView />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPostView />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            {/* Anything else is a signed-in page. Send them to sign-up carrying
                where they were going, so auth returns them there. */}
            <Route path="*" element={<SignUpThenReturn />} />
          </Routes>
        </Suspense>
      </Show>
    </>
  )
}

export default App

/**
 * Signed-out visitor asking for a signed-in page (say /api-keys from the docs).
 * Bounce to sign-up with the destination attached instead of dumping them on
 * the landing page, so AuthView can return them there once they are in.
 */
function SignUpThenReturn() {
  const { pathname, search, hash } = useLocation()
  const target = `${pathname}${search}${hash}`
  return <Navigate to={`/sign-up?redirect=${encodeURIComponent(target)}`} replace />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Detect Instagram's in-app browser WebView by UA string. */
function isInstagramWebView(): boolean {
  const ua = navigator.userAgent || ''
  return /Instagram/i.test(ua)
}

/**
 * Banner shown to visitors arriving via the Instagram in-app browser.
 * Instagram WebView is a restricted environment that causes JS errors
 * (TypeError, postMessage failures) and blocks PostHog session recording.
 * Prompting users to open in a real browser fixes both issues.
 */
function InstagramBanner() {
  const [visible, setVisible] = useState(() => isInstagramWebView())

  if (!visible) return null

  const openInBrowser = () => {
    // Most Android Instagram WebViews respect this intent; iOS users need to
    // use the "Open in browser" option in the three-dot menu manually.
    const url = window.location.href
    // Try to force open via a scheme that bypasses the in-app browser on Android
    window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
    // Fallback: just copy/show the URL after a short delay
    setTimeout(() => {
      try {
        navigator.clipboard?.writeText(url)
      } catch {
        // clipboard not available in WebView — that's fine
      }
    }, 300)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'linear-gradient(90deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}
      role="alert"
      aria-live="polite"
      id="instagram-webview-banner"
    >
      <span style={{ flex: 1 }}>
        🌐 For the best experience, open this page in your browser — some features don't work inside
        Instagram.
      </span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={openInBrowser}
          style={{
            background: 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 10px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          id="instagram-banner-open-btn"
        >
          Open in browser
        </button>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
          }}
          id="instagram-banner-dismiss-btn"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <InstagramBanner />
      <ScrollToTop />
      <ToastShell>
        <AppContent />
      </ToastShell>
    </BrowserRouter>
  )
}
