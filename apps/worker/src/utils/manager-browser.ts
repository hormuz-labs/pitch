import { 
  createLogger, 
  getManagerProfile, 
  createManagerProfile, 
  launchManagerProfile, 
  stopManagerProfile,
  MANAGER_BASE_URL,
  MANAGER_AUTH_TOKEN,
} from '@saas/shared';

const logger = createLogger('worker:manager-browser');

export interface ManagerBrowserHandle {
  profileId: string;
  /** Browser-level WebSocket CDP URL ready for playwright-cli attach --cdp */
  cdpUrl: string;
  close: () => Promise<void>;
}

/**
 * Fetch the browser-level WebSocket CDP URL from the manager's /json/version
 * endpoint and ensure the auth token is present for header-less clients.
 */
async function getBrowserWebSocketUrl(profileId: string): Promise<string> {
  const versionUrl = `${MANAGER_BASE_URL}/api/profiles/${profileId}/cdp/json/version`;
  const headers: Record<string, string> = {};
  if (MANAGER_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${MANAGER_AUTH_TOKEN}`;
  }

  const res = await fetch(versionUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch CDP /json/version: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as any;
  let wsUrl = data.webSocketDebuggerUrl;
  if (!wsUrl || typeof wsUrl !== 'string') {
    throw new Error('No webSocketDebuggerUrl in /json/version response');
  }

  // Defensive: some manager versions do not propagate ?token= into the returned
  // WebSocket URL. Since playwright-cli cannot send headers, force the token
  // into the URL ourselves before passing it to attach.
  if (MANAGER_AUTH_TOKEN && !wsUrl.includes('token=')) {
    const sep = wsUrl.includes('?') ? '&' : '?';
    wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(MANAGER_AUTH_TOKEN)}`;
  }

  return wsUrl;
}

/**
 * Ensures the CloakBrowser Manager profile for the user is running and
 * returns a browser-level WebSocket CDP URL that playwright-cli can use.
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

  const cdpUrl = await getBrowserWebSocketUrl(profile.id);
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
