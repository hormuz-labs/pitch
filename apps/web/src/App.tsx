import {
  AuthenticateWithRedirectCallback,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/clerk-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import './index.css'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import { BiSolidZap } from 'react-icons/bi'
import tabLogoB from './assets/tabLogoB.svg'
import { AboutUs } from './components/AboutUs'
import { AnimatedDashboardIcon } from './components/AnimatedDashboardIcon'
import { Blog, BlogPostView } from './components/Blog'
import { CreditPopover } from './components/CreditPopover'
import { PitchLogoAnimation } from './components/PitchLogoAnimation'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import { TermsOfService } from './components/TermsOfService'
import { API_URL } from './config'
import { api } from './lib/api'
import { parseSSELog } from './lib/events'
import { captureRefFromUrl, getRefCode } from './lib/referral'
import { SLIDE_TEMPLATES } from './lib/slideBlocks'
import { cn } from './lib/utils'
import type { LogEntry, Project } from './types'
import {
  AdminView,
  AffiliateView,
  CheckoutReturnView,
  CreateView,
  DashboardView,
  EditorView,
  LandingView,
  PdfCreateView,
  PdfEditorView,
  PricingView,
  PublicPricingView,
  SessionsView,
  SettingsView,
  TemplatesView,
} from './views'
import { AuthView } from './views/AuthView'

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

const ToastContext = createContext<ToastCtx | null>(null)
const useToast = () => {
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

const IconVideo = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
)
const IconAdmin = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconSessions = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <circle cx="12" cy="11" r="2.5" />
    <path d="M12 13.5V16" />
  </svg>
)
const IconSettings = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
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
const IconDownload = () => (
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
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
const Share2Icon = () => (
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
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

const IconSupport = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface SidebarProps {
  selectedKey: string
  navigate: (path: string) => void
  isMobile: boolean
  collapsed: boolean
  onClose: () => void
  isAdmin?: boolean
  pdfSlides?: { id: number; title: string; srcDoc?: string }[]
  activePdfSlide?: number
  onScrollToPdfSlide?: (index: number) => void
  onAddPdfSlide?: (template: string) => void
  onReorderPdfSlides?: (from: number, to: number) => void
  onSetPdfSlideBg?: (index: number, color: string) => void
  onDeletePdfSlide?: (index: number) => void
}
const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const Sidebar = ({
  selectedKey,
  navigate,
  isMobile,
  collapsed,
  onClose,
  isAdmin,
  pdfSlides,
  activePdfSlide,
  onScrollToPdfSlide,
  onAddPdfSlide,
  onReorderPdfSlides,
  onSetPdfSlideBg,
  onDeletePdfSlide,
}: SidebarProps) => {
  const { getToken } = useAuth()
  const [plan, setPlan] = useState<string | null>(null)
  const [showAddSlide, setShowAddSlide] = useState(false)
  const [dragSlide, setDragSlide] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [slideMenu, setSlideMenu] = useState<number | null>(null)

  // Count the element types inside a slide preview (for the per-slide summary)
  const summarizeSlide = (srcDoc?: string): string => {
    if (!srcDoc) return ''
    try {
      const d = new DOMParser().parseFromString(srcDoc, 'text/html')
      const slide = d.querySelector('.slide') || d.body
      const n = (sel: string) => slide.querySelectorAll(sel).length
      const parts: string[] = []
      const headings = n('h1, h2, h3, h4, .main-title')
      const text = n('p')
      const imgs = n('img')
      const charts = n('canvas')
      const lists = n('ul, ol')
      const tables = n('table')
      if (headings) parts.push(`${headings} heading${headings > 1 ? 's' : ''}`)
      if (text) parts.push(`${text} text`)
      if (lists) parts.push(`${lists} list${lists > 1 ? 's' : ''}`)
      if (tables) parts.push(`${tables} table${tables > 1 ? 's' : ''}`)
      if (imgs) parts.push(`${imgs} image${imgs > 1 ? 's' : ''}`)
      if (charts) parts.push(`${charts} chart${charts > 1 ? 's' : ''}`)
      return parts.join(' · ') || 'Empty slide'
    } catch {
      return ''
    }
  }
  const SLIDE_BG_DOTS = ['#ffffff', '#000000', '#0f172a', '#1f2937', '#6366f1', '#f3f4f6']

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
          {(selectedKey !== 'pdfeditor' || (pdfSlides && pdfSlides.length === 0)) && (
            <>
              <NavItem
                icon={<AnimatedDashboardIcon active={selectedKey === 'dashboard'} />}
                label="Dashboard"
                active={selectedKey === 'dashboard'}
                onClick={() => go('/dashboard')}
              />
              <NavItem
                icon={<IconVideo />}
                label="New Video"
                active={selectedKey === 'create'}
                onClick={() => go('/new')}
              />
              <NavItem
                icon={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                }
                label="New PDF"
                active={selectedKey === 'pdf-create'}
                onClick={() => go('/pdf')}
              />
              <NavItem
                icon={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                }
                label="Templates"
                active={selectedKey === 'templates'}
                onClick={() => go('/templates')}
              />
              <NavItem
                icon={<Share2Icon />}
                label="Affiliate"
                active={selectedKey === 'affiliate'}
                onClick={() => go('/affiliate')}
              />
              <NavItem
                icon={<IconSessions />}
                label="Browser Sessions"
                active={selectedKey === 'sessions'}
                onClick={() => go('/sessions')}
              />
              {isAdmin && (
                <NavItem
                  icon={<IconAdmin />}
                  label="Admin"
                  active={selectedKey === 'admin'}
                  onClick={() => go('/admin')}
                />
              )}
            </>
          )}

          {/* Active PDF Editor Slides section — visual thumbnail rail (drag to reorder) */}
          {selectedKey === 'pdfeditor' && pdfSlides && pdfSlides.length > 0 && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="px-3 mb-2 shrink-0 flex items-center justify-between relative">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                  Slides ({pdfSlides.length})
                </h3>
                {onAddPdfSlide && (
                  <button
                    onClick={() => setShowAddSlide(v => !v)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 bg-gray-200/70 hover:bg-gray-200 rounded-md px-1.5 py-1 cursor-pointer transition-colors"
                    title="Add a new slide"
                    aria-haspopup="menu"
                    aria-expanded={showAddSlide}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add
                  </button>
                )}
                {showAddSlide && onAddPdfSlide && (
                  <div
                    role="menu"
                    className="absolute right-2 top-8 z-50 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">
                      New slide layout
                    </p>
                    {SLIDE_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        role="menuitem"
                        onClick={() => {
                          onAddPdfSlide(t.id)
                          setShowAddSlide(false)
                        }}
                        className="w-full text-left text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-2 py-1.5 cursor-pointer transition-colors"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {onReorderPdfSlides && (
                <p className="px-3 -mt-1 mb-2 shrink-0 flex items-center gap-1 text-[10px] text-gray-400">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                  Drag to reorder
                </p>
              )}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                {pdfSlides.map(slide => {
                  const isActive = activePdfSlide === slide.id
                  const isDropTarget = dropTarget === slide.id && dragSlide !== slide.id
                  const THUMB_W = 186 // matches ~sidebar inner width; iframe scales 1280 -> THUMB_W
                  return (
                    <div
                      key={slide.id}
                      draggable={!!onReorderPdfSlides}
                      onDragStart={() => setDragSlide(slide.id)}
                      onDragOver={e => {
                        if (dragSlide !== null) {
                          e.preventDefault()
                          setDropTarget(slide.id)
                        }
                      }}
                      onDragEnd={() => {
                        setDragSlide(null)
                        setDropTarget(null)
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragSlide !== null && dragSlide !== slide.id)
                          onReorderPdfSlides?.(dragSlide, slide.id)
                        setDragSlide(null)
                        setDropTarget(null)
                      }}
                      onClick={() => onScrollToPdfSlide?.(slide.id)}
                      className={`group relative w-full flex items-stretch gap-2 cursor-pointer text-left p-0 rounded-lg transition-all ${dragSlide === slide.id ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
                    >
                      <span
                        className={`shrink-0 self-center text-[10px] font-mono w-5 text-center ${isActive ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
                      >
                        {slide.id + 1}
                      </span>
                      <div
                        className={`relative flex-1 rounded-lg overflow-hidden bg-white transition-all duration-150 ${
                          isActive
                            ? 'ring-2 ring-gray-900 shadow-md'
                            : 'ring-1 ring-gray-200 group-hover:ring-gray-400 shadow-sm'
                        }`}
                        style={{ aspectRatio: '16 / 9' }}
                      >
                        {slide.srcDoc ? (
                          <iframe
                            srcDoc={slide.srcDoc}
                            title={`Slide ${slide.id + 1} preview`}
                            tabIndex={-1}
                            scrolling="no"
                            loading="lazy"
                            sandbox="allow-same-origin"
                            className="absolute top-0 left-0 pointer-events-none border-none bg-white"
                            style={{
                              width: 1280,
                              height: 720,
                              transformOrigin: 'top left',
                              transform: `scale(${THUMB_W / 1280})`,
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                        )}
                        {/* drag grip affordance */}
                        {onReorderPdfSlides && (
                          <span
                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-white/90 bg-black/40 rounded p-0.5"
                            title="Drag to reorder"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="9" cy="6" r="1.5" />
                              <circle cx="15" cy="6" r="1.5" />
                              <circle cx="9" cy="12" r="1.5" />
                              <circle cx="15" cy="12" r="1.5" />
                              <circle cx="9" cy="18" r="1.5" />
                              <circle cx="15" cy="18" r="1.5" />
                            </svg>
                          </span>
                        )}
                        {/* per-slide menu trigger */}
                        {onSetPdfSlideBg && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setSlideMenu(slideMenu === slide.id ? null : slide.id)
                            }}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-white/90 bg-black/40 hover:bg-black/60 rounded p-0.5 cursor-pointer"
                            title="Slide options"
                            aria-label="Slide options"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="12" cy="19" r="1.6" />
                            </svg>
                          </button>
                        )}
                        {/* hover/scrim + title */}
                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/55 to-transparent">
                          <span className="block truncate text-[9px] font-semibold text-white/95 leading-tight">
                            {slide.title}
                          </span>
                        </div>
                      </div>

                      {/* per-slide options popover (bg colour + element summary) */}
                      {slideMenu === slide.id && onSetPdfSlideBg && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={e => {
                              e.stopPropagation()
                              setSlideMenu(null)
                            }}
                          />
                          <div
                            className="absolute right-1 top-7 z-50 w-44 bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
                            onClick={e => e.stopPropagation()}
                          >
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                              Background
                            </p>
                            <div className="flex items-center gap-1.5 mb-2.5">
                              {SLIDE_BG_DOTS.map(c => (
                                <button
                                  key={c}
                                  onClick={() => {
                                    onSetPdfSlideBg(slide.id, c)
                                  }}
                                  style={{ backgroundColor: c }}
                                  className="w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer"
                                  title={c}
                                />
                              ))}
                              <div
                                className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-300 cursor-pointer"
                                style={{
                                  background:
                                    'conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)',
                                }}
                                title="Custom"
                              >
                                <input
                                  type="color"
                                  onChange={e => onSetPdfSlideBg(slide.id, e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  aria-label="Custom background colour"
                                />
                              </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                              Contains
                            </p>
                            <p className="text-[11px] text-gray-600 leading-snug">
                              {summarizeSlide(slide.srcDoc)}
                            </p>
                            {onDeletePdfSlide && (pdfSlides?.length ?? 0) > 1 && (
                              <>
                                <div className="border-t border-gray-100 my-2 -mx-2.5" />
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    onDeletePdfSlide(slide.id)
                                    setSlideMenu(null)
                                  }}
                                  className="w-full flex items-center gap-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5 cursor-pointer transition-colors text-left"
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                  </svg>
                                  Delete slide
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-3 space-y-1.5">
          {(selectedKey !== 'pdfeditor' || (pdfSlides && pdfSlides.length === 0)) && (
            <NavItem
              icon={<IconSupport />}
              label="Support"
              active={false}
              onClick={() => {
                window.location.href = 'mailto:support@trypitch.co'
              }}
            />
          )}
          <div className="border-t border-gray-200 my-2 -mx-3" />
          <NavItem
            icon={<IconSettings />}
            label="Settings"
            active={selectedKey === 'settings'}
            onClick={() => go('/settings')}
          />

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
                afterSignOutUrl="/"
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
  searchQuery: string
  onSearchChange: (q: string) => void
  onToggle: () => void
  onNew: () => void
  onBack: () => void
  projectTitle?: string
  onDownload?: () => void
  isPricingPage?: boolean
  isSettingsPage?: boolean
  isNewPage?: boolean
  isEditorPage?: boolean
  isPdfEditorPage?: boolean
  onSignOut?: () => void
}
const TopHeader = ({
  isMobile,
  isDetailPage,
  backLabel,
  searchQuery,
  onSearchChange,
  onToggle,
  onNew,
  onBack,
  projectTitle,
  onDownload,
  isPricingPage,
  isSettingsPage,
  isNewPage,
  isEditorPage,
  isPdfEditorPage,
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
          <span className="hidden sm:inline">
            {backLabel ?? (isMobile && isNewPage ? 'Dashboard' : 'Back to Dashboard')}
          </span>
        </button>
      ) : isPricingPage ? (
        <h2 className="text-lg font-bold text-gray-900 ml-1">Pricing</h2>
      ) : (
        <div className="hidden sm:flex items-center h-8 shrink-0 sm:w-48">
          {/* OrganizationSwitcher removed because it is disabled in Clerk dashboard */}
        </div>
      )}
    </div>

    {projectTitle ? (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[200px] sm:max-w-sm hidden md:block">
        <p className="text-base font-medium text-gray-900 truncate">{projectTitle}</p>
      </div>
    ) : !isDetailPage && !isPricingPage ? (
      <div className="flex-1 min-w-0 px-2 sm:px-4 md:px-0 md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-[240px]">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Search..."
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
    ) : null}

    {/* Right: actions + currency (currency kept right-most) */}
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
      ) : isPdfEditorPage ? (
        <div id="pdf-editor-header-actions" className="flex items-center gap-2" />
      ) : onDownload && !(isMobile && isEditorPage) ? (
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors border-none cursor-pointer shadow-sm"
          id="header-download-btn"
        >
          <IconDownload /> <span className="hidden sm:inline">Download</span>
        </button>
      ) : !isMobile && !isDetailPage && !isPricingPage ? (
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
          id="new-project-btn"
        >
          <IconPlus />
          <span className="hidden sm:inline">New Video</span>
        </button>
      ) : null}

      {/* Currency / credits — kept right-most */}
      {!isSettingsPage && !(isMobile && isEditorPage) && <CreditPopover />}

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

// ── App Content ───────────────────────────────────────────────────────────────
function AppContent() {
  const { getToken, isLoaded, userId } = useAuth()
  const { signOut } = useClerk()
  const { user } = useUser()
  const { toast } = useToast()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1024)
  const [searchQuery, setSearchQuery] = useState('')

  const [projects, setProjects] = useState<Project[]>([])
  const [jobLogs, setJobLogs] = useState<Record<string, LogEntry[]>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [isAdmin, setIsAdmin] = useState(false)

  // Track whether the user has selected a specific template (detail mode)
  const [templatesInDetail, setTemplatesInDetail] = useState(false)
  const clearTemplatesSelectionRef = useRef<(() => void) | null>(null)

  // States for PDF Editor slide navigation integration in main Sidebar
  const [pdfSlides, setPdfSlides] = useState<{ id: number; title: string; srcDoc?: string }[]>([])
  const [activePdfSlide, setActivePdfSlide] = useState<number>(0)
  const [onScrollToPdfSlide, setOnScrollToPdfSlide] = useState<((index: number) => void) | null>(
    null,
  )
  const [onAddPdfSlide, setOnAddPdfSlide] = useState<((template: string) => void) | null>(null)
  const [onReorderPdfSlides, setOnReorderPdfSlides] = useState<
    ((from: number, to: number) => void) | null
  >(null)
  const [onSetPdfSlideBg, setOnSetPdfSlideBg] = useState<
    ((index: number, color: string) => void) | null
  >(null)
  const [onDeletePdfSlide, setOnDeletePdfSlide] = useState<((index: number) => void) | null>(null)

  const navigate = useNavigate()
  const location = useLocation()

  // Wrapper: always fetches a fresh token; on 401 retries once with force-refresh
  // @ts-expect-error - unused variable but kept for reference
  const _authFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken()
    if (!token) throw new Error('Not authenticated')
    const res = await fetch(input, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      // Force Clerk to refresh the session token and retry once
      const freshToken = await getToken({ skipCache: true })
      if (!freshToken) throw new Error('Not authenticated')
      return fetch(input, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${freshToken}` },
      })
    }
    return res
  }

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

  // Capture any `?ref=<CODE>` from the landing URL on first load, and again
  // on every route change so a `?ref=` that appears on a later page (e.g.
  // /sign-up?ref=CODE) is still picked up. captureRefFromUrl is idempotent
  // and a no-op when the param is absent, and the most recent valid ref
  // wins (last-touch attribution). The code is persisted in localStorage so
  // it survives Clerk's OAuth round-trip and subsequent SPA navigations.
  // `location` is already declared at the top of AppContent.
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

  // Fetch initial jobs
  useEffect(() => {
    if (!isLoaded || !userId) return

    const fetchJobs = async () => {
      try {
        const token = await getToken()
        const [videoJobs, pdfJobs] = await Promise.all([
          api.get<Project[]>('/jobs', token!),
          api.get<Project[]>('/pdf-jobs', token!),
        ])
        const combined = [
          ...(Array.isArray(videoJobs) ? videoJobs : []),
          ...(Array.isArray(pdfJobs) ? pdfJobs : []),
        ]
        setProjects(combined)

        // Fetch user profile to check role
        try {
          const profile = await api.get<any>('/users/me', token!)
          if (profile && profile.role === 'admin') {
            setIsAdmin(true)
          }
        } catch (profileErr: any) {
          if (profileErr.status === 404) {
            // DB was wiped or user is missing. Force a re-sync.
            sessionStorage.removeItem(`user_synced_${userId}`)

            try {
              const primaryEmail = user?.primaryEmailAddress?.emailAddress
              if (primaryEmail) {
                await api.post('/users/sync', token!, {
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
      } catch (err) {
        console.error('Failed to fetch jobs:', err)
      }
    }

    fetchJobs()
  }, [
    isLoaded,
    userId,
    getToken,
    user?.primaryEmailAddress?.emailAddress,
    user?.lastName,
    user?.imageUrl,
    user?.firstName,
  ])

  // Listen to SSE updates — reconnects automatically with a fresh token on close/error.
  // EventSource doesn't support Authorization headers, so the token is passed as a query param.
  // Parsing logic lives in lib/events.ts (parseSSELog).
  useEffect(() => {
    if (!isLoaded || !userId) return

    let sse: EventSource | null = null
    let destroyed = false
    let retryTimeout: ReturnType<typeof setTimeout> | null = null

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.userId !== userId) return

        if (data.type === 'LOG') {
          const { jobId, event: opencodeEvent } = data
          const logEntry: LogEntry | null = parseSSELog(opencodeEvent)

          if (logEntry) {
            setJobLogs(prev => ({
              ...prev,
              [jobId]: [...(prev[jobId] || []), logEntry],
            }))
          }
        } else if (data.type === 'phase_update') {
          // Real-time phase progress — update only phases & progress on the matching project
          const { jobId, allPhases, progress } = data
          setProjects(prev =>
            prev.map(p => (p.id === jobId ? { ...p, phases: allPhases, progress } : p)),
          )
        } else {
          const updatedJob = data
          setProjects(prev => {
            const exists = prev.find(p => p.id === updatedJob.id)
            return exists
              ? prev.map(p => (p.id === updatedJob.id ? updatedJob : p))
              : [...prev, updatedJob]
          })
        }
      } catch (err) {
        console.error('SSE Parsing error', err)
      }
    }

    const connect = async () => {
      if (destroyed) return
      // Always fetch a fresh token so the SSE URL never carries an expired JWT
      const token = await getToken()
      if (!token || destroyed) return
      sse = new EventSource(`${API_URL}/jobs/stream?token=${token}`)
      sse.onmessage = handleMessage
      sse.onerror = () => {
        sse?.close()
        sse = null
        if (!destroyed) {
          // Reconnect after 3 s with a brand-new token
          retryTimeout = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      destroyed = true
      if (retryTimeout) clearTimeout(retryTimeout)
      sse?.close()
    }
  }, [isLoaded, userId, getToken])

  const handleQueueJob = async (values: any) => {
    setIsSubmitting(true)
    try {
      const token = await getToken()
      const newJob = await api.post<Project>('/jobs', token!, {
        parameters: {
          url: values.url,
          instructions: values.instructions,
          script: values.script,
          voice: values.audio || 'Puck',
          subtitles: values.subtitles,
          theme: values.theme || 'light',
        },
      })
      setProjects(prev => {
        const exists = prev.find(p => p.id === newJob.id)
        return exists ? prev.map(p => (p.id === newJob.id ? newJob : p)) : [...prev, newJob]
      })
      setFormValues({})
      navigate('/dashboard')
      window.dispatchEvent(new Event('credits-changed'))
    } catch (err: any) {
      const msg =
        err.status === 402
          ? 'You have no credits remaining. Please top up to continue generating videos.'
          : err.message || 'An error occurred'
      toast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQueuePdfJob = async (values: {
    topic: string
    slideCount: number
    slideHeadings: string[]
    template?: string
  }) => {
    setIsSubmitting(true)
    try {
      const token = await getToken()
      const newJob = await api.post<Project>('/pdf-jobs', token!, {
        parameters: {
          topic: values.topic,
          slideCount: values.slideCount,
          slideHeadings: values.slideHeadings,
          ...(values.template ? { template: values.template } : {}),
        },
      })
      setProjects(prev => {
        const exists = prev.find(p => p.id === newJob.id)
        return exists ? prev.map(p => (p.id === newJob.id ? newJob : p)) : [...prev, newJob]
      })
      navigate('/dashboard')
      window.dispatchEvent(new Event('credits-changed'))
    } catch (err: any) {
      const msg =
        err.status === 402
          ? 'You have no credits remaining. Please top up to continue generating presentations.'
          : err.message || 'An error occurred'
      toast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken()
      await api.delete(`/jobs/${id}`, token!)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch {
      toast('Failed to delete job', 'error')
    }
  }

  const handleRetry = async (id: string) => {
    try {
      const token = await getToken()
      const updatedJob = await api.post<Project>(`/jobs/${id}/retrigger`, token!)
      setProjects(prev => {
        const exists = prev.find(p => p.id === updatedJob.id)
        return exists
          ? prev.map(p => (p.id === updatedJob.id ? updatedJob : p))
          : [...prev, updatedJob]
      })
      toast('Job queued for retry', 'success')
      window.dispatchEvent(new Event('credits-changed'))
    } catch (err: any) {
      const msg =
        err.status === 402
          ? 'You have no credits remaining. Please top up to retry generating videos.'
          : err.message || 'An error occurred'
      toast(msg, 'error')
    }
  }

  let selectedKey = 'dashboard'
  let projectTitle
  let onDownload

  if (location.pathname.startsWith('/new')) {
    selectedKey = 'create'
  } else if (location.pathname.startsWith('/pdfeditor')) {
    selectedKey = 'pdfeditor'
    const id = location.pathname.split('/pdfeditor/')[1]
    const project = projects.find(p => p.id === id)
    if (project) {
      projectTitle = project.parameters?.topic || 'PDF Presentation'
      if (project.status === 'COMPLETED' && project.pdfUrl) {
        onDownload = () => window.open(project.pdfUrl)
      }
    }
  } else if (location.pathname.startsWith('/pdf')) {
    selectedKey = 'pdf-create'
  } else if (location.pathname.startsWith('/editor')) {
    selectedKey = 'editor'
    const id = location.pathname.split('/editor/')[1]
    const project = projects.find(p => p.id === id)
    if (project) {
      projectTitle = project.parameters?.url?.replace(/^https?:\/\//, '') || 'Video Generation'
      if (project.status === 'COMPLETED' && project.videoUrl) {
        onDownload = () => window.open(project.videoUrl)
      }
    }
  } else if (location.pathname.startsWith('/settings')) {
    selectedKey = 'settings'
  } else if (location.pathname.startsWith('/sessions')) {
    selectedKey = 'sessions'
  } else if (location.pathname.startsWith('/admin')) {
    selectedKey = 'admin'
  } else if (location.pathname.startsWith('/pricing')) {
    selectedKey = 'pricing'
  } else if (location.pathname.startsWith('/affiliate')) {
    selectedKey = 'affiliate'
  } else if (location.pathname.startsWith('/templates')) {
    selectedKey = 'templates'
  }

  if (!isLoaded) return <div className="h-screen w-screen bg-[#FDFDFD]"></div>

  // SSO callback — must be outside SignedIn/SignedOut (user is in transitional auth state)
  if (location.pathname === '/sso-callback') {
    return <AuthenticateWithRedirectCallback />
  }

  // Checkout return — full-screen receipt page Dodo redirects to after payment.
  if (location.pathname === '/checkout/return') {
    return (
      <>
        <SignedIn>
          <CheckoutReturnView />
        </SignedIn>
        <SignedOut>
          <Navigate to="/sign-in" replace />
        </SignedOut>
      </>
    )
  }

  // Landing page — signed-in users go straight to dashboard
  if (location.pathname === '/') {
    if (userId) return <Navigate to="/dashboard" replace />
    return <LandingView />
  }

  return (
    <>
      <SignedIn>
        <div
          className="app-shell-bg flex h-screen w-screen overflow-hidden p-3 gap-3"
          style={{ backgroundColor: '#e6e6e6' }}
        >
          {(!isMobile ? selectedKey !== 'settings' : true) && (
            <Sidebar
              selectedKey={selectedKey}
              navigate={path => {
                navigate(path)
                if (isMobile) setCollapsed(true)
              }}
              isMobile={isMobile}
              collapsed={collapsed}
              onClose={() => setCollapsed(true)}
              isAdmin={isAdmin}
              pdfSlides={pdfSlides}
              activePdfSlide={activePdfSlide}
              onScrollToPdfSlide={onScrollToPdfSlide || undefined}
              onAddPdfSlide={onAddPdfSlide || undefined}
              onReorderPdfSlides={onReorderPdfSlides || undefined}
              onSetPdfSlideBg={onSetPdfSlideBg || undefined}
              onDeletePdfSlide={onDeletePdfSlide || undefined}
            />
          )}

          <div
            className="app-shell-panel flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl shadow-sm border border-gray-200"
            style={{ backgroundColor: '#ffffff' }}
          >
            <TopHeader
              isMobile={isMobile}
              isDetailPage={
                selectedKey === 'create' ||
                selectedKey === 'pdf-create' ||
                selectedKey === 'editor' ||
                selectedKey === 'pdfeditor' ||
                selectedKey === 'settings' ||
                (selectedKey === 'templates' && templatesInDetail)
              }
              backLabel={
                selectedKey === 'templates' && templatesInDetail
                  ? 'Back to Templates Gallery'
                  : undefined
              }
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggle={() => setCollapsed(c => !c)}
              onNew={() => navigate('/new')}
              onBack={() => {
                if (selectedKey === 'templates' && templatesInDetail) {
                  clearTemplatesSelectionRef.current?.()
                } else {
                  navigate('/dashboard')
                }
              }}
              projectTitle={projectTitle}
              onDownload={onDownload}
              isPricingPage={selectedKey === 'pricing'}
              isSettingsPage={selectedKey === 'settings'}
              isNewPage={selectedKey === 'create'}
              isEditorPage={selectedKey === 'editor'}
              isPdfEditorPage={selectedKey === 'pdfeditor'}
              onSignOut={() => signOut()}
            />

            <main className="app-shell-main flex-1 overflow-y-auto overflow-x-hidden bg-white rounded-b-2xl relative">
              <Routes>
                <Route
                  path="/dashboard"
                  element={
                    <DashboardView
                      projects={projects}
                      searchQuery={searchQuery}
                      onDelete={handleDelete}
                      onRetry={handleRetry}
                    />
                  }
                />
                <Route
                  path="/new"
                  element={
                    <CreateView
                      isMobile={isMobile}
                      formValues={formValues}
                      setFormValues={setFormValues}
                      isSubmitting={isSubmitting}
                      onQueueJob={handleQueueJob}
                    />
                  }
                />
                <Route
                  path="/pdf"
                  element={
                    <PdfCreateView isSubmitting={isSubmitting} onQueuePdfJob={handleQueuePdfJob} />
                  }
                />
                <Route
                  path="/templates"
                  element={
                    <TemplatesView
                      isSubmitting={isSubmitting}
                      onQueuePdfJob={handleQueuePdfJob}
                      onDetailModeChange={setTemplatesInDetail}
                      clearSelectionRef={clearTemplatesSelectionRef}
                    />
                  }
                />
                <Route
                  path="/pdfeditor/:id"
                  element={
                    <PdfEditorView
                      projects={projects}
                      setPdfSlides={setPdfSlides}
                      activePdfSlide={activePdfSlide}
                      setActivePdfSlide={setActivePdfSlide}
                      setOnScrollToPdfSlide={setOnScrollToPdfSlide}
                      setOnAddPdfSlide={setOnAddPdfSlide}
                      setOnReorderPdfSlides={setOnReorderPdfSlides}
                      setOnSetPdfSlideBg={setOnSetPdfSlideBg}
                      setOnDeletePdfSlide={setOnDeletePdfSlide}
                    />
                  }
                />
                <Route path="/pricing" element={<PricingView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/sessions" element={<SessionsView />} />
                <Route path="/affiliate" element={<AffiliateView />} />
                <Route path="/admin" element={<AdminView />} />
                <Route
                  path="/editor/:id"
                  element={
                    <EditorView
                      projects={projects}
                      jobLogs={jobLogs}
                      isMobile={isMobile}
                      onDelete={handleDelete}
                    />
                  }
                />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPostView />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
              </Routes>
            </main>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedOut>
    </>
  )
}

export default App

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastShell>
        <AppContent />
      </ToastShell>
    </BrowserRouter>
  )
}
