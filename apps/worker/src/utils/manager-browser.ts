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

const logger = createLogger('worker:manager-browser');

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
  const proxy = await createCdpProxy({
    managerHttpUrl,
    managerWsUrl,
    authToken: MANAGER_AUTH_TOKEN,
    port: localPort,
  });

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
