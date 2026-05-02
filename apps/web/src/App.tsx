import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import './index.css';
import type { Project, LogEntry } from './types';
import { DashboardView, CreateView, EditorView } from './views';

const MOCK_USER_ID = 'demo-user-123'; // Hardcoded for this demo

// ── Icons (inline SVG micro-set) ──────────────────────────────────────────────
const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
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
const IconBell = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
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
const IconHelp = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconSupport = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="14.83" y1="9.17" x2="18.36" y2="5.64"/>
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
  </svg>
);
const IconZap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
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
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer border-none outline-none
      ${active
        ? 'bg-black text-white'
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
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-gray-200 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-none">Silverfish</div>
            <div className="text-xs text-gray-400 mt-0.5">Video Management</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="mb-2">
            <NavItem
              icon={<IconGrid />}
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
          <div className="border-t border-gray-200 my-2" />
          <div className="mb-2 flex items-center gap-2">
            <button
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white transition-all duration-200 cursor-pointer shadow-sm border-none outline-none h-9"
              id="upgrade-pro-btn"
            >
              <span className="text-gray-300">
                <IconZap />
              </span>
              <span className="text-sm font-medium text-white whitespace-nowrap">
                Upgrade Pro
              </span>
            </button>
            <button
              className="flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors cursor-pointer shrink-0 h-9 w-9 hover:brightness-95"
              style={{ backgroundColor: '#e6e6e6' }}
              id="sidebar-profile-btn"
              title="Account"
            >
              <IconUser />
            </button>
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
  isNewPage: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggle: () => void;
  onNew: () => void;
  onBack: () => void;
}
const TopHeader = ({ isMobile, isNewPage, searchQuery, onSearchChange, onToggle, onNew, onBack }: TopHeaderProps) => (
  <header className="h-16 flex items-center justify-between px-5 bg-white border-b border-gray-200 shrink-0 gap-4 rounded-t-2xl">
    {/* Left: hamburger + search / back */}
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {isMobile && (
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-md hover:bg-gray-100 border-none bg-transparent cursor-pointer"
          id="sidebar-toggle-btn"
        >
          <IconMenu />
        </button>
      )}
      {isNewPage ? (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-base font-medium text-gray-500 hover:text-gray-800 transition-colors bg-transparent border-none cursor-pointer p-0"
          id="header-back-btn"
        >
          <IconArrowLeft /> Back to Dashboard
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1 max-w-sm">
          <span className="text-gray-400 shrink-0"><IconSearch /></span>
          <input
            type="text"
            placeholder="Search videos, projects..."
            className="bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400 w-full"
            id="global-search-input"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer text-xs shrink-0"
            >✕</button>
          )}
        </div>
      )}
    </div>

    {/* Right: bell + CTA */}
    <div className="flex items-center gap-3 shrink-0">
      <button
        className="text-gray-400 hover:text-gray-700 transition-colors p-1.5 rounded-md hover:bg-gray-100 border-none bg-transparent cursor-pointer"
        id="notifications-btn"
      >
        <IconBell />
      </button>
      {!isNewPage && (
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
          id="new-project-btn"
        >
          <IconPlus />
          New Project
        </button>
      )}
    </div>
  </header>
);

// ── App Content ───────────────────────────────────────────────────────────────
function AppContent() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1024);
  const [searchQuery, setSearchQuery] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [jobLogs, setJobLogs] = useState<Record<string, LogEntry[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // form state for CreateView (managed here to match original arch)
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
    fetch(`/api/jobs?userId=${MOCK_USER_ID}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(err => console.error('Failed to fetch jobs:', err));
  }, []);

  // Listen to SSE updates
  useEffect(() => {
    const sse = new EventSource('/api/jobs/stream');

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.userId !== MOCK_USER_ID) return;

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
  }, []);

  const handleQueueJob = async (values: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: MOCK_USER_ID,
          parameters: { url: values.url, instructions: values.instructions, script: values.script }
        })
      });
      if (!res.ok) throw new Error('Failed to queue job');
      setFormValues({});
      navigate('/dashboard');
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('Failed to delete job');
    }
  };

  let selectedKey = 'dashboard';
  if (location.pathname.startsWith('/new')) selectedKey = 'create';
  else if (location.pathname.startsWith('/settings')) selectedKey = 'settings';

  return (
    <div className="flex h-screen w-screen overflow-hidden p-3 gap-3" style={{ backgroundColor: '#e6e6e6' }}>
      {/* Sidebar card */}
      <Sidebar
        selectedKey={selectedKey}
        navigate={navigate}
        isMobile={isMobile}
        collapsed={collapsed}
        onClose={() => setCollapsed(true)}
      />

      {/* Main content card */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl shadow-sm border border-gray-200" style={{ backgroundColor: '#ffffff' }}>
        <TopHeader
          isMobile={isMobile}
          isNewPage={selectedKey === 'create'}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggle={() => setCollapsed(c => !c)}
          onNew={() => navigate('/new')}
          onBack={() => navigate('/dashboard')}
        />

        <main className="flex-1 overflow-y-auto bg-white rounded-b-2xl">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardView projects={projects} searchQuery={searchQuery} isMobile={isMobile} onDelete={handleDelete} />} />
            <Route path="/new" element={<CreateView isMobile={isMobile} formValues={formValues} setFormValues={setFormValues} isSubmitting={isSubmitting} onQueueJob={handleQueueJob} />} />
            <Route path="/editor/:id" element={<EditorView projects={projects} jobLogs={jobLogs} isMobile={isMobile} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
