import {
  AuthenticateWithRedirectCallback,
  Show,
  UserButton,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react'
import {
  type ComponentType,
  cloneElement,
  createContext,
  isValidElement,
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
import { Key, X } from 'lucide-react'
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
import { CreditPopover } from './components/CreditPopover'
import { FlowGlyph } from './components/FlowGlyph'
import { LoadingCoin } from './components/LoadingCoin'
import { OnboardingSurvey } from './components/OnboardingSurvey'
import { PitchLogoAnimation } from './components/PitchLogoAnimation'
import { API_URL } from './config'
import { api, isApiError } from './lib/api'
import { captureRefFromUrl, getRefCode } from './lib/referral'
import { FLOWS, type FlowId, isFlowId } from './lib/studio-api'
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
const AffiliateView = lazyNamed(() => import('./views/AffiliateView'), 'AffiliateView')
const ApiKeysView = lazyNamed(() => import('./views/ApiKeysView'), 'ApiKeysView')
const CheckoutReturnView = lazyNamed(
  () => import('./views/CheckoutReturnView'),
  'CheckoutReturnView',
)
const DocsView = lazyNamed(() => import('./views/DocsView'), 'DocsView')
const LandingView = lazyNamed(() => import('./views/LandingView'), 'LandingView')
const LegacyProjectView = lazyNamed(() => import('./views/LegacyProjectView'), 'LegacyProjectView')
const NewProjectView = lazyNamed(() => import('./views/NewProjectView'), 'NewProjectView')
const PricingView = lazyNamed(() => import('./views/PricingView'), 'PricingView')
const ProductView = lazyNamed(() => import('./views/ProductView'), 'ProductView')
const ProjectsView = lazyNamed(() => import('./views/ProjectsView'), 'ProjectsView')
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
}
const AppShellContext = createContext<AppShellCtx | null>(null)
export const useAppShell = (): AppShellCtx =>
  useContext(AppShellContext) ?? { isMobile: false, toggleSidebar: () => {} }

const ToastContext = createContext<ToastCtx | null>(null)
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastShell')
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

const IconSearch = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const IconPlus = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="5" width="20" height="3.5" rx="1" />
    <rect x="2" y="10.5" width="20" height="3.5" rx="1" />
    <rect x="2" y="16" width="20" height="3.5" rx="1" />
  </svg>
)
const IconArrowLeft = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)
const IconChevronRight = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

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

interface NavGroupChild {
  key: string
  label: string
  path: string
  icon?: React.ReactNode
}
interface NavGroupProps {
  icon: React.ReactNode
  label: string
  children: NavGroupChild[]
  selectedKey: string
  onNavigate: (path: string) => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}
