import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../lib/api';

const IconShield = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconSpinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

interface BrowserProfile {
  id: string;
  userId: string;
  profileDir: string;
  storageStateKey: string | null;
  loggedInOrigins: string[];
  lastSyncedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface BrowserSession {
  id: string;
  userId: string;
  profileId: string;
  status: 'STARTING' | 'READY' | 'CLOSED' | 'ERROR' | 'EXPIRED';
  startUrl: string | null;
  cdpPort: number | null;
  noVncUrl: string | null;
  pid: number | null;
  error: string | null;
  startedAt: string;
  readyAt: string | null;
  closedAt: string | null;
  expiresAt: string;
}

interface ProfileResponse {
  profile: BrowserProfile;
  activeSessions: BrowserSession[];
}

interface StartSessionResponse {
  sessionId: string;
  status: BrowserSession['status'];
  cdpPort: number;
  profileDir: string;
  startedAt: string;
  expiresAt: string;
}

interface CloseSessionResponse {
  sessionId: string;
  status: BrowserSession['status'];
  loggedInOrigins: string[];
}

function formatOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    return u.host;
  } catch {
    return origin;
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export const SessionsView = () => {
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<BrowserProfile | null>(null);
  const [activeSession, setActiveSession] = useState<BrowserSession | StartSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.get<ProfileResponse>('/browser/profile', token);
      setProfile(data.profile);
      setActiveSession(data.activeSessions[0] ?? null);
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Poll active session status while one is running so the UI reflects
  // EXPIRED / ERROR transitions promptly.
  useEffect(() => {
    if (!activeSession) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const data = await api.get<ProfileResponse>('/browser/profile', token);
        setProfile(data.profile);
        setActiveSession(data.activeSessions[0] ?? null);
      } catch {
        // ignore transient errors
      }
    }, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [activeSession, getToken]);

  const handleStart = async () => {
    setActionError(null);
    setUrlError(null);
    const raw = targetUrl.trim();
    if (!raw) {
      setUrlError('Enter a URL to log in to.');
      return;
    }
    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      new URL(normalized);
    } catch {
      setUrlError('That doesn\'t look like a valid URL.');
      return;
    }

    setStarting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const session = await api.post<StartSessionResponse>('/browser/sessions', token, {
        startUrl: normalized,
      });
      setActiveSession(session);
      setAuthModalOpen(false);
      setTargetUrl('');
    } catch (err: any) {
      const msg = err?.status === 409
        ? 'You already have an active session. Close it first.'
        : err?.message ?? 'Failed to start session';
      setActionError(msg);
    } finally {
      setStarting(false);
    }
  };

  const handleClose = async () => {
    if (!activeSession) return;
    setActionError(null);
    setClosing(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const result = await api.post<CloseSessionResponse>(`/browser/sessions/${activeSession.sessionId ?? (activeSession as BrowserSession).id}/close`, token, {});
      setActiveSession(null);
      if (profile) {
        setProfile({
          ...profile,
          loggedInOrigins: Array.from(new Set([...profile.loggedInOrigins, ...result.loggedInOrigins])).sort(),
          lastSyncedAt: new Date().toISOString(),
        });
      }
      await fetchProfile();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to close session');
    } finally {
      setClosing(false);
    }
  };

  const origins = useMemo(() => profile?.loggedInOrigins ?? [], [profile]);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Browser Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Log in once on any site — your session is reused by every automation job.
          </p>
        </div>
        <button
          onClick={() => { setActionError(null); setUrlError(null); setAuthModalOpen(true); }}
          disabled={!!activeSession}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          id="add-login-btn"
        >
          <IconPlus /> Authenticate with URL
        </button>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {activeSession && (
        <ActiveSessionPanel
          session={activeSession as BrowserSession & StartSessionResponse}
          onClose={handleClose}
          closing={closing}
        />
      )}

      <div className="mt-2">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Logged-in sites</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><IconSpinner /> Loading…</div>
        ) : origins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm border border-gray-200">
              <IconShield />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No sites authenticated yet</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Click <span className="font-medium">Authenticate with URL</span> to open a stealth browser, log in,
              and have those credentials reused by every job you queue.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {origins.map((origin) => (
              <li
                key={origin}
                className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg"
              >
                <span className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center"><IconCheck /></span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-gray-800 truncate">
                  <IconGlobe />
                  {formatOrigin(origin)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {profile?.lastSyncedAt && (
          <p className="mt-3 text-xs text-gray-400">
            Last synced {formatRelativeTime(profile.lastSyncedAt)}
          </p>
        )}
      </div>

      {authModalOpen && (
        <AuthModal
          url={targetUrl}
          onUrlChange={(v) => { setTargetUrl(v); setUrlError(null); }}
          urlError={urlError}
          starting={starting}
          onStart={handleStart}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
};

interface ActiveSessionPanelProps {
  session: BrowserSession & StartSessionResponse;
  onClose: () => void;
  closing: boolean;
}

const ActiveSessionPanel = ({ session, onClose, closing }: ActiveSessionPanelProps) => {
  const startUrl = session.startUrl;
  const port = session.cdpPort;
  return (
    <div className="mb-6 px-5 py-4 rounded-xl border border-amber-200 bg-amber-50">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="mt-0.5 text-amber-600"><IconSpinner /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-amber-900">
              Stealth browser is running — finish logging in
            </h3>
            <p className="mt-1 text-xs text-amber-800">
              A CloakBrowser window is open on the API host{startUrl && <> at <code className="px-1 py-0.5 rounded bg-amber-100 text-amber-900">{startUrl}</code></>}.
              Complete the login flow there, then click <span className="font-medium">I&apos;m done</span>.
            </p>
            {port && (
              <p className="mt-1 text-[11px] text-amber-700">
                CDP port <code className="px-1 py-0.5 rounded bg-amber-100">{port}</code> · expires {formatRelativeTime(session.expiresAt)}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={closing}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {closing ? 'Saving…' : 'I\'m done'}
        </button>
      </div>
    </div>
  );
};

interface AuthModalProps {
  url: string;
  onUrlChange: (v: string) => void;
  urlError: string | null;
  starting: boolean;
  onStart: () => void;
  onClose: () => void;
}

const AuthModal = ({ url, onUrlChange, urlError, starting, onStart, onClose }: AuthModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Authenticate with URL</h2>
        <p className="text-sm text-gray-500 mb-4">
          We&apos;ll open a stealth browser to this URL so you can log in. Session is saved to your profile and reused by every job.
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Site URL</label>
        <input
          type="url"
          autoFocus
          placeholder="https://chat.deepseek.com"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
            urlError ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-gray-400'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !starting) onStart();
          }}
        />
        {urlError && <p className="mt-1.5 text-xs text-red-600">{urlError}</p>}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={starting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            disabled={starting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {starting && <IconSpinner />}
            {starting ? 'Starting browser…' : 'Open browser'}
          </button>
        </div>
      </div>
    </div>
  );
};
