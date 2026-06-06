import React, { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../lib/api';
import { MANAGER_URL } from '../config';

// Build a CloakBrowser Manager HTTP URL. In dev MANAGER_URL is empty and we use
// the relative `/manager-api` path that vite.config.ts proxies to the manager's
// `/api`. In production MANAGER_URL is the manager's public origin, so we hit
// `${MANAGER_URL}/api/...` directly (Vercel can't proxy these paths).
function managerHttpUrl(path: string): string {
  return MANAGER_URL ? `${MANAGER_URL}/api${path}` : `/manager-api${path}`;
}

// Build the noVNC WebSocket URL. In dev it's same-origin (proxied by the
// `/api/profiles` ws rule in vite.config.ts); in production it points straight
// at the manager origin, upgrading http(s) -> ws(s).
function managerWsUrl(profileId: string): string {
  const vncPath = `/api/profiles/${profileId}/vnc`;
  if (MANAGER_URL) {
    return MANAGER_URL.replace(/^http/, 'ws') + vncPath;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${vncPath}`;
}

interface BrowserViewerProps {
  profileId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: any) => void;
}

export const BrowserViewer: React.FC<BrowserViewerProps> = ({
  profileId,
  onConnect,
  onDisconnect,
  onError,
}) => {
  const { getToken } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error' | 'authenticating'>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    let active = true;
    let rfb: any = null;

    async function init() {
      if (!containerRef.current || !profileId) return;

      try {
        // 1. Check Manager Auth status and login if needed
        setStatus('authenticating');
        const pitchToken = await getToken();
        if (!pitchToken && active) {
            setStatus('error');
            return;
        }

        const { token: managerToken } = await api.get<{ token?: string }>('/browser/manager-config', pitchToken!);
        
        if (managerToken) {
            // Check if we already have a valid session. credentials:'include'
            // so the manager's session cookie is sent/stored cross-origin in prod.
            const authStatus = await fetch(managerHttpUrl('/auth/status'), {
                credentials: 'include',
            }).then(r => r.json());
            if (authStatus.auth_required && !authStatus.authenticated) {
                console.log('Logging in to Manager...');
                const loginRes = await fetch(managerHttpUrl('/auth/login'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ token: managerToken }),
                });
                if (!loginRes.ok) {
                    throw new Error('Manager login failed');
                }
            }
        }

        if (!active) return;
        setStatus('connecting');

        // Dynamic import to avoid build-time issues with noVNC's non-standard ESM structure
        const RFBModule = await import('@novnc/novnc');
        const RFB = RFBModule.default;

        if (!active) return;

        const wsUrl = managerWsUrl(profileId);

        console.log('Connecting to VNC:', wsUrl);

        rfb = new RFB(containerRef.current, wsUrl, {
          wsProtocols: ['binary'],
        });

        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.showDotCursor = true;

        rfb.addEventListener('connect', () => {
          if (active) {
            setStatus('connected');
            onConnect?.();
          }
        });

        rfb.addEventListener('disconnect', (e: any) => {
          if (active) {
            setStatus('disconnected');
            onDisconnect?.();
          }
        });

        rfb.addEventListener('securityfailure', (e: any) => {
          if (active) {
            setStatus('error');
            onError?.(e.detail.reason);
          }
        });

        rfbRef.current = rfb;
      } catch (err) {
        console.error('BrowserViewer Init Error:', err);
        if (active) setStatus('error');
      }
    }

    init();

    return () => {
      active = false;
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch (e) {
          // ignore
        }
        rfbRef.current = null;
      }
    };
  }, [profileId, getToken]);

  return (
    <div ref={wrapperRef} className="relative w-full h-full bg-black flex flex-col overflow-hidden rounded-lg group">
      {status === 'connected' && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-20 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      )}
      
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden"
        style={{ minHeight: 0 }}
      />

      {(status === 'connecting' || status === 'authenticating') && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm z-0">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-white/10 border-t-white/80 rounded-full animate-spin" />
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                {status === 'authenticating' ? 'Authenticating...' : 'Linking...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
