import { 
  createLogger, 
  getManagerProfile, 
  createManagerProfile, 
  launchManagerProfile, 
  stopManagerProfile,
  managerCdpHttpUrl,
} from '@saas/shared';
import { startCdpProxy } from './cdp-proxy.js';

const logger = createLogger('worker:manager-browser');

export interface ManagerBrowserHandle {
  profileId: string;
  /** Local CDP HTTP URL for playwright-cli attach --cdp (proxied, localhost) */
  cdpUrl: string;
  close: () => Promise<void>;
}

async function waitForCdpReady(
  profileId: string,
  timeoutMs = 45000,
  intervalMs = 1500
): Promise<void> {
  const versionUrl = `${managerCdpHttpUrl(profileId)}/json/version`;
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(versionUrl);
      if (res.ok) {
        const body = await res.json() as any;
        if (body?.Browser) {
          logger.info({ versionUrl, browser: body.Browser }, 'Manager CDP endpoint is ready');
          return;
        }
        throw new Error('CDP /json/version did not return a Browser field yet');
      }
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.debug(
        { versionUrl, remainingMs: Math.max(0, deadline - Date.now()), err: lastError.message },
        'Manager CDP endpoint not ready yet, retrying...'
      );
      if (Date.now() + intervalMs < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
      } else {
        throw new Error(
          `Manager CDP endpoint ${versionUrl} did not become ready within ${timeoutMs}ms. ` +
          `Last error: ${lastError?.message || 'unknown'}`
        );
      }
    }
  }
}

/**
 * Ensures the CloakBrowser Manager profile for the user is running and
 * returns the manager CDP URL. The manager runs without auth inside the
 * private Docker network, so no token is needed.
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      logger.warn({ err }, 'Failed to stop already running CloakBrowser profile, proceeding anyway');
    }
  }

  logger.info({ userId, profileId: profile.id }, 'Launching CloakBrowser profile');
  await launchManagerProfile(profile.id);

  logger.info({ profileId: profile.id }, 'Waiting for manager CDP endpoint to be ready');
  await waitForCdpReady(profile.id);

  // Start a local CDP proxy so playwright-cli always connects to 127.0.0.1.
  // The manager rewrites webSocketDebuggerUrl to its public hostname; from
  // inside Docker that URL is unreachable and causes a 30-second timeout.
  const upstreamCdpUrl = managerCdpHttpUrl(profile.id);
  const proxy = await startCdpProxy(upstreamCdpUrl);
  logger.info({ userId, profileId: profile.id, localCdpUrl: proxy.localCdpUrl }, 'CloakBrowser profile ready (via local proxy)');

  return {
    profileId: profile.id,
    cdpUrl: proxy.localCdpUrl,
    close: async () => {
      logger.info({ userId, profileId: profile.id }, 'Stopping CloakBrowser profile and CDP proxy');
      await proxy.close();
      try {
        await stopManagerProfile(profile.id);
      } catch (err) {
        logger.warn({ err }, 'Failed to stop CloakBrowser profile');
      }
    }
  };
}
