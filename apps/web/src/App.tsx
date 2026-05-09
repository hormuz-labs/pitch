import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { 
  SignedIn, 
  SignedOut, 
  UserButton, 
  OrganizationSwitcher,
  useAuth,
  useClerk
} from '@clerk/clerk-react';
import './index.css';
import type { Project, LogEntry } from './types';
import { DashboardView, CreateView, EditorView, PricingView, LandingView, PublicPricingView, SettingsView } from './views';
import { CreditPopover } from './components/CreditPopover';
import { BiSolidZap } from 'react-icons/bi';
import { AnimatedDashboardIcon } from './components/AnimatedDashboardIcon';

import tabLogoB from './assets/tabLogoB.svg';
import { PitchLogoAnimation } from './components/PitchLogoAnimation';

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
          ${isMobile ? 'fixed top-0 left-0 h-full z-50 rounded-none' : 'relative rounded-2xl'}
          flex flex-col shrink-0 transition-all duration-200 shadow-sm border border-gray-200
          ${isMobile ? (collapsed ? '-translate-x-full' : 'translate-x-0') : ''}
        `}
        style={{ width: 220, backgroundColor: '#f5f5f5' }}
      >
        {/* Brand */}
        <div className="px-3 h-16 border-b border-gray-200 shrink-0 flex items-center">
          <a href="https://trypitch.in" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#e6e6e6] transition-colors cursor-pointer no-underline group">
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
               <img src={tabLogoB} alt="Pitch" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <div className="w-[96px] flex items-center pb-1">
                <PitchLogoAnimation startAnimation={true} />
              </div>
            </div>
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="mb-2">
            <NavItem
              icon={<AnimatedDashboardIcon active={selectedKey === 'dashboard'} />}
              label="Dashboard"
              active={selectedKey === 'dashboard'}
              onClick={() => go('/dashboard')}
            />
          </div>
          <NavItem
            icon={<IconVideo />}
            label="New Video"
            active={selectedKey === 'create'}
            onClick={() => go('/new')}
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
  <header className="h-16 px-5 bg-white border-b border-gray-200 shrink-0 rounded-t-2xl relative flex items-center justify-between">
    {/* Left: logo + search / back */}
    <div className="flex items-center gap-3 shrink-0">
      {isMobile && (
        <a href="https://trypitch.in" target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center shrink-0 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors p-1 group">
           <img src={tabLogoB} alt="Pitch" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
        </a>
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
          <OrganizationSwitcher 
            appearance={{
              elements: {
                rootBox: "w-full h-full flex items-center",
                organizationSwitcherTrigger: "w-full h-full flex justify-between items-center py-1 px-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer",
                organizationPreview: "flex items-center gap-2",
                organizationPreviewTextContainer: "flex flex-col hidden sm:flex",
                organizationPreviewMainIdentifier: "text-sm font-bold text-gray-900 leading-none truncate",
                organizationPreviewSecondaryIdentifier: "text-[10px] text-gray-400 mt-0.5 truncate",
                organizationSwitcherTriggerIcon: "w-4 h-4 text-gray-400 shrink-0"
              }
            }}
          />
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
          className="flex items-center gap-1.5 px-3 py-1.5 md:px-3.5 md:py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium rounded-lg transition-colors border-none cursor-pointer"
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
  const { getToken, isLoaded, userId, orgId } = useAuth();
  const { signOut } = useClerk();
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

  // Fetch initial jobs
  useEffect(() => {
    if (!isLoaded || !userId) return;

    const fetchJobs = async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/jobs', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (Array.isArray(data)) setProjects(data);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };
    
    fetchJobs();
  }, [isLoaded, userId, orgId, getToken]);

  // Listen to SSE updates
  useEffect(() => {
    if (!isLoaded || !userId) return;
    
    const sse = new EventSource('/api/jobs/stream');

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const currentTenantId = orgId || userId;
        if (data.orgId !== currentTenantId && data.userId !== userId) return;

        if (data.type === 'LOG') {
          const { jobId, event: opencodeEvent } = data;
          let logEntry: LogEntry | null = null;

          if (opencodeEvent.type === 'call' || opencodeEvent.call) {
            const toolCall = opencodeEvent.call || opencodeEvent;
            let message = `Calling tool: ${toolCall.name}`;
            if (toolCall.name === 'run_shell_command') message = `Running: ${toolCall.arguments.command}`;
            else if (toolCall.name === 'write_file') message = `Writing file: ${toolCall.arguments.file_path}`;

            logEntry = { timestamp: new Date().toLocaleTimeString(), message, type: 'call' };

            const argsString = JSON.stringify(toolCall.arguments);
            const pngMatch = argsString.match(/demo\/[^"\s]+\.png/);
            if (pngMatch) logEntry.screenshot = `/${pngMatch[0]}`;

          } else if (opencodeEvent.type === 'response' || opencodeEvent.output) {
            const response = opencodeEvent.response || opencodeEvent;
            let message = 'Task step completed';
            if (response.content && Array.isArray(response.content)) {
              const textPart = response.content.find((p: any) => p.type === 'text');
              if (textPart?.text) {
                const lines = textPart.text.trim().split('\n');
                message = lines[lines.length - 1];
              }
            }
            logEntry = { timestamp: new Date().toLocaleTimeString(), message, type: 'response' };

          } else if (opencodeEvent.type === 'text' || typeof opencodeEvent.text === 'string') {
            const text = opencodeEvent.text || opencodeEvent;
            let message = typeof text === 'string' ? text : text.text || JSON.stringify(text);
            if (message.includes('Generating Voiceover')) message = '🎙️ Generating AI Voiceover...';
            if (message.includes('Transcribing')) message = '📝 Transcribing audio...';
            if (message.includes('Rendering Frames')) message = '🎞️ Rendering video frames...';
            if (message.includes('Encoding Final Video')) message = '🎬 Encoding final video...';
            if (message.includes('Navigating')) message = '🌐 Navigating to target site...';
            logEntry = { timestamp: new Date().toLocaleTimeString(), message, type: 'text' };
          }

          if (logEntry) {
            setJobLogs(prev => ({
              ...prev,
              [jobId]: [...(prev[jobId] || []), logEntry!]
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

    return () => sse.close();
  }, [isLoaded, userId, orgId]);

  const handleQueueJob = async (values: any) => {
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          parameters: { url: values.url, instructions: values.instructions, script: values.script }
        })
      });
      if (!res.ok) {
        if (res.status === 402) {
          throw new Error('You have no credits remaining. Please top up to continue generating videos.');
        }
        throw new Error('Failed to queue job');
      }
      setFormValues({});
      navigate('/dashboard');
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/jobs/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('Failed to delete job');
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
  }

  if (!isLoaded) return <div className="h-screen w-screen bg-[#FDFDFD]"></div>;

  return (
    <>
      <SignedIn>
        <div className="flex h-screen w-screen overflow-hidden p-3 gap-3" style={{ backgroundColor: '#e6e6e6' }}>
          {(!isMobile ? selectedKey !== 'settings' : true) && (
            <Sidebar
              selectedKey={selectedKey}
              navigate={navigate}
              isMobile={isMobile}
              collapsed={collapsed}
              onClose={() => setCollapsed(true)}
            />
          )}

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl shadow-sm border border-gray-200" style={{ backgroundColor: '#ffffff' }}>
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

            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white rounded-b-2xl relative">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardView projects={projects} searchQuery={searchQuery} isMobile={isMobile} onDelete={handleDelete} />} />
                <Route path="/new" element={<CreateView isMobile={isMobile} formValues={formValues} setFormValues={setFormValues} isSubmitting={isSubmitting} onQueueJob={handleQueueJob} />} />
                <Route path="/pricing" element={<PricingView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/editor/:id" element={<EditorView projects={projects} jobLogs={jobLogs} isMobile={isMobile} />} />
              </Routes>
            </main>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <Routes>
          <Route path="/" element={<LandingView />} />
          <Route path="/pricing" element={<PublicPricingView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
