import {
  createLogger,
  createManagerProfile,
  getManagerProfile,
  launchManagerProfile,
  managerCdpHttpUrl,
  stopManagerProfile,
} from '@saas/shared'

const logger = createLogger('worker:manager-browser')

export interface ManagerBrowserHandle {
  profileId: string
  /** Manager CDP HTTP URL for playwright-cli attach --cdp */
  cdpUrl: string
  close: () => Promise<void>
}

async function waitForCdpReady(
  profileId: string,
  timeoutMs = 45000,
  intervalMs = 1500,
): Promise<void> {
  const versionUrl = `${managerCdpHttpUrl(profileId)}/json/version`
  const wsUrl = `${managerCdpHttpUrl(profileId).replace(/^http/, 'ws')}`
  const deadline = Date.now() + timeoutMs
  let lastError: Error | undefined

  // Phase 1: wait for HTTP /json/version to respond
  while (Date.now() < deadline) {
    try {
      const res = await fetch(versionUrl)
      if (res.ok) {
        logger.info({ versionUrl }, 'Manager CDP HTTP endpoint is ready')
        break
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const remaining = deadline - Date.now()
      logger.debug(
        { versionUrl, remainingMs: Math.max(0, remaining), err: lastError },
        'Manager CDP HTTP endpoint not ready yet, retrying...',
      )
      if (Date.now() + intervalMs < deadline) {
        await new Promise(r => setTimeout(r, intervalMs))
      } else {
        throw new Error(
          `Manager CDP endpoint ${versionUrl} did not become ready within ${timeoutMs}ms. ` +
            `Last error: ${lastError?.message || 'unknown'}`,
        )
      }
    }
  }

  // Phase 2: verify WebSocket connectivity before returning
  await new Promise<void>((resolve, reject) => {
    const wsDeadline = Math.max(0, deadline - Date.now())
    const timer = setTimeout(
      () => reject(new Error(`CDP WebSocket ${wsUrl} did not become ready within timeout`)),
      wsDeadline,
    )
    let resolved = false
    const tryWs = () => {
      if (Date.now() >= deadline) {
        clearTimeout(timer)
        reject(new Error(`CDP WebSocket ${wsUrl} did not become ready within timeout`))
        return
      }
      const ws = new (globalThis as any).WebSocket(wsUrl)
      ws.onopen = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          ws.close()
          logger.info({ wsUrl }, 'Manager CDP WebSocket is ready')
          resolve()
        }
      }
      ws.onerror = () => {
        ws.close()
        if (!resolved && Date.now() < deadline) {
          setTimeout(tryWs, intervalMs)
        }
      }
      ws.onclose = (ev: any) => {
        if (!resolved && ev.code !== 1000 && Date.now() < deadline) {
          setTimeout(tryWs, intervalMs)
        }
      }
    }
    tryWs()
  }).catch(err => {
    // WS check failed — log a warning but don't hard-fail; the HTTP endpoint is up
    // and playwright-cli attach has its own retry loop.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'CDP WebSocket readiness check did not confirm; proceeding anyway',
    )
  })
}

/**
 * Ensures the CloakBrowser Manager profile for the user is running and
 * returns the manager CDP URL. The manager runs without auth inside the
 * private Docker network, so no token is needed.
 */
export async function startManagerBrowser(userId: string): Promise<ManagerBrowserHandle> {
  logger.info({ userId }, 'Ensuring CloakBrowser profile is running')

  let profile = await getManagerProfile(userId)
  if (!profile) {
    logger.info({ userId }, 'Creating new CloakBrowser profile')
    profile = await createManagerProfile(userId)
  }

  if (profile.status === 'running') {
    logger.info(
      { userId, profileId: profile.id },
      'Stopping already running CloakBrowser profile to ensure a fresh session',
    )
    try {
      await stopManagerProfile(profile.id)
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch (err) {
      logger.warn({ err }, 'Failed to stop already running CloakBrowser profile, proceeding anyway')
    }
  }

  logger.info({ userId, profileId: profile.id }, 'Launching CloakBrowser profile')
  await launchManagerProfile(profile.id)

  logger.info({ profileId: profile.id }, 'Waiting for manager CDP endpoint to be ready')
  await waitForCdpReady(profile.id)

  const cdpUrl = managerCdpHttpUrl(profile.id)
  logger.info({ userId, profileId: profile.id, cdpUrl }, 'CloakBrowser profile ready')

  return {
    profileId: profile.id,
    cdpUrl,
    close: async () => {
      logger.info({ userId, profileId: profile.id }, 'Stopping CloakBrowser profile')
      try {
        await stopManagerProfile(profile.id)
      } catch (err) {
        logger.warn({ err }, 'Failed to stop CloakBrowser profile')
      }
    },
  }
}
