import { createCdpProxy, type CdpProxyHandle } from './cdp-proxy.js';
import { 
  createLogger, 
  getManagerProfile, 
  createManagerProfile, 
  launchManagerProfile, 
  stopManagerProfile,
  managerCdpUrl,
  managerCdpHttpUrl,
  MANAGER_AUTH_TOKEN 
} from '@saas/shared';
import net from 'net';
import { WebSocket } from 'ws';

const logger = createLogger('worker:manager-browser');

/**
 * Poll the local CDP proxy until both its HTTP endpoint and the WebSocket
 * debugger URL are reachable. Playwright's connectOverCDP (used by
 * `playwright-cli attach --cdp`) can hang for 30s if the upstream manager
 * WebSocket handshake is not ready, so we verify readiness before returning.
 */
async function waitForCdpProxyReady(
  localCdpUrl: string,
  timeoutMs = 30000,
  intervalMs = 1000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${localCdpUrl}/json/version`);
      if (!res.ok) {
        throw new Error(`/json/version returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as any;
      const wsUrl = data.webSocketDebuggerUrl;
      if (!wsUrl || typeof wsUrl !== 'string') {
        throw new Error('No webSocketDebuggerUrl in /json/version response');
      }

      // Verify the WebSocket path through the proxy is actually usable.
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const wsTimeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket open timeout'));
        }, 5000);

        ws.on('open', () => {
          clearTimeout(wsTimeout);
          ws.close();
          resolve();
        });
        ws.on('error', (err) => {
          clearTimeout(wsTimeout);
          reject(err);
        });
      });

      logger.info({ localCdpUrl, wsUrl }, 'CDP proxy is ready for playwright-cli attach');
      return;
    } catch (err) {
      const remaining = deadline - Date.now();
      logger.debug(
        { err, localCdpUrl, remainingMs: Math.max(0, remaining) },
        'CDP proxy not ready yet, retrying...'
      );
      if (Date.now() + intervalMs < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  }

  throw new Error(`CDP proxy at ${localCdpUrl} did not become ready within ${timeoutMs}ms`);
}

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'string' ? 0 : address?.port ?? 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

export interface ManagerBrowserHandle {
  profileId: string;
  proxy: CdpProxyHandle;
  /** HTTP URL the local proxy exposes for playwright-cli attach --cdp */
  localCdpUrl: string;
  close: () => Promise<void>;
}

/**
 * Ensures the CloakBrowser Manager profile for the user is running,
 * starts a local CDP proxy to it, and returns the handle.
 */
export async function startManagerBrowser(userId: string): Promise<ManagerBrowserHandle> {
  logger.info({ userId }, 'Ensuring CloakBrowser profile is running');

  let profile = await getManagerProfile(userId);
  if (!profile) {
    logger.info({ userId }, 'Creating new CloakBrowser profile');
    profile = await createManagerProfile(userId);
  }

  if (profile.status === 'running') {
    logger.info({ userId, profileId: profile.id }, 'Stopping already running CloakBrowser profile to ensure a fresh session');
    try {
      await stopManagerProfile(profile.id);
      // Give it a brief moment to fully terminate
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      logger.warn({ err }, 'Failed to stop already running CloakBrowser profile, proceeding anyway');
    }
  }

  logger.info({ userId, profileId: profile.id }, 'Launching CloakBrowser profile');
  await launchManagerProfile(profile.id);

  const managerWsUrl = managerCdpUrl(profile.id);
  const managerHttpUrl = managerCdpHttpUrl(profile.id);
  const localPort = await getAvailablePort();
  const localCdpUrl = `http://127.0.0.1:${localPort}`;
  
  logger.info({ userId, managerHttpUrl, localPort }, 'Starting CDP proxy');
  let proxy: CdpProxyHandle;
  try {
    proxy = await createCdpProxy({
      managerHttpUrl,
      managerWsUrl,
      authToken: MANAGER_AUTH_TOKEN,
      port: localPort,
    });
  } catch (err) {
    logger.warn({ err, profileId: profile.id }, 'CDP proxy creation failed, stopping profile');
    await stopManagerProfile(profile.id).catch(() => {});
    throw err;
  }

  try {
    logger.info({ localCdpUrl }, 'Waiting for CDP proxy to be ready');
    await waitForCdpProxyReady(localCdpUrl);
  } catch (err) {
    logger.warn({ err, profileId: profile.id }, 'CDP proxy readiness check failed, cleaning up');
    await proxy.close().catch(() => {});
    await stopManagerProfile(profile.id).catch(() => {});
    throw err;
  }

  return {
    profileId: profile.id,
    proxy,
    localCdpUrl,
    close: async () => {
      logger.info({ userId, profileId: profile.id }, 'Stopping CloakBrowser profile and CDP proxy');
      try {
        await proxy.close();
      } catch (err) {
        logger.warn({ err }, 'Failed to close CDP proxy');
      }
      try {
        await stopManagerProfile(profile.id);
      } catch (err) {
        logger.warn({ err }, 'Failed to stop CloakBrowser profile');
      }
    }
  };
}
