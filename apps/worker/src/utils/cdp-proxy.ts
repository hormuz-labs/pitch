/**
 * cdp-proxy.ts
 *
 * Spins up a local HTTP+WebSocket server on a random port that proxies the
 * CloakBrowser Manager CDP endpoint. The critical job it does:
 *
 *   - Rewrites every `webSocketDebuggerUrl` (and `devtoolsFrontendUrl`) in the
 *     /json/version, /json/list and /json/new responses so they point to
 *     localhost instead of the manager's public hostname.
 *
 * Background: the manager returns `wss://cloakbrowser-manager.trypitch.co/...`
 * in those fields.  playwright-cli reads /json/version, picks up that URL and
 * tries to open the WebSocket to it.  From inside the Docker container that
 * public hostname may be unreachable, causing the 30-second TimeoutError.
 * By sitting a local proxy in front we ensure playwright-cli always connects
 * to 127.0.0.1 for both HTTP and WebSocket traffic.
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { createLogger } from '@saas/shared';
import { WebSocket, WebSocketServer } from 'ws';

const logger = createLogger('worker:cdp-proxy');

export interface CdpProxy {
  /** The http://127.0.0.1:<port>/api/profiles/<id>/cdp URL to pass to playwright-cli */
  localCdpUrl: string;
  /** Stop the proxy server and close all connections */
  close: () => Promise<void>;
}

function rewriteUrls(body: string, localBase: string, upstreamBase: string): string {
  // Replace every occurrence of the upstream base URL (both ws/wss and http/https)
  // with our local base URL (http/ws on localhost).
  const upstreamWs = upstreamBase.replace(/^http/, 'ws');
  const localWs = localBase.replace(/^http/, 'ws');
  return body
    .replaceAll(upstreamBase, localBase)
    .replaceAll(upstreamWs, localWs);
}

/**
 * Get a free TCP port on localhost.
 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

/**
 * Start a local CDP proxy for the given profile CDP endpoint.
 *
 * @param upstreamCdpUrl  The internal manager URL, e.g.
 *                        http://cloakbrowser-manager:8080/api/profiles/<id>/cdp
 */
export async function startCdpProxy(upstreamCdpUrl: string): Promise<CdpProxy> {
  const port = await getFreePort();

  // upstreamBase = http://cloakbrowser-manager:8080
  // upstreamPath = /api/profiles/<id>/cdp
  const upstreamUrl = new URL(upstreamCdpUrl);
  const upstreamBase = upstreamUrl.origin;                 // e.g. http://cloakbrowser-manager:8080
  const profileCdpPath = upstreamUrl.pathname;             // e.g. /api/profiles/<id>/cdp
  const localBase = `http://127.0.0.1:${port}`;
  const localCdpUrl = `${localBase}${profileCdpPath}`;

  const wss = new WebSocketServer({ noServer: true });

  const server = http.createServer(async (req, res) => {
    // Proxy all HTTP requests to the upstream manager, rewriting URLs in JSON responses.
    const upstreamTarget = `${upstreamBase}${req.url}`;
    try {
      const upstreamRes = await fetch(upstreamTarget, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([k]) =>
            !['host', 'connection'].includes(k.toLowerCase())
          ) as [string, string][]
        ),
      });

      const contentType = upstreamRes.headers.get('content-type') ?? '';
      const body = await upstreamRes.text();

      const rewritten = contentType.includes('json')
        ? rewriteUrls(body, localBase, upstreamBase)
        : body;

      res.writeHead(upstreamRes.status, {
        'content-type': contentType,
        'content-length': Buffer.byteLength(rewritten),
      });
      res.end(rewritten);
    } catch (err) {
      logger.warn({ err, upstreamTarget }, 'CDP proxy HTTP request failed');
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });

  // WebSocket upgrade: bridge local WS client ↔ upstream WS
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket as net.Socket, head, (clientWs) => {
      // The req.url path on the local side maps 1:1 to the upstream path.
      const upstreamWsUrl = `${upstreamBase.replace(/^http/, 'ws')}${req.url}`;
      logger.debug({ upstreamWsUrl }, 'CDP proxy: opening upstream WS');

      const upstreamWs = new WebSocket(upstreamWsUrl);

      upstreamWs.on('open', () => {
        logger.debug({ upstreamWsUrl }, 'CDP proxy: upstream WS open');
      });

      // Pipe frames in both directions
      clientWs.on('message', (data, isBinary) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data, { binary: isBinary });
        }
      });
      upstreamWs.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      const close = (code?: number, reason?: string) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code, reason);
        if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.close(code, reason);
      };

      clientWs.on('close', (code, reason) => close(code, reason.toString()));
      upstreamWs.on('close', (code, reason) => close(code, reason.toString()));
      clientWs.on('error', (err) => { logger.warn({ err }, 'CDP proxy: client WS error'); close(1011); });
      upstreamWs.on('error', (err) => { logger.warn({ err }, 'CDP proxy: upstream WS error'); close(1011); });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  logger.info({ localCdpUrl, upstreamCdpUrl }, 'CDP proxy started');

  return {
    localCdpUrl,
    close: () => new Promise<void>((resolve) => {
      wss.close();
      server.close(() => resolve());
    }),
  };
}
