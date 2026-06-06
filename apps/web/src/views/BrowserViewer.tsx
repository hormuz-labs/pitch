import React, { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { API_URL } from '../config';

// Build the VNC WebSocket URL pointing at the Pitch API's manager proxy.
// The browser never talks to the CloakBrowser Manager directly: the API
// authenticates the Clerk token (passed as `?token=`, since browsers can't set
// headers on a WebSocket), authorizes the session, then bridges to the manager
// while injecting the manager Bearer token and omitting Origin server-side —
// which clears the manager's CSWSH check and the cross-origin CORS problem.
// In dev API_URL is '/api' and vite proxies the upgrade to the local API; in
// prod it's the absolute api origin (e.g. https://api.trypitch.co).
function vncProxyUrl(profileId: string, token: string): string {
  const path = `/browser/profiles/${profileId}/vnc?token=${encodeURIComponent(token)}`;
  if (API_URL.startsWith('http')) {
    return API_URL.replace(/^http/, 'ws') + path;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${API_URL}${path}`;
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
        setStatus('authenticating');
        const pitchToken = await getToken();
        if (!pitchToken) {
            if (active) setStatus('error');
            return;
        }

        if (!active) return;
        setStatus('connecting');

        // Dynamic import to avoid build-time issues with noVNC's non-standard ESM structure
        const RFBModule = await import('@novnc/novnc');
        const RFB = RFBModule.default;

        if (!active) return;

        // Connect through the Pitch API proxy (handles manager auth + CSWSH/CORS).
        const wsUrl = vncProxyUrl(profileId, pitchToken);

        console.log('Connecting to VNC via API proxy');

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
