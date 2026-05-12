import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import {
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useClerk,
  useUser,
  AuthenticateWithRedirectCallback,
} from '@clerk/clerk-react';
import './index.css';
import type { Project, LogEntry } from './types';
import { DashboardView, CreateView, EditorView, PricingView, LandingView, PublicPricingView, SettingsView, AffiliateView } from './views';
import { AuthView } from './views/AuthView';
import { CreditPopover } from './components/CreditPopover';
import { BiSolidZap } from 'react-icons/bi';
import { AnimatedDashboardIcon } from './components/AnimatedDashboardIcon';
import { AboutUs } from './components/AboutUs';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { API_URL } from './config';
import { api } from './lib/api';
import { parseSSELog } from './lib/events';

import tabLogoB from './assets/tabLogoB.svg';
import { PitchLogoAnimation } from './components/PitchLogoAnimation';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { cn } from './lib/utils';

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastVariant = 'error' | 'success' | 'info';
interface ToastEntry { id: string; message: string; variant: ToastVariant; }
interface ToastCtx { toast: (message: string, variant?: ToastVariant) => void; }

const ToastContext = createContext<ToastCtx | null>(null);
const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastShell');
  return ctx;
};

const toastBorder: Record<ToastVariant, string> = {
  error: 'border-red-100', success: 'border-green-100', info: 'border-gray-200',
};
const toastIconCls: Record<ToastVariant, string> = {
  error: 'bg-red-50 text-red-500', success: 'bg-green-50 text-green-600', info: 'bg-gray-100 text-gray-500',
};

function ToastShell({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToasts(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, message, variant }]);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={4000}>
        {children}
        {toasts.map(t => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={open => { if (!open) dismiss(t.id); }}
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
            <div className={cn('mt-0.5 flex shrink-0 items-center justify-center rounded-full p-1', toastIconCls[t.variant])}>
              {t.variant === 'error' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              {t.variant === 'success' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              {t.variant === 'info' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
            </div>
            <ToastPrimitive.Title className="text-xs font-medium leading-snug text-gray-800">{t.message}</ToastPrimitive.Title>
            <ToastPrimitive.Close className="ml-auto shrink-0 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-700 focus:opacity-100 focus:outline-none group-hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed top-5 right-5 z-[9999] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

// ── Icons (inline SVG micro-set) ──────────────────────────────────────────────

const IconVideo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="5" width="20" height="3.5" rx="1" />
    <rect x="2" y="10.5" width="20" height="3.5" rx="1" />
    <rect x="2" y="16" width="20" height="3.5" rx="1" />
  </svg>
);
const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const Share2Icon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

// ── Nav Item ─────────────────────────────────────────────────────────────────
interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}
const NavItem = ({ icon, label, active, onClick }: NavItemProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-[background-position,color] duration-500 ease-out cursor-pointer border-none outline-none
      ${active
        ? 'bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] hover:[background-position:100%_center] text-white shadow-sm'
        : 'text-gray-500 hover:bg-[#e6e6e6] hover:text-gray-800 bg-transparent'
      }`}
  >
    <span className={active ? 'text-white' : 'text-gray-400'}>{icon}</span>
    {label}
  </button>
);

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface SidebarProps {
  selectedKey: string;
  navigate: (path: string) => void;
  isMobile: boolean;
  collapsed: boolean;
  onClose: () => void;
}
const Sidebar = ({ selectedKey, navigate, isMobile, collapsed, onClose }: SidebarProps) => {
  const go = (path: string) => {
    navigate(path);
    if (isMobile) onClose();
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && !collapsed && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          app-shell-sidebar
          ${isMobile ? 'fixed top-0 left-0 h-full z-50 rounded-none' : 'relative rounded-2xl'}
          flex flex-col shrink-0 transition-all duration-200 shadow-sm border border-gray-200
          ${isMobile ? (collapsed ? '-translate-x-full' : 'translate-x-0') : ''}
        `}
        style={{ width: 220, backgroundColor: '#f5f5f5' }}
      >
        {/* Brand */}
        <div className="px-3 h-16 border-b border-gray-200 shrink-0 flex items-center">
          <Link to="/" className="flex flex-1 items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#e6e6e6] transition-colors cursor-pointer no-underline group">
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
               <img src={tabLogoB} alt="Pitch" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <div className="w-[96px] flex items-center pb-1">
                <PitchLogoAnimation startAnimation={true} />
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
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
            icon={<Share2Icon />}
            label="Affiliate"
            active={selectedKey === 'affiliate'}
            onClick={() => go('/affiliate')}
          />
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-3 space-y-1">
          <div className="border-t border-gray-200 my-2 -mx-3" />

          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => go('/pricing')}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white transition-[background-position] duration-500 ease-out cursor-pointer shadow-sm border-none outline-none h-9 bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] hover:bg-transparent hover:[background-position:100%_center] focus-visible:ring-gray-900/20"
              id="upgrade-pro-btn"
            >
              <span className="text-sm font-medium text-white whitespace-nowrap" style={{ color: '#ffffff' }}>
                Upgrade Pro
              </span>
              <BiSolidZap className="w-4 h-4 text-gray-300" />
            </button>
            <div className="relative flex items-center justify-center shrink-0 cursor-pointer hover:brightness-95 transition-all w-9 h-9">
              <UserButton 
                afterSignOutUrl="/" 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-9 h-9"
                  }
                }}
              />
            </div>
          </div>
          <NavItem
            icon={<IconSettings />}
            label="Settings"
            active={selectedKey === 'settings'}
            onClick={() => go('/settings')}
          />
        </div>
      </aside>
    </>
  );
};