const NavGroup = ({
  icon,
  label,
  children,
  selectedKey,
  onNavigate,
  isOpen,
  onOpenChange,
}: NavGroupProps) => {
  const isChildActive = children.some(c => c.key === selectedKey)
  const isActive = isOpen || isChildActive

  const toggle = () => onOpenChange(!isOpen)

  const animatedIcon = isValidElement<{ active?: boolean }>(icon)
    ? cloneElement(icon, { active: isActive })
    : icon

  return (
    <div className="space-y-1">
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out cursor-pointer border-none outline-none group
          ${
            isActive
              ? 'bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] hover:[background-position:100%_center] text-white shadow-sm'
              : 'text-gray-500 hover:bg-[#e6e6e6] hover:text-gray-800 bg-transparent'
          }`}
      >
        <span className="flex items-center gap-2.5">
          <span
            className={`transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-500'}`}
          >
            {animatedIcon}
          </span>
          {label}
        </span>
        <span
          className={`transition-transform duration-200 ease-out ${isOpen ? 'rotate-90' : ''} ${isActive ? 'text-white/80' : 'text-gray-400'}`}
        >
          <IconChevronRight />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="ml-3.5 pl-3 pr-1 py-1 space-y-0.5 border-l border-gray-200/80">
            {children.map(child => {
              const active = child.key === selectedKey
              return (
                <button
                  key={child.key}
                  onClick={() => onNavigate(child.path)}
                  className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer border-none outline-none relative
                    ${
                      active
                        ? 'bg-gray-200 text-gray-900'
                        : 'text-gray-500 hover:bg-[#e6e6e6] hover:text-gray-800 bg-transparent hover:translate-x-0.5'
                    }`}
                >
                  {active && (
                    <span className="absolute -left-[13px] inset-y-0 w-[3px] bg-gray-900 rounded-r-full" />
                  )}
                  {child.icon && (
                    <span className={`shrink-0 ${active ? 'text-gray-700' : 'text-gray-400'}`}>
                      {child.icon}
                    </span>
                  )}
                  <span className="truncate">{child.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface SidebarProps {
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

const Sidebar = ({
  selectedKey,
  navigate,
  isMobile,
  collapsed,
  onClose,
  isAdmin,
}: SidebarProps) => {
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
            '/affiliate',
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

// ── Top Header ────────────────────────────────────────────────────────────────
interface TopHeaderProps {
  isMobile: boolean
  isDetailPage: boolean
  backLabel?: string
  showSearch: boolean
  searchQuery: string
  onSearchChange: (q: string) => void
  onToggle: () => void
  onNew: () => void
  onBack: () => void
  title?: string
  isPricingPage?: boolean
  isSettingsPage?: boolean
  onSignOut?: () => void
}
const TopHeader = ({
  isMobile,
  isDetailPage,
  backLabel,
  showSearch,
  searchQuery,
  onSearchChange,
  onToggle,
  onNew,
  onBack,
  title,
  isPricingPage,
  isSettingsPage,
  onSignOut,
}: TopHeaderProps) => (
  <header className="app-shell-header h-16 px-5 bg-white border-b border-gray-200 shrink-0 rounded-t-2xl relative flex items-center justify-between">
    {/* Left: logo + search / back */}
    <div className="flex items-center gap-3 shrink-0">
      {isMobile && (
        <Link
          to="/"
          className="w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors group"
        >
          <img
            src={tabLogoB}
            alt="Pitch"
            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
          />
        </Link>
      )}
      {isDetailPage ? (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm sm:text-base font-medium text-gray-500 hover:text-gray-800 transition-colors bg-transparent border-none cursor-pointer p-0 shrink-0"
          id="header-back-btn"
        >
          <IconArrowLeft />
          <span className="hidden sm:inline">{backLabel ?? 'Back to Projects'}</span>
        </button>
      ) : title ? (
        <h2 className="text-lg font-bold text-gray-900 ml-1">{title}</h2>
      ) : (
        <div className="hidden sm:flex items-center h-8 shrink-0 sm:w-48" />
      )}
    </div>

    {showSearch ? (
      <div className="flex-1 min-w-0 px-2 sm:px-4 md:px-0 md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-[240px]">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Search projects…"
            className="flex h-9 md:h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 md:pl-10 pr-8 md:pr-10 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all"
            id="global-search-input"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    ) : isDetailPage && title ? (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[200px] sm:max-w-sm hidden md:block">
        <p className="text-base font-medium text-gray-900 truncate">{title}</p>
      </div>
    ) : null}

    {/* Right: actions + credits (credits kept right-most) */}
    <div className="flex items-center gap-2 md:gap-3 shrink-0">
      {isSettingsPage && onSignOut ? (
        <button
          onClick={onSignOut}
          className="flex items-center justify-center gap-1.5 w-9 h-9 px-0 md:w-auto md:h-auto md:px-3.5 md:py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium rounded-lg transition-colors border-none cursor-pointer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      ) : !isMobile && !isDetailPage && !isPricingPage ? (
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
          id="new-project-btn"
        >
          <IconPlus />
          <span className="hidden sm:inline">New project</span>
        </button>
      ) : null}

      {isMobile && (
        <button
          onClick={onToggle}
          className="text-gray-900 transition-colors w-9 h-9 flex items-center justify-center ml-1 rounded-lg border border-gray-200 hover:bg-gray-50 bg-white cursor-pointer"
          id="sidebar-toggle-btn"
        >
          <IconMenu />
        </button>
      )}
    </div>
  </header>
)

// ── Studio route ──────────────────────────────────────────────────────────────
function StudioRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/projects" replace />
  return <StudioView projectId={id} />
}

function LegacyRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/projects" replace />
  return <LegacyProjectView projectId={id} />
}

// ── App Content ───────────────────────────────────────────────────────────────
function AppContent() {
  const { getToken, isLoaded, userId } = useAuth()
  const { signOut } = useClerk()
  const { user } = useUser()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1024)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  // Track whether the user has selected a specific template (detail mode)
  const [templatesInDetail, setTemplatesInDetail] = useState(false)
  const [clearTemplatesSelection, setClearTemplatesSelection] = useState<(() => void) | null>(null)

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
  let selectedKey = 'projects'
  if (path.startsWith('/new')) {
    const flow = new URLSearchParams(location.search).get('flow')
    selectedKey = isFlowId(flow) ? `new-${flow}` : 'new'
  } else if (path.startsWith('/p/')) {
    selectedKey = 'studio'
  } else if (path.startsWith('/legacy/')) {
    selectedKey = 'legacy'
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
    () => ({ isMobile, toggleSidebar: () => setCollapsed(c => !c) }),
    [isMobile],
  )

  const isStudio = selectedKey === 'studio'
  const isDetailPage =
    isStudio ||
    selectedKey === 'legacy' ||
    selectedKey.startsWith('new') ||
    selectedKey === 'settings' ||
    (selectedKey === 'templates' && templatesInDetail)

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
            className="app-shell-bg flex h-screen w-screen overflow-hidden p-3 gap-3"
            style={{ backgroundColor: '#e6e6e6' }}
          >
            <OnboardingSurvey />
            {(!isMobile ? selectedKey !== 'settings' && !isStudio : true) && (
              <Sidebar
                selectedKey={selectedKey}
                navigate={p => {
                  navigate(p)
                  if (isMobile) setCollapsed(true)
                }}
                isMobile={isMobile}
                collapsed={collapsed}
                onClose={() => setCollapsed(true)}
                isAdmin={isAdmin}
              />
            )}

            <div
              className="app-shell-panel flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl shadow-sm border border-gray-200"
              style={{ backgroundColor: '#ffffff' }}
            >
              {/* The studio route draws its own header (see Topbar in
                StudioView) — rendering this one too gave every project two
                stacked bars with two identical back buttons. */}
              {!isStudio && (
                <TopHeader
                  isMobile={isMobile}
                  isDetailPage={isDetailPage}
                  backLabel={
                    selectedKey === 'templates' && templatesInDetail
                      ? 'Back to Templates Gallery'
                      : undefined
                  }
                  showSearch={selectedKey === 'projects'}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onToggle={() => setCollapsed(c => !c)}
                  onNew={() => navigate('/new')}
                  onBack={() => {
                    if (selectedKey === 'templates' && templatesInDetail) {
                      clearTemplatesSelection?.()
                    } else {
                      navigate('/projects')
                    }
                  }}
                  title={
                    selectedKey === 'pricing'
                      ? 'Pricing'
                      : selectedKey === 'templates' && !templatesInDetail
                        ? 'Templates'
                        : undefined
                  }
                  isPricingPage={selectedKey === 'pricing'}
                  isSettingsPage={selectedKey === 'settings'}
                  onSignOut={() => signOut()}
                />
              )}

              <main
                className={cn(
                  'app-shell-main flex-1 overflow-x-hidden bg-white rounded-b-2xl relative',
                  isStudio ? 'overflow-hidden' : 'overflow-y-auto',
                )}
              >
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/projects" element={<ProjectsView searchQuery={searchQuery} />} />
                    <Route path="/new" element={<NewProjectView />} />
                    <Route path="/p/:id" element={<StudioRoute />} />
                    <Route path="/legacy/:id" element={<LegacyRoute />} />
                    <Route
                      path="/templates"
                      element={
                        <TemplatesView
                          onDetailModeChange={setTemplatesInDetail}
                          onClearSelectionReady={(fn: (() => void) | null) =>
                            setClearTemplatesSelection(() => fn)
                          }
                        />
                      }
                    />
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
                    <Route path="/dashboard" element={<Navigate to="/projects" replace />} />
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
                    <Route path="*" element={<Navigate to="/projects" replace />} />
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
