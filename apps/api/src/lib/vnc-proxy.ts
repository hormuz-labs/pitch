/**
 * VNC WebSocket proxy.
 *
 * The browser cannot reach the CloakBrowser Manager directly: the manager
 * enforces a CSWSH origin check (and sends no CORS headers), and browsers can't
 * attach an Authorization header to a WebSocket. So the SPA opens a WS to this
 * API instead — `/browser/profiles/:id/vnc?token=<clerk session jwt>` — and we
 * bridge it to the manager server-side, where we *can* set the manager Bearer
 * token and omit Origin (a node ws client sends none), which clears both checks.
 *
 * Auth: the Clerk session token is passed as a query param (browsers can't set
 * WS headers), mirroring the existing /jobs/stream SSE pattern. We verify it,
 * then confirm the user actually owns an active session for that manager
 * profile before bridging — otherwise any signed-in user could view another
 * user's browser by guessing the profile id.
 */
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '@clerk/backend';
import * as db from '@saas/db';
import { createLogger, MANAGER_BASE_URL, getManagerHeaders } from '@saas/shared';

const logger = createLogger('api:vnc-proxy');

const VNC_PATH_RE = /^\/browser\/profiles\/([^/]+)\/vnc$/;

function safeUrl(url = '/'): URL {
  try {
    return new URL(url, 'http://localhost');
  } catch {
    return new URL('/', 'http://localhost');
  }
}

function abort(socket: Duplex, code: number, message: string): void {
  // socket.end() flushes the status line on Node; under Bun the reject body
  // isn't delivered but the connection still closes, so access is denied either
  // way. Either is acceptable — an unauthorized client must not be upgraded.
  try {
    socket.end(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
  } catch {
    socket.destroy();
  }
}

/** Verify the Clerk token and confirm the user owns an active session for this profile. */
async function authorize(token: string | null, profileId: string): Promise<boolean> {
  if (!token) return false;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.error('CLERK_SECRET_KEY missing — cannot verify VNC token');
    return false;
  }

  let userId: string | undefined;
  try {
    const claims = await verifyToken(token, { secretKey });
    userId = claims.sub;
  } catch (err) {
    logger.warn({ err }, 'VNC token verification failed');
    return false;
  }
  if (!userId) return false;

  const sessions = await db.listActiveBrowserSessions(userId);
  // browser-host stores the manager profile id in `noVncUrl`.
  return sessions.some((s: { noVncUrl: string | null }) => s.noVncUrl === profileId);
}

/** Pipe an accepted browser WS to the manager's VNC WS, both directions. */
function bridge(client: WebSocket, profileId: string): void {
  const target = `${MANAGER_BASE_URL.replace(/^http/, 'ws')}/api/profiles/${profileId}/vnc`;
  // node ws client sends no Origin header → passes the manager CSWSH check.
  const upstream = new WebSocket(target, ['binary'], { headers: getManagerHeaders() });

  client.binaryType = 'nodebuffer';
  upstream.binaryType = 'nodebuffer';

  // Buffer frames the client sends before the upstream handshake completes
  // (noVNC starts its RFB handshake as soon as our side opens).
  const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
  let upstreamOpen = false;

  const closeBoth = (): void => {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close();
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
  };

  client.on('message', (data, isBinary) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else pending.push({ data, isBinary });
  });

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const m of pending) upstream.send(m.data, { binary: m.isBinary });
    pending.length = 0;
  });

  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  upstream.on('error', (err) => {
    logger.warn({ err, profileId }, 'manager VNC upstream error');
    closeBoth();
  });
  client.on('error', () => closeBoth());
  upstream.on('close', closeBoth);
  client.on('close', closeBoth);
}

/** Attach the VNC upgrade handler to the API's HTTP server. */
export function attachVncProxy(server: Server): void {
  const wss = new WebSocketServer({
    noServer: true,
    // noVNC negotiates the 'binary' subprotocol; echo it back.
    handleProtocols: (protocols) => (protocols.has('binary') ? 'binary' : false),
  });

  server.on('upgrade', (req, socket, head) => {
    const url = safeUrl(req.url);
    const match = url.pathname.match(VNC_PATH_RE);
    // This is the only WS endpoint on the API; reject any other upgrade so the
    // socket isn't left hanging.
    if (!match) {
      abort(socket, 404, 'Not Found');
      return;
    }

    const profileId = decodeURIComponent(match[1]);
    const token = url.searchParams.get('token');

    authorize(token, profileId)
      .then((ok) => {
        if (!ok) {
          abort(socket, 403, 'Forbidden');
          return;
        }
        wss.handleUpgrade(req, socket, head, (client) => bridge(client as WebSocket, profileId));
      })
      .catch((err) => {
        logger.error({ err, profileId }, 'VNC upgrade failed');
        abort(socket, 500, 'Internal Server Error');
      });
  });

  logger.info('VNC proxy attached at /browser/profiles/:id/vnc');
}
