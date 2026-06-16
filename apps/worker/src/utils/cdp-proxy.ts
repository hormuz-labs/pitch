import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { createLogger } from '@saas/shared';

const logger = createLogger('worker:cdp-proxy');

export interface CdpProxyHandle {
  port: number;
  close: () => Promise<void>;
}

interface ProxyOptions {
  /** Manager CDP HTTP base URL, e.g. http://localhost:8080/api/profiles/<id>/cdp */
  managerHttpUrl: string;
  /** Manager CDP WebSocket base URL, e.g. ws://localhost:8080/api/profiles/<id>/cdp */
  managerWsUrl: string;
  authToken?: string;
  port: number;
}

/**
 * Create a local transparent proxy for a CloakBrowser Manager CDP endpoint.
 *
 * Playwright's connectOverCDP (used by `playwright-cli attach --cdp`) speaks
 * three things to the URL we give it:
 *   1. GET  /json/version
 *   2. GET  /json/list
 *   3. WS   to the browser-level or page-level webSocketDebuggerUrl
 *
 * The manager requires an Authorization header, but `playwright-cli` cannot
 * pass headers. This proxy injects the token and rewrites manager WS URLs so
 * traffic loops back through the proxy.
 */
export function createCdpProxy(options: ProxyOptions): Promise<CdpProxyHandle> {
  const { managerHttpUrl, managerWsUrl, authToken, port } = options;

  const managerHttp = new URL(managerHttpUrl);
  const managerWs = new URL(managerWsUrl);
  const managerHttpOrigin = `${managerHttp.protocol}//${managerHttp.host}`;
  const managerWsOrigin = `${managerWs.protocol}//${managerWs.host}`;
  const localWsOrigin = `ws://127.0.0.1:${port}`;

  // Regex that matches any manager WS URL for this profile's CDP endpoint.
  const wsRewriteRegex = new RegExp(
    `^${managerWsOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(.*)$`
  );

  const upstreamHeaders = (extra: http.IncomingHttpHeaders = {}): http.OutgoingHttpHeaders => {
    const h: http.OutgoingHttpHeaders = { ...extra };
    if (authToken) {
      h['Authorization'] = `Bearer ${authToken}`;
    }
    return h;
  };

  const rewriteWsUrls = (body: string): string => {
    return body.replace(wsRewriteRegex, (_, path: string) => `${localWsOrigin}${path || ''}`);
  };

  const proxyHttp = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const upstreamPath = `${managerHttp.pathname}${requestUrl.pathname}`;
    const upstreamUrl = new URL(upstreamPath + requestUrl.search, managerHttpOrigin);

    logger.debug({ path: requestUrl.pathname, upstream: upstreamUrl.toString() }, 'Proxying CDP HTTP request');

    const requestModule = upstreamUrl.protocol === 'https:' ? https : http;
    const proxyReq = requestModule.request(
      upstreamUrl,
      {
        method: req.method,
        headers: upstreamHeaders({
          ...req.headers,
          host: upstreamUrl.host,
        }),
      },
      (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        const isJson = contentType.includes('application/json');

        if (isJson) {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk) => chunks.push(chunk));
          proxyRes.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            const rewritten = rewriteWsUrls(raw);
            res.writeHead(proxyRes.statusCode || 200, {
              ...proxyRes.headers,
              'content-length': Buffer.byteLength(rewritten),
            });
            res.end(rewritten);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      }
    );

    proxyReq.on('error', (err) => {
      logger.error({ err, upstream: upstreamUrl.toString() }, 'CDP HTTP proxy request failed');
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
      }
    });

    req.pipe(proxyReq, { end: true });
  };

  const server = http.createServer(proxyHttp);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const upstreamPath = `${managerWs.pathname}${requestUrl.pathname}`;
    const upstreamUrl = `${managerWsOrigin}${upstreamPath}`;

    logger.info({ path: requestUrl.pathname, upstream: upstreamUrl }, 'New WebSocket connection to CDP proxy');

    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    // `ws` WebSocket constructor expects Record<string, string> for headers.

    let targetWs: WebSocket;
    try {
      targetWs = new WebSocket(upstreamUrl, { headers });
    } catch (err) {
      logger.error({ err, upstream: upstreamUrl }, 'Failed to create upstream WebSocket');
      clientWs.close(1011, 'Upstream connection failed');
      return;
    }

    let clientOpen = true;
    let targetOpen = false;
    const messageQueue: WebSocket.RawData[] = [];

    targetWs.on('open', () => {
      logger.debug({ upstream: upstreamUrl }, 'Connected to manager CDP WebSocket');
      targetOpen = true;
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (msg) targetWs.send(msg);
      }
    });

    clientWs.on('message', (message: WebSocket.RawData) => {
      if (targetOpen && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(message);
      } else {
        messageQueue.push(message);
      }
    });

    targetWs.on('message', (message: WebSocket.RawData) => {
      if (clientOpen && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(message);
      }
    });

    const closeBoth = (source: string, code?: number, reason?: string) => {
      logger.debug({ source, code, reason }, 'CDP WebSocket side closed');
      clientOpen = false;
      if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
        targetWs.close();
      }
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        clientWs.close();
      }
    };

    clientWs.on('close', (code, reason) => closeBoth('client', code, reason?.toString()));
    targetWs.on('close', (code, reason) => closeBoth('upstream', code, reason?.toString()));

    clientWs.on('error', (err) => {
      logger.error({ err, upstream: upstreamUrl }, 'Client CDP WebSocket error');
      closeBoth('client-error');
    });

    targetWs.on('error', (err) => {
      logger.error({ err, upstream: upstreamUrl }, 'Manager CDP WebSocket error');
      closeBoth('upstream-error');
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);

    server.listen(port, '127.0.0.1', () => {
      logger.info({ port, managerHttpUrl, managerWsUrl }, 'CDP proxy listening');
      resolve({
        port,
        close: () => {
          return new Promise<void>((resolveClose) => {
            let closed = 0;
            const done = () => {
              if (++closed === 2) resolveClose();
            };
            wss.close(done);
            server.close(done);
          });
        },
      });
    });
  });
}
