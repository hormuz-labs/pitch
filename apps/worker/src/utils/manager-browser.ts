import { 
  createLogger, 
  getManagerProfile, 
  createManagerProfile, 
  launchManagerProfile, 
  stopManagerProfile,
  managerCdpHttpUrl,
} from '@saas/shared';

const logger = createLogger('worker:manager-browser');

export interface ManagerBrowserHandle {
  profileId: string;
  /** Manager CDP HTTP URL for playwright-cli attach --cdp */
  cdpUrl: string;
  close: () => Promise<void>;
}

async function waitForCdpReady(
  profileId: string,
  timeoutMs = 30000,
  intervalMs = 1000
): Promise<void> {
  const versionUrl = `${managerCdpHttpUrl(profileId)}/json/version`;
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(versionUrl);
      if (res.ok) {
        logger.info({ versionUrl }, 'Manager CDP endpoint is ready');
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const remaining = deadline - Date.now();
      logger.debug(
        { versionUrl, remainingMs: Math.max(0, remaining), err: lastError },
        'Manager CDP endpoint not ready yet, retrying...'
      );
      if (Date.now() + intervalMs < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  }

  throw new Error(
    `Manager CDP endpoint ${versionUrl} did not become ready within ${timeoutMs}ms. ` +
    `Last error: ${lastError?.message || 'unknown'}`
  );
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

  const cdpUrl = managerCdpHttpUrl(profile.id);
  logger.info({ userId, profileId: profile.id, cdpUrl }, 'CloakBrowser profile ready');

  return {
    profileId: profile.id,
    cdpUrl,
    close: async () => {
      logger.info({ userId, profileId: profile.id }, 'Stopping CloakBrowser profile');
      try {
        await stopManagerProfile(profile.id);
      } catch (err) {
        logger.warn({ err }, 'Failed to stop CloakBrowser profile');
      }
    }
  };
}
