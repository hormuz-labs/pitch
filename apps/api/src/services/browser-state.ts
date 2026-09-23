import * as db from '@saas/db'
import { uploadStorageState } from '@saas/storage'
import type { BrowserContext } from 'playwright'
import { withTimeout } from '../render/utils/cloak-browser.js'

/**
 * Save a live browser's cookies and storage to `stateFile`, upload it as the
 * user's profile state and merge the origins it holds into their logged-in
 * list. Throws on any failure; the caller decides whether that is fatal.
 * Returns the origins captured this time.
 */
export async function persistBrowserState(
  context: BrowserContext,
  userId: string,
  stateFile: string,
): Promise<string[]> {
  const state = await withTimeout(
    'browser state capture',
    context.storageState({ path: stateFile, indexedDB: true }),
    10_000,
  )
  const origins = Array.from(
    new Set([
      ...state.origins.map(origin => origin.origin),
      ...state.cookies.map(
        cookie => `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}`,
      ),
    ]),
  ).sort()
  const key = await uploadStorageState(stateFile, userId)
  await db.recordLoggedInOrigins(userId, origins, { storageStateKey: key })
  return origins
}