// ── Top Header ────────────────────────────────────────────────────────────────
interface TopHeaderProps {
  isMobile: boolean;
  isDetailPage: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggle: () => void;
  onNew: () => void;
  onBack: () => void;
  projectTitle?: string;
  onDownload?: () => void;
  isPricingPage?: boolean;
  isSettingsPage?: boolean;
  onSignOut?: () => void;
}
const TopHeader = ({ isMobile, isDetailPage, searchQuery, onSearchChange, onToggle, onNew, onBack, projectTitle, onDownload, isPricingPage, isSettingsPage, onSignOut }: TopHeaderProps) => (
  <header className="app-shell-header h-16 px-5 bg-white border-b border-gray-200 shrink-0 rounded-t-2xl relative flex items-center justify-between">
    {/* Left: logo + search / back */}
    <div className="flex items-center gap-3 shrink-0">
      {isMobile && (
        <Link to="/" className="w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors group">
           <img src={tabLogoB} alt="Pitch" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
        </Link>
      )}
      {isDetailPage ? (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-base font-medium text-gray-500 hover:text-gray-800 transition-colors bg-transparent border-none cursor-pointer p-0"
          id="header-back-btn"
        >
          <IconArrowLeft /> Back to Dashboard
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
    ) : (!isDetailPage && !isPricingPage) ? (
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
            >✕</button>
          )}
        </div>
      </div>
    ) : null}

    {/* Right: Download / CTA / Menu */}
    <div className="flex items-center gap-2 md:gap-3 shrink-0">
      {!isMobile && !isSettingsPage && <CreditPopover />}
      {isSettingsPage && onSignOut ? (
        <button
          onClick={onSignOut}
          className="flex items-center justify-center gap-1.5 w-9 h-9 px-0 md:w-auto md:h-auto md:px-3.5 md:py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium rounded-lg transition-colors border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      ) : onDownload ? (
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
          <span className="hidden sm:inline">New Project</span>
        </button>
      ) : null}
      
      {isMobile && (
        <button
          onClick={onToggle}
          className="text-gray-900 transition-colors w-9 h-9 flex items-center justify-center ml-1 rounded-lg border border-gray-200 hover:bg-gray-50 bg-white cursor-pointer shadow-sm"
          id="sidebar-toggle-btn"
        >
          <IconMenu />
        </button>
      )}
    </div>
  </header>
);

