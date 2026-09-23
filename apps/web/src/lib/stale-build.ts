/**
 * Recovering a tab that outlived a deploy.
 *
 * Every build names its chunks by content hash, and a deploy removes the old
 * ones. A tab opened before the deploy still asks for the old names the next
 * time it lazy-loads a route, and gets a 404 (or, before vercel.json excluded
 * /assets from the SPA fallback, index.html served as "text/html"). The only
 * fix is to load the new index.html, so reload — once. If the reload did not
 * help, something else is wrong, and looping would only hide it.
 */

const KEY = 'pitch:stale-build-reload'
/** A second failure this soon after reloading is not a stale tab; stop and show an error. */
const RETRY_WINDOW_MS = 60_000

const STALE_BUILD =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|module script/i

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return STALE_BUILD.test(message)
}

interface ReloadDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  reload?: () => void
  now?: number
}

/** Reload to pick up the new build, unless we already did so moments ago. True when reloading. */
export function reloadForNewBuild(deps: ReloadDeps = {}): boolean {
  const now = deps.now ?? Date.now()
  const reload = deps.reload ?? (() => window.location.reload())
  let storage = deps.storage
  try {
    storage ??= window.sessionStorage
    const last = Number(storage.getItem(KEY) ?? 0)
    if (Number.isFinite(last) && now - last < RETRY_WINDOW_MS) return false
    storage.setItem(KEY, String(now))
  } catch {
    // No sessionStorage (privacy mode): without a guard, never risk a loop.
    return false
  }
  reload()
  return true
}

/**
 * Vite dispatches a cancelable `vite:preloadError` whenever a lazy chunk (or
 * its CSS) fails to load; cancelling it makes the import resolve to
 * undefined instead of throwing, while the page reloads.
 */
export function installStaleBuildRecovery(target: Window = window): void {
  target.addEventListener('vite:preloadError', event => {
    if (reloadForNewBuild()) event.preventDefault()
  })
}

/** A promise that never settles: keeps Suspense on its fallback while the page reloads. */
export const whileReloading = <T>() => new Promise<T>(() => {})