// ── App Content ───────────────────────────────────────────────────────────────
function AppContent() {
  const { getToken, isLoaded, userId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1024);
  const [searchQuery, setSearchQuery] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [jobLogs, setJobLogs] = useState<Record<string, LogEntry[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const location = useLocation();

  // Responsive
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setCollapsed(false);
      else setCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync user profile to the database once per session (on sign-in, not on every refresh)
  useEffect(() => {
    if (!isLoaded || !userId || !user) return;

    const sessionKey = `user_synced_${userId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const syncUser = async () => {
      try {
        const token = await getToken();
        const primaryEmail = user.primaryEmailAddress?.emailAddress;
        if (!primaryEmail) return;
        await api.post('/users/sync', token!, {
          email: primaryEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
        });
        sessionStorage.setItem(sessionKey, '1');
      } catch (err) {
        console.error('Failed to sync user profile:', err);
      }
    };

    syncUser();
  }, [isLoaded, userId, user, getToken]);

  // Fetch initial jobs
  useEffect(() => {
    if (!isLoaded || !userId) return;

    const fetchJobs = async () => {
      try {
        const token = await getToken();
        const data = await api.get<Project[]>('/jobs', token!);
        if (Array.isArray(data)) setProjects(data);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };
    
    fetchJobs();
  }, [isLoaded, userId, getToken]);

  // Listen to SSE updates.
  // EventSource doesn't support Authorization headers, so the token is passed
  // as a query param. Parsing logic lives in lib/events.ts (parseSSELog).
  useEffect(() => {
    if (!isLoaded || !userId) return;

    let sse: EventSource;
    getToken().then(token => {
      sse = new EventSource(`${API_URL}/jobs/stream?token=${token}`);

      sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.userId !== userId) return;

        if (data.type === 'LOG') {
          const { jobId, event: opencodeEvent } = data;
          const logEntry: LogEntry | null = parseSSELog(opencodeEvent);

          if (logEntry) {
            setJobLogs(prev => ({
              ...prev,
              [jobId]: [...(prev[jobId] || []), logEntry],
            }));
          }
        } else {
          const updatedJob = data;
          setProjects(prev => {
            const exists = prev.find(p => p.id === updatedJob.id);
            return exists ? prev.map(p => p.id === updatedJob.id ? updatedJob : p) : [...prev, updatedJob];
          });
        }
      } catch (err) {
        console.error('SSE Parsing error', err);
      }
    };

    });

    return () => sse?.close();
  }, [isLoaded, userId]);

  const handleQueueJob = async (values: any) => {
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const newJob = await api.post<Project>('/jobs', token!, {
        parameters: { url: values.url, instructions: values.instructions, script: values.script },
      });
      setProjects(prev => {
        const exists = prev.find(p => p.id === newJob.id);
        return exists ? prev.map(p => p.id === newJob.id ? newJob : p) : [...prev, newJob];
      });
      setFormValues({});
      navigate('/dashboard');
      window.dispatchEvent(new Event('credits-changed'));
    } catch (err: any) {
      const msg = err.status === 402
        ? 'You have no credits remaining. Please top up to continue generating videos.'
        : (err.message || 'An error occurred');
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await api.delete(`/jobs/${id}`, token!);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      toast('Failed to delete job', 'error');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const token = await getToken();
      const updatedJob = await api.post<Project>(`/jobs/${id}/retrigger`, token!);
      setProjects(prev => {
        const exists = prev.find(p => p.id === updatedJob.id);
        return exists ? prev.map(p => p.id === updatedJob.id ? updatedJob : p) : [...prev, updatedJob];
      });
      toast('Job queued for retry', 'success');
      window.dispatchEvent(new Event('credits-changed'));
    } catch (err: any) {
      const msg = err.status === 402
        ? 'You have no credits remaining. Please top up to retry generating videos.'
        : (err.message || 'An error occurred');
      toast(msg, 'error');
    }
  };

  let selectedKey = 'dashboard';
  let projectTitle;
  let onDownload;

  if (location.pathname.startsWith('/new')) {
    selectedKey = 'create';
  } else if (location.pathname.startsWith('/editor')) {
    selectedKey = 'editor';
    const id = location.pathname.split('/editor/')[1];
    const project = projects.find(p => p.id === id);
    if (project) {
      projectTitle = project.parameters?.url?.replace(/^https?:\/\//, '') || 'Video Generation';
      if (project.status === 'COMPLETED' && project.videoUrl) {
        onDownload = () => window.open(project.videoUrl);
      }
    }
  } else if (location.pathname.startsWith('/settings')) {
    selectedKey = 'settings';
  } else if (location.pathname.startsWith('/pricing')) {
    selectedKey = 'pricing';
  } else if (location.pathname.startsWith('/affiliate')) {
    selectedKey = 'affiliate';
  }

  if (!isLoaded) return <div className="h-screen w-screen bg-[#FDFDFD]"></div>;

  // SSO callback — must be outside SignedIn/SignedOut (user is in transitional auth state)
  if (location.pathname === '/sso-callback') {
    return <AuthenticateWithRedirectCallback />;
  }

  // Landing page is always public — render it outside the authenticated app shell
  if (location.pathname === '/') {
    return <LandingView />;
  }

  return (
    <>
      <SignedIn>
        <div className="app-shell-bg flex h-screen w-screen overflow-hidden p-3 gap-3" style={{ backgroundColor: '#e6e6e6' }}>
          {(!isMobile ? selectedKey !== 'settings' : true) && (
            <Sidebar
              selectedKey={selectedKey}
              navigate={navigate}
              isMobile={isMobile}
              collapsed={collapsed}
              onClose={() => setCollapsed(true)}
            />
          )}

          <div className="app-shell-panel flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl shadow-sm border border-gray-200" style={{ backgroundColor: '#ffffff' }}>
            <TopHeader
              isMobile={isMobile}
              isDetailPage={selectedKey === 'create' || selectedKey === 'editor' || selectedKey === 'settings'}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggle={() => setCollapsed(c => !c)}
              onNew={() => navigate('/new')}
              onBack={() => navigate('/dashboard')}
              projectTitle={projectTitle}
              onDownload={onDownload}
              isPricingPage={selectedKey === 'pricing'}
              isSettingsPage={selectedKey === 'settings'}
              onSignOut={() => signOut()}
            />

            <main className="app-shell-main flex-1 overflow-y-auto overflow-x-hidden bg-white rounded-b-2xl relative">
              <Routes>
                <Route path="/dashboard" element={<DashboardView projects={projects} searchQuery={searchQuery} isMobile={isMobile} onDelete={handleDelete} onRetry={handleRetry} />} />
                <Route path="/new" element={<CreateView isMobile={isMobile} formValues={formValues} setFormValues={setFormValues} isSubmitting={isSubmitting} onQueueJob={handleQueueJob} />} />
                <Route path="/pricing" element={<PricingView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/affiliate" element={<AffiliateView />} />
                <Route path="/editor/:id" element={<EditorView projects={projects} jobLogs={jobLogs} isMobile={isMobile} />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
              </Routes>
            </main>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <Routes>
          <Route path="/sign-in" element={<AuthView mode="sign-in" />} />
          <Route path="/sign-up" element={<AuthView mode="sign-up" />} />
          <Route path="/pricing" element={<PublicPricingView />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedOut>
    </>
  );
}

export default App;

function App() {
  return (
    <BrowserRouter>
      <ToastShell>
        <AppContent />
      </ToastShell>
    </BrowserRouter>
  );
}
